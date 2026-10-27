import { Schema, model, Types, HydratedDocument } from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/** Subcategoría de una categoría. `limitCents` es un tope opcional (céntimos). */
export interface ISubcategory {
  userId: Types.ObjectId;
  categoryId: Types.ObjectId;
  name: string;
  limitCents?: number;
}

export type SubcategoryDocument = HydratedDocument<ISubcategory>;

const subcategorySchema = new Schema<ISubcategory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    name: { type: String, required: true, trim: true },
    limitCents: { type: Number, min: 0 },
  },
  { timestamps: true },
);

subcategorySchema.index({ userId: 1, categoryId: 1 });
subcategorySchema.plugin(serializePlugin);

export const Subcategory = model<ISubcategory>('Subcategory', subcategorySchema);
