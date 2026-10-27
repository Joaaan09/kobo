import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env, isProd } from './config/env.js';
import apiRouter from './routes/index.js';

/** Construye la app de Express (sin escuchar; el listen vive en index.ts). */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true, // cookies httpOnly de sesión
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(morgan(isProd ? 'combined' : 'dev'));

  // API bajo /api (el nginx del frontend proxya /api → aquí).
  app.use('/api', apiRouter);

  // 404 para rutas de API no encontradas.
  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: 'not_found' });
  });

  // Manejador de errores centralizado (no filtra internals en producción).
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const message = err instanceof Error ? err.message : 'internal_error';
      if (!isProd) console.error(err);
      res.status(500).json({ ok: false, error: isProd ? 'internal_error' : message });
    },
  );

  return app;
}
