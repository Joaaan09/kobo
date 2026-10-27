import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { Transfer } from '../models/Transfer.js';
import { Category } from '../models/Category.js';
import { transferCreateSchema, transferUpdateSchema } from '../schemas/transfer.js';
import { bucketExists, moveFunds } from '../services/accounts.js';
import { parseMonthParam, madridMonthRange } from '../lib/time.js';
import { asyncHandler, parseBody, sendOk, sendError, getUserId } from '../lib/http.js';

const router = Router();

/** Valida que un extremo (cuenta+bucket) exista en el patrimonio del usuario. */
async function endpointExists(userId: string, accountId: string, bucketId: string) {
  return bucketExists(userId, new Types.ObjectId(accountId), new Types.ObjectId(bucketId));
}

/**
 * El sobre que consume un movimiento tiene que ser una categoría **del usuario** y
 * **de ahorro**: consumir presupuesto de una categoría de gasto sin registrar un
 * gasto descuadraría el mes (dinero que desaparece del sobre sin dejar rastro).
 */
async function savingsCategoryOk(userId: string, categoryId: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(categoryId)) return false;
  const category = await Category.findOne({ _id: categoryId, userId });
  return Boolean(category?.savings);
}

// GET /api/transfers?month=YYYY-MM — historial de movimientos, filtrable por mes.
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
      const { start, end } = madridMonthRange(parsed.year, parsed.month);
      filter.date = { $gte: start, $lt: end };
    }

    const items = await Transfer.find(filter).sort({ date: -1, createdAt: -1 });
    sendOk(res, items);
  }),
);

// POST /api/transfers — crea el movimiento y traslada el saldo (neutro).
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(transferCreateSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    const [okFrom, okTo] = await Promise.all([
      endpointExists(userId, body.fromAccountId, body.fromBucketId),
      endpointExists(userId, body.toAccountId, body.toBucketId),
    ]);
    if (!okFrom || !okTo) {
      sendError(res, 'bucket_not_found', 400);
      return;
    }
    if (body.categoryId && !(await savingsCategoryOk(userId, body.categoryId))) {
      sendError(res, 'category_not_savings', 400);
      return;
    }

    // El doc es el registro del movimiento. Si el saldo no se puede trasladar,
    // no dejamos un movimiento que no movió nada.
    const item = await Transfer.create({ ...body, userId });
    try {
      const applied = await moveFunds(
        userId,
        item.fromAccountId,
        item.fromBucketId,
        item.toAccountId,
        item.toBucketId,
        item.amountCents,
      );
      if (!applied) {
        await Transfer.deleteOne({ _id: item._id, userId });
        sendError(res, 'transfer_failed', 400);
        return;
      }
    } catch (err) {
      await Transfer.deleteOne({ _id: item._id, userId });
      throw err;
    }

    sendOk(res, item, 201);
  }),
);

// PATCH /api/transfers/:id — edita el movimiento: revierte el saldo anterior y
// aplica el nuevo (sobre el estado ya fusionado, validando la invariante).
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const body = parseBody(transferUpdateSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    const item = await Transfer.findOne({ _id: req.params.id, userId });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }

    // Estado resultante tras aplicar el parcial.
    const next = {
      fromAccountId: body.fromAccountId ?? String(item.fromAccountId),
      fromBucketId: body.fromBucketId ?? String(item.fromBucketId),
      toAccountId: body.toAccountId ?? String(item.toAccountId),
      toBucketId: body.toBucketId ?? String(item.toBucketId),
      amountCents: body.amountCents ?? item.amountCents,
    };

    if (next.fromAccountId === next.toAccountId && next.fromBucketId === next.toBucketId) {
      sendError(res, 'same_endpoint');
      return;
    }
    const [okFrom, okTo] = await Promise.all([
      endpointExists(userId, next.fromAccountId, next.fromBucketId),
      endpointExists(userId, next.toAccountId, next.toBucketId),
    ]);
    if (!okFrom || !okTo) {
      sendError(res, 'bucket_not_found', 400);
      return;
    }
    if (body.categoryId && !(await savingsCategoryOk(userId, body.categoryId))) {
      sendError(res, 'category_not_savings', 400);
      return;
    }

    // Revierte el movimiento anterior (destino → origen)...
    await moveFunds(
      userId,
      item.toAccountId,
      item.toBucketId,
      item.fromAccountId,
      item.fromBucketId,
      item.amountCents,
    );
    // ...y aplica el nuevo (origen → destino).
    const applied = await moveFunds(
      userId,
      new Types.ObjectId(next.fromAccountId),
      new Types.ObjectId(next.fromBucketId),
      new Types.ObjectId(next.toAccountId),
      new Types.ObjectId(next.toBucketId),
      next.amountCents,
    );
    if (!applied) {
      // Restaura el movimiento anterior para no dejar el patrimonio descuadrado.
      await moveFunds(
        userId,
        item.fromAccountId,
        item.fromBucketId,
        item.toAccountId,
        item.toBucketId,
        item.amountCents,
      );
      sendError(res, 'transfer_failed', 400);
      return;
    }

    // `null` desvincula el sobre; `undefined` no lo toca.
    const { categoryId, ...rest } = body;
    Object.assign(item, rest);
    if (categoryId !== undefined) {
      item.categoryId = categoryId ? new Types.ObjectId(categoryId) : undefined;
    }
    await item.save();
    sendOk(res, item);
  }),
);

// DELETE /api/transfers/:id — borra el movimiento y devuelve el saldo (destino → origen).
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const userId = getUserId(req);
    const item = await Transfer.findOneAndDelete({ _id: req.params.id, userId });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }
    await moveFunds(
      userId,
      item.toAccountId,
      item.toBucketId,
      item.fromAccountId,
      item.fromBucketId,
      item.amountCents,
    );
    sendOk(res, { id: String(item._id) });
  }),
);

export default router;
