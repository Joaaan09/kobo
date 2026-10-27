import { Schema, model, Types, HydratedDocument } from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/**
 * Un tramo del reparto de un comodín: cuánto dinero (céntimos) va a una
 * categoría destino, opcionalmente afinado a una de sus subcategorías (pista,
 * no presupuesto propio: el dinero aterriza en la categoría padre).
 */
export interface IDistributionShare {
  toCategoryId: Types.ObjectId;
  toSubcategoryId?: Types.ObjectId;
  amountCents: number;
}

/**
 * Reparto mensual de una **categoría comodín** (`flexible`) entre otras
 * categorías. Vive por (userId, categoryId, year, month) para que cada mes sea
 * una decisión propia: cambiar el reparto de agosto no toca el de julio. Es una
 * **reasignación neutra** (mueve presupuesto entre categorías del mismo mes, no
 * crea ni destruye dinero) — ver services/dashboard.ts.
 */
export interface IDistribution {
  userId: Types.ObjectId;
  categoryId: Types.ObjectId; // la categoría comodín que se reparte
  year: number;
  month: number;
  shares: IDistributionShare[];
}

export type DistributionDocument = HydratedDocument<IDistribution>;

const shareSchema = new Schema<IDistributionShare>(
  {
    toCategoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    toSubcategoryId: { type: Schema.Types.ObjectId, ref: 'Subcategory' },
    amountCents: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const distributionSchema = new Schema<IDistribution>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    shares: { type: [shareSchema], default: [] },
  },
  { timestamps: true },
);

// Un único reparto por comodín y mes.
distributionSchema.index({ userId: 1, categoryId: 1, year: 1, month: 1 }, { unique: true });
distributionSchema.plugin(serializePlugin);

export const Distribution = model<IDistribution>('Distribution', distributionSchema);
