import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from './jwt.js';
import { COOKIE_NAME } from './cookie.js';

/**
 * Middleware de autenticación. Lee la cookie de sesión, verifica el JWT y
 * pone `req.userId`. Responde 401 si no hay token o es inválido. Todo endpoint
 * privado va detrás de esto (§11: nada de datos sin sesión válida).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  try {
    const { sub } = verifyToken(token);
    req.userId = sub;
    next();
  } catch {
    res.status(401).json({ ok: false, error: 'unauthorized' });
  }
}
