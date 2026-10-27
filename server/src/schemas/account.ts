import { z } from 'zod';
import { zHexColor } from './common.js';

// El balance del bucket puede ser negativo (números rojos / reconciliación).
const balanceCents = z.number().int();

export const bucketKind = z.enum(['cash', 'savings', 'investment']);

/**
 * Tipo nominal anual en puntos básicos. Tope 10000 (100 %): por encima es un
 * dedazo, y el dinero es sagrado. Retención en bps, tope 100 %.
 */
const rateBps = z.number().int().min(0).max(10_000);
const withholdingBps = z.number().int().min(0).max(10_000);

/**
 * Invariante dura: el tipo de interés y la retención **solo** tienen sentido en un
 * sub-saldo remunerado. Un `cash` o un `investment` con TAE sería un estado
 * contradictorio del que luego salen estimaciones fantasma.
 */
const rateOnlyOnSavings = (d: { kind?: string; rateBps?: number; withholdingBps?: number }) =>
  d.kind === 'savings' || (d.rateBps === undefined && d.withholdingBps === undefined);
const rateOnlyOnSavingsIssue = {
  message: 'rate_requires_savings',
  path: ['rateBps'],
};

export const bucketInputSchema = z
  .object({
    name: z.string().min(1).max(60),
    balanceCents: balanceCents.optional(),
    kind: bucketKind.optional(),
    rateBps: rateBps.optional(),
    withholdingBps: withholdingBps.optional(),
  })
  .refine(rateOnlyOnSavings, rateOnlyOnSavingsIssue);

export const accountCreateSchema = z.object({
  name: z.string().min(1).max(60),
  color: zHexColor.optional(),
  order: z.number().int().min(0).optional(),
  buckets: z.array(bucketInputSchema).max(20).optional(),
});

export const accountUpdateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: zHexColor.optional(),
  order: z.number().int().min(0).optional(),
});

export const bucketCreateSchema = z
  .object({
    name: z.string().min(1).max(60),
    balanceCents: balanceCents.optional(),
    kind: bucketKind.optional(),
    rateBps: rateBps.optional(),
    withholdingBps: withholdingBps.optional(),
  })
  .refine(rateOnlyOnSavings, rateOnlyOnSavingsIssue);

/**
 * Update parcial. `rateBps`/`withholdingBps` admiten **`null`** para desvincular
 * (p. ej. al pasar un remunerado a efectivo). La coherencia tipo↔tasa se valida en
 * la ruta sobre el estado ya fusionado, porque un parcial no siempre trae el `kind`.
 */
export const bucketUpdateSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    balanceCents: balanceCents.optional(),
    kind: bucketKind.optional(),
    rateBps: rateBps.nullable().optional(),
    withholdingBps: withholdingBps.nullable().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'empty_update',
  });

export type AccountCreateInput = z.infer<typeof accountCreateSchema>;
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;
export type BucketCreateInput = z.infer<typeof bucketCreateSchema>;
export type BucketUpdateInput = z.infer<typeof bucketUpdateSchema>;
