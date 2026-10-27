import { z } from 'zod';
import { zObjectId } from './common.js';

const accountBucketPair = (d: { accountId?: string; bucketId?: string }) =>
  Boolean(d.accountId) === Boolean(d.bucketId);

export const incomeCreateSchema = z
  .object({
    amountCents: z.number().int().positive(),
    date: z.coerce.date(),
    source: z.string().max(120).optional(),
    accountId: zObjectId.optional(),
    bucketId: zObjectId.optional(),
    isNomina: z.boolean().optional(),
  })
  .refine(accountBucketPair, { message: 'account_bucket_pair', path: ['bucketId'] });

export const incomeUpdateSchema = z
  .object({
    amountCents: z.number().int().positive().optional(),
    date: z.coerce.date().optional(),
    source: z.string().max(120).optional(),
    accountId: zObjectId.optional(),
    bucketId: zObjectId.optional(),
    isNomina: z.boolean().optional(),
  })
  .refine(accountBucketPair, { message: 'account_bucket_pair', path: ['bucketId'] });

export type IncomeCreateInput = z.infer<typeof incomeCreateSchema>;
export type IncomeUpdateInput = z.infer<typeof incomeUpdateSchema>;
