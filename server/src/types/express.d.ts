import type { ApiTokenDocument } from '../models/ApiToken.js';

// Extiende la Request de Express con el userId de la sesión (lo setea requireAuth
// o, en la ingesta automática, requireApiToken) y el token de API usado.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      apiToken?: ApiTokenDocument;
    }
  }
}

export {};
