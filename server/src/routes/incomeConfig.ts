import { Router } from 'express';
import { Types } from 'mongoose';
import { IncomeConfig } from '../models/IncomeConfig.js';
import { incomeConfigSchema } from '../schemas/incomeConfig.js';
import { bucketExists } from '../services/accounts.js';
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
