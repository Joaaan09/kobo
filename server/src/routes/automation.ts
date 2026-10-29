import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { ApiToken } from '../models/ApiToken.js';
import { IngestRule } from '../models/IngestRule.js';
import { Category } from '../models/Category.js';
import { Subcategory } from '../models/Subcategory.js';
import {
  apiTokenCreateSchema,
  apiTokenUpdateSchema,
  ingestRuleCreateSchema,
  ingestRuleUpdateSchema,
} from '../schemas/ingest.js';
import { generateApiToken } from '../auth/apiToken.js';
import { normalizeMerchant } from '../services/ingest.js';
import { bucketExists } from '../services/accounts.js';
import { asyncHandler, parseBody, sendOk, sendError, getUserId } from '../lib/http.js';

/**
 * Gestión de la automatización (自動) desde la app: tokens de ingesta y reglas
 * de auto-asignación. Va **detrás de la cookie de sesión** (`requireAuth`): un
 * token de ingesta jamás puede administrarse a sí mismo ni crear otros tokens.
 */
const router = Router();

// ─────────────────────────────── Tokens ───────────────────────────────

// GET /api/automation/tokens — lista (nunca incluye el token en claro ni su hash).
router.get(
  '/tokens',
  asyncHandler(async (req, res) => {
    const items = await ApiToken.find({ userId: getUserId(req) }).sort({ createdAt: -1 });
    sendOk(res, items);
  }),
);

/**
 * POST /api/automation/tokens — crea un token. **Única vez** que el valor en
 * claro existe fuera del dispositivo del usuario: se devuelve aquí y no se
 * puede volver a consultar (solo se guarda su sha256).
 */
router.post(
  '/tokens',
  asyncHandler(async (req, res) => {
    const body = parseBody(apiTokenCreateSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    if (body.accountId && body.bucketId) {
      const exists = await bucketExists(
        userId,
        new Types.ObjectId(body.accountId),
        new Types.ObjectId(body.bucketId),
      );
      if (!exists) {
        sendError(res, 'bucket_not_found');
        return;
      }
    }

    const { token, tokenHash, prefix } = generateApiToken();
    const doc = await ApiToken.create({
      userId,
      label: body.label,
      tokenHash,
      prefix,
      accountId: body.accountId,
      bucketId: body.bucketId,
    });

    sendOk(res, { token: doc.toJSON(), secret: token }, 201);
  }),
);

/**
 * PATCH /api/automation/tokens/:id — edita el dispositivo: nombre, la tarjeta que
 * hay detrás (cuenta + sub-saldo) y la categoría por defecto de los pagos que
 * ninguna regla reconoce. El secreto no se toca (no se puede ni ver).
 */
router.patch(
  '/tokens/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const body = parseBody(apiTokenUpdateSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    const item = await ApiToken.findOne({ _id: req.params.id, userId });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }

    if (body.label !== undefined) item.label = body.label;

    if (body.accountId !== undefined) {
      if (body.accountId && body.bucketId) {
        const exists = await bucketExists(
          userId,
          new Types.ObjectId(body.accountId),
          new Types.ObjectId(body.bucketId),
        );
        if (!exists) {
          sendError(res, 'bucket_not_found');
          return;
        }
        item.accountId = new Types.ObjectId(body.accountId);
        item.bucketId = new Types.ObjectId(body.bucketId);
      } else {
        item.accountId = undefined;
        item.bucketId = undefined;
      }
    }

    // Categoría por defecto resultante; cambiarla suelta la subcategoría vieja.
    if (body.defaultCategoryId !== undefined || body.defaultSubcategoryId !== undefined) {
      const nextCategoryId =
        body.defaultCategoryId !== undefined
          ? body.defaultCategoryId
          : item.defaultCategoryId
            ? String(item.defaultCategoryId)
            : null;
      const categoryChanged = nextCategoryId !== (item.defaultCategoryId ? String(item.defaultCategoryId) : null);
      const nextSubcategoryId =
        body.defaultSubcategoryId !== undefined
          ? body.defaultSubcategoryId
          : categoryChanged || !item.defaultSubcategoryId
            ? null
            : String(item.defaultSubcategoryId);

      if (nextCategoryId) {
        const ownershipError = await validateOwnership(
          userId,
          nextCategoryId,
          nextSubcategoryId ?? undefined,
        );
        if (ownershipError) {
          sendError(res, ownershipError, 400);
          return;
        }
      } else if (nextSubcategoryId) {
        sendError(res, 'subcategory_without_category', 400);
        return;
      }
      item.defaultCategoryId = nextCategoryId ? new Types.ObjectId(nextCategoryId) : undefined;
      item.defaultSubcategoryId = nextSubcategoryId
        ? new Types.ObjectId(nextSubcategoryId)
        : undefined;
    }

    await item.save();
    sendOk(res, item);
  }),
);

// POST /api/automation/tokens/:id/revoke — lo desactiva sin perder su histórico.
router.post(
  '/tokens/:id/revoke',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const item = await ApiToken.findOneAndUpdate(
      { _id: req.params.id, userId: getUserId(req) },
      { $set: { revokedAt: new Date() } },
      { new: true },
    );
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }
    sendOk(res, item);
  }),
);

// DELETE /api/automation/tokens/:id — lo borra del todo.
router.delete(
  '/tokens/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const item = await ApiToken.findOneAndDelete({
      _id: req.params.id,
      userId: getUserId(req),
    });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }
    sendOk(res, { id: String(item._id) });
  }),
);

// ─────────────────────────────── Reglas ───────────────────────────────

/**
 * Valida que categoría y subcategoría son del usuario y que la segunda cuelga de
 * la primera (anti-IDOR). Devuelve el código de error o `null`.
 */
async function validateOwnership(
  userId: string,
  categoryId: string,
  subcategoryId?: string,
): Promise<string | null> {
  const category = await Category.findOne({ _id: categoryId, userId });
  if (!category) return 'category_not_found';
  if (subcategoryId) {
    const sub = await Subcategory.findOne({ _id: subcategoryId, userId, categoryId });
    if (!sub) return 'subcategory_not_found';
  }
  return null;
}

// GET /api/automation/rules — las más usadas primero.
router.get(
  '/rules',
  asyncHandler(async (req, res) => {
    const items = await IngestRule.find({ userId: getUserId(req) }).sort({
      hits: -1,
      createdAt: 1,
    });
    sendOk(res, items);
  }),
);

/**
 * POST /api/automation/rules — crea o **reaprende** una regla. Si ya existe una
 * para ese comercio normalizado se actualiza en vez de duplicar: es el camino
 * natural cuando el usuario reclasifica un gasto y pide "recordar esto".
 */
router.post(
  '/rules',
  asyncHandler(async (req, res) => {
    const body = parseBody(ingestRuleCreateSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    const match = normalizeMerchant(body.label);
    if (match.length < 2) {
      sendError(res, 'invalid_match');
      return;
    }

    const ownershipError = await validateOwnership(userId, body.categoryId, body.subcategoryId);
    if (ownershipError) {
      sendError(res, ownershipError);
      return;
    }

    const item = await IngestRule.findOneAndUpdate(
      { userId, match },
      {
        $set: {
          label: body.label.trim(),
          categoryId: body.categoryId,
          subcategoryId: body.subcategoryId ?? undefined,
        },
        $setOnInsert: { userId, match, hits: 0 },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    sendOk(res, item, 201);
  }),
);

// PATCH /api/automation/rules/:id — cambia destino o patrón.
router.patch(
  '/rules/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const body = parseBody(ingestRuleUpdateSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    const item = await IngestRule.findOne({ _id: req.params.id, userId });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }

    // La propiedad se valida contra el estado RESULTANTE, no contra el enviado.
    if (body.categoryId !== undefined || body.subcategoryId !== undefined) {
      const nextCategoryId = body.categoryId ?? String(item.categoryId);
      const nextSubcategoryId =
        body.subcategoryId !== undefined
          ? (body.subcategoryId ?? undefined)
          : item.subcategoryId
            ? String(item.subcategoryId)
            : undefined;
      const ownershipError = await validateOwnership(userId, nextCategoryId, nextSubcategoryId);
      if (ownershipError) {
        sendError(res, ownershipError);
        return;
      }
      if (body.categoryId) item.categoryId = new Types.ObjectId(body.categoryId);
      // `null` explícito = quitar la subcategoría.
      if (body.subcategoryId !== undefined) {
        item.subcategoryId = body.subcategoryId
          ? new Types.ObjectId(body.subcategoryId)
          : undefined;
      }
    }

    if (body.label !== undefined) {
      const match = normalizeMerchant(body.label);
      if (match.length < 2) {
        sendError(res, 'invalid_match');
        return;
      }
      const clash = await IngestRule.findOne({ userId, match, _id: { $ne: item._id } });
      if (clash) {
        sendError(res, 'rule_exists', 409);
        return;
      }
      item.label = body.label.trim();
      item.match = match;
    }

    await item.save();
    sendOk(res, item);
  }),
);

// DELETE /api/automation/rules/:id
router.delete(
  '/rules/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const item = await IngestRule.findOneAndDelete({
      _id: req.params.id,
      userId: getUserId(req),
    });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }
    sendOk(res, { id: String(item._id) });
  }),
);

export default router;
