import type { Schema } from 'mongoose';

/** Campos que no salen nunca al cliente, sea cual sea el modelo. */
const ALWAYS_HIDDEN = ['passwordHash'];

/**
 * Plugin de serialización para esquemas de nivel superior. En `toJSON`:
 * - mapea `_id` → `id` (string), como consume el frontend;
 * - elimina `__v` (versionKey);
 * - elimina `passwordHash` y los campos de `options.hide` (defensa en
 *   profundidad: los secretos no viajan al cliente ni por accidente).
 *
 * NO aplicar a subesquemas cuyos `_id` deba consumir el cliente (p. ej. los
 * buckets de Account se siguen serializando con `_id`).
 */
export function serializePlugin(schema: Schema, options?: { hide?: string[] }): void {
  const hidden = [...ALWAYS_HIDDEN, ...(options?.hide ?? [])];
  schema.set('toJSON', {
    versionKey: false,
    transform(_doc, ret) {
      const obj = ret as Record<string, unknown>;
      if (obj._id != null) {
        obj.id = String(obj._id);
        delete obj._id;
      }
      for (const field of hidden) delete obj[field];
      return obj;
    },
  });
}
