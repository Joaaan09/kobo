import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { ApiToken, type ApiTokenDocument } from '../models/ApiToken.js';

/**
 * Autenticación de la **ingesta automática** (Atajo de iOS): `Authorization:
 * Bearer <token>`, no la cookie de sesión —un Atajo no tiene navegador.
 *
 * Reglas duras (§11):
 * - El token se guarda **hasheado** (sha256). En claro solo existe en el momento
 *   de crearlo, en la respuesta que ve el usuario una única vez.
 * - Su alcance es **solo `/api/ingest`**: crear gastos. Nunca leer el patrimonio
 *   ni tocar la sesión. Un token filtrado ensucia datos; no los expone ni los borra.
 * - Ignora deliberadamente cualquier cookie: este camino no puede convertirse en
 *   una vía alternativa de sesión.
 */

const TOKEN_PREFIX = 'kobo_';
const PREFIX_VISIBLE_CHARS = 8;

/** Ventana y tope del rate limit por token (un pago por segundo ya es absurdo). */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_HITS = 60;

const hits = new Map<string, { count: number; resetAt: number }>();

/**
 * Rate limit en memoria, por token. El backend corre en un solo contenedor
 * (§2) así que un Map basta; si algún día escala a varias réplicas, esto se
 * mueve a Mongo o Redis.
 */
function rateLimited(tokenId: string, now: number): boolean {
  const entry = hits.get(tokenId);
  if (!entry || now >= entry.resetAt) {
    hits.set(tokenId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX_HITS;
}

/** Purga perezosa: sin esto el Map crecería con cada token que deja de usarse. */
function pruneRateLimit(now: number): void {
  if (hits.size < 64) return;
  for (const [key, entry] of hits) {
    if (now >= entry.resetAt) hits.delete(key);
  }
}

/** Genera un token nuevo en claro. 32 bytes de entropía: nada que adivinar. */
export function generateApiToken(): { token: string; tokenHash: string; prefix: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashApiToken(token),
    prefix: token.slice(0, TOKEN_PREFIX.length + PREFIX_VISIBLE_CHARS),
  };
}

/**
 * sha256 del token. Aquí NO se usa bcrypt a propósito: el token tiene 256 bits
 * de entropía aleatoria (no es una contraseña humana adivinable), así que un
 * hash rápido es seguro y evita quemar CPU en cada pago.
 */
export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Compara dos hashes hex en tiempo constante. */
function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Extrae el token de `Authorization: Bearer …` (o del header `X-Kobo-Token`). */
function readToken(req: Request): string | null {
  const auth = req.header('authorization');
  if (auth) {
    const [scheme, value] = auth.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && value) return value.trim();
  }
  // Alternativa para clientes que lo tengan más fácil con un header propio.
  const custom = req.header('x-kobo-token');
  return custom ? custom.trim() : null;
}

/**
 * Deja rastro de un pago rechazado. Existe porque la ingesta fallaba **en
 * silencio**: el Atajo mandaba la petición, el servidor contestaba un 4xx que
 * nadie miraba y el presupuesto mentía durante días. En una feature cuyo valor
 * entero es "no tienes que acordarte", un fallo mudo es peor que no tenerla.
 *
 * Dos destinos: el log del servidor (siempre, con el motivo explícito) y, si el
 * token era válido, el propio documento —para que la app pueda enseñarlo sin
 * que nadie tenga que leer logs.
 *
 * Nunca falla hacia fuera: anotar el rechazo no puede provocar otro.
 */
export async function noteIngestFailure(
  token: ApiTokenDocument | undefined,
  reason: string,
  detail?: string,
): Promise<void> {
  const who = token ? `${token.prefix}… (${token.label})` : 'sin token';
  console.warn(`[ingest] rechazado: ${reason}${detail ? ` — ${detail}` : ''} · ${who}`);
  if (!token) return;
  try {
    await token.updateOne({
      $set: { lastFailureAt: new Date(), lastFailureReason: reason },
    });
  } catch (err) {
    console.error('[ingest] no se pudo anotar el rechazo', err);
  }
}

/**
 * Pista **no secreta** de un token que no autentica, para poder diagnosticar el
 * 401 a posteriori: el prefijo visible (los mismos caracteres que la app ya
 * enseña en la lista de dispositivos) y su longitud, que es lo que delata un
 * `kobo_kobo_…` pegado dos veces o un copiado a medias. El resto no se registra.
 */
function tokenHint(token: string): string {
  return `«${token.slice(0, TOKEN_PREFIX.length + PREFIX_VISIBLE_CHARS)}…», ${token.length} caracteres`;
}

/**
 * Middleware de ingesta. Verifica el token, rellena `req.userId` (para reusar
 * el aislamiento por usuario del resto de la API) y `req.apiToken`.
 */
export async function requireApiToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = readToken(req);
  if (!token) {
    await noteIngestFailure(undefined, 'missing_token', 'sin cabecera Authorization: Bearer');
    res.status(401).json({ ok: false, error: 'missing_token' });
    return;
  }

  const tokenHash = hashApiToken(token);
  const doc = await ApiToken.findOne({ tokenHash });
  // Aunque la búsqueda ya es por hash exacto, el contraste final va en tiempo
  // constante para no dar pistas por temporización.
  if (!doc || !hashesEqual(doc.tokenHash, tokenHash)) {
    await noteIngestFailure(undefined, 'invalid_token', tokenHint(token));
    res.status(401).json({ ok: false, error: 'invalid_token' });
    return;
  }
  if (doc.revokedAt) {
    await noteIngestFailure(doc, 'revoked_token');
    res.status(401).json({ ok: false, error: 'revoked_token' });
    return;
  }

  const now = Date.now();
  pruneRateLimit(now);
  if (rateLimited(String(doc._id), now)) {
    await noteIngestFailure(doc, 'rate_limited');
    res.status(429).json({ ok: false, error: 'rate_limited' });
    return;
  }

  req.userId = String(doc.userId);
  req.apiToken = doc;
  next();
}
