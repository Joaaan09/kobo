import { Schema, model, Types, HydratedDocument } from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/**
 * Naturaleza del sub-saldo (define qué puede pasarle a su dinero):
 * - `cash` — efectivo/corriente: solo se mueve con gastos, ingresos y traspasos.
 * - `savings` — remunerado: además **liquida intereses** cada cierto tiempo.
 * - `investment` — invertido: su valor **fluctúa** (revalorización, también a la baja).
 */
export type BucketKind = 'cash' | 'savings' | 'investment';

/**
 * Bucket: desglose dentro de una cuenta (subdocumento con `_id`). El balance
 * en céntimos puede ser negativo (números rojos) y editarse a mano (reconciliación).
 *
 * `rateBps` es el tipo **nominal anual** en puntos básicos (3 % → 300), NO una TAE
 * compuesta: los bancos remuneran el saldo diario y abonan a mes vencido, así que
 * el interés se devenga `saldo × rate × días/365` (ver `services/rendimiento.ts`).
 * Es una **estimación** para prefijar el importe: el saldo solo cambia cuando el
 * usuario confirma la liquidación real del extracto.
 */
export interface IBucket {
  _id?: Types.ObjectId;
  name: string;
  balanceCents: number;
  kind: BucketKind;
  /** Solo `savings`: tipo nominal anual en puntos básicos (3 % → 300). */
  rateBps?: number;
  /** Solo `savings`: retención sobre los intereses en bps (19 % → 1900; 0 = bruto). */
  withholdingBps?: number;
}

/**
 * Cuenta del usuario (parte del patrimonio). Una cuenta simple = 1 bucket;
 * puede tener varios (p. ej. "Sueldo base" + "Inversión"). El patrimonio total
 * es Σ cuentas Σ buckets.balanceCents.
 */
export interface IAccount {
  userId: Types.ObjectId;
  name: string;
  color?: string;
  order: number;
  buckets: Types.DocumentArray<IBucket>;
}

export type AccountDocument = HydratedDocument<IAccount>;

const bucketSchema = new Schema<IBucket>(
  {
    name: { type: String, required: true, trim: true },
    balanceCents: { type: Number, required: true, default: 0 },
    // Los buckets creados antes de esta versión se hidratan como 'cash' (default).
    kind: { type: String, enum: ['cash', 'savings', 'investment'], required: true, default: 'cash' },
    rateBps: { type: Number },
    withholdingBps: { type: Number },
  },
  { _id: true },
);

const accountSchema = new Schema<IAccount>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    color: { type: String },
    order: { type: Number, required: true, default: 0 },
    buckets: { type: [bucketSchema], default: [] },
  },
  { timestamps: true },
);

accountSchema.index({ userId: 1, order: 1 });
// Solo la cuenta lleva el plugin (id). El bucketSchema conserva su `_id`
// intacto porque el frontend consume `bucket._id`.
accountSchema.plugin(serializePlugin);

export const Account = model<IAccount>('Account', accountSchema);
