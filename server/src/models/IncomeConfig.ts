import { Schema, model, Types, HydratedDocument } from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/** Tipo de nómina: fija (mismo importe cada mes) o variable. */
export type IncomeType = 'fija' | 'variable';

/**
 * Configuración de nómina del usuario. v1: una sola config por usuario
 * (upsert por `userId`). `effectiveFrom` queda para el histórico por snapshot
 * (follow-up); en v1 el importe vigente se usa para todos los meses.
 */
export interface IIncomeConfig {
  userId: Types.ObjectId;
  type: IncomeType;
  amountCents: number;
  payDay: number;
  effectiveFrom: Date;
  /** Cuenta + sub-saldo donde cae la nómina (opcional). Prefija el ingreso al cobrarla. */
  defaultAccountId?: Types.ObjectId;
  defaultBucketId?: Types.ObjectId;
  /**
   * Inicio del mes de Kobo (ciclo de nómina) como historial de tramos: desde
   * `from` (`YYYY-MM`, inclusive) cada mes empieza el día `startDay`. Sin tramos,
   * mes natural. Ver `CycleConfig` en `lib/time.ts`.
   */
  cycleChanges: ICycleChange[];
}

export interface ICycleChange {
  from: string;
  startDay: number;
}

export type IncomeConfigDocument = HydratedDocument<IIncomeConfig>;

const cycleChangeSchema = new Schema<ICycleChange>(
  {
    from: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    startDay: { type: Number, required: true, min: 1, max: 28 },
  },
  { _id: false },
);

const incomeConfigSchema = new Schema<IIncomeConfig>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    type: { type: String, enum: ['fija', 'variable'], required: true },
    amountCents: { type: Number, required: true, min: 0 },
    payDay: { type: Number, required: true, min: 1, max: 31 },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    defaultAccountId: { type: Schema.Types.ObjectId, ref: 'Account' },
    defaultBucketId: { type: Schema.Types.ObjectId },
    cycleChanges: { type: [cycleChangeSchema], default: [] },
  },
  { timestamps: true },
);

incomeConfigSchema.plugin(serializePlugin);

export const IncomeConfig = model<IIncomeConfig>('IncomeConfig', incomeConfigSchema);
