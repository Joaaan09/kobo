import { Router } from 'express';
import mongoose from 'mongoose';
import { Category } from '../models/Category.js';
import { Subcategory } from '../models/Subcategory.js';
import { Distribution } from '../models/Distribution.js';
import { distributionPutSchema } from '../schemas/distribution.js';
import { assignedCents } from '../services/money.js';
import { getNominaVigenteCents } from '../services/dashboard.js';
import { parseMonthParam } from '../lib/time.js';
import { asyncHandler, parseBody, sendOk, sendError, getUserId } from '../lib/http.js';

const router = Router();

/**
 * GET /api/distributions?month=YYYY-MM[&categoryId=] — repartos del mes.
 * Con `categoryId`, filtra al de ese comodín (0 o 1 resultado).
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const { month, categoryId } = req.query;
    if (typeof month !== 'string') {
      sendError(res, 'invalid_month');
      return;
    }
    const parsed = parseMonthParam(month);
    if (!parsed) {
      sendError(res, 'invalid_month');
      return;
    }
    const filter: Record<string, unknown> = { userId, year: parsed.year, month: parsed.month };
    if (typeof categoryId === 'string') {
      if (!mongoose.isValidObjectId(categoryId)) {
        sendError(res, 'invalid_id');
        return;
      }
      filter.categoryId = categoryId;
    }
    const items = await Distribution.find(filter);
    sendOk(res, items);
  }),
);

/**
 * PUT /api/distributions — fija (idempotente) el reparto de un comodín en un mes.
 * Valida propiedad del comodín y de cada destino, que el comodín sea `flexible`,
 * que las subcategorías cuelguen de su categoría destino, y que la suma no
 * exceda lo asignado al comodín ese mes (el dinero es sagrado: no se reparte
 * más de lo que hay).
 */
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(distributionPutSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    const parsed = parseMonthParam(body.month);
    if (!parsed) {
      sendError(res, 'invalid_month');
      return;
    }

    // El comodín debe ser una categoría del usuario y estar marcada como flexible.
    const comodin = await Category.findOne({ _id: body.categoryId, userId });
    if (!comodin) {
      sendError(res, 'category_not_found', 404);
      return;
    }
    if (!comodin.flexible) {
      sendError(res, 'not_flexible', 400);
      return;
    }

    // Índices de validación: categorías del usuario y subcategoría→categoría.
    const [cats, subs, nominaCents] = await Promise.all([
      Category.find({ userId }).select('_id').lean(),
      Subcategory.find({ userId }).select('_id categoryId').lean(),
      getNominaVigenteCents(userId),
    ]);
    const catIds = new Set(cats.map((c) => String(c._id)));
    const subToCat = new Map(subs.map((s) => [String(s._id), String(s.categoryId)]));

    // Descarta tramos a 0 € (nada que repartir) y valida el resto.
    const shares = body.shares.filter((s) => s.amountCents > 0);
    for (const share of shares) {
      const dest = share.toCategoryId;
      if (dest === body.categoryId || !catIds.has(dest)) {
        sendError(res, 'invalid_destination', 400);
        return;
      }
      if (share.toSubcategoryId && subToCat.get(share.toSubcategoryId) !== dest) {
        sendError(res, 'invalid_subcategory', 400);
        return;
      }
    }

    // No se puede repartir más de lo asignado al comodín este mes.
    const available = assignedCents(nominaCents, comodin.percentBp);
    const total = shares.reduce((sum, s) => sum + s.amountCents, 0);
    if (total > available) {
      sendError(res, 'reparto_exceeds', 400);
      return;
    }

    const doc = await Distribution.findOneAndUpdate(
      { userId, categoryId: body.categoryId, year: parsed.year, month: parsed.month },
      { $set: { shares } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    sendOk(res, doc);
  }),
);

export default router;
