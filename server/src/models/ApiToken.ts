import { Schema, model, Types, HydratedDocument } from 'mongoose';
import { serializePlugin } from './plugins/serialize.js';

/**
 * Token de ingesta (自動): credencial de larga vida para que un dispositivo
 * externo (el Atajo de iOS) cree gastos sin sesión de navegador.
 *
 * Seguridad (§11): del token solo se guarda su **sha256**; el valor en claro se
 * enseña UNA vez al crearlo y no se puede recuperar. Su alcance es mínimo —
 * `requireApiToken` solo blinda `/api/ingest`, jamás el resto de la API—, así
 * que filtrarlo permite escribir gastos, nunca leer ni vaciar la cuenta.
 * `revokedAt` lo desactiva sin borrar el histórico de uso.
 *
 * `accountId` + `bucketId` (opcionales) son la **tarjeta física detrás del token**:
 * un token por tarjeta de Wallet, así el pago descuenta además del patrimonio.
 *
 * `defaultCategoryId` (+ `defaultSubcategoryId`) es dónde cae un pago de esta
 * tarjeta cuando **ninguna regla** reconoce el comercio. Sigue entrando marcado
 * `needsReview`: la categoría por defecto es una suposición, no una clasificación.
 */
export interface IApiToken {
  userId: Types.ObjectId;
  label: string;
  /** sha256 (hex) del token en claro. Nunca sale del servidor. */
  tokenHash: string;
  /** Primeros caracteres del token, para reconocerlo en la UI (no es secreto). */
  prefix: string;
  accountId?: Types.ObjectId;
  bucketId?: Types.ObjectId;
  defaultCategoryId?: Types.ObjectId;
  defaultSubcategoryId?: Types.ObjectId;
  lastUsedAt?: Date;
  /**
   * Último rechazo y su motivo. Existen porque la ingesta fallaba **en silencio**:
   * el Atajo mandaba el pago, el servidor contestaba un 400 que nadie veía y el
   * presupuesto mentía durante días. Con esto la propia app puede responder a
   * "¿por qué no entró mi pago?" sin ir a los logs del servidor.
   */
  lastFailureAt?: Date;
  lastFailureReason?: string;
  revokedAt?: Date;
}

export type ApiTokenDocument = HydratedDocument<IApiToken>;

const apiTokenSchema = new Schema<IApiToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, required: true, trim: true },
    tokenHash: { type: String, required: true, unique: true },
    prefix: { type: String, required: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account' },
    bucketId: { type: Schema.Types.ObjectId },
    defaultCategoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
    defaultSubcategoryId: { type: Schema.Types.ObjectId, ref: 'Subcategory' },
    lastUsedAt: { type: Date },
    lastFailureAt: { type: Date },
    lastFailureReason: { type: String },
    revokedAt: { type: Date },
  },
  { timestamps: true },
);

apiTokenSchema.index({ userId: 1, createdAt: -1 });
// `hide: tokenHash` — el hash no viaja al cliente ni por accidente.
apiTokenSchema.plugin(serializePlugin, { hide: ['tokenHash'] });

export const ApiToken = model<IApiToken>('ApiToken', apiTokenSchema);
