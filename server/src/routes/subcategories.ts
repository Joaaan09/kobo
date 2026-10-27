import { Router } from 'express';
import mongoose from 'mongoose';
import { Category } from '../models/Category.js';
import { Subcategory } from '../models/Subcategory.js';
import { Fund } from '../models/Fund.js';
import { subcategoryCreateSchema, subcategoryUpdateSchema } from '../schemas/subcategory.js';
import { asyncHandler, parseBody, sendOk, sendError, getUserId } from '../lib/http.js';

const router = Router();

// GET /api/subcategories?categoryId= — lista, opcionalmente por categoría.
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
    const items = await Subcategory.find(filter).sort({ createdAt: 1 });
    sendOk(res, items);
  }),
);

// POST /api/subcategories — crea subcategoría (la categoría debe ser del usuario).
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(subcategoryCreateSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);
    const category = await Category.findOne({ _id: body.categoryId, userId });
    if (!category) {
      sendError(res, 'category_not_found', 404);
      return;
    }
    const item = await Subcategory.create({ ...body, userId });
    sendOk(res, item, 201);
  }),
);

// PATCH /api/subcategories/:id — actualiza campos.
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const body = parseBody(subcategoryUpdateSchema, req, res);
    if (!body) return;
    const item = await Subcategory.findOneAndUpdate(
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

// DELETE /api/subcategories/:id — borra subcategoría.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const item = await Subcategory.findOneAndDelete({
      _id: req.params.id,
      userId: getUserId(req),
    });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }
    // Los fondos anclados a ella se desanclan: siguen reservando de la categoría,
    // pero sin arrastrar una etiqueta muerta a los pagos futuros. (Los gastos ya
    // registrados conservan su `subcategoryId`: son historia, no configuración.)
    await Fund.updateMany(
      { userId: getUserId(req), subcategoryId: item._id },
      { $unset: { subcategoryId: 1 } },
    );
    sendOk(res, { id: String(item._id) });
  }),
);

export default router;
