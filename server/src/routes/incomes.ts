import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { Income } from '../models/Income.js';
import { incomeCreateSchema, incomeUpdateSchema } from '../schemas/income.js';
import { adjustBucketBalance, bucketExists } from '../services/accounts.js';
import { parseMonthParam, cycleRange, nominaCycleOf, nominaWindow } from '../lib/time.js';
import { getCycleConfig } from '../services/cycle.js';
import { asyncHandler, parseBody, sendOk, sendError, getUserId } from '../lib/http.js';

const router = Router();

// GET /api/incomes?month=YYYY-MM — historial de ingresos filtrable por mes.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const filter: Record<string, unknown> = { userId };

    const { month } = req.query;
    if (typeof month === 'string') {
      const parsed = parseMonthParam(month);
      if (!parsed) {
        sendError(res, 'invalid_month');
        return;
      }
      const cycle = await getCycleConfig(userId);
      const { start, end } = cycleRange(cycle, parsed.year, parsed.month);
      filter.date = { $gte: start, $lt: end };
    }

    const items = await Income.find(filter).sort({ date: -1, createdAt: -1 });
    sendOk(res, items);
  }),
);

// POST /api/incomes — crea ingreso; si enlaza cuenta+bucket, suma al balance.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(incomeCreateSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    // El dinero es sagrado: como mucho UNA nómina por mes (evita duplicar el sueldo
    // si se pulsa "registrar nómina" dos veces o desde dos dispositivos). El "mes"
    // es el ciclo, y una nómina adelantada unos días (fin de semana, festivo) es la
    // del ciclo que empieza, no una segunda del que acaba (`nominaWindow`).
    if (body.isNomina) {
      const cycle = await getCycleConfig(userId);
      const { year, month } = nominaCycleOf(cycle, body.date);
      const { start, end } = nominaWindow(cycle, year, month);
      const already = await Income.findOne({
        userId,
        isNomina: true,
        date: { $gte: start, $lt: end },
      });
      if (already) {
        sendError(res, 'nomina_already_collected', 409);
        return;
      }
    }

    if (body.accountId && body.bucketId) {
      const exists = await bucketExists(
        userId,
        new Types.ObjectId(body.accountId),
        new Types.ObjectId(body.bucketId),
      );
      if (!exists) {
        sendError(res, 'bucket_not_found', 400);
        return;
      }
    }

    const item = await Income.create({ ...body, userId });
    await adjustBucketBalance(userId, item.accountId, item.bucketId, item.amountCents);
    sendOk(res, item, 201);
  }),
);

// PATCH /api/incomes/:id — edita ingreso; reajusta el balance del bucket (delta).
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const body = parseBody(incomeUpdateSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    const item = await Income.findOne({ _id: req.params.id, userId });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }

    if (body.accountId && body.bucketId) {
      const exists = await bucketExists(
        userId,
        new Types.ObjectId(body.accountId),
        new Types.ObjectId(body.bucketId),
      );
      if (!exists) {
        sendError(res, 'bucket_not_found', 400);
        return;
      }
    }

    // Revierte el efecto anterior (resta), aplica cambios, aplica el nuevo (suma).
    await adjustBucketBalance(userId, item.accountId, item.bucketId, -item.amountCents);
    Object.assign(item, body);
    await item.save();
    await adjustBucketBalance(userId, item.accountId, item.bucketId, item.amountCents);

    sendOk(res, item);
  }),
);

// DELETE /api/incomes/:id — borra ingreso y revierte el balance del bucket.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const userId = getUserId(req);
    const item = await Income.findOneAndDelete({ _id: req.params.id, userId });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }
    await adjustBucketBalance(userId, item.accountId, item.bucketId, -item.amountCents);
    sendOk(res, { id: String(item._id) });
  }),
);

export default router;
