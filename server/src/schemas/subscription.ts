import { z } from 'zod';
import { zObjectId } from './common.js';

/** `YYYY-MM-DD` de un día que EXISTE (nada de 31 de febrero, que V8 pasaría a marzo). */
const zDayKey = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'invalid_date')
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDate() === d;
  }, 'invalid_date');

// Cuenta y sub-saldo van juntos o ninguno (null = desvincular en el PATCH).
const accountBucketPair = (d: { accountId?: string | null; bucketId?: string | null }) =>
  Boolean(d.accountId) === Boolean(d.bucketId);

// Una anual necesita su mes; una mensual no lo usa.
const yearlyHasMonth = (d: { frequency?: string; monthOfYear?: number | null }) =>
  d.frequency !== 'yearly' || typeof d.monthOfYear === 'number';

export const subscriptionCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    amountCents: z.number().int().positive(),
    categoryId: zObjectId,
    subcategoryId: zObjectId.optional(),
    accountId: zObjectId.optional(),
    bucketId: zObjectId.optional(),
    frequency: z.enum(['monthly', 'yearly']),
    dayOfMonth: z.number().int().min(1).max(31),
    monthOfYear: z.number().int().min(1).max(12).optional(),
    /** Primer cargo (opcional; por defecto, el primero del calendario desde hoy). */
    nextChargeDate: zDayKey.optional(),
  })
  .refine(accountBucketPair, { message: 'account_bucket_pair', path: ['bucketId'] })
  .refine(yearlyHasMonth, { message: 'month_required', path: ['monthOfYear'] });

export const subscriptionUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    amountCents: z.number().int().positive().optional(),
    categoryId: zObjectId.optional(),
    subcategoryId: zObjectId.nullable().optional(),
    accountId: zObjectId.nullable().optional(),
    bucketId: zObjectId.nullable().optional(),
    frequency: z.enum(['monthly', 'yearly']).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    monthOfYear: z.number().int().min(1).max(12).nullable().optional(),
    nextChargeDate: zDayKey.optional(),
    active: z.boolean().optional(),
  })
  .refine(accountBucketPair, { message: 'account_bucket_pair', path: ['bucketId'] });

export type SubscriptionCreateInput = z.infer<typeof subscriptionCreateSchema>;
export type SubscriptionUpdateInput = z.infer<typeof subscriptionUpdateSchema>;
