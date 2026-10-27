import { Schema, model, Types, HydratedDocument } from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/**
 * Ingreso (ganancia). `amountCents` en céntimos (positivo). `isNomina` marca
 * el ingreso de nómina. Puede enlazarse a cuenta + bucket para sumar al patrimonio.
 */
export interface IIncome {
  userId: Types.ObjectId;
  amountCents: number;
  date: Date;
  source?: string;
  accountId?: Types.ObjectId;
  bucketId?: Types.ObjectId;
  isNomina: boolean;
}

export type IncomeDocument = HydratedDocument<IIncome>;

const incomeSchema = new Schema<IIncome>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountCents: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true },
    source: { type: String, trim: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account' },
    bucketId: { type: Schema.Types.ObjectId },
    isNomina: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

incomeSchema.index({ userId: 1, date: -1 });
incomeSchema.plugin(serializePlugin);

export const Income = model<IIncome>('Income', incomeSchema);
