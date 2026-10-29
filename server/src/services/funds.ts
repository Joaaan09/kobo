import { Types } from 'mongoose';
import { Fund } from '../models/Fund.js';
import { Expense } from '../models/Expense.js';
import { CALENDAR_CYCLE, cycleRange, monthIndex, type CycleConfig } from '../lib/time.js';

/**
 * Cálculo de fondos de previsión (積立) para un mes dado. Todo en **céntimos**.
 *
 * - `provisionCents` = `round(targetCents / everyMonths)` — lo que se reserva
 *   cada mes. El posible resto (target no divisible) rueda al siguiente ciclo.
 * - `balanceCents` (saldo acumulado) se **deriva**: provisiones acumuladas desde
 *   el mes de inicio del fondo menos los pagos reales (`Expense` con `fundId`)
 *   hasta el fin del mes consultado. Puede quedar negativo si se paga antes de
 *   tiempo (el fondo se "recupera" los meses siguientes) — se conserva el signo.
 */

/** Provisión mensual (céntimos) de un fondo. */
export function fundProvisionCents(targetCents: number, everyMonths: number): number {
  return Math.round(targetCents / everyMonths);
}

/**
 * Nº de provisiones acumuladas desde el inicio del fondo hasta `year`/`month`
 * inclusive. 0 si el fondo aún no ha empezado en el mes consultado.
 */
export function monthsAccrued(
  startYear: number,
  startMonth: number,
  year: number,
  month: number,
): number {
  return Math.max(0, monthIndex(year, month) - monthIndex(startYear, startMonth) + 1);
}

/**
 * Documento de actualización de un fondo. Desanclar (`subcategoryId: null`) tiene
 * que **borrar** el campo, no guardarlo a null: un null en la base se colaría en
 * las consultas por subcategoría como si fuera un valor. Ausente = no se toca.
 */
export function fundUpdateDoc(body: {
  subcategoryId?: string | null;
  [key: string]: unknown;
}): Record<string, unknown> {
  const { subcategoryId, ...rest } = body;
  const update: Record<string, unknown> = { ...rest };
  if (subcategoryId === null) update.$unset = { subcategoryId: 1 };
  else if (subcategoryId !== undefined) update.subcategoryId = subcategoryId;
  return update;
}

export interface FundView {
  id: string;
  categoryId: string;
  /** Subcategoría a la que se ancla (etiqueta): el dinero sigue siendo de la categoría. */
  subcategoryId?: string;
  name: string;
  kanji?: string;
  targetCents: number;
  everyMonths: number;
  provisionCents: number; // reservado cada mes
  reservedCents: number; // reservado ESTE mes (0 si el fondo no ha empezado)
  balanceCents: number; // saldo acumulado a fin del mes consultado
  paidThisMonthCents: number; // pagos reales registrados este mes
  active: boolean; // el fondo ya está en marcha en el mes consultado
  monthsUntilTarget: number | null; // meses estimados para llegar al objetivo
}

export interface FundsForMonth {
  funds: FundView[];
  reservedByCategory: Map<string, number>;
  reservedTotalCents: number;
}

/** Calcula todos los fondos del usuario para el mes (ciclo, zona Europe/Madrid). */
export async function computeFundsForMonth(
  userId: string,
  year: number,
  month: number,
  cycle: CycleConfig = CALENDAR_CYCLE,
): Promise<FundsForMonth> {
  const uid = new Types.ObjectId(userId);
  // El "mes" del fondo es el ciclo del usuario: la provisión se reserva por ciclo.
  const { start, end } = cycleRange(cycle, year, month);

  const [funds, paidToDateAgg, paidThisMonthAgg] = await Promise.all([
    Fund.find({ userId }).sort({ order: 1, createdAt: 1 }).lean(),
    // Pagos acumulados hasta el fin del mes consultado (para el saldo derivado).
    Expense.aggregate<{ _id: Types.ObjectId; paid: number }>([
      { $match: { userId: uid, fundId: { $ne: null }, date: { $lt: end } } },
      { $group: { _id: '$fundId', paid: { $sum: '$amountCents' } } },
    ]),
    // Pagos registrados dentro del mes consultado (para mostrarlos).
    Expense.aggregate<{ _id: Types.ObjectId; paid: number }>([
      { $match: { userId: uid, fundId: { $ne: null }, date: { $gte: start, $lt: end } } },
      { $group: { _id: '$fundId', paid: { $sum: '$amountCents' } } },
    ]),
  ]);

  const paidToDate = new Map<string, number>();
  for (const r of paidToDateAgg) paidToDate.set(String(r._id), r.paid);
  const paidThisMonth = new Map<string, number>();
  for (const r of paidThisMonthAgg) paidThisMonth.set(String(r._id), r.paid);

  const reservedByCategory = new Map<string, number>();
  let reservedTotalCents = 0;

  const views: FundView[] = funds.map((f) => {
    const id = String(f._id);
    const categoryId = String(f.categoryId);
    const provisionCents = fundProvisionCents(f.targetCents, f.everyMonths);
    const n = monthsAccrued(f.startYear, f.startMonth, year, month);
    const active = n >= 1;
    const reservedCents = active ? provisionCents : 0;
    const accumulated = n * provisionCents;
    const balanceCents = accumulated - (paidToDate.get(id) ?? 0);

    reservedTotalCents += reservedCents;
    reservedByCategory.set(categoryId, (reservedByCategory.get(categoryId) ?? 0) + reservedCents);

    const remaining = f.targetCents - balanceCents;
    const monthsUntilTarget =
      provisionCents > 0 ? Math.max(0, Math.ceil(remaining / provisionCents)) : null;

    return {
      id,
      categoryId,
      subcategoryId: f.subcategoryId ? String(f.subcategoryId) : undefined,
      name: f.name,
      kanji: f.kanji,
      targetCents: f.targetCents,
      everyMonths: f.everyMonths,
      provisionCents,
      reservedCents,
      balanceCents,
      paidThisMonthCents: paidThisMonth.get(id) ?? 0,
      active,
      monthsUntilTarget,
    };
  });

  return { funds: views, reservedByCategory, reservedTotalCents };
}
