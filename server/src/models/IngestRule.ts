import { Schema, model, Types, HydratedDocument } from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/**
 * Regla de auto-asignación (規則): "si el comercio contiene X → categoría Y".
 * Es lo que convierte un cobro anónimo del banco en un gasto ya clasificado.
 *
 * `match` se guarda **normalizado** (minúsculas, sin acentos ni signos, ver
 * `services/ingest.ts`) para comparar contra el comercio también normalizado;
 * `label` conserva lo que escribió el usuario, que es lo que se le enseña.
 *
 * Ante varias coincidencias gana la **más específica** (match más largo), así
 * que "mercadona online" puede afinar sobre "mercadona" sin borrarla.
 */
export interface IIngestRule {
  userId: Types.ObjectId;
  /** Texto normalizado a buscar dentro del comercio. */
  match: string;
  /** El texto tal cual lo escribió el usuario. */
  label: string;
  categoryId: Types.ObjectId;
  subcategoryId?: Types.ObjectId;
  /** Veces que la regla ha clasificado un gasto (para ordenarlas por utilidad). */
  hits: number;
  lastUsedAt?: Date;
}

export type IngestRuleDocument = HydratedDocument<IIngestRule>;

const ingestRuleSchema = new Schema<IIngestRule>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    match: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    subcategoryId: { type: Schema.Types.ObjectId, ref: 'Subcategory' },
    hits: { type: Number, required: true, default: 0 },
    lastUsedAt: { type: Date },
  },
  { timestamps: true },
);

// Una regla por patrón y usuario: reaprender el mismo comercio actualiza, no duplica.
ingestRuleSchema.index({ userId: 1, match: 1 }, { unique: true });
ingestRuleSchema.plugin(serializePlugin);

export const IngestRule = model<IIngestRule>('IngestRule', ingestRuleSchema);
