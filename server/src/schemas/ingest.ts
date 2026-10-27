import { z } from 'zod';
import { zObjectId } from './common.js';

/**
 * Entrada de la ingesta automática. Es el único endpoint que habla con un
 * cliente que no es nuestra PWA, así que el contrato es **tolerante en la forma
 * y estricto en el fondo**: acepta el importe como lo mande el Atajo (texto de
 * moneda o número), pero nada entra sin validar (§11).
 *
 * "Tolerante en la forma" se toma al pie de la letra: en Atajos, una variable que
 * no resuelve **no desaparece del JSON, llega como cadena vacía**, y un campo de
 * contexto no puede tumbar un pago real. Por eso todo lo opcional se normaliza
 * (trim, `""` → ausente) y se **trunca** en vez de rechazarse. Lo único que puede
 * abortar la ingesta es el importe: si no hay dinero que registrar, no hay gasto.
 */

/**
 * Texto de contexto que llega de un Atajo: se limpia y, si no queda nada, se
 * trata como ausente. Nunca falla por longitud —recorta— porque perder el pago
 * entero por un nombre de comercio largo sería absurdo.
 */
const looseText = (max: number) =>
  z.preprocess((v) => {
    if (v === null || v === undefined) return undefined;
    const raw = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null;
    if (raw === null) return undefined;
    const trimmed = raw.trim();
    return trimmed ? trimmed.slice(0, max) : undefined;
  }, z.string().optional());

/** Importe tal cual lo manda el cliente: texto de moneda o número. Vacío = ausente. */
const looseAmount = z.preprocess((v) => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed ? trimmed : undefined;
}, z.union([z.string(), z.number()]).optional());

/** Céntimos exactos, si el cliente sabe calcularlos. Acepta "1250" además de 1250. */
const looseAmountCents = z.preprocess((v) => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed || !/^-?\d+$/.test(trimmed)) return undefined;
    return Number(trimmed);
  }
  return v;
}, z.number().int().optional());

/**
 * Fecha opcional. Una fecha ilegible **no** tumba el pago: se ignora y el gasto
 * queda fechado en el momento en que llega (que es cuando se pagó, con minutos
 * de diferencia). Mejor un gasto con la fecha de hoy que ningún gasto.
 */
const looseDate = z.preprocess((v) => {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  if (typeof v === 'string' && !v.trim()) return undefined;
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}, z.date().optional());

export const ingestTransactionSchema = z
  .object({
    /** Importe con formato humano: "12,50 €", "1.234,56", 12.5… */
    amount: looseAmount,
    /** Alternativa exacta y preferida si el cliente puede calcularla. */
    amountCents: looseAmountCents,
    merchant: looseText(140),
    /** Tarjeta que informa Wallet; se guarda como contexto en la nota. */
    card: looseText(80),
    date: looseDate,
    /** Clave de idempotencia del dispositivo (evita duplicar en reintentos). */
    clientRef: looseText(120),
    note: looseText(280),
  })
  .refine((d) => d.amount !== undefined || d.amountCents !== undefined, {
    message: 'amount_required',
    path: ['amount'],
  });

export type IngestTransactionInput = z.infer<typeof ingestTransactionSchema>;

// accountId y bucketId van juntos o ninguno (mismo invariante que en los gastos).
const accountBucketPair = (d: { accountId?: string; bucketId?: string }) =>
  Boolean(d.accountId) === Boolean(d.bucketId);

/** Alta de token de ingesta: una etiqueta y, opcionalmente, la cuenta que paga. */
export const apiTokenCreateSchema = z
  .object({
    label: z.string().min(1).max(60),
    accountId: zObjectId.optional(),
    bucketId: zObjectId.optional(),
  })
  .refine(accountBucketPair, { message: 'account_bucket_pair', path: ['bucketId'] });

/** Regla de auto-asignación: "comercio contiene X → categoría Y". */
export const ingestRuleCreateSchema = z.object({
  label: z.string().min(2).max(80),
  categoryId: zObjectId,
  subcategoryId: zObjectId.optional(),
});

export const ingestRuleUpdateSchema = z.object({
  label: z.string().min(2).max(80).optional(),
  categoryId: zObjectId.optional(),
  subcategoryId: zObjectId.nullable().optional(),
});

export type ApiTokenCreateInput = z.infer<typeof apiTokenCreateSchema>;
export type IngestRuleCreateInput = z.infer<typeof ingestRuleCreateSchema>;
export type IngestRuleUpdateInput = z.infer<typeof ingestRuleUpdateSchema>;
