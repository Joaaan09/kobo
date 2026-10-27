/**
 * Wrapper de fetch para la API de Kobo.
 * - Base `/api`, cookie de sesión (`credentials: 'include'`).
 * - Contrato de respuesta: `{ ok: true, data }` en éxito, `{ ok: false, error }` en fallo.
 * - Lanza `ApiError` (con `status` + mensaje) para que las vistas puedan ramificar.
 */

const BASE = '/api';

/** Error tipado de la API: expone el `status` HTTP y el mensaje del backend. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface Envelope<T> {
  ok?: boolean;
  data?: T;
  error?: string;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let payload: Envelope<T> | null = null;
  try {
    payload = (await res.json()) as Envelope<T>;
  } catch {
    // Respuesta sin cuerpo JSON (p. ej. 204): se trata más abajo.
  }

  if (!res.ok) {
    throw new ApiError(res.status, payload?.error ?? res.statusText ?? 'Error de red');
  }
  if (payload && payload.ok === false) {
    throw new ApiError(res.status, payload.error ?? 'Error de la API');
  }

  return (payload?.data as T) ?? (undefined as T);
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>('GET', path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown): Promise<T> => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>('PATCH', path, body),
  del: <T>(path: string): Promise<T> => request<T>('DELETE', path),
};
