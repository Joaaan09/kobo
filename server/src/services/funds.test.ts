import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fundProvisionCents, fundUpdateDoc, monthsAccrued } from './funds.js';

test('provisión mensual = round(target / everyMonths), en céntimos', () => {
  assert.equal(fundProvisionCents(15000, 4), 3750); // 150 € / 4 = 37,50 € exacto
  assert.equal(fundProvisionCents(10000, 3), 3333); // 100 € / 3 = 33,33 € (redondea)
  assert.equal(fundProvisionCents(12000, 12), 1000); // 120 € / 12 = 10 €
  assert.equal(fundProvisionCents(100, 3), 33); // resto rueda al siguiente ciclo
});

test('monthsAccrued cuenta provisiones desde el inicio, inclusive', () => {
  // Fondo que empieza en 2026-08.
  assert.equal(monthsAccrued(2026, 8, 2026, 8), 1); // el propio mes de inicio ya acumula 1
  assert.equal(monthsAccrued(2026, 8, 2026, 11), 4); // ago, sep, oct, nov
  assert.equal(monthsAccrued(2026, 8, 2027, 1), 6); // cruza año
  assert.equal(monthsAccrued(2026, 8, 2026, 7), 0); // mes anterior al inicio → 0
  assert.equal(monthsAccrued(2026, 8, 2025, 12), 0); // futuro respecto al fondo → 0
});

test('escenario gimnasio: 150 € cada 4 meses, saldo rueda y se agota al pagar', () => {
  const target = 15000;
  const every = 4;
  const provision = fundProvisionCents(target, every); // 3750

  // Saldo derivado = provisiones acumuladas − pagos, a fin de cada mes.
  const balanceAt = (year: number, month: number, paidToDate: number) =>
    monthsAccrued(2026, 8, year, month) * provision - paidToDate;

  // Sin pagos aún: acumula mes a mes.
  assert.equal(balanceAt(2026, 8, 0), 3750); // mes 1
  assert.equal(balanceAt(2026, 9, 0), 7500); // mes 2
  assert.equal(balanceAt(2026, 10, 0), 11250); // mes 3
  assert.equal(balanceAt(2026, 11, 0), 15000); // mes 4 → cubre el objetivo

  // En el mes 4 se paga el pase de 150 €: el saldo cae casi a cero y sigue subiendo.
  assert.equal(balanceAt(2026, 11, 15000), 0); // justo tras pagar
  assert.equal(balanceAt(2026, 12, 15000), 3750); // vuelve a acumular el ciclo siguiente
});

test('pago anticipado deja el fondo en negativo (se recupera después)', () => {
  const provision = fundProvisionCents(15000, 4); // 3750
  const balanceAt = (year: number, month: number, paidToDate: number) =>
    monthsAccrued(2026, 8, year, month) * provision - paidToDate;

  // Pagas 150 € en el mes 2, cuando solo has apartado 75 €.
  assert.equal(balanceAt(2026, 9, 15000), 7500 - 15000); // -7500 (te adelantaste)
  assert.ok(balanceAt(2026, 9, 15000) < 0);
  // Dos meses después ya casi lo has recuperado.
  assert.equal(balanceAt(2026, 11, 15000), 15000 - 15000); // 0
});

test('desanclar de la subcategoría BORRA el campo, no lo guarda a null', () => {
  const update = fundUpdateDoc({ name: 'Gimnasio', subcategoryId: null });
  assert.deepEqual(update, { name: 'Gimnasio', $unset: { subcategoryId: 1 } });
  assert.equal('subcategoryId' in update, false);
});

test('anclar pasa el id tal cual; no tocarlo lo deja fuera del update', () => {
  const SUB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
  assert.deepEqual(fundUpdateDoc({ subcategoryId: SUB }), { subcategoryId: SUB });

  const soloImporte = fundUpdateDoc({ targetCents: 15000 });
  assert.deepEqual(soloImporte, { targetCents: 15000 });
  assert.equal('$unset' in soloImporte, false);
});
