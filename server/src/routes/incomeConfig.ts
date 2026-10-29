import { Router } from 'express';
import { Types } from 'mongoose';
import { IncomeConfig } from '../models/IncomeConfig.js';
import { incomeConfigSchema } from '../schemas/incomeConfig.js';
import { bucketExists } from '../services/accounts.js';
import { withCycleChange } from '../services/cycle.js';
import { madridParts } from '../lib/time.js';
import { asyncHandler, parseBody, sendOk, sendError, getUserId } from '../lib/http.js';

const router = Router();

// GET /api/income-config — configuración de nómina del usuario (o null).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const config = await IncomeConfig.findOne({ userId: getUserId(req) });
    sendOk(res, config);
  }),
);

// PUT /api/income-config — upsert de la nómina (una por usuario).
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(incomeConfigSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    const $set: Record<string, unknown> = {
      userId,
      type: body.type,
      amountCents: body.amountCents,
      payDay: body.payDay,
      effectiveFrom: body.effectiveFrom ?? new Date(),
    };
    const $unset: Record<string, unknown> = {};

    // Destino de la nómina: solo se toca si viene en el body (undefined = no tocar).
    if (body.defaultAccountId !== undefined || body.defaultBucketId !== undefined) {
      if (body.defaultAccountId && body.defaultBucketId) {
        const exists = await bucketExists(
          userId,
          new Types.ObjectId(body.defaultAccountId),
          new Types.ObjectId(body.defaultBucketId),
        );
        if (!exists) {
          sendError(res, 'bucket_not_found', 400);
          return;
        }
        $set.defaultAccountId = body.defaultAccountId;
        $set.defaultBucketId = body.defaultBucketId;
      } else {
        // null (o par vacío) → desvincular.
        $unset.defaultAccountId = '';
        $unset.defaultBucketId = '';
      }
    }

    // Inicio del mes: se añade como tramo al historial (el pasado no se reescribe).
    if (body.cycle) {
      // Como mucho desde el mes natural de hoy: un `from` pasado reescribiría
      // meses ya vividos (sus rangos, su nómina, su ritmo).
      const { year, month } = madridParts(new Date());
      const thisMonth = `${year}-${String(month).padStart(2, '0')}`;
      if (body.cycle.from < thisMonth) {
        sendError(res, 'cycle_from_in_past', 400);
        return;
      }
      const current = await IncomeConfig.findOne({ userId }, { cycleChanges: 1 }).lean();
      $set.cycleChanges = withCycleChange(current?.cycleChanges, body.cycle);
    }

    const update: Record<string, unknown> = { $set };
    if (Object.keys($unset).length > 0) update.$unset = $unset;

    const config = await IncomeConfig.findOneAndUpdate({ userId }, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });
    sendOk(res, config);
  }),
);

export default router;
