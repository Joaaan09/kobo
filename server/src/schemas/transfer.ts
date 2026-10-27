import { z } from 'zod';
import { zObjectId } from './common.js';

/** Origen y destino no pueden ser exactamente el mismo bucket. */
const distinctEndpoints = (d: {
  fromAccountId?: string;
  fromBucketId?: string;
  toAccountId?: string;
  toBucketId?: string;
}) => !(d.fromAccountId === d.toAccountId && d.fromBucketId === d.toBucketId);

export const transferCreateSchema = z
  .object({
    amountCents: z.number().int().positive(),
    date: z.coerce.date(),
    fromAccountId: zObjectId,
    fromBucketId: zObjectId,
    toAccountId: zObjectId,
    toBucketId: zObjectId,
    categoryId: zObjectId.optional(),
    note: z.string().max(120).optional(),
  })
  .refine(distinctEndpoints, { message: 'same_endpoint', path: ['toBucketId'] });

// Update: campos opcionales (parcial). La invariante "origen ≠ destino" y la
// existencia de los buckets se comprueban en la ruta sobre el estado ya fusionado,
// porque un parcial no siempre trae los cuatro extremos a la vez.
export const transferUpdateSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  date: z.coerce.date().optional(),
  fromAccountId: zObjectId.optional(),
  fromBucketId: zObjectId.optional(),
  toAccountId: zObjectId.optional(),
  toBucketId: zObjectId.optional(),
  // `null` desvincula el sobre de ahorro; `undefined` lo deja como está.
  categoryId: zObjectId.nullable().optional(),
  note: z.string().max(120).optional(),
});

export type TransferCreateInput = z.infer<typeof transferCreateSchema>;
export type TransferUpdateInput = z.infer<typeof transferUpdateSchema>;
