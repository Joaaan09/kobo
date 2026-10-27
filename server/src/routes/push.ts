import { Router } from 'express';
import { env, pushEnabled } from '../config/env.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { User } from '../models/User.js';
import {
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  notificationPrefsSchema,
} from '../schemas/push.js';
import { sendToUser } from '../services/push.js';
import { asyncHandler, parseBody, sendOk, sendError, getUserId } from '../lib/http.js';

/**
 * Notificaciones push (通知). Todo detrás de la cookie de sesión: una suscripción
 * es un canal directo al dispositivo del usuario y solo él puede darla de alta.
 */
const router = Router();

/**
 * GET /api/push/config — lo que el cliente necesita para arrancar: si el servidor
 * tiene push configurado, la clave pública VAPID (no es secreta) y las preferencias.
 */
router.get(
  '/config',
  asyncHandler(async (req, res) => {
    const user = await User.findById(getUserId(req));
    const count = await PushSubscription.countDocuments({ userId: getUserId(req) });
    sendOk(res, {
      enabled: pushEnabled,
      publicKey: pushEnabled ? env.VAPID_PUBLIC_KEY : null,
      devices: count,
      prefs: user?.prefs?.notifications ?? null,
    });
  }),
);

/**
 * POST /api/push/subscribe — alta (o renovación) de un navegador.
 *
 * Upsert por `endpoint`: si ese navegador ya estaba suscrito —incluso con otra
 * cuenta— pasa a pertenecer a la sesión actual. Un endpoint identifica un
 * dispositivo, y el último que se autentica es su dueño.
 */
router.post(
  '/subscribe',
  asyncHandler(async (req, res) => {
    if (!pushEnabled) {
      sendError(res, 'push_disabled', 503);
      return;
    }
    const body = parseBody(pushSubscribeSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    const sub = await PushSubscription.findOneAndUpdate(
      { endpoint: body.endpoint },
      {
        $set: {
          userId,
          keys: body.keys,
          userAgent: body.userAgent,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    sendOk(res, sub, 201);
  }),
);

// POST /api/push/unsubscribe — baja de este navegador (solo si es del usuario).
// Es POST y no DELETE porque lleva cuerpo (el endpoint) y hay proxies que lo
// descartan en un DELETE; aquí perderlo significaría no borrar nada.
router.post(
  '/unsubscribe',
  asyncHandler(async (req, res) => {
    const body = parseBody(pushUnsubscribeSchema, req, res);
    if (!body) return;
    await PushSubscription.deleteOne({ endpoint: body.endpoint, userId: getUserId(req) });
    sendOk(res, { ok: true });
  }),
);

/**
 * POST /api/push/test — notificación de prueba. Es la única forma honesta de que
 * el usuario sepa que el canal funciona sin esperar a que ocurra un gasto.
 */
router.post(
  '/test',
  asyncHandler(async (req, res) => {
    if (!pushEnabled) {
      sendError(res, 'push_disabled', 503);
      return;
    }
    const delivered = await sendToUser(getUserId(req), {
      title: 'Kobo · 工房',
      body: 'Las notificaciones funcionan. Aquí te avisaré de tus gastos.',
      tag: 'kobo-test',
      url: '/',
    });
    if (delivered === 0) {
      sendError(res, 'no_devices', 409);
      return;
    }
    sendOk(res, { delivered });
  }),
);

// PATCH /api/push/prefs — cuándo avisar y a qué hora el recordatorio.
router.patch(
  '/prefs',
  asyncHandler(async (req, res) => {
    const body = parseBody(notificationPrefsSchema, req, res);
    if (!body) return;

    const update: Record<string, unknown> = {};
    if (body.ingest !== undefined) update['prefs.notifications.ingest'] = body.ingest;
    if (body.dailyReminder !== undefined) {
      update['prefs.notifications.dailyReminder'] = body.dailyReminder;
      // Al reactivarlo, olvida el último día avisado para no saltarse hoy.
      if (body.dailyReminder) update['prefs.notifications.lastDailyKey'] = null;
    }
    if (body.dailyHour !== undefined) update['prefs.notifications.dailyHour'] = body.dailyHour;

    const user = await User.findByIdAndUpdate(getUserId(req), { $set: update }, { new: true });
    if (!user) {
      sendError(res, 'not_found', 404);
      return;
    }
    sendOk(res, user.prefs.notifications);
  }),
);

export default router;
