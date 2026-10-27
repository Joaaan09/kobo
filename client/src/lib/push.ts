import { api } from './api';
import { isStandalone } from './install';

/**
 * Notificaciones push (通知) en el cliente: permiso, suscripción y baja.
 *
 * Aviso de plataforma que condiciona toda la UI: **en iPhone solo funcionan si
 * Kobo está instalada en la pantalla de inicio**. En Safari a pelo, `Notification`
 * ni siquiera existe. Por eso `pushSupport()` distingue "no se puede" de "aún no
 * lo has activado": son mensajes muy distintos para el usuario.
 */

export interface PushConfig {
  enabled: boolean;
  publicKey: string | null;
  devices: number;
  prefs: NotificationPrefs | null;
}

export interface NotificationPrefs {
  ingest: 'none' | 'review' | 'all';
  dailyReminder: boolean;
  dailyHour: number;
}

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'needs-install' };

/** ¿Puede este navegador recibir push? Y si no, ¿por qué? */
export function pushSupport(): PushSupport {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    // iOS solo expone PushManager dentro de una PWA instalada; fuera, ni existe.
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
    // Detección compartida con la guía de instalación: una sola definición de
    // "está corriendo como app" para toda la app (`lib/install.ts`).
    if (isIOS && !isStandalone()) return { ok: false, reason: 'needs-install' };
    return { ok: false, reason: 'unsupported' };
  }
  if (!('Notification' in window)) return { ok: false, reason: 'unsupported' };
  return { ok: true };
}

/**
 * Clave VAPID en base64url → los bytes que espera `subscribe()`.
 * Se construye sobre un `ArrayBuffer` explícito: el tipo genérico de `Uint8Array`
 * admite `SharedArrayBuffer`, que `BufferSource` no acepta.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/** ¿Está este navegador ya suscrito? */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport().ok !== true) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/**
 * Pide permiso, se suscribe y registra la suscripción en el servidor.
 * Lanza `Error` con un motivo legible si el usuario deniega o algo falla.
 */
export async function enablePush(publicKey: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Has bloqueado las notificaciones para Kobo. Actívalas en los ajustes del navegador.'
        : 'No se concedió el permiso de notificaciones.',
    );
  }

  const reg = await navigator.serviceWorker.ready;
  // Si ya había una suscripción (de otra clave VAPID, p. ej.) se reutiliza:
  // volver a suscribir con otra clave falla en algunos navegadores.
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
  if (!json.endpoint || !json.keys) throw new Error('El navegador devolvió una suscripción incompleta.');

  await api.post('/push/subscribe', {
    endpoint: json.endpoint,
    keys: json.keys,
    userAgent: navigator.userAgent.slice(0, 255),
  });
}

/** Da de baja este navegador (en el servidor y en el propio navegador). */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
