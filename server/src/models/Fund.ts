import { Schema, model, Types, HydratedDocument } from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/**
 * Fondo de previsión (積立 *tsumitate*) — un gasto **no mensual** que se suaviza.
 *
 * Pertenece a una categoría y **reserva un importe fijo cada mes** tallado del
 * presupuesto de esa categoría (no suma al 100 % de la nómina). Ese importe
 * mensual (`provisionCents`, derivado de `targetCents / everyMonths`) **acumula
 * mes a mes** (rollover, a diferencia de un sobre normal que reinicia). El pago
 * real de golpe (`targetCents`) se registra como un `Expense` con `fundId` y se
 * descuenta del saldo acumulado, sin contar como gasto normal del mes.
 *
 * El saldo NO se guarda: se **deriva** al vuelo (provisiones desde `startYear`/
 * `startMonth` menos pagos), coherente con el resto del cálculo mes a mes.
 *
 * `subcategoryId` es **opcional y solo etiqueta**: el dinero sale siempre del
 * sobre de la categoría (la subcategoría no tiene presupuesto propio), pero
 * anclarlo permite que el pago herede la clasificación correcta y que la hucha
 * se vea donde el gasto vive de verdad. Debe pertenecer a `categoryId`.
 */
export interface IFund {
  userId: Types.ObjectId;
  categoryId: Types.ObjectId;
  subcategoryId?: Types.ObjectId;
  name: string;
  kanji?: string;
  targetCents: number; // lo que pagas de golpe (p. ej. 150 € = 15000)
  everyMonths: number; // cada cuántos meses lo pagas (estimación)
  startYear: number; // desde cuándo empieza a acumular
  startMonth: number; // 1..12
  order: number;
}

export type FundDocument = HydratedDocument<IFund>;

const fundSchema = new Schema<IFund>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    subcategoryId: { type: Schema.Types.ObjectId, ref: 'Subcategory' },
    name: { type: String, required: true, trim: true },
    kanji: { type: String, trim: true },
    targetCents: { type: Number, required: true, min: 1 },
    everyMonths: { type: Number, required: true, min: 1, max: 120 },
    startYear: { type: Number, required: true },
    startMonth: { type: Number, required: true, min: 1, max: 12 },
    order: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

fundSchema.index({ userId: 1, categoryId: 1 });
fundSchema.plugin(serializePlugin);

export const Fund = model<IFund>('Fund', fundSchema);
