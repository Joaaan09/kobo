import { Router } from 'express';
import { Types } from 'mongoose';
import { Expense } from '../models/Expense.js';
import { Income } from '../models/Income.js';
import { Account } from '../models/Account.js';
import { getNominaVigenteCents } from '../services/dashboard.js';
import { patrimonyAtCloseByMonth, patrimonyChangeByMonth } from '../services/patrimonio.js';
import { getCycleConfig } from '../services/cycle.js';
import {
  TZ,
  cycleKeyOfDayKey,
  cycleOf,
  cycleRange,
  madridDayKey,
  parseMonthParam,
} from '../lib/time.js';
import { asyncHandler, sendOk, getUserId } from '../lib/http.js';

const router = Router();

interface MonthAccumulator {
  gastadoCents: number;
  ingresosCents: number;
}

/** Agrupación por día de Madrid; se pliega al ciclo del usuario en JS. */
const dayKey = { $dateToString: { date: '$date', format: '%Y-%m-%d', timezone: TZ } };

// GET /api/months — resúmenes por mes con actividad (para histórico/comparativa).
// "Mes" = ciclo del usuario (puede empezar el día de cobro), clave 'YYYY-MM'.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const uid = new Types.ObjectId(userId);
    const cycle = await getCycleConfig(userId);

    const [expAgg, incAgg, nominaCents, patrimony, accounts] = await Promise.all([
      Expense.aggregate<{ _id: string; total: number }>([
        { $match: { userId: uid } },
        { $group: { _id: dayKey, total: { $sum: '$amountCents' } } },
      ]),
      Income.aggregate<{ _id: string; total: number }>([
        { $match: { userId: uid } },
        { $group: { _id: dayKey, total: { $sum: '$amountCents' } } },
      ]),
      // v1: misma nómina vigente para todos los meses (histórico por snapshot = follow-up).
      getNominaVigenteCents(userId),
      // Variación del patrimonio del mes, descompuesta en aportado vs rendimiento.
      patrimonyChangeByMonth(userId, cycle),
      Account.find({ userId }, { 'buckets.balanceCents': 1 }).lean(),
    ]);

    const map = new Map<string, MonthAccumulator>();
    const ensure = (key: string): MonthAccumulator => {
      let entry = map.get(key);
      if (!entry) {
        entry = { gastadoCents: 0, ingresosCents: 0 };
        map.set(key, entry);
      }
      return entry;
    };
    for (const row of expAgg) ensure(cycleKeyOfDayKey(cycle, row._id)).gastadoCents += row.total;
    for (const row of incAgg) ensure(cycleKeyOfDayKey(cycle, row._id)).ingresosCents += row.total;
    // Un mes puede tener SOLO rendimiento (ni gastos ni ingresos) y aun así ser
    // un mes con actividad: si no, esa ganancia no se vería en ninguna parte.
    for (const key of patrimony.keys()) ensure(key);
    // El mes en curso siempre aparece: es donde se ve el patrimonio de hoy.
    const now = cycleOf(cycle, new Date());
    const currentKey = `${now.year}-${String(now.month).padStart(2, '0')}`;
    ensure(currentKey);

    // Patrimonio al cierre de cada mes, reconstruido hacia atrás desde los saldos
    // de hoy: `cierre(M) − cierre(M−1)` es exactamente el delta del mes.
    const totalNowCents = accounts.reduce(
      (sum, a) => sum + a.buckets.reduce((acc, b) => acc + (b.balanceCents ?? 0), 0),
      0,
    );
    const atClose = patrimonyAtCloseByMonth(totalNowCents, patrimony, [...map.keys()]);

    const months = [...map.entries()]
      // Meses futuros (algo fechado por delante) no se listan como histórico.
      .filter(([key]) => key <= currentKey)
      .map(([key, value]) => {
        const { year, month } = parseMonthParam(key)!;
        const { start, end } = cycleRange(cycle, year, month);
        // usadoBp = porción de la nómina gastada (10000 = 100 %).
        const usadoBp = nominaCents > 0 ? Math.round((value.gastadoCents * 10000) / nominaCents) : 0;
        const change = patrimony.get(key);
        return {
          year,
          month,
          // Límites del ciclo (inclusive) para que la vista enseñe "25 oct – 24 nov".
          firstDay: madridDayKey(start),
          lastDay: madridDayKey(new Date(end.getTime() - 1)),
          current: key === currentKey,
          nominaCents,
          gastadoCents: value.gastadoCents,
          ingresosCents: value.ingresosCents,
          usadoBp,
          // Patrimonio: cuánto se movió y por qué (ahorro tuyo vs rendimiento)…
          aportadoCents: change?.aportadoCents ?? 0,
          rendimientoCents: change?.rendimientoCents ?? 0,
          patrimonioDeltaCents: change?.deltaCents ?? 0,
          // …y cuánto había al cerrar el mes (hoy, si es el mes en curso).
          patrimonioCierreCents: atClose.get(key) ?? totalNowCents,
        };
      })
      .sort((a, b) => b.year - a.year || b.month - a.month);

    sendOk(res, months);
  }),
);

export default router;
