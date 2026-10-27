import { z } from 'zod';
import { zObjectId } from './common.js';

/** Cuenta y bucket destino van juntos: ambos o ninguno. `null` = desvincular. */
const defaultPair = (d: { defaultAccountId?: string | null; defaultBucketId?: string | null }) =>
  Boolean(d.defaultAccountId) === Boolean(d.defaultBucketId);

export const incomeConfigSchema = z
  .object({
    type: z.enum(['fija', 'variable']),
    amountCents: z.number().int().min(0),
    payDay: z.number().int().min(1).max(31),
    effectiveFrom: z.coerce.date().optional(),
    // undefined = no tocar el destino; null = desvincular; ObjectId = fijar.
    defaultAccountId: zObjectId.nullable().optional(),
    defaultBucketId: zObjectId.nullable().optional(),
  })
  .refine(defaultPair, { message: 'account_bucket_pair', path: ['defaultBucketId'] });

export type IncomeConfigInput = z.infer<typeof incomeConfigSchema>;
