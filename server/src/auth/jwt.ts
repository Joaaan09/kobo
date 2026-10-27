import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/** Payload del JWT de sesión: `sub` = userId. */
export interface TokenPayload {
  sub: string;
}

const EXPIRES_IN = '7d';

/** Firma un token de sesión de 7 días para el usuario dado. */
export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, { expiresIn: EXPIRES_IN });
}

/** Verifica y decodifica el token; lanza si es inválido/expirado. */
export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
    throw new Error('invalid_token');
  }
  return { sub: decoded.sub };
}
