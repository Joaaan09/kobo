import { z } from 'zod';

/**
 * Suscripción tal y como la entrega `PushManager.subscribe()` en el navegador.
 * Se valida en el borde como todo lo demás: `endpoint` tiene que ser una URL de
 * verdad y las claves no pueden venir vacías.
 */
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
  userAgent: z.string().max(255).optional(),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
});

/** Preferencias de notificación (todas opcionales: es un PATCH). */
export const notificationPrefsSchema = z.object({
  ingest: z.enum(['none', 'review', 'all']).optional(),
  dailyReminder: z.boolean().optional(),
  dailyHour: z.number().int().min(0).max(23).optional(),
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;
export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;
