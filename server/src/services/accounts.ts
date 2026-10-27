import { Types } from 'mongoose';
import { Account } from '../models/Account.js';

/**
 * Enlace transacción ↔ patrimonio. Un gasto/ingreso puede apuntar a
 * `accountId` + `bucketId`; al crear se ajusta el balance del bucket (gasto
 * resta, ingreso suma), al borrar se revierte y al editar se aplica el delta.
 *
 * Caveat (documentado): Mongo de un solo nodo no da transacciones multi-doc,
 * así que estos ajustes son secuenciales *best-effort*. App personal
 * monousuario → aceptable. Endurecer con replica-set + txn = follow-up.
 *
 * Todo aislado por `userId` (anti-IDOR).
 */

/**
 * Ajusta el balance del bucket en `deltaCents`. No-op si falta accountId/bucketId
 * o si la cuenta/bucket no existe (p. ej. al revertir algo ya borrado).
 * Devuelve true si aplicó el ajuste.
 */
export async function adjustBucketBalance(
  userId: string,
  accountId: Types.ObjectId | null | undefined,
  bucketId: Types.ObjectId | null | undefined,
  deltaCents: number,
): Promise<boolean> {
  if (!accountId || !bucketId || deltaCents === 0) return false;
  const account = await Account.findOne({ _id: accountId, userId });
  if (!account) return false;
  const bucket = account.buckets.id(bucketId);
  if (!bucket) return false;
  bucket.balanceCents += deltaCents;
  await account.save();
  return true;
}

/** Comprueba que el bucket existe en una cuenta del usuario. */
export async function bucketExists(
  userId: string,
  accountId: Types.ObjectId,
  bucketId: Types.ObjectId,
): Promise<boolean> {
  const account = await Account.findOne({ _id: accountId, userId });
  return Boolean(account?.buckets.id(bucketId));
}

/**
 * Mueve `amountCents` de un bucket a otro (transferencia). Es **NEUTRO** por
 * construcción: resta en origen y suma en destino, así que el patrimonio total
 * (Σ saldos) no cambia. Si la segunda pata no se puede aplicar, **revierte la
 * primera** para no crear ni destruir dinero. Devuelve `true` solo si el
 * movimiento se aplicó entero.
 *
 * best-effort (Mongo mononodo sin transacción multi-doc): la ruta valida antes
 * que ambos buckets existen (`bucketExists`), así que el camino de rollback es
 * defensa en profundidad, no el caso normal.
 */
export async function moveFunds(
  userId: string,
  fromAccountId: Types.ObjectId | null | undefined,
  fromBucketId: Types.ObjectId | null | undefined,
  toAccountId: Types.ObjectId | null | undefined,
  toBucketId: Types.ObjectId | null | undefined,
  amountCents: number,
): Promise<boolean> {
  if (amountCents <= 0) return false;

  const okFrom = await adjustBucketBalance(userId, fromAccountId, fromBucketId, -amountCents);
  if (!okFrom) return false;

  try {
    const okTo = await adjustBucketBalance(userId, toAccountId, toBucketId, amountCents);
    if (!okTo) {
      // El destino no se pudo tocar: devolvemos el dinero al origen.
      await adjustBucketBalance(userId, fromAccountId, fromBucketId, amountCents);
      return false;
    }
    return true;
  } catch (err) {
    // Falló la segunda escritura: revertimos la primera antes de propagar.
    await adjustBucketBalance(userId, fromAccountId, fromBucketId, amountCents);
    throw err;
  }
}
