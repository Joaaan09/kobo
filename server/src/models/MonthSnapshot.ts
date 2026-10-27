import { Schema, model, Types, HydratedDocument } from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/** Reparto congelado de una categoría dentro de un mes. */
export interface IAllocation {
  categoryId: Types.ObjectId;
  percentBp: number;
  assignedCents: number;
}

/**
 * Foto del presupuesto de un mes (nómina + reparto por categorías). v1: el
 * panel se computa en vivo; el snapshot congela el pasado para no recalcularlo
 * si cambian los % (follow-up). Único por (userId, year, month).
 */
export interface IMonthSnapshot {
  userId: Types.ObjectId;
  year: number;
  month: number;
  nominaCents: number;
  allocations: IAllocation[];
}

export type MonthSnapshotDocument = HydratedDocument<IMonthSnapshot>;

const allocationSchema = new Schema<IAllocation>(
  {
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    percentBp: { type: Number, required: true, min: 0 },
    assignedCents: { type: Number, required: true },
  },
  { _id: false },
);

const monthSnapshotSchema = new Schema<IMonthSnapshot>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    nominaCents: { type: Number, required: true, default: 0 },
    allocations: { type: [allocationSchema], default: [] },
  },
  { timestamps: true },
);

monthSnapshotSchema.index({ userId: 1, year: 1, month: 1 }, { unique: true });
monthSnapshotSchema.plugin(serializePlugin);

export const MonthSnapshot = model<IMonthSnapshot>('MonthSnapshot', monthSnapshotSchema);
