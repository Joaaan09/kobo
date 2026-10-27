import { Router } from 'express';
import { computeDashboard } from '../services/dashboard.js';
import { parseMonthParam, madridParts } from '../lib/time.js';
import { asyncHandler, sendOk, sendError, getUserId } from '../lib/http.js';

const router = Router();

// GET /api/dashboard?month=YYYY-MM — resumen del mes (por defecto, el actual).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { month } = req.query;
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
      const now = madridParts(new Date());
      year = now.year;
      monthNum = now.month;
    }

    const data = await computeDashboard(getUserId(req), year, monthNum);
    sendOk(res, data);
  }),
);

export default router;
