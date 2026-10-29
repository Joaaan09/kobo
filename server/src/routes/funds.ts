import { Router } from 'express';
import mongoose from 'mongoose';
import { Fund } from '../models/Fund.js';
import { Category } from '../models/Category.js';
import { Subcategory } from '../models/Subcategory.js';
import { Expense } from '../models/Expense.js';
import { fundCreateSchema, fundUpdateSchema } from '../schemas/fund.js';
import { fundUpdateDoc } from '../services/funds.js';
import { cycleOf } from '../lib/time.js';
import { getCycleConfig } from '../services/cycle.js';
import { asyncHandler, parseBody, sendOk, sendError, getUserId } from '../lib/http.js';

const router = Router();

// GET /api/funds?categoryId= — lista de fondos, opcionalmente por categoría.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const filter: Record<string, unknown> = { userId };
    const { categoryId } = req.query;
    if (typeof categoryId === 'string') {
      if (!mongoose.isValidObjectId(categoryId)) {
        sendError(res, 'invalid_id');
        return;
      }
      filter.categoryId = categoryId;
    }
    const items = await Fund.find(filter).sort({ order: 1, createdAt: 1 });
    sendOk(res, items);
  }),
);

// POST /api/funds — crea fondo (la categoría debe ser del usuario).
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(fundCreateSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    const category = await Category.findOne({ _id: body.categoryId, userId });
    if (!category) {
      sendError(res, 'category_not_found', 404);
      return;
    }

    // La subcategoría, si la hay, tiene que ser del usuario Y de esta categoría:
    // un fondo anclado a una subcategoría ajena descuadraría la clasificación.
    if (body.subcategoryId) {
      const belongs = await Subcategory.exists({
        _id: body.subcategoryId,
        userId,
        categoryId: body.categoryId,
      });
      if (!belongs) {
        sendError(res, 'subcategory_not_found', 404);
        return;
      }
    }

    // Por defecto el fondo empieza a acumular en el ciclo en curso.
    const now = cycleOf(await getCycleConfig(userId), new Date());
    const item = await Fund.create({
      ...body,
      startYear: body.startYear ?? now.year,
      startMonth: body.startMonth ?? now.month,
      userId,
    });
    sendOk(res, item, 201);
  }),
);

// PATCH /api/funds/:id — actualiza campos.
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const body = parseBody(fundUpdateSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    // Anclar a otra subcategoría se valida contra la categoría del PROPIO fondo,
    // no contra la que diga el cliente (§11: nada de ids ajenos).
    if (body.subcategoryId) {
      const fund = await Fund.findOne({ _id: req.params.id, userId });
      if (!fund) {
        sendError(res, 'not_found', 404);
        return;
      }
      const belongs = await Subcategory.exists({
        _id: body.subcategoryId,
        userId,
        categoryId: fund.categoryId,
      });
      if (!belongs) {
        sendError(res, 'subcategory_not_found', 404);
        return;
      }
    }

    const update = fundUpdateDoc(body);
    const item = await Fund.findOneAndUpdate({ _id: req.params.id, userId }, update, { new: true });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }
    sendOk(res, item);
  }),
);

// DELETE /api/funds/:id — borra fondo. Guarda: no se borra si tiene pagos
// registrados (esos gastos quedarían huérfanos y desaparecerían del cómputo).
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const userId = getUserId(req);
    const hasPayments = await Expense.exists({ userId, fundId: req.params.id });
    if (hasPayments) {
      sendError(res, 'fund_has_expenses', 409);
      return;
    }
    const item = await Fund.findOneAndDelete({ _id: req.params.id, userId });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }
    sendOk(res, { id: String(item._id) });
  }),
);

export default router;
