import { z } from 'zod';
import { zObjectId } from './common.js';

export const subcategoryCreateSchema = z.object({
  categoryId: zObjectId,
  name: z.string().min(1).max(60),
  limitCents: z.number().int().min(0).optional(),
});

export const subcategoryUpdateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  limitCents: z.number().int().min(0).optional(),
});

export type SubcategoryCreateInput = z.infer<typeof subcategoryCreateSchema>;
export type SubcategoryUpdateInput = z.infer<typeof subcategoryUpdateSchema>;
