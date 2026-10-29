import { Schema, model, Types, HydratedDocument } from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/** Periodicidad de una suscripción: cada mes (día N) o cada año (día N del mes M). */
export type SubscriptionFrequency = 'monthly' | 'yearly';

/**
 * Suscripción / pago recurrente (定期): un cargo que se repite y que Kobo apunta
 * solo, como gasto real, el día que toca (`services/subscriptions.ts`).
 *
 * - `dayOfMonth` es el día **pedido** (1..31). El cargo cae ese día o, si el mes
 *   es más corto, el último (31 → 28 feb → 31 mar: el ancla no se pierde).
 * - `nextChargeDate` (`YYYY-MM-DD`, día de Madrid) es el siguiente cargo pendiente.
 *   El planificador registra todo cargo con fecha ≤ hoy y avanza esta fecha, así
 *   que si el servidor estuvo caído, al volver se ponen al día los cargos perdidos.
 * - Idempotencia: cada cargo es un `Expense` con `clientRef = sub:<id>:<día>`
 *   (índice único por usuario): un doble tick nunca duplica el cargo.
 * - `lastError`: si el cargo no se pudo registrar (p. ej. la categoría ya no
 *   existe), la suscripción se **pausa** y lo dice, en vez de fallar en silencio.
 */
export interface ISubscription {
  userId: Types.ObjectId;
  name: string;
  amountCents: number;
  categoryId: Types.ObjectId;
  subcategoryId?: Types.ObjectId;
  accountId?: Types.ObjectId;
  bucketId?: Types.ObjectId;
  frequency: SubscriptionFrequency;
  dayOfMonth: number;
  /** Solo `yearly`: mes del cargo (1..12). */
  monthOfYear?: number;
  nextChargeDate: string;
  active: boolean;
  /** Último cargo registrado (`YYYY-MM-DD`): evita cobrar dos veces un periodo al reprogramar. */
  lastChargeDate?: string;
  lastChargedAt?: Date;
  lastError?: string;
}

export type SubscriptionDocument = HydratedDocument<ISubscription>;

const subscriptionSchema = new Schema<ISubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    amountCents: { type: Number, required: true, min: 1 },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    subcategoryId: { type: Schema.Types.ObjectId, ref: 'Subcategory' },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account' },
    bucketId: { type: Schema.Types.ObjectId },
    frequency: { type: String, enum: ['monthly', 'yearly'], required: true, default: 'monthly' },
    dayOfMonth: { type: Number, required: true, min: 1, max: 31 },
    monthOfYear: { type: Number, min: 1, max: 12 },
    nextChargeDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    active: { type: Boolean, required: true, default: true },
    lastChargeDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    lastChargedAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true },
);

// El planificador busca las activas con cargo vencido.
subscriptionSchema.index({ active: 1, nextChargeDate: 1 });
subscriptionSchema.plugin(serializePlugin);

export const Subscription = model<ISubscription>('Subscription', subscriptionSchema);
