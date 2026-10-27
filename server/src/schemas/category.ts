import { z } from 'zod';
import { zHexColor } from './common.js';

export const categoryCreateSchema = z.object({
  name: z.string().min(1).max(60),
  kanji: z.string().max(8).optional(),
  color: zHexColor,
  percentBp: z.number().int().min(0).max(10000),
  order: z.number().int().min(0).optional(),
  flexible: z.boolean().optional(),
  savings: z.boolean().optional(),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
