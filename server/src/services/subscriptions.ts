import { Types } from 'mongoose';
import { Subscription, type SubscriptionDocument } from '../models/Subscription.js';
import { Expense } from '../models/Expense.js';
import { Category } from '../models/Category.js';
import { Subcategory } from '../models/Subcategory.js';
import { User } from '../models/User.js';
import { adjustBucketBalance, bucketExists } from './accounts.js';
import { notifyInBackground } from './push.js';
import { madridDayKey } from '../lib/time.js';
import { dayAfter, scheduleNextCharge } from './subscriptionSchedule.js';

/**
 * Suscripciones (定期): planificador que registra los cargos vencidos como gastos
 * reales. El calendario (qué día toca) vive en `subscriptionSchedule.ts`.
 */

/** Tope de cargos por suscripción y pasada (meses de servidor caído que se recuperan). */
const MAX_CATCH_UP = 36;

function formatEuros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

/** ¿Error de clave duplicada de Mongo? (el cargo ya existía: idempotencia). */
function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

/**
 * Registra los cargos vencidos de UNA suscripción (todos los ≤ hoy) como gastos
 * reales y avanza su próximo cargo. Devuelve cuántos cargos nuevos registró.
 */
async function chargeSubscription(initial: SubscriptionDocument, todayKey: string): Promise<number> {
  let sub: SubscriptionDocument | null = initial;
  let charged = 0;
  const userId = String(initial.userId);

  for (let i = 0; i < MAX_CATCH_UP && sub && sub.active && sub.nextChargeDate <= todayKey; i++) {
    const dateKey: string = sub.nextChargeDate;

    // Anti-IDOR y datos vivos: todo se relee contra el userId de la suscripción.
    const category = await Category.findOne({ _id: sub.categoryId, userId });
    if (!category) {
      // Sin categoría no hay dónde apuntarlo: se pausa y se dice (nada de inventarse una).
      await Subscription.updateOne(
        { _id: sub._id },
        { $set: { active: false, lastError: 'category_not_found' } },
      );
      return charged;
    }
    let subcategoryId: Types.ObjectId | undefined;
    if (sub.subcategoryId) {
      const exists = await Subcategory.exists({
        _id: sub.subcategoryId,
        userId,
        categoryId: category._id,
      });
      if (exists) subcategoryId = sub.subcategoryId;
    }
    let accountId: Types.ObjectId | undefined;
    let bucketId: Types.ObjectId | undefined;
    if (sub.accountId && sub.bucketId && (await bucketExists(userId, sub.accountId, sub.bucketId))) {
      accountId = sub.accountId;
      bucketId = sub.bucketId;
    }
    // Si la cuenta ya no existe, el cargo se registra igual sin tocar patrimonio:
    // perder el gasto sería peor que perder el enlace (mismo criterio que la ingesta).

    try {
      await Expense.create({
        userId: sub.userId,
        amountCents: sub.amountCents,
        // Medianoche UTC del día: cae ese mismo día en Madrid (igual que la app).
        date: new Date(`${dateKey}T00:00:00.000Z`),
        categoryId: category._id,
        subcategoryId,
        accountId,
        bucketId,
        affectsPatrimony: true,
        note: sub.name,
        source: 'subscription',
        subscriptionId: sub._id,
        needsReview: false,
        clientRef: `sub:${String(sub._id)}:${dateKey}`,
      });
      try {
        await adjustBucketBalance(userId, accountId, bucketId, -sub.amountCents);
      } catch (err) {
        // Gasto sin descuento = patrimonio descuadrado. Se deshace el gasto para que
        // el reintento (que chocaría con el `clientRef`) lo vuelva a hacer entero.
        await Expense.deleteOne({ userId: sub.userId, clientRef: `sub:${String(sub._id)}:${dateKey}` });
        throw err;
      }
      charged += 1;

      const user = await User.findById(userId, { 'prefs.notifications': 1 });
      if (user?.prefs?.notifications?.ingest === 'all') {
        notifyInBackground(userId, {
          title: `Cargo de ${sub.name}`,
          body: `${formatEuros(sub.amountCents)} · ${category.name}`,
          url: '/gastos',
          tag: `kobo-suscripcion-${String(sub._id)}-${dateKey}`,
        });
      }
    } catch (err) {
      // Ya registrado por una pasada anterior que no llegó a avanzar la fecha.
      if (!isDuplicateKey(err)) throw err;
    }

    // Avance condicionado a que nadie haya tocado la fecha entretanto.
    sub = await Subscription.findOneAndUpdate(
      { _id: sub._id, nextChargeDate: dateKey },
      {
        $set: {
          // El siguiente, saltando el periodo recién cobrado: si el primer cargo se
          // fijó a mano en otro día (el 29 con cobro el 30), el 30 no repite mes.
          nextChargeDate: scheduleNextCharge(sub, dayAfter(dateKey), dateKey),
          lastChargeDate: dateKey,
          lastChargedAt: new Date(),
        },
        $unset: { lastError: 1 },
      },
      { new: true },
    );
  }
  return charged;
}

/**
 * Registra todos los cargos vencidos (de un usuario o de todos). Exportada para
 * llamarla tras crear/editar una suscripción y desde scripts sin esperar al reloj.
 */
export async function chargeDueSubscriptions(now = new Date(), userId?: string): Promise<number> {
  const todayKey = madridDayKey(now);
  const filter: Record<string, unknown> = { active: true, nextChargeDate: { $lte: todayKey } };
  if (userId) filter.userId = new Types.ObjectId(userId);

  let total = 0;
  for (const sub of await Subscription.find(filter)) {
    try {
      total += await chargeSubscription(sub, todayKey);
    } catch (err) {
      // Una suscripción rota no puede bloquear las demás.
      console.error('[suscripciones] cargo fallido', String(sub._id), err);
    }
  }
  return total;
}

const TICK_MS = 10 * 60_000;

/**
 * Planificador en proceso (mismo patrón que `reminders.ts`): una pasada al
 * arrancar y otra cada 10 min. Los cargos son por día, así que el retraso máximo
 * tras la medianoche de Madrid es de un tick.
 */
export function startSubscriptionScheduler(): () => void {
  const run = () =>
    void chargeDueSubscriptions().catch((err) => {
      console.error('[suscripciones] pasada fallida', err);
    });
  run();
  const timer = setInterval(run, TICK_MS);
  timer.unref();
  console.log('[suscripciones] planificador en marcha (tick de 10 min)');
  return () => clearInterval(timer);
}
