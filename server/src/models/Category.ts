import { Schema, model, Types, HydratedDocument } from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/**
 * Categoría de presupuesto. `percentBp` = porcentaje de la nómina en puntos
 * básicos (1 % = 100 bp). La suma de todas debería tender a 10000 (100 %);
 * lo que falte = "sin asignar". `flexible` marca la categoría comodín.
 *
 * `savings` marca un **sobre de ahorro** (貯): su dinero no se gasta, se traspasa.
 * Ahorrar no es gastar —no cuenta en el ritmo del mes— pero **sí consume
 * presupuesto**, así que su asignado sale del "queda por gastar" (ver
 * `services/dashboard.ts` y decisiones.md).
 */
export interface ICategory {
  userId: Types.ObjectId;
  name: string;
  kanji?: string;
  color: string;
  percentBp: number;
  order: number;
  flexible: boolean;
  savings: boolean;
}

export type CategoryDocument = HydratedDocument<ICategory>;

const categorySchema = new Schema<ICategory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    kanji: { type: String, trim: true },
    color: { type: String, required: true },
    percentBp: { type: Number, required: true, min: 0, max: 10000, default: 0 },
    order: { type: Number, required: true, default: 0 },
    flexible: { type: Boolean, required: true, default: false },
    // Las categorías creadas antes de esta versión se hidratan como `false`.
    savings: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

categorySchema.index({ userId: 1, order: 1 });
categorySchema.plugin(serializePlugin);

export const Category = model<ICategory>('Category', categorySchema);
