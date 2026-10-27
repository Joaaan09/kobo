import { Router } from 'express';
import mongoose from 'mongoose';
import { Account } from '../models/Account.js';
import {
  accountCreateSchema,
  accountUpdateSchema,
  bucketCreateSchema,
  bucketUpdateSchema,
} from '../schemas/account.js';
import { asyncHandler, parseBody, sendOk, sendError, getUserId } from '../lib/http.js';

const router = Router();

// GET /api/accounts — cuentas del usuario con sus buckets.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await Account.find({ userId: getUserId(req) }).sort({ order: 1, createdAt: 1 });
    sendOk(res, items);
  }),
);

// POST /api/accounts — crea cuenta (con buckets iniciales opcionales).
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(accountCreateSchema, req, res);
    if (!body) return;
    const buckets = (body.buckets ?? []).map((b) => ({
      name: b.name,
      balanceCents: b.balanceCents ?? 0,
      kind: b.kind ?? 'cash',
      rateBps: b.rateBps,
      withholdingBps: b.withholdingBps,
    }));
    const item = await Account.create({
      name: body.name,
      color: body.color,
      order: body.order ?? 0,
      buckets,
      userId: getUserId(req),
    });
    sendOk(res, item, 201);
  }),
);

// PATCH /api/accounts/:id — actualiza datos de la cuenta (no sus buckets).
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const body = parseBody(accountUpdateSchema, req, res);
    if (!body) return;
    const item = await Account.findOneAndUpdate(
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

// DELETE /api/accounts/:id — borra la cuenta y sus buckets.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const item = await Account.findOneAndDelete({
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

// POST /api/accounts/:id/buckets — crea un bucket en la cuenta.
router.post(
  '/:id/buckets',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const body = parseBody(bucketCreateSchema, req, res);
    if (!body) return;
    const account = await Account.findOne({ _id: req.params.id, userId: getUserId(req) });
    if (!account) {
      sendError(res, 'not_found', 404);
      return;
    }
    account.buckets.push({
      name: body.name,
      balanceCents: body.balanceCents ?? 0,
      kind: body.kind ?? 'cash',
      rateBps: body.rateBps,
      withholdingBps: body.withholdingBps,
    });
    await account.save();
    sendOk(res, account, 201);
  }),
);

// PATCH /api/accounts/:id/buckets/:bucketId — renombra y/o ajusta el balance a mano.
router.patch(
  '/:id/buckets/:bucketId',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.bucketId)) {
      sendError(res, 'invalid_id');
      return;
    }
    const body = parseBody(bucketUpdateSchema, req, res);
    if (!body) return;
    const account = await Account.findOne({ _id: req.params.id, userId: getUserId(req) });
    if (!account) {
      sendError(res, 'not_found', 404);
      return;
    }
    const bucket = account.buckets.id(req.params.bucketId);
    if (!bucket) {
      sendError(res, 'bucket_not_found', 404);
      return;
    }
    if (body.name !== undefined) bucket.name = body.name;
    if (body.balanceCents !== undefined) bucket.balanceCents = body.balanceCents;
    if (body.kind !== undefined) bucket.kind = body.kind;
    // `null` = quitar el dato; `undefined` = no tocarlo.
    if (body.rateBps !== undefined) bucket.rateBps = body.rateBps ?? undefined;
    if (body.withholdingBps !== undefined) bucket.withholdingBps = body.withholdingBps ?? undefined;

    // Coherencia sobre el estado ya fusionado: si deja de ser remunerado, el tipo
    // y la retención se van con él (no dejamos una TAE huérfana estimando de más).
    if (bucket.kind !== 'savings') {
      bucket.rateBps = undefined;
      bucket.withholdingBps = undefined;
    }

    await account.save();
    sendOk(res, account);
  }),
);

// DELETE /api/accounts/:id/buckets/:bucketId — elimina un bucket.
router.delete(
  '/:id/buckets/:bucketId',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.bucketId)) {
      sendError(res, 'invalid_id');
      return;
    }
    const account = await Account.findOne({ _id: req.params.id, userId: getUserId(req) });
    if (!account) {
      sendError(res, 'not_found', 404);
      return;
    }
    const bucket = account.buckets.id(req.params.bucketId);
    if (!bucket) {
      sendError(res, 'bucket_not_found', 404);
      return;
    }
    bucket.deleteOne();
    await account.save();
    sendOk(res, account);
  }),
);

export default router;
