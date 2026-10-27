import { Schema, model, Types, HydratedDocument } from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/**
 * Movimiento (transferencia) entre dos sub-saldos del patrimonio. Mueve
 * `amountCents` de `(fromAccountId, fromBucketId)` a `(toAccountId, toBucketId)`.
 *
 * Reglas de dominio (el dinero es sagrado):
 * - **Neutro para el patrimonio**: suma 0 (resta en origen, suma en destino).
 * - **Invisible para el presupuesto**: NO es gasto ni ingreso; el dashboard no lo
 *   mira, así que no toca categorías, "queda por gastar" ni el ritmo del mes.
 * - Sirve también para **rebalancear** dos buckets de la MISMA cuenta.
 *
 * Origen y destino son obligatorios (un movimiento sin ambos extremos no tiene
 * sentido) y no pueden ser el mismo bucket (lo valida el schema zod).
 *
 * `categoryId` (opcional) apunta a un **sobre de ahorro** (`Category.savings`):
 * mover dinero a tu inversión **consume** ese sobre del mes sin contar como gasto.
 * Sigue siendo neutro para el patrimonio; lo único que cambia es que el
 * presupuesto de esa categoría deja de figurar como disponible.
 */
export interface ITransfer {
  userId: Types.ObjectId;
  amountCents: number;
  date: Date;
  fromAccountId: Types.ObjectId;
  fromBucketId: Types.ObjectId;
  toAccountId: Types.ObjectId;
  toBucketId: Types.ObjectId;
  /** Sobre de ahorro que consume este movimiento (debe ser `Category.savings`). */
  categoryId?: Types.ObjectId;
  note?: string;
}

export type TransferDocument = HydratedDocument<ITransfer>;

const transferSchema = new Schema<ITransfer>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountCents: { type: Number, required: true, min: 1 },
    date: { type: Date, required: true },
    fromAccountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    fromBucketId: { type: Schema.Types.ObjectId, required: true },
    toAccountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    toBucketId: { type: Schema.Types.ObjectId, required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
    note: { type: String, trim: true },
  },
  { timestamps: true },
);

transferSchema.index({ userId: 1, date: -1 });
transferSchema.plugin(serializePlugin);

export const Transfer = model<ITransfer>('Transfer', transferSchema);
