import { Schema, model, HydratedDocument } from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/** Tema visual del usuario (Washi claro / Sumi oscuro / Auto sigue al sistema). */
export type Theme = 'washi' | 'sumi' | 'auto';

/** Módulos del panel que el usuario puede activar/desactivar. */
export interface IUserModules {
  ritmo: boolean;
  acumulado: boolean;
  comparativa: boolean;
  sinAsignar: boolean;
}

/**
 * Cuándo avisar de un gasto que entró por automatización:
 * - `none` — nunca.
 * - `review` — solo si ninguna regla supo clasificarlo (pide acción tuya).
 * - `all` — cada pago. Útil al principio; se vuelve ruido si pagas mucho.
 */
export type IngestNotify = 'none' | 'review' | 'all';

/** Preferencias de notificaciones push (通知). */
export interface IUserNotifications {
  ingest: IngestNotify;
  /** Recordatorio de fin de día para apuntar lo que no entró solo. */
  dailyReminder: boolean;
  /** Hora local (Europe/Madrid) del recordatorio, 0–23. */
  dailyHour: number;
  /** Último día ya avisado (`YYYY-MM-DD` en Madrid): evita repetir el aviso. */
  lastDailyKey?: string;
}

/** Preferencias de UI del usuario. */
export interface IUserPrefs {
  theme: Theme;
  mincho: boolean;
  modules: IUserModules;
  notifications: IUserNotifications;
}

/** Documento de usuario (campos crudos; los timestamps los añade Mongoose). */
export interface IUser {
  email: string;
  passwordHash: string;
  prefs: IUserPrefs;
}

export type UserDocument = HydratedDocument<IUser>;

const modulesSchema = new Schema<IUserModules>(
  {
    ritmo: { type: Boolean, default: true },
    acumulado: { type: Boolean, default: true },
    comparativa: { type: Boolean, default: true },
    sinAsignar: { type: Boolean, default: true },
  },
  { _id: false },
);

const notificationsSchema = new Schema<IUserNotifications>(
  {
    // Por defecto solo lo que pide acción: avisar de CADA pago se vuelve ruido.
    ingest: { type: String, enum: ['none', 'review', 'all'], default: 'review' },
    dailyReminder: { type: Boolean, default: false },
    dailyHour: { type: Number, min: 0, max: 23, default: 21 },
    lastDailyKey: { type: String },
  },
  { _id: false },
);

const prefsSchema = new Schema<IUserPrefs>(
  {
    theme: { type: String, enum: ['washi', 'sumi', 'auto'], default: 'auto' },
    mincho: { type: Boolean, default: true },
    modules: { type: modulesSchema, default: () => ({}) },
    // Los usuarios creados antes de las push se hidratan con los valores por defecto.
    notifications: { type: notificationsSchema, default: () => ({}) },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    prefs: { type: prefsSchema, default: () => ({}) },
  },
  { timestamps: true },
);

userSchema.plugin(serializePlugin);

export const User = model<IUser>('User', userSchema);
