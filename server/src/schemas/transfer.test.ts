import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transferCreateSchema } from './transfer.js';

// ObjectIds válidos (24 hex) y distintos para las pruebas.
const ACC_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ACC_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const BUCKET_1 = '111111111111111111111111';
const BUCKET_2 = '222222222222222222222222';

const base = {
  amountCents: 5000,
  date: '2026-08-06',
  fromAccountId: ACC_A,
  fromBucketId: BUCKET_1,
  toAccountId: ACC_B,
  toBucketId: BUCKET_2,
};

test('acepta un movimiento entre dos buckets distintos', () => {
  const r = transferCreateSchema.safeParse(base);
  assert.equal(r.success, true);
});

test('acepta traspaso entre buckets de la MISMA cuenta (rebalanceo)', () => {
  const r = transferCreateSchema.safeParse({
    ...base,
    fromAccountId: ACC_A,
    toAccountId: ACC_A,
    fromBucketId: BUCKET_1,
    toBucketId: BUCKET_2,
  });
  assert.equal(r.success, true);
});

test('rechaza origen y destino idénticos (mismo bucket)', () => {
  const r = transferCreateSchema.safeParse({
    ...base,
    toAccountId: ACC_A,
    toBucketId: BUCKET_1,
  });
  assert.equal(r.success, false);
  if (!r.success) {
    assert.ok(r.error.issues.some((i) => i.message === 'same_endpoint'));
  }
});

test('rechaza importe cero o negativo', () => {
  assert.equal(transferCreateSchema.safeParse({ ...base, amountCents: 0 }).success, false);
  assert.equal(transferCreateSchema.safeParse({ ...base, amountCents: -100 }).success, false);
});

test('rechaza importe no entero (el dinero es en céntimos)', () => {
  assert.equal(transferCreateSchema.safeParse({ ...base, amountCents: 50.5 }).success, false);
});

test('rechaza un ObjectId inválido', () => {
  assert.equal(transferCreateSchema.safeParse({ ...base, toBucketId: 'no-es-id' }).success, false);
});

test('exige los cuatro extremos (origen y destino completos)', () => {
  const { toBucketId: _omit, ...withoutToBucket } = base;
  assert.equal(transferCreateSchema.safeParse(withoutToBucket).success, false);
});
