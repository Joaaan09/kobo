import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { Valuation } from '../models/Valuation.js';
import { Transfer } from '../models/Transfer.js';
import { Account } from '../models/Account.js';
import { valuationCreateSchema, valuationUpdateSchema } from '../schemas/valuation.js';
import { adjustBucketBalance } from '../services/accounts.js';
import { estimateInterest } from '../services/rendimiento.js';
import { parseMonthParam, madridMonthRange } from '../lib/time.js';
import { asyncHandler, parseBody, sendOk, sendError, getUserId } from '../lib/http.js';

const router = Router();

/** Localiza cuenta + bucket del usuario (anti-IDOR: siempre filtra por userId). */
async function findBucket(userId: string, accountId: string, bucketId: string) {
  if (!mongoose.isValidObjectId(accountId) || !mongoose.isValidObjectId(bucketId)) return null;
  const account = await Account.findOne({ _id: accountId, userId });
  const bucket = account?.buckets.id(bucketId);
  return account && bucket ? { account, bucket } : null;
}

// GET /api/valuations?month=YYYY-MM&bucketId=... — historial de rendimiento.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const filter: Record<string, unknown> = { userId };

    const { month, bucketId } = req.query;
    if (typeof month === 'string') {
      const parsed = parseMonthParam(month);
      if (!parsed) {
        sendError(res, 'invalid_month');
        return;
      }
      const { start, end } = madridMonthRange(parsed.year, parsed.month);
      filter.date = { $gte: start, $lt: end };
    }
    if (typeof bucketId === 'string') {
      if (!mongoose.isValidObjectId(bucketId)) {
        sendError(res, 'invalid_id');
        return;
      }
      filter.bucketId = new Types.ObjectId(bucketId);
    }

    const items = await Valuation.find(filter).sort({ date: -1, createdAt: -1 });
    sendOk(res, items);
  }),
);

/**
 * GET /api/valuations/pending — sub-saldos remunerados con liquidación estimada
 * pendiente. Una sola llamada para toda la vista Cuentas (en vez de una por
 * bucket): sirve para avisar "toca registrar los intereses", nunca para sumar
 * dinero — el saldo no se mueve hasta que el usuario confirma su extracto.
 */
router.get(
  '/pending',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const accounts = await Account.find({ userId });
    const now = new Date();

    const pending: unknown[] = [];
    for (const account of accounts) {
      for (const bucket of account.buckets) {
        if (bucket.kind !== 'savings' || !bucket.rateBps) continue;
        const last = await Valuation.findOne({ userId, bucketId: bucket._id }).sort({
          date: -1,
          createdAt: -1,
        });
        const since = last?.date ?? (account.get('createdAt') as Date | undefined) ?? now;
        const estimate = estimateInterest({
          balanceCents: bucket.balanceCents,
          rateBps: bucket.rateBps,
          withholdingBps: bucket.withholdingBps ?? 0,
          since,
          until: now,
        });
        if (!estimate) continue;
        pending.push({
          accountId: String(account._id),
          bucketId: String(bucket._id),
          days: estimate.days,
          netCents: estimate.netCents,
        });
      }
    }
    sendOk(res, pending);
  }),
);

/**
 * GET /api/valuations/context?accountId=&bucketId= — todo lo que necesita la hoja
 * de valoración, calculado en el servidor para que la UI no haga aritmética de dinero:
 *
 * - `balanceCents` — saldo real ahora mismo (base del delta).
 * - `since` / `contributedSinceCents` — aportaciones **netas** por traspaso desde la
 *   última valoración. Sirven para explicar la subida: si el fondo sube 250 € y 200
 *   los pusiste tú, tu rendimiento es 50. (El delta ya lo excluye por construcción,
 *   porque el traspaso ya subió el saldo; este dato es para que se vea.)
 * - `estimate` — solo en remunerados: la liquidación pendiente estimada.
 */
router.get(
  '/context',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const { accountId, bucketId } = req.query;
    if (typeof accountId !== 'string' || typeof bucketId !== 'string') {
      sendError(res, 'validation_error');
      return;
    }
    const found = await findBucket(userId, accountId, bucketId);
    if (!found) {
      sendError(res, 'bucket_not_found', 404);
      return;
    }
    const { account, bucket } = found;

    const last = await Valuation.findOne({ userId, bucketId: bucket._id }).sort({
      date: -1,
      createdAt: -1,
    });
    // Sin valoraciones previas, el periodo arranca en el alta de la cuenta.
    const since = last?.date ?? account.get('createdAt') ?? new Date();

    // Aportaciones netas por traspaso desde la última valoración (entradas − salidas).
    //
    // Se filtra por `createdAt`, NO por la fecha del traspaso: el saldo se movió
    // cuando registraste el movimiento, no en la fecha que le pusiste. Un traspaso
    // fechado en el pasado pero registrado hoy sí forma parte de la subida que
    // estás a punto de explicar. Sin valoración previa se cuenta todo lo aportado.
    const lastAt = last ? (last.get('createdAt') as Date | undefined) : undefined;
    const moves = await Transfer.find({
      userId,
      $or: [{ toBucketId: bucket._id }, { fromBucketId: bucket._id }],
      ...(lastAt ? { createdAt: { $gte: lastAt } } : {}),
    });
    let contributedSinceCents = 0;
    for (const t of moves) {
      if (String(t.toBucketId) === String(bucket._id)) contributedSinceCents += t.amountCents;
      if (String(t.fromBucketId) === String(bucket._id)) contributedSinceCents -= t.amountCents;
    }

    const estimate =
      bucket.kind === 'savings' && bucket.rateBps
        ? estimateInterest({
            balanceCents: bucket.balanceCents,
            rateBps: bucket.rateBps,
            withholdingBps: bucket.withholdingBps ?? 0,
            since,
            until: new Date(),
          })
        : null;

    sendOk(res, {
      accountId: String(account._id),
      bucketId: String(bucket._id),
      kind: bucket.kind,
      balanceCents: bucket.balanceCents,
      rateBps: bucket.rateBps ?? null,
      withholdingBps: bucket.withholdingBps ?? null,
      since,
      lastValuationAt: last?.date ?? null,
      contributedSinceCents,
      estimate,
    });
  }),
);

// POST /api/valuations — registra el rendimiento y aplica el delta al saldo.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(valuationCreateSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    const found = await findBucket(userId, body.accountId, body.bucketId);
    if (!found) {
      sendError(res, 'bucket_not_found', 400);
      return;
    }

    // `targetCents` (valor actual del fondo) se convierte a delta contra el saldo
    // REAL leído aquí: así la aportación ya registrada no se cuela como rendimiento.
    const deltaCents = body.deltaCents ?? body.targetCents! - found.bucket.balanceCents;
    if (deltaCents === 0) {
      sendError(res, 'no_change');
      return;
    }

    const item = await Valuation.create({
      userId,
      accountId: body.accountId,
      bucketId: body.bucketId,
      date: body.date,
      deltaCents,
      kind: body.kind,
      grossCents: body.grossCents,
      note: body.note,
    });

    // El doc es el registro del hecho: si el saldo no se puede mover, no lo dejamos.
    try {
      const applied = await adjustBucketBalance(
        userId,
        item.accountId,
        item.bucketId,
        item.deltaCents,
      );
      if (!applied) {
        await Valuation.deleteOne({ _id: item._id, userId });
        sendError(res, 'valuation_failed', 400);
        return;
      }
    } catch (err) {
      await Valuation.deleteOne({ _id: item._id, userId });
      throw err;
    }

    sendOk(res, item, 201);
  }),
);

// PATCH /api/valuations/:id — corrige el importe: revierte el viejo y aplica el nuevo.
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const body = parseBody(valuationUpdateSchema, req, res);
    if (!body) return;
    const userId = getUserId(req);

    const item = await Valuation.findOne({ _id: req.params.id, userId });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }

    if (body.deltaCents !== undefined && body.deltaCents !== item.deltaCents) {
      // Diferencia a aplicar sobre el saldo (no revertimos y reaplicamos: el neto
      // es el mismo y así una sola escritura no puede dejar el saldo a medias).
      const applied = await adjustBucketBalance(
        userId,
        item.accountId,
        item.bucketId,
        body.deltaCents - item.deltaCents,
      );
      if (!applied) {
        sendError(res, 'valuation_failed', 400);
        return;
      }
      item.deltaCents = body.deltaCents;
    }

    if (body.date !== undefined) item.date = body.date;
    if (body.note !== undefined) item.note = body.note;
    if (body.grossCents !== undefined) item.grossCents = body.grossCents ?? undefined;
    await item.save();
    sendOk(res, item);
  }),
);

// DELETE /api/valuations/:id — borra el registro y deshace su efecto en el saldo.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, 'invalid_id');
      return;
    }
    const userId = getUserId(req);
    const item = await Valuation.findOneAndDelete({ _id: req.params.id, userId });
    if (!item) {
      sendError(res, 'not_found', 404);
      return;
    }
    await adjustBucketBalance(userId, item.accountId, item.bucketId, -item.deltaCents);
    sendOk(res, { id: String(item._id) });
  }),
);

export default router;
