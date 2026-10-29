import { Router } from 'express';
import { computeDashboard } from '../services/dashboard.js';
import { parseMonthParam, cycleOf } from '../lib/time.js';
import { getCycleConfig } from '../services/cycle.js';
import { asyncHandler, sendOk, sendError, getUserId } from '../lib/http.js';

const router = Router();

// GET /api/dashboard?month=YYYY-MM — resumen del mes (por defecto, el ciclo en curso).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { month } = req.query;
    const userId = getUserId(req);
    const cycle = await getCycleConfig(userId);
    let year: number;
    let monthNum: number;

    if (typeof month === 'string') {
      const parsed = parseMonthParam(month);
      if (!parsed) {
        sendError(res, 'invalid_month');
        return;
      }
      ({ year, month: monthNum } = parsed);
    } else {
      ({ year, month: monthNum } = cycleOf(cycle, new Date()));
    }

    const data = await computeDashboard(userId, year, monthNum, cycle);
    sendOk(res, data);
  }),
);

export default router;
