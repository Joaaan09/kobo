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
    // Inicio del mes de Kobo: desde `from` (YYYY-MM) cada mes empieza el día
    // `startDay`. undefined = no tocar. Días 29–31 no existen en todos los meses.
    cycle: z
      .object({
        startDay: z.number().int().min(1).max(28),
        from: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'invalid_month'),
      })
      .optional(),
  })
  .refine(defaultPair, { message: 'account_bucket_pair', path: ['defaultBucketId'] });

export type IncomeConfigInput = z.infer<typeof incomeConfigSchema>;
