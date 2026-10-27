import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accruedInterestCents,
  withholdingCents,
  netInterestCents,
  daysBetween,
  estimateInterest,
  splitPatrimonyChange,
} from './rendimiento.js';

test('interés: caso real (5.000 € al 3 % nominal, agosto = 31 días)', () => {
  // 500000 × 300/10000 × 31/365 = 1273,97… → 1274 céntimos (12,74 €).
  assert.equal(accruedInterestCents(500_000, 300, 31), 1274);
});

test('interés: el mes importa (no es el tipo entre 12)', () => {
  const agosto = accruedInterestCents(500_000, 300, 31);
  const febrero = accruedInterestCents(500_000, 300, 28);
  assert.equal(febrero, 1151);
  assert.ok(agosto > febrero, 'un mes más largo debe devengar más');
  // Dividir entre 12 daría 1250 en ambos: el error que evitamos.
  assert.notEqual(agosto, 1250);
});

test('interés: un año completo se acerca al tipo nominal', () => {
  // 10.000 € al 3 % durante 365 días = 300,00 € exactos.
  assert.equal(accruedInterestCents(1_000_000, 300, 365), 30_000);
});

test('interés: saldo no positivo, tipo 0 o 0 días no devengan nada', () => {
  assert.equal(accruedInterestCents(0, 300, 31), 0);
  assert.equal(accruedInterestCents(-500_000, 300, 31), 0);
  assert.equal(accruedInterestCents(500_000, 0, 31), 0);
  assert.equal(accruedInterestCents(500_000, 300, 0), 0);
});

test('retención: 19 % con redondeo half-up al céntimo', () => {
  // 1274 × 0,19 = 242,06 → 242.
  assert.equal(withholdingCents(1274, 1900), 242);
  assert.equal(netInterestCents(1274, 1900), 1032);
  // 50 × 0,19 = 9,5 → half-up → 10.
  assert.equal(withholdingCents(50, 1900), 10);
});

test('retención: sin retención el neto es el bruto', () => {
  assert.equal(withholdingCents(1274, 0), 0);
  assert.equal(netInterestCents(1274, 0), 1274);
});

test('retención: bruto = neto + retenido (no se pierde ni un céntimo)', () => {
  for (const gross of [1, 7, 50, 1274, 99_999, 123_456]) {
    assert.equal(netInterestCents(gross, 1900) + withholdingCents(gross, 1900), gross);
  }
});

test('días: cuenta días completos y nunca es negativo', () => {
  const a = new Date('2026-08-01T00:00:00Z');
  const b = new Date('2026-09-01T00:00:00Z');
  assert.equal(daysBetween(a, b), 31);
  assert.equal(daysBetween(b, a), 0);
  assert.equal(daysBetween(a, a), 0);
});

test('estimación: devuelve el desglose completo del abono', () => {
  const est = estimateInterest({
    balanceCents: 500_000,
    rateBps: 300,
    withholdingBps: 1900,
    since: new Date('2026-07-01T00:00:00Z'),
    until: new Date('2026-08-01T00:00:00Z'),
  });
  assert.ok(est);
  assert.equal(est.days, 31);
  assert.equal(est.grossCents, 1274);
  assert.equal(est.withheldCents, 242);
  assert.equal(est.netCents, 1032);
  assert.equal(est.netCents + est.withheldCents, est.grossCents);
});

test('estimación: null cuando no hay nada que proponer', () => {
  const base = {
    rateBps: 300,
    withholdingBps: 1900,
    since: new Date('2026-08-01T00:00:00Z'),
    until: new Date('2026-08-02T00:00:00Z'),
  };
  // Un día con saldo pequeño no llega ni a un céntimo.
  assert.equal(estimateInterest({ ...base, balanceCents: 100 }), null);
  assert.equal(estimateInterest({ ...base, balanceCents: 0 }), null);
  assert.equal(
    estimateInterest({ ...base, balanceCents: 500_000, until: base.since }),
    null,
    'sin días transcurridos no se estima nada',
  );
});

test('descomposición: Δ = aportado + rendimiento, exacto', () => {
  const { aportadoCents, rendimientoCents } = splitPatrimonyChange(124_000, 9_000);
  assert.equal(aportadoCents, 115_000);
  assert.equal(rendimientoCents, 9_000);
  assert.equal(aportadoCents + rendimientoCents, 124_000);
});

test('descomposición: un mes malo (rendimiento negativo) no rompe la identidad', () => {
  // Aportaste 200 € pero la inversión cayó 50 €: el patrimonio sube solo 150 €.
  const { aportadoCents, rendimientoCents } = splitPatrimonyChange(15_000, -5_000);
  assert.equal(aportadoCents, 20_000);
  assert.equal(rendimientoCents, -5_000);
  assert.equal(aportadoCents + rendimientoCents, 15_000);
});
