import { z } from 'zod';
import { zObjectId } from './common.js';

// accountId y bucketId van juntos o ninguno (un gasto enlazado a cuenta necesita bucket).
// Aceptan `null` porque el PATCH lo usa para desvincular explícitamente.
const accountBucketPair = (d: { accountId?: string | null; bucketId?: string | null }) =>
  Boolean(d.accountId) === Boolean(d.bucketId);

// Un gasto que no afecta al patrimonio no puede enlazar cuenta (si no, movería un saldo).
const patrimonyNoAccount = (d: {
  affectsPatrimony?: boolean;
  accountId?: string | null;
  bucketId?: string | null;
}) => d.affectsPatrimony !== false || (!d.accountId && !d.bucketId);

export const expenseCreateSchema = z
  .object({
    amountCents: z.number().int().positive(),
    date: z.coerce.date(),
    categoryId: zObjectId,
    subcategoryId: zObjectId.optional(),
    fundId: zObjectId.optional(),
    accountId: zObjectId.optional(),
    bucketId: zObjectId.optional(),
    affectsPatrimony: z.boolean().optional(),
    note: z.string().max(280).optional(),
  })
  .refine(accountBucketPair, { message: 'account_bucket_pair', path: ['bucketId'] })
  .refine(patrimonyNoAccount, { message: 'patrimony_account_conflict', path: ['accountId'] });

export const expenseUpdateSchema = z
  .object({
    amountCents: z.number().int().positive().optional(),
    date: z.coerce.date().optional(),
    categoryId: zObjectId.optional(),
    // `null` desvincula explícitamente (mover el gasto a "sin subcategoría" / "sin fondo" / "sin cuenta").
    subcategoryId: zObjectId.nullable().optional(),
    fundId: zObjectId.nullable().optional(),
    accountId: zObjectId.nullable().optional(),
    bucketId: zObjectId.nullable().optional(),
    affectsPatrimony: z.boolean().optional(),
    note: z.string().max(280).optional(),
    // Confirmar la categoría de un gasto ingerido lo saca de la bandeja de revisión.
    needsReview: z.boolean().optional(),
  })
  .refine(accountBucketPair, { message: 'account_bucket_pair', path: ['bucketId'] })
  .refine(patrimonyNoAccount, { message: 'patrimony_account_conflict', path: ['accountId'] });

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>;
