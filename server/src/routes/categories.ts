import { Router } from 'express';
import mongoose from 'mongoose';
import { Category } from '../models/Category.js';
import { Subcategory } from '../models/Subcategory.js';
import { Fund } from '../models/Fund.js';
import { Expense } from '../models/Expense.js';
import { Distribution } from '../models/Distribution.js';
import { categoryCreateSchema, categoryUpdateSchema } from '../schemas/category.js';
import { asyncHandler, parseBody, sendOk, sendError, getUserId } from '../lib/http.js';

const router = Router();

// GET /api/categories — lista ordenada del usuario.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await Category.find({ userId: getUserId(req) }).sort({ order: 1, createdAt: 1 });
    sendOk(res, items);
  }),
);

// POST /api/categories — crea categoría.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(categoryCreateSchema, req, res);
    if (!body) return;
    const item = await Category.create({ ...body, userId: getUserId(req) });
    sendOk(res, item, 201);
  }),
);

// PATCH /api/categories/:id — actualiza campos.
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const body = parseBody(categoryUpdateSchema, req, res);
    if (!body) return;
    const item = await Category.findOneAndUpdate(
      { _id: req.params.id, userId: getUserId(req) },
      body,
      { new: true },
    );
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }
    sendOk(res, item);
  }),
);

// DELETE /api/categories/:id — borra la categoría y sus subcategorías.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const userId = getUserId(req);
    // No se borra una categoría con gastos vivos: destruiría histórico financiero
    // y dejaría gastos huérfanos que descuadran el panel.
    const liveExpenses = await Expense.countDocuments({ userId, categoryId: req.params.id });
    if (liveExpenses > 0) {
      sendError(res, 'category_has_expenses', 409);
      return;
    }
    const item = await Category.findOneAndDelete({ _id: req.params.id, userId });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }
    await Subcategory.deleteMany({ userId, categoryId: item._id });
    // Los fondos con pagos ya habrían bloqueado el borrado (sus pagos son gastos);
    // los que quedan no tienen pagos, así que se limpian sin descuadrar histórico.
    await Fund.deleteMany({ userId, categoryId: item._id });
    // Limpia el reparto del comodín borrado y los tramos que apuntaban a él como
    // destino, para que el reparto de otros comodines no quede con destinos muertos.
    await Distribution.deleteMany({ userId, categoryId: item._id });
    await Distribution.updateMany(
      { userId },
      { $pull: { shares: { toCategoryId: item._id } } },
    );
    sendOk(res, { id: String(item._id) });
  }),
);

export default router;
