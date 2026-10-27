import { Schema, model, Types, HydratedDocument } from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/**
 * Naturaleza del rendimiento:
 * - `interes` — liquidación de una cuenta remunerada (el banco abona dinero nuevo).
 * - `revalorizacion` — cambio de valor de mercado de una inversión (puede ser negativo).
 */
export type ValuationKind = 'interes' | 'revalorizacion';

/**
 * Valoración (評価): variación del **valor** de un sub-saldo que NO viene de un
 * movimiento del usuario. Es el tercer evento del patrimonio, junto a la
 * transacción (gasto/ingreso) y el traspaso (`Transfer`).
 *
 * Reglas de dominio (el dinero es sagrado):
 * - **Mueve patrimonio**: aplica `deltaCents` al saldo del bucket (puede ser negativo).
 * - **Invisible para el presupuesto**: NO es gasto ni ingreso. El dashboard no la
 *   mira, así que no toca categorías, "queda por gastar" ni el ritmo del mes.
 *   Meterla como ingreso inflaría los ingresos reales — el mismo error que ya se
 *   corrigió con los traspasos.
 * - **Nunca se devenga sola**: el % solo *estima*; el saldo cambia cuando el
 *   usuario confirma lo que de verdad pasó en su banco.
 *
 * En un interés, `grossCents` guarda el bruto antes de retención (el `deltaCents`
 * es lo que realmente entró en la cuenta). En una revalorización no aplica.
 */
export interface IValuation {
  userId: Types.ObjectId;
  accountId: Types.ObjectId;
  bucketId: Types.ObjectId;
  date: Date;
  deltaCents: number;
  kind: ValuationKind;
  grossCents?: number;
  note?: string;
}

export type ValuationDocument = HydratedDocument<IValuation>;

const valuationSchema = new Schema<IValuation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    bucketId: { type: Schema.Types.ObjectId, required: true },
    date: { type: Date, required: true },
    // Firmado y != 0 (lo valida el schema zod): una valoración que no mueve nada
    // no es un hecho, es ruido.
    deltaCents: { type: Number, required: true },
    kind: { type: String, enum: ['interes', 'revalorizacion'], required: true },
    grossCents: { type: Number },
    note: { type: String, trim: true },
  },
  { timestamps: true },
);

valuationSchema.index({ userId: 1, date: -1 });
valuationSchema.index({ userId: 1, bucketId: 1, date: -1 });
valuationSchema.plugin(serializePlugin);

export const Valuation = model<IValuation>('Valuation', valuationSchema);
