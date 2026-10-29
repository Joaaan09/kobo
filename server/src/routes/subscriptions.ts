import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { Subscription } from '../models/Subscription.js';
import { Category } from '../models/Category.js';
import { Subcategory } from '../models/Subcategory.js';
import { subscriptionCreateSchema, subscriptionUpdateSchema } from '../schemas/subscription.js';
import { bucketExists } from '../services/accounts.js';
import { chargeDueSubscriptions } from '../services/subscriptions.js';
import { scheduleNextCharge, type Schedule } from '../services/subscriptionSchedule.js';
import { madridDayKey } from '../lib/time.js';
import { asyncHandler, parseBody, sendOk, sendError, getUserId } from '../lib/http.js';

/**
 * Suscripciones (定期): pagos que se repiten y que Kobo apunta solo. El cargo lo
 * registra el planificador (`services/subscriptions.ts`); aquí solo se gestionan.
 */
const router = Router();

/** Categoría (y subcategoría, si viene) del usuario y colgando una de otra (anti-IDOR). */
async function validateOwnership(
  userId: string,
  categoryId: string,
  subcategoryId?: string,
): Promise<string | null> {
  const category = await Category.findOne({ _id: categoryId, userId });
  if (!category) return 'category_not_found';
  if (subcategoryId) {
    const sub = await Subcategory.exists({ _id: subcategoryId, userId, categoryId });
    if (!sub) return 'subcategory_not_found';
  }
  return null;
}

// GET /api/subscriptions — lista, la más próxima a cobrarse primero.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await Subscription.find({ userId: getUserId(req) }).sort({
      active: -1,
      nextChargeDate: 1,
      name: 1,
    });
    sendOk(res, items);
  }),
);

// POST /api/subscriptions — alta. Si el primer cargo es hoy, se registra ya.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(subscriptionCreateSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    const ownershipError = await validateOwnership(userId, body.categoryId, body.subcategoryId);
    if (ownershipError) {
      sendError(res, ownershipError, 400);
      return;
    }
    if (body.accountId && body.bucketId) {
      const ok = await bucketExists(
        userId,
        new Types.ObjectId(body.accountId),
        new Types.ObjectId(body.bucketId),
      );
      if (!ok) {
        sendError(res, 'bucket_not_found', 400);
        return;
      }
    }

    const todayKey = madridDayKey(new Date());
    // Nada de cargos retroactivos: duplicarían lo que ya apuntaste a mano.
    if (body.nextChargeDate && body.nextChargeDate < todayKey) {
      sendError(res, 'date_in_past', 400);
      return;
    }
    const schedule: Schedule = {
      frequency: body.frequency,
      dayOfMonth: body.dayOfMonth,
      monthOfYear: body.frequency === 'yearly' ? body.monthOfYear : undefined,
    };

    const item = await Subscription.create({
      ...body,
      monthOfYear: schedule.monthOfYear,
      userId,
      nextChargeDate: body.nextChargeDate ?? scheduleNextCharge(schedule, todayKey),
    });
    await chargeDueSubscriptions(new Date(), userId);
    sendOk(res, await Subscription.findById(item._id), 201);
  }),
);

// PATCH /api/subscriptions/:id — edición parcial (incluye pausar/reanudar).
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const body = parseBody(subscriptionUpdateSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    const item = await Subscription.findOne({ _id: req.params.id, userId });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }

    // Clasificación resultante: cambiar de categoría suelta la subcategoría vieja.
    const nextCategoryId = body.categoryId ?? String(item.categoryId);
    const categoryChanged = nextCategoryId !== String(item.categoryId);
    const nextSubcategoryId =
      body.subcategoryId !== undefined
        ? (body.subcategoryId ?? undefined)
        : categoryChanged || !item.subcategoryId
          ? undefined
          : String(item.subcategoryId);
    if (body.categoryId !== undefined || body.subcategoryId !== undefined) {
      const ownershipError = await validateOwnership(userId, nextCategoryId, nextSubcategoryId);
      if (ownershipError) {
        sendError(res, ownershipError, 400);
        return;
      }
    }

    // Cuenta resultante: `undefined` conserva, `null` desvincula.
    if (body.accountId !== undefined) {
      if (body.accountId && body.bucketId) {
        const ok = await bucketExists(
          userId,
          new Types.ObjectId(body.accountId),
          new Types.ObjectId(body.bucketId),
        );
        if (!ok) {
          sendError(res, 'bucket_not_found', 400);
          return;
        }
        item.accountId = new Types.ObjectId(body.accountId);
        item.bucketId = new Types.ObjectId(body.bucketId);
      } else {
        item.accountId = undefined;
        item.bucketId = undefined;
      }
    }

    // Calendario resultante.
    const schedule: Schedule = {
      frequency: body.frequency ?? item.frequency,
      dayOfMonth: body.dayOfMonth ?? item.dayOfMonth,
      monthOfYear:
        body.monthOfYear !== undefined ? (body.monthOfYear ?? undefined) : item.monthOfYear,
    };
    if (schedule.frequency === 'yearly' && !schedule.monthOfYear) {
      sendError(res, 'month_required', 400);
      return;
    }
    if (schedule.frequency === 'monthly') schedule.monthOfYear = undefined;
    const scheduleChanged =
      schedule.frequency !== item.frequency ||
      schedule.dayOfMonth !== item.dayOfMonth ||
      schedule.monthOfYear !== item.monthOfYear;

    const todayKey = madridDayKey(new Date());
    const resuming = body.active === true && !item.active;
    let nextChargeDate = item.nextChargeDate;
    if (body.nextChargeDate !== undefined) {
      if (body.nextChargeDate < todayKey) {
        sendError(res, 'date_in_past', 400);
        return;
      }
      nextChargeDate = body.nextChargeDate;
    } else if (scheduleChanged || (resuming && item.nextChargeDate < todayKey)) {
      // Reprogramar o reanudar NO cobra lo pasado: el siguiente cargo es desde hoy,
      // saltando el periodo que ya se cobró.
      // El último cargo solo cuenta si la frecuencia no cambió: el cargo mensual de
      // octubre no puede saltarse el primer cargo anual de diciembre.
      nextChargeDate = scheduleNextCharge(
        schedule,
        todayKey,
        schedule.frequency === item.frequency ? item.lastChargeDate : undefined,
      );
    }

    if (body.name !== undefined) item.name = body.name;
    if (body.amountCents !== undefined) item.amountCents = body.amountCents;
    item.categoryId = new Types.ObjectId(nextCategoryId);
    item.subcategoryId = nextSubcategoryId ? new Types.ObjectId(nextSubcategoryId) : undefined;
    item.frequency = schedule.frequency;
    item.dayOfMonth = schedule.dayOfMonth;
    item.monthOfYear = schedule.monthOfYear;
    item.nextChargeDate = nextChargeDate;
    if (body.active !== undefined) item.active = body.active;
    // Reanudar (o reclasificar) limpia el aviso de la pausa automática.
    if (resuming || body.categoryId !== undefined) item.lastError = undefined;
    await item.save();

    await chargeDueSubscriptions(new Date(), userId);
    sendOk(res, await Subscription.findById(item._id));
  }),
);

// DELETE /api/subscriptions/:id — la borra. Los cargos ya registrados se quedan:
// fueron gastos reales.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const item = await Subscription.findOneAndDelete({ _id: req.params.id, userId: getUserId(req) });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }
    sendOk(res, { id: String(item._id) });
  }),
);

export default router;
