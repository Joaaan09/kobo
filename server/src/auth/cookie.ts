import type { Response } from 'express';
import { isProd } from '../config/env.js';

/** Nombre de la cookie de sesión (httpOnly). */
export const COOKIE_NAME = 'kobo_token';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

const baseOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd, // solo sobre HTTPS en producción (TLS lo termina NPM)
  path: '/',
};

/** Fija la cookie de sesión con el token JWT. */
export function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, { ...baseOptions, maxAge: MAX_AGE_MS });
}

/** Limpia la cookie de sesión (logout). */
export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, baseOptions);
}
