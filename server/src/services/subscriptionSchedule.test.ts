import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayAfter,
  firstOccurrence,
  nextOccurrence,
  occurrenceOn,
  scheduleNextCharge,
  type Schedule,
} from './subscriptionSchedule.js';

const mensual = (dayOfMonth: number): Schedule => ({ frequency: 'monthly', dayOfMonth });

test('el día 31 se acota al último día del mes sin perder el ancla', () => {
  assert.equal(occurrenceOn(2027, 2, 31), '2027-02-28');
  assert.equal(occurrenceOn(2028, 2, 31), '2028-02-29'); // bisiesto
  const s = mensual(31);
  assert.equal(nextOccurrence(s, '2027-01-31'), '2027-02-28');
  assert.equal(nextOccurrence(s, '2027-02-28'), '2027-03-31'); // vuelve al 31
});

test('primer cargo desde hoy: el de este mes si aún no ha pasado, si no el siguiente', () => {
  assert.equal(firstOccurrence(mensual(15), '2026-10-29'), '2026-11-15');
  assert.equal(firstOccurrence(mensual(29), '2026-10-29'), '2026-10-29'); // hoy mismo
  assert.equal(firstOccurrence(mensual(5), '2026-12-20'), '2027-01-05'); // cruza año
});

test('anual: día y mes fijos', () => {
  const s: Schedule = { frequency: 'yearly', dayOfMonth: 3, monthOfYear: 2 };
  assert.equal(firstOccurrence(s, '2026-10-29'), '2027-02-03');
  assert.equal(firstOccurrence(s, '2026-01-10'), '2026-02-03');
  assert.equal(nextOccurrence(s, '2027-02-03'), '2028-02-03');
});

test('reprogramar no cobra dos veces el mismo periodo', () => {
  // Cobrada el 15 oct; el 16 oct se mueve al día 20 → el siguiente es el 20 nov, no el 20 oct.
  assert.equal(scheduleNextCharge(mensual(20), '2026-10-16', '2026-10-15'), '2026-11-20');
  // Sin cobro previo este mes, el 20 oct es válido.
  assert.equal(scheduleNextCharge(mensual(20), '2026-10-16', '2026-09-15'), '2026-10-20');
  assert.equal(scheduleNextCharge(mensual(20), '2026-10-16'), '2026-10-20');
});

test('tras cobrar, el siguiente salta el periodo cobrado aunque el primer cargo fuese otro día', () => {
  // Cobro el 30, primer cargo fijado a mano el 29 oct → el siguiente es el 30 NOV, no el 30 oct.
  assert.equal(scheduleNextCharge(mensual(30), dayAfter('2026-10-29'), '2026-10-29'), '2026-11-30');
  // Cobro el 15, primer cargo el 3 nov → el siguiente es el 15 DIC.
  assert.equal(scheduleNextCharge(mensual(15), dayAfter('2026-11-03'), '2026-11-03'), '2026-12-15');
  // Caso normal: cobrado el 15 nov → 15 dic.
  assert.equal(scheduleNextCharge(mensual(15), dayAfter('2026-11-15'), '2026-11-15'), '2026-12-15');
  // Día 31: 31 ene → 28 feb → 31 mar.
  assert.equal(scheduleNextCharge(mensual(31), dayAfter('2027-01-31'), '2027-01-31'), '2027-02-28');
  assert.equal(scheduleNextCharge(mensual(31), dayAfter('2027-02-28'), '2027-02-28'), '2027-03-31');
});
