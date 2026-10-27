import { z } from 'zod';
import mongoose from 'mongoose';

/** Cadena que debe ser un ObjectId válido de Mongo. */
export const zObjectId = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), { message: 'invalid_id' });

/** Color hexadecimal (#rgb o #rrggbb). */
export const zHexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, { message: 'invalid_color' });
