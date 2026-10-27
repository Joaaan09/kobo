import { z } from 'zod';
import { zObjectId } from './common.js';

export const valuationKind = z.enum(['interes', 'revalorizacion']);

/** Una valoración que no mueve nada no es un hecho: `deltaCents` firmado y != 0. */
const deltaCents = z.number().int().refine((v) => v !== 0, { message: 'zero_delta' });

/**
 * Create. Dos formas de expresar lo mismo, excluyentes:
 * - `deltaCents` — "han entrado 12,74 €" (típico de una liquidación de intereses).
 * - `targetCents` — "el fondo vale ahora 5.250 €". El servidor lee el saldo real y
 *   calcula el delta él mismo: así la aportación que ya registraste **no** se cuela
 *   como rendimiento, y no hay carrera si el saldo cambió desde que se pintó la UI.
 *
 * `grossCents` (bruto antes de retención) solo tiene sentido en un interés.
 */
export const valuationCreateSchema = z
  .object({
    accountId: zObjectId,
    bucketId: zObjectId,
    date: z.coerce.date(),
    deltaCents: deltaCents.optional(),
    targetCents: z.number().int().optional(),
    kind: valuationKind,
    grossCents: z.number().int().positive().optional(),
    note: z.string().max(120).optional(),
  })
  .refine((d) => (d.deltaCents === undefined) !== (d.targetCents === undefined), {
    message: 'delta_or_target',
    path: ['deltaCents'],
  })
  .refine((d) => d.kind === 'interes' || d.grossCents === undefined, {
    message: 'gross_requires_interes',
    path: ['grossCents'],
  });

/**
 * Update parcial. No admite `targetCents`: al editar se corrige el importe del
 * hecho registrado, no se re-valora contra el saldo actual (que ya lo incluye).
 * El extremo (cuenta+bucket) tampoco se mueve: para eso, borra y vuelve a crear.
 */
export const valuationUpdateSchema = z
  .object({
    date: z.coerce.date().optional(),
    deltaCents: deltaCents.optional(),
    grossCents: z.number().int().positive().nullable().optional(),
    note: z.string().max(120).optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'empty_update' });

export type ValuationCreateInput = z.infer<typeof valuationCreateSchema>;
export type ValuationUpdateInput = z.infer<typeof valuationUpdateSchema>;
