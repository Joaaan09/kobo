import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../auth/middleware.js';
import { requireApiToken } from '../auth/apiToken.js';
import authRouter from './auth.js';
import ingestRouter from './ingest.js';
import automationRouter from './automation.js';
import pushRouter from './push.js';
import categoriesRouter from './categories.js';
import subcategoriesRouter from './subcategories.js';
import fundsRouter from './funds.js';
import expensesRouter from './expenses.js';
import incomesRouter from './incomes.js';
import transfersRouter from './transfers.js';
import valuationsRouter from './valuations.js';
import accountsRouter from './accounts.js';
import incomeConfigRouter from './incomeConfig.js';
import dashboardRouter from './dashboard.js';
import distributionsRouter from './distributions.js';
import monthsRouter from './months.js';

const router = Router();

/**
 * Health-check de la API. Lo usa el HEALTHCHECK del Dockerfile y el
 * depends_on del compose. Reporta también el estado de la conexión a Mongo.
 */
router.get('/health', (_req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  res.json({
    ok: true,
    service: 'kobo-api',
    db: dbState === 1 ? 'up' : 'down',
    ts: new Date().toISOString(),
  });
});

// Auth: register/login/logout son públicos; /me exige sesión (dentro del router).
router.use('/auth', authRouter);

/**
 * Ingesta automática (Atajo de iOS). Único router que NO usa la cookie de sesión:
 * se autentica con un token de ingesta acotado a crear gastos (§11). Deliberadamente
 * separado de `/expenses` para que ese token no herede el resto de la API.
 */
router.use('/ingest', requireApiToken, ingestRouter);

// Recursos privados: requireAuth blinda cada endpoint y aísla por userId (§11).
router.use('/categories', requireAuth, categoriesRouter);
router.use('/subcategories', requireAuth, subcategoriesRouter);
router.use('/funds', requireAuth, fundsRouter);
router.use('/expenses', requireAuth, expensesRouter);
router.use('/incomes', requireAuth, incomesRouter);
router.use('/transfers', requireAuth, transfersRouter);
router.use('/valuations', requireAuth, valuationsRouter);
router.use('/accounts', requireAuth, accountsRouter);
router.use('/income-config', requireAuth, incomeConfigRouter);
router.use('/dashboard', requireAuth, dashboardRouter);
router.use('/distributions', requireAuth, distributionsRouter);
router.use('/months', requireAuth, monthsRouter);
router.use('/automation', requireAuth, automationRouter);
router.use('/push', requireAuth, pushRouter);

export default router;
