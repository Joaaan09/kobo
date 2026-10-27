import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { Expense } from '../models/Expense.js';
import { Category } from '../models/Category.js';
import { Subcategory } from '../models/Subcategory.js';
import { Fund } from '../models/Fund.js';
import { expenseCreateSchema, expenseUpdateSchema } from '../schemas/expense.js';
import { adjustBucketBalance, bucketExists } from '../services/accounts.js';
import { parseMonthParam, madridMonthRange } from '../lib/time.js';
import { asyncHandler, parseBody, sendOk, sendError, getUserId } from '../lib/http.js';

const router = Router();

/**
 * Valida que la categoría (y, si vienen, la subcategoría y el fondo) pertenecen
 * al usuario y cuelgan de esa categoría. Devuelve el código de error a enviar o
 * `null` si todo es correcto (anti-IDOR: nunca confiar en ids del cliente).
 */
async function validateOwnership(
  userId: string,
  categoryId: string,
  subcategoryId?: string,
  fundId?: string,
): Promise<string | null> {
  const category = await Category.findOne({ _id: categoryId, userId });
  if (!category) return 'category_not_found';
  if (subcategoryId) {
    const subcategory = await Subcategory.findOne({ _id: subcategoryId, userId, categoryId });
    if (!subcategory) return 'subcategory_not_found';
  }
  if (fundId) {
    const fund = await Fund.findOne({ _id: fundId, userId, categoryId });
    if (!fund) return 'fund_not_found';
  }
  return null;
}

// GET /api/expenses?month=YYYY-MM&categoryId=&needsReview=1 — historial filtrable.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const filter: Record<string, unknown> = { userId };

    const { month, categoryId, needsReview } = req.query;
    if (typeof month === 'string') {
      const parsed = parseMonthParam(month);
      if (!parsed) {
        sendError(res, 'invalid_month');
        return;
      }
      const { start, end } = madridMonthRange(parsed.year, parsed.month);
      filter.date = { $gte: start, $lt: end };
    }
    if (typeof categoryId === 'string') {
      if (!mongoose.isValidObjectId(categoryId)) {
        sendError(res, 'invalid_id');
        return;
      }
      filter.categoryId = categoryId;
    }
    // Bandeja "por revisar": los gastos que entraron por automatización sin que
    // ninguna regla supiera clasificarlos.
    if (needsReview === '1' || needsReview === 'true') {
      filter.needsReview = true;
    }

    const items = await Expense.find(filter).sort({ date: -1, createdAt: -1 });
    sendOk(res, items);
  }),
);

// POST /api/expenses — crea gasto; si enlaza cuenta+bucket, resta del balance.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(expenseCreateSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    const ownershipError = await validateOwnership(
      userId,
      body.categoryId,
      body.subcategoryId,
      body.fundId,
    );
    if (ownershipError) {
      sendError(res, ownershipError, 400);
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

    const item = await Expense.create({ ...body, userId });
    await adjustBucketBalance(userId, item.accountId, item.bucketId, -item.amountCents);
    sendOk(res, item, 201);
  }),
);

// PATCH /api/expenses/:id — edita gasto; reajusta el balance del bucket (delta).
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const body = parseBody(expenseUpdateSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    const item = await Expense.findOne({ _id: req.params.id, userId });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }

    // Estado resultante de la tríada categoría/subcategoría/fondo. Al mover el gasto
    // a otra categoría, la subcategoría y el fondo anteriores dejan de aplicar (cuelgan
    // de la categoría vieja): si el cliente no manda unos nuevos, se desvinculan. Sin
    // esto, cambiar de categoría un gasto ya clasificado fallaría con `*_not_found`.
    const nextCategoryId = body.categoryId ?? String(item.categoryId);
    const categoryChanged = nextCategoryId !== String(item.categoryId);
    const nextSubcategoryId =
      body.subcategoryId !== undefined
        ? (body.subcategoryId ?? undefined)
        : categoryChanged || !item.subcategoryId
          ? undefined
          : String(item.subcategoryId);
    const nextFundId =
      body.fundId !== undefined
        ? (body.fundId ?? undefined)
        : categoryChanged || !item.fundId
          ? undefined
          : String(item.fundId);

    // Estado resultante del enlace al patrimonio (cuenta + sub-saldo). A diferencia
    // de la tríada, la cuenta NO depende de la categoría: solo cambia si el cliente
    // manda una nueva (`accountId`) o la desvincula (`null`). `undefined` = se conserva.
    const nextAccountId =
      body.accountId !== undefined
        ? (body.accountId ?? undefined)
        : item.accountId
          ? String(item.accountId)
          : undefined;
    const nextBucketId =
      body.bucketId !== undefined
        ? (body.bucketId ?? undefined)
        : item.bucketId
          ? String(item.bucketId)
          : undefined;

    // Valida propiedad contra ese estado resultante (anti-IDOR).
    if (
      body.categoryId !== undefined ||
      body.subcategoryId !== undefined ||
      body.fundId !== undefined
    ) {
      const ownershipError = await validateOwnership(
        userId,
        nextCategoryId,
        nextSubcategoryId,
        nextFundId,
      );
      if (ownershipError) {
        sendError(res, ownershipError, 400);
        return;
      }
    }

    // Valida el sub-saldo resultante (anti-IDOR) si el gasto queda enlazado a una cuenta.
    if (nextAccountId && nextBucketId) {
      const exists = await bucketExists(
        userId,
        new Types.ObjectId(nextAccountId),
        new Types.ObjectId(nextBucketId),
      );
      if (!exists) {
        sendError(res, 'bucket_not_found', 400);
        return;
      }
    }

    // Revierte el efecto anterior (estado PREVIO), aplica los cambios y reaplica el nuevo.
    await adjustBucketBalance(userId, item.accountId, item.bucketId, item.amountCents);
    Object.assign(item, body);
    // La tríada y el enlace a cuenta se escriben siempre desde el estado calculado
    // arriba: `Object.assign` no borra un vínculo (un `null`/`undefined` del body no
    // haría `$unset`), así que cambiar o desvincular la cuenta exige asignación explícita.
    item.subcategoryId = nextSubcategoryId ? new Types.ObjectId(nextSubcategoryId) : undefined;
    item.fundId = nextFundId ? new Types.ObjectId(nextFundId) : undefined;
    item.accountId = nextAccountId ? new Types.ObjectId(nextAccountId) : undefined;
    item.bucketId = nextBucketId ? new Types.ObjectId(nextBucketId) : undefined;
    // Invariante: un gasto que no afecta al patrimonio no enlaza cuenta (si no, movería un saldo).
    if (item.affectsPatrimony === false) {
      item.accountId = undefined;
      item.bucketId = undefined;
    }
    await item.save();
    // Reaplica con el estado RESULTANTE; no-op si ya no hay cuenta (o si no afecta al patrimonio).
    await adjustBucketBalance(userId, item.accountId, item.bucketId, -item.amountCents);

    sendOk(res, item);
  }),
);

// DELETE /api/expenses/:id — borra gasto y revierte el balance del bucket.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const userId = getUserId(req);
    const item = await Expense.findOneAndDelete({ _id: req.params.id, userId });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }
    await adjustBucketBalance(userId, item.accountId, item.bucketId, item.amountCents);
    sendOk(res, { id: String(item._id) });
  }),
);

export default router;
