import { Schema, model, Types, HydratedDocument } from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/**
 * Suscripción a notificaciones push de un navegador concreto (通知).
 *
 * La entrega la produce el navegador (`PushManager.subscribe`) y la guardamos tal
 * cual: `endpoint` es la URL del servicio de push del fabricante y `keys` el par
 * con el que se cifra el mensaje. Un usuario puede tener varias (móvil, portátil).
 *
 * `endpoint` es **único global**, no por usuario: identifica un navegador, y si el
 * mismo navegador cambia de cuenta debe pertenecer solo a la última. Cuando el
 * servicio responde 404/410 la suscripción está muerta y se borra sola
 * (ver `services/push.ts`) — es el ciclo de vida normal, no un error.
 *
 * Aviso de plataforma: **en iOS solo funcionan si Kobo está instalada en la
 * pantalla de inicio**. En Safari a pelo, Apple no entrega push web.
 */
export interface IPushSubscription {
  userId: Types.ObjectId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Para que el usuario reconozca el dispositivo en la lista. */
  userAgent?: string;
  lastSuccessAt?: Date;
}

export type PushSubscriptionDocument = HydratedDocument<IPushSubscription>;

const pushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, trim: true },
    lastSuccessAt: { type: Date },
  },
  { timestamps: true },
);

pushSubscriptionSchema.plugin(serializePlugin);

export const PushSubscription = model<IPushSubscription>(
  'PushSubscription',
  pushSubscriptionSchema,
);
