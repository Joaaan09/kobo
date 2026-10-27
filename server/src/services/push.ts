import webpush from 'web-push';
import { env, pushEnabled } from '../config/env.js';
import { PushSubscription } from '../models/PushSubscription.js';

/**
 * Envío de notificaciones push (通知) por Web Push / VAPID.
 *
 * Principio: **una notificación nunca puede tumbar la operación que la provoca**.
 * Si el envío falla, el gasto ya está registrado y eso es lo que importa; el error
 * se traga y se registra, jamás se propaga a la ruta.
 *
 * Las suscripciones muertas (404/410 del servicio de push) se borran solas: es su
 * ciclo de vida normal —el usuario desinstaló la PWA o el navegador rotó la clave—,
 * no un fallo que haya que reportar.
 */

if (pushEnabled) {
  webpush.setVapidDetails(
    env.VAPID_SUBJECT || 'mailto:admin@kobo.local',
    env.VAPID_PUBLIC_KEY!,
    env.VAPID_PRIVATE_KEY!,
  );
}

/** Contenido de la notificación. `url` es a dónde lleva al tocarla. */
export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  /** Notificaciones con la misma etiqueta se sustituyen en vez de apilarse. */
  tag?: string;
}

/**
 * Envía a **todos** los dispositivos del usuario. Devuelve cuántos recibieron el
 * aviso. Nunca lanza: si las push están apagadas o todo falla, devuelve 0.
 */
export async function sendToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!pushEnabled) return 0;

  const subs = await PushSubscription.find({ userId });
  if (subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  let delivered = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          body,
        );
        delivered += 1;
        await PushSubscription.updateOne(
          { _id: sub._id },
          { $set: { lastSuccessAt: new Date() } },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Suscripción caducada: se limpia y nadie tiene que enterarse.
          await PushSubscription.deleteOne({ _id: sub._id });
          return;
        }
        console.error('[push] envío fallido', { status });
      }
    }),
  );

  return delivered;
}

/**
 * Igual que `sendToUser` pero pensado para llamarse **sin await** desde una ruta:
 * atrapa cualquier error para que un fallo de notificación no deje una promesa
 * rechazada colgando ni afecte a la respuesta HTTP.
 */
export function notifyInBackground(userId: string, payload: PushPayload): void {
  void sendToUser(userId, payload).catch((err) => {
    console.error('[push] error inesperado', err);
  });
}
