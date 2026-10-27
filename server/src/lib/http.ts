import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodType } from 'zod';

/** Respuesta de éxito uniforme: `{ ok: true, data }`. */
export function sendOk(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ ok: true, data });
}

/** Respuesta de error uniforme: `{ ok: false, error }`. */
export function sendError(res: Response, error: string, status = 400): void {
  res.status(status).json({ ok: false, error });
}

/** Envuelve un handler async y reenvía cualquier rechazo al error handler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Valida `req.body` con un esquema zod. Si falla, responde 400 con los detalles
 * y devuelve `undefined` (el handler debe hacer `return`). Si pasa, devuelve los datos.
 */
export function parseBody<T>(schema: ZodType<T>, req: Request, res: Response): T | undefined {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ ok: false, error: 'validation_error', details: result.error.flatten() });
    return undefined;
  }
  return result.data;
}

/** userId de la sesión (garantizado por requireAuth). */
export function getUserId(req: Request): string {
  return req.userId as string;
}
