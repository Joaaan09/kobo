import { Router, type Response } from 'express';
import { Types } from 'mongoose';
import { Expense } from '../models/Expense.js';
import { Category } from '../models/Category.js';
import { Subcategory } from '../models/Subcategory.js';
import { IngestRule } from '../models/IngestRule.js';
import { ingestTransactionSchema } from '../schemas/ingest.js';
import { normalizeMerchant, parseAmountToCents, matchRule } from '../services/ingest.js';
import { adjustBucketBalance, bucketExists } from '../services/accounts.js';
import { notifyInBackground } from '../services/push.js';
import { noteIngestFailure } from '../auth/apiToken.js';
import { User } from '../models/User.js';
import { asyncHandler, sendOk, sendError, getUserId } from '../lib/http.js';
import type { ApiTokenDocument } from '../models/ApiToken.js';

const router = Router();

/** Formatea céntimos para el mensaje que el Atajo enseña en la notificación. */
function formatEuros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

/**
 * Motivo del rechazo en cristiano. Es lo que lee el usuario en la notificación
 * y en la tarjeta 自動: un código de error no le dice qué tocar en el Atajo.
 */
const FAILURE_TEXT: Record<string, string> = {
  amount_required: 'el Atajo no mandó el importe',
  invalid_amount: 'el importe no se entiende',
  invalid_payload: 'el Atajo mandó algo que Kobo no entiende',
  refund_not_supported: 'era una devolución: apúntala como ingreso',
  zero_amount: 'autorización de 0 €, no es un gasto',
  no_category: 'no hay ninguna categoría donde ponerlo',
};

/**
 * Rechaza un pago **haciendo ruido**: lo anota en el token (para la app) y avisa
 * al móvil. Un pago que no entra tiene que enterarse el dueño del dinero en el
 * momento, no cuatro días después cuadrando cuentas.
 *
 * `zero_amount` es la excepción: una autorización a cero (gasolinera, alquiler
 * de coche) no es un gasto perdido, así que se anota pero no se notifica.
 */
async function rejectIngest(
  res: Response,
  opts: {
    userId: string;
    token?: ApiTokenDocument;
    reason: string;
    detail?: string;
    status?: number;
  },
): Promise<void> {
  const { userId, token, reason, detail, status = 400 } = opts;
  await noteIngestFailure(token, reason, detail);

  if (reason !== 'zero_amount') {
    const user = await User.findById(userId);
    if ((user?.prefs?.notifications?.ingest ?? 'review') !== 'none') {
      notifyInBackground(userId, {
        title: 'Un pago no entró en Kobo',
        body: `${FAILURE_TEXT[reason] ?? reason}. Revísalo y apúntalo a mano.`,
        url: '/gastos',
        // Tag común: si algo está mal en el Atajo fallarán todos los pagos
        // seguidos, y no queremos una avalancha de avisos idénticos.
        tag: 'kobo-ingesta-fallo',
      });
    }
  }

  sendError(res, reason, status);
}

/**
 * POST /api/ingest/transaction — un pago con tarjeta entra en Kobo.
 *
 * Autenticado con **token de ingesta**, no con la cookie de sesión (`requireApiToken`
 * lo monta en `routes/index.ts`). Filosofía de producto: el gasto se crea **ya**,
 * como gasto real. El dinero salió de tu cuenta en el momento del pago, así que
 * el "queda por gastar" tiene que reflejarlo al instante; si ninguna regla sabe
 * clasificarlo, entra en la categoría comodín marcado `needsReview` para que lo
 * confirmes luego. Un gasto esperando aprobación en una bandeja es un presupuesto
 * que miente.
 */
router.post(
  '/transaction',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const token = req.apiToken;

    // Validación propia (no `parseBody`): el Atajo no sabe leer un volcado de
    // zod, y en el log de acceso ese cuerpo genérico hacía indistinguibles dos
    // fallos muy distintos. Aquí sale un motivo corto, el mismo que se anota.
    const parsed = ingestTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const reason = issue?.message === 'amount_required' ? 'amount_required' : 'invalid_payload';
      await rejectIngest(res, {
        userId,
        token,
        reason,
        detail: issue ? `${issue.path.join('.') || '(raíz)'}: ${issue.message}` : undefined,
      });
      return;
    }
    const body = parsed.data;

    // 1. Importe → céntimos enteros.
    const amountCents =
      body.amountCents !== undefined ? body.amountCents : parseAmountToCents(body.amount!);
    if (amountCents === null) {
      await rejectIngest(res, { userId, token, reason: 'invalid_amount' });
      return;
    }
    if (amountCents < 0) {
      // Devoluciones/abonos: son un ingreso, no un gasto negativo. Fuera de v1.
      await rejectIngest(res, { userId, token, reason: 'refund_not_supported' });
      return;
    }
    if (amountCents === 0) {
      // Autorizaciones a cero (gasolineras, alquiler de coche): no son un gasto.
      await rejectIngest(res, { userId, token, reason: 'zero_amount' });
      return;
    }

    // 2. Idempotencia: el disparador de iOS reintenta y no queremos duplicados.
    if (body.clientRef) {
      const existing = await Expense.findOne({ userId, clientRef: body.clientRef });
      if (existing) {
        sendOk(res, {
          id: String(existing._id),
          duplicate: true,
          amountCents: existing.amountCents,
          needsReview: existing.needsReview,
          summary: `Ya registrado · ${formatEuros(existing.amountCents)}`,
        });
        return;
      }
    }

    // 3. ¿Alguna regla reconoce el comercio?
    const merchant = body.merchant?.trim() || undefined;
    const merchantNorm = merchant ? normalizeMerchant(merchant) : '';
    const rules = merchantNorm ? await IngestRule.find({ userId }) : [];
    const rule = matchRule(rules, merchantNorm);

    // 4. Categoría destino. Con regla, la suya; sin regla, la de la tarjeta (o la
    //    comodín, o la primera) y a revisar. Anti-IDOR: se relee contra el userId.
    let categoryId: Types.ObjectId | null = null;
    let subcategoryId: Types.ObjectId | undefined;
    if (rule) {
      const category = await Category.findOne({ _id: rule.categoryId, userId });
      if (category) {
        categoryId = category._id;
        if (rule.subcategoryId) {
          const sub = await Subcategory.findOne({
            _id: rule.subcategoryId,
            userId,
            categoryId: category._id,
          });
          if (sub) subcategoryId = sub._id;
        }
      }
    }
    // Sin regla: la categoría por defecto de esta tarjeta (si la tiene y sigue
    // existiendo), luego la comodín, luego la primera. Sigue entrando a revisar.
    if (!categoryId && token?.defaultCategoryId) {
      const category = await Category.findOne({ _id: token.defaultCategoryId, userId });
      if (category) {
        categoryId = category._id;
        if (token.defaultSubcategoryId) {
          const sub = await Subcategory.findOne({
            _id: token.defaultSubcategoryId,
            userId,
            categoryId: category._id,
          });
          if (sub) subcategoryId = sub._id;
        }
      }
    }
    if (!categoryId) {
      const fallback =
        (await Category.findOne({ userId, flexible: true }).sort({ order: 1 })) ??
        (await Category.findOne({ userId }).sort({ order: 1 }));
      if (!fallback) {
        // Sin categorías no hay dónde poner el gasto: mejor fallar que inventarse una.
        await rejectIngest(res, { userId, token, reason: 'no_category', status: 409 });
        return;
      }
      categoryId = fallback._id;
    }
    const needsReview = !rule;

    // 5. Cuenta/bucket del token: la tarjeta detrás de este Atajo (si se enlazó).
    let accountId: Types.ObjectId | undefined;
    let bucketId: Types.ObjectId | undefined;
    if (token?.accountId && token.bucketId) {
      const exists = await bucketExists(userId, token.accountId, token.bucketId);
      if (exists) {
        accountId = token.accountId;
        bucketId = token.bucketId;
      }
      // Si la cuenta o el bucket ya no existen, el gasto se registra igual sin
      // tocar patrimonio: perder el gasto sería mucho peor que perder el enlace.
    }

    const noteParts = [body.note?.trim(), body.card?.trim()].filter(Boolean) as string[];
    const item = await Expense.create({
      userId,
      amountCents,
      date: body.date ?? new Date(),
      categoryId,
      subcategoryId,
      accountId,
      bucketId,
      affectsPatrimony: true,
      merchant,
      note: noteParts.length ? noteParts.join(' · ').slice(0, 280) : undefined,
      source: 'ingest',
      needsReview,
      clientRef: body.clientRef,
    });
    await adjustBucketBalance(userId, accountId, bucketId, -amountCents);

    // 6. Telemetría mínima de uso (para ordenar reglas y ver tokens vivos).
    if (rule) {
      await IngestRule.updateOne(
        { _id: rule._id },
        { $inc: { hits: 1 }, $set: { lastUsedAt: new Date() } },
      );
    }
    if (token) {
      await token.updateOne({ $set: { lastUsedAt: new Date() } });
    }

    const category = await Category.findById(categoryId);
    const summary = `${formatEuros(amountCents)} · ${category?.name ?? 'Sin categoría'}${
      needsReview ? ' (por revisar)' : ''
    }`;

    // 7. Aviso al móvil, según la preferencia del usuario. Va en segundo plano:
    //    una notificación no puede retrasar ni tumbar el registro del gasto.
    const user = await User.findById(userId);
    const mode = user?.prefs?.notifications?.ingest ?? 'review';
    if (mode === 'all' || (mode === 'review' && needsReview)) {
      notifyInBackground(userId, {
        title: needsReview ? 'Gasto sin clasificar' : `Gasto en ${category?.name ?? 'Kobo'}`,
        body: merchant ? `${merchant} · ${summary}` : summary,
        // Los gastos por revisar llevan a la lista ya filtrada, que es donde se resuelven.
        url: needsReview ? '/gastos?revisar=1' : '/gastos',
        // Sin tag común: cada gasto es un aviso distinto y agruparlos ocultaría pagos.
        tag: `kobo-gasto-${String(item._id)}`,
      });
    }

    sendOk(
      res,
      {
        id: String(item._id),
        duplicate: false,
        amountCents,
        merchant,
        categoryId: String(categoryId),
        categoryName: category?.name ?? null,
        needsReview,
        summary,
      },
      201,
    );
  }),
);

export default router;
