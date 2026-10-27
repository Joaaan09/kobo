import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema, model } from 'mongoose';
import { serializePlugin } from './serialize.js';

/**
 * Este plugin es la ÚNICA barrera que impide que `passwordHash` y `tokenHash`
 * viajen al cliente: las rutas responden con `sendOk(res, doc)` → `res.json()`
 * → `JSON.stringify` → `toJSON()`. Si el `transform` se rompe, el secreto sale
 * por la API sin que falle nada más, así que se prueba aquí (§11).
 *
 * Los documentos se instancian sin conexión a Mongo: `toJSON()` es local.
 */

const withHidden = model(
  'TestHidden',
  new Schema({ label: String, passwordHash: String, tokenHash: String }).plugin(serializePlugin, {
    hide: ['tokenHash'],
  }),
);

const plain = model(
  'TestPlain',
  new Schema({ label: String, passwordHash: String }).plugin(serializePlugin),
);

test('mapea _id → id (string) y elimina __v', () => {
  const doc = new plain({ label: 'x' });
  const json = doc.toJSON() as Record<string, unknown>;

  assert.equal(json.id, String(doc._id));
  assert.equal(json._id, undefined);
  assert.equal(json.__v, undefined);
  assert.equal(typeof json.id, 'string');
});

test('oculta passwordHash siempre, aunque no se pase ninguna opción', () => {
  const json = new plain({ label: 'x', passwordHash: 'secreto' }).toJSON() as Record<
    string,
    unknown
  >;

  assert.equal(json.passwordHash, undefined);
  assert.equal(json.label, 'x');
});

test('oculta además los campos de options.hide (p. ej. tokenHash de ApiToken)', () => {
  const json = new withHidden({
    label: 'Atajo de iOS',
    passwordHash: 'secreto',
    tokenHash: 'sha256-del-token',
  }).toJSON() as Record<string, unknown>;

  assert.equal(json.tokenHash, undefined);
  assert.equal(json.passwordHash, undefined);
  assert.equal(json.label, 'Atajo de iOS');
});

test('el secreto tampoco aparece al serializar de verdad con JSON.stringify', () => {
  // Es el camino real de la API (`res.json`), no solo la llamada directa a toJSON.
  const salida = JSON.stringify({
    ok: true,
    data: [new withHidden({ label: 'a', tokenHash: 'sha256-del-token' })],
  });

  assert.equal(salida.includes('sha256-del-token'), false);
  assert.equal(salida.includes('tokenHash'), false);
});
