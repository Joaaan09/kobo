import { Router } from 'express';
import { Types } from 'mongoose';
import { Expense } from '../models/Expense.js';
import { Income } from '../models/Income.js';
import { getNominaVigenteCents } from '../services/dashboard.js';
import { patrimonyChangeByMonth } from '../services/patrimonio.js';
import { asyncHandler, sendOk, getUserId } from '../lib/http.js';

const router = Router();

interface MonthAccumulator {
  gastadoCents: number;
  ingresosCents: number;
}

// GET /api/months — resúmenes por mes con actividad (para histórico/comparativa).
// Los meses se agrupan por 'YYYY-MM' en zona Europe/Madrid.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const uid = new Types.ObjectId(userId);

    const [expAgg, incAgg, nominaCents, patrimony] = await Promise.all([
      Expense.aggregate<{ _id: string; total: number }>([
        { $match: { userId: uid } },
        {
          $group: {
            _id: { $dateToString: { date: '$date', format: '%Y-%m', timezone: 'Europe/Madrid' } },
            total: { $sum: '$amountCents' },
          },
        },
      ]),
      Income.aggregate<{ _id: string; total: number }>([
        { $match: { userId: uid } },
        {
          $group: {
            _id: { $dateToString: { date: '$date', format: '%Y-%m', timezone: 'Europe/Madrid' } },
            total: { $sum: '$amountCents' },
          },
        },
      ]),
      // v1: misma nómina vigente para todos los meses (histórico por snapshot = follow-up).
      getNominaVigenteCents(userId),
      // Variación del patrimonio del mes, descompuesta en aportado vs rendimiento.
      patrimonyChangeByMonth(userId),
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
    for (const row of expAgg) ensure(row._id).gastadoCents = row.total;
    for (const row of incAgg) ensure(row._id).ingresosCents = row.total;
    // Un mes puede tener SOLO rendimiento (ni gastos ni ingresos) y aun así ser
    // un mes con actividad: si no, esa ganancia no se vería en ninguna parte.
    for (const key of patrimony.keys()) ensure(key);

    const months = [...map.entries()]
      .map(([key, value]) => {
        const [year, month] = key.split('-').map(Number);
        // usadoBp = porción de la nómina gastada (10000 = 100 %).
        const usadoBp = nominaCents > 0 ? Math.round((value.gastadoCents * 10000) / nominaCents) : 0;
        const change = patrimony.get(key);
        return {
          year,
          month,
          nominaCents,
          gastadoCents: value.gastadoCents,
          ingresosCents: value.ingresosCents,
          usadoBp,
          // Patrimonio: cuánto se movió y por qué (ahorro tuyo vs rendimiento).
          aportadoCents: change?.aportadoCents ?? 0,
          rendimientoCents: change?.rendimientoCents ?? 0,
          patrimonioDeltaCents: change?.deltaCents ?? 0,
        };
      })
      .sort((a, b) => b.year - a.year || b.month - a.month);

    sendOk(res, months);
  }),
);

export default router;
