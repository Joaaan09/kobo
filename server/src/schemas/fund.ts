import { z } from 'zod';
import { zObjectId } from './common.js';

/** Un fondo se paga como mucho cada 120 meses (10 años); el objetivo va en céntimos. */
export const fundCreateSchema = z.object({
  categoryId: zObjectId,
  /** Subcategoría a la que se ancla (opcional): solo etiqueta, el dinero es de la categoría. */
  subcategoryId: zObjectId.optional(),
  name: z.string().min(1).max(60),
  kanji: z.string().max(4).optional(),
  targetCents: z.number().int().positive(),
  everyMonths: z.number().int().min(1).max(120),
  startYear: z.number().int().min(2000).max(2100).optional(),
  startMonth: z.number().int().min(1).max(12).optional(),
  order: z.number().int().optional(),
});

export const fundUpdateSchema = z.object({
  /** `null` desancla el fondo de su subcategoría; ausente = no se toca. */
  subcategoryId: zObjectId.nullable().optional(),
  name: z.string().min(1).max(60).optional(),
  kanji: z.string().max(4).optional(),
  targetCents: z.number().int().positive().optional(),
  everyMonths: z.number().int().min(1).max(120).optional(),
  startYear: z.number().int().min(2000).max(2100).optional(),
  startMonth: z.number().int().min(1).max(12).optional(),
  order: z.number().int().optional(),
});

export type FundCreateInput = z.infer<typeof fundCreateSchema>;
export type FundUpdateInput = z.infer<typeof fundUpdateSchema>;
