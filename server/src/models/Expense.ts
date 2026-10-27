import { Schema, model, Types, HydratedDocument } from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/**
 * Gasto. `amountCents` en céntimos (positivo). Puede enlazarse a una cuenta
 * (`accountId`) + bucket (`bucketId`) para descontar del patrimonio.
 *
 * Si lleva `fundId`, es el **pago real de un fondo de previsión** (積立): se
 * descuenta del saldo acumulado del fondo y NO cuenta como gasto normal del mes
 * (el dashboard lo excluye de `spentCents`/`gastadoTotalCents`).
 *
 * `affectsPatrimony` (por defecto `true`): si es `false`, el gasto es un registro
 * histórico/informativo que NO mueve el saldo de ninguna cuenta (p. ej. un gasto
 * que ya hiciste hace tiempo). Sigue contando como "gastado" en su categoría. Un
 * gasto con `affectsPatrimony: false` nunca lleva `accountId`/`bucketId` (invariante
 * que valida el schema), así que jamás toca el patrimonio.
 *
 * **Ingesta automática** (Atajo de iOS, ver `services/ingest.ts`): `source` marca
 * de dónde vino el gasto, `merchant` guarda el comercio que mandó Wallet y
 * `needsReview` avisa de que ninguna regla supo clasificarlo. Un gasto ingerido
 * es un gasto real desde el primer segundo —el dinero ya salió de la cuenta—;
 * `needsReview` solo pide confirmar SU CATEGORÍA, nunca su existencia.
 * `clientRef` es la clave de idempotencia del dispositivo: el disparador de iOS
 * reintenta, y sin ella cada reintento sería un gasto duplicado.
 */
export interface IExpense {
  userId: Types.ObjectId;
  amountCents: number;
  date: Date;
  categoryId: Types.ObjectId;
  subcategoryId?: Types.ObjectId;
  fundId?: Types.ObjectId;
  accountId?: Types.ObjectId;
  bucketId?: Types.ObjectId;
  affectsPatrimony: boolean;
  note?: string;
  source: ExpenseSource;
  merchant?: string;
  needsReview: boolean;
  clientRef?: string;
}

/** Origen del gasto: escrito a mano en la app o ingerido por automatización. */
export type ExpenseSource = 'manual' | 'ingest';

export type ExpenseDocument = HydratedDocument<IExpense>;

const expenseSchema = new Schema<IExpense>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountCents: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    subcategoryId: { type: Schema.Types.ObjectId, ref: 'Subcategory' },
    fundId: { type: Schema.Types.ObjectId, ref: 'Fund' },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account' },
    bucketId: { type: Schema.Types.ObjectId },
    affectsPatrimony: { type: Boolean, required: true, default: true },
    note: { type: String, trim: true },
    // Los gastos creados antes de la ingesta se hidratan como 'manual' / sin revisar.
    source: { type: String, enum: ['manual', 'ingest'], required: true, default: 'manual' },
    merchant: { type: String, trim: true },
    needsReview: { type: Boolean, required: true, default: false },
    clientRef: { type: String, trim: true },
  },
  { timestamps: true },
);

expenseSchema.index({ userId: 1, date: -1 });
// Idempotencia de la ingesta: un `clientRef` como mucho una vez por usuario. El
// filtro parcial deja fuera los gastos sin clientRef (si no, todos colisionarían).
expenseSchema.index(
  { userId: 1, clientRef: 1 },
  { unique: true, partialFilterExpression: { clientRef: { $type: 'string' } } },
);
// La bandeja "por revisar" se consulta por este par en cada carga del Taller.
expenseSchema.index({ userId: 1, needsReview: 1 });
expenseSchema.plugin(serializePlugin);

export const Expense = model<IExpense>('Expense', expenseSchema);
