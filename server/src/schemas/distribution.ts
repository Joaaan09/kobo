import { z } from 'zod';
import { zObjectId } from './common.js';

/**
 * Cuerpo del reparto de un comodín para un mes (PUT idempotente): la categoría
 * comodín, el mes `YYYY-MM` y sus tramos. Los importes van en **céntimos**
 * (enteros); la suma no puede exceder lo asignado al comodín (se valida en la
 * ruta, que necesita la nómina).
 */
export const distributionPutSchema = z.object({
  categoryId: zObjectId,
  month: z.string().regex(/^\d{4}-\d{2}$/, { message: 'invalid_month' }),
  shares: z
    .array(
      z.object({
        toCategoryId: zObjectId,
        toSubcategoryId: zObjectId.optional(),
        amountCents: z.number().int().min(0),
      }),
    )
    .max(50),
});

export type DistributionPutInput = z.infer<typeof distributionPutSchema>;
