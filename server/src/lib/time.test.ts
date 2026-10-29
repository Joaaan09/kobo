import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CALENDAR_CYCLE,
  cycleDayIndex,
  cycleKeyOfDayKey,
  cycleLengthDays,
  cycleOf,
  cycleRange,
  madridDayKey,
  madridMonthRange,
  nominaCycleOf,
  nominaWindow,
  type CycleConfig,
} from './time.js';
import { toCycleConfig, withCycleChange } from '../services/cycle.js';
import { patrimonyAtCloseByMonth, type PatrimonyChange } from '../services/patrimonio.js';

/** Ciclo del Patrón: cobra el 25 y el mes empieza ese día, solo desde octubre de 2026. */
const desdeOctubre: CycleConfig = { changes: [{ from: { year: 2026, month: 10 }, startDay: 25 }] };

/** Instante a mediodía de Madrid (evita ambigüedades de medianoche en los tests). */
const madrid = (day: string) => new Date(`${day}T12:00:00+02:00`);

test('sin tramos, el ciclo es el mes natural (mismo rango que antes)', () => {
  const a = cycleRange(CALENDAR_CYCLE, 2026, 2);
  const b = madridMonthRange(2026, 2);
  assert.equal(a.start.getTime(), b.start.getTime());
  assert.equal(a.end.getTime(), b.end.getTime());
  assert.equal(cycleLengthDays(CALENDAR_CYCLE, 2026, 2), 28);
});

test('transición desde octubre: septiembre absorbe el tramo 1 sep → 24 oct', () => {
  const sep = cycleRange(desdeOctubre, 2026, 9);
  assert.equal(madridDayKey(sep.start), '2026-09-01');
  assert.equal(madridDayKey(new Date(sep.end.getTime() - 1)), '2026-10-24');
  assert.equal(cycleLengthDays(desdeOctubre, 2026, 9), 54);

  const oct = cycleRange(desdeOctubre, 2026, 10);
  assert.equal(oct.start.getTime(), sep.end.getTime(), 'ciclos contiguos');
  assert.equal(madridDayKey(oct.start), '2026-10-25');
  assert.equal(madridDayKey(new Date(oct.end.getTime() - 1)), '2026-11-24');
  assert.equal(cycleLengthDays(desdeOctubre, 2026, 10), 31);

  // Agosto no se toca: mes natural.
  assert.equal(cycleLengthDays(desdeOctubre, 2026, 8), 31);
});

test('el 25 de octubre (cambio de hora) arranca a medianoche de Madrid', () => {
  // 25 oct 2026 es el último domingo de octubre: a las 03:00 vuelve el horario de
  // invierno. La medianoche aún es CEST (+02:00) → 24 oct 22:00 UTC.
  assert.equal(cycleRange(desdeOctubre, 2026, 10).start.toISOString(), '2026-10-24T22:00:00.000Z');
  // 25 nov ya es CET (+01:00).
  assert.equal(cycleRange(desdeOctubre, 2026, 10).end.toISOString(), '2026-11-24T23:00:00.000Z');
});

test('cycleOf asigna cada día a su ciclo', () => {
  assert.deepEqual(cycleOf(desdeOctubre, madrid('2026-10-29')), { year: 2026, month: 10 });
  assert.deepEqual(cycleOf(desdeOctubre, madrid('2026-10-25')), { year: 2026, month: 10 });
  assert.deepEqual(cycleOf(desdeOctubre, madrid('2026-10-24')), { year: 2026, month: 9 });
  assert.deepEqual(cycleOf(desdeOctubre, madrid('2026-10-10')), { year: 2026, month: 9 });
  assert.deepEqual(cycleOf(desdeOctubre, madrid('2026-11-03')), { year: 2026, month: 10 });
  assert.deepEqual(cycleOf(desdeOctubre, madrid('2027-01-05')), { year: 2026, month: 12 });
  assert.equal(cycleKeyOfDayKey(desdeOctubre, '2026-09-25'), '2026-09');
  assert.equal(cycleKeyOfDayKey(desdeOctubre, '2026-08-27'), '2026-08');
});

test('cycleDayIndex: día del ciclo, 0 antes y completo después', () => {
  assert.equal(cycleDayIndex(desdeOctubre, 2026, 10, madrid('2026-10-25')), 1);
  assert.equal(cycleDayIndex(desdeOctubre, 2026, 10, madrid('2026-10-29')), 5);
  assert.equal(cycleDayIndex(desdeOctubre, 2026, 10, madrid('2026-11-24')), 31);
  assert.equal(cycleDayIndex(desdeOctubre, 2026, 10, madrid('2026-12-01')), 31);
  assert.equal(cycleDayIndex(desdeOctubre, 2026, 11, madrid('2026-10-29')), 0);
});

test('un segundo cambio no reescribe los ciclos ya vividos', () => {
  const stored = withCycleChange([{ from: '2026-10', startDay: 25 }], { from: '2027-03', startDay: 20 });
  assert.deepEqual(stored, [
    { from: '2026-10', startDay: 25 },
    { from: '2027-03', startDay: 20 },
  ]);
  const cfg = toCycleConfig(stored);
  assert.equal(madridDayKey(cycleRange(cfg, 2026, 11).start), '2026-11-25');
  // Febrero cierra el 19 mar (el día antes del nuevo inicio): ciclo corto.
  assert.equal(madridDayKey(new Date(cycleRange(cfg, 2027, 2).end.getTime() - 1)), '2027-03-19');
  // Volver al mismo día vigente no añade un tramo inútil; uno nuevo sustituye lo programado después.
  assert.deepEqual(withCycleChange(stored, { from: '2027-03', startDay: 25 }), [
    { from: '2026-10', startDay: 25 },
  ]);
});

test('patrimonio al cierre: cierre(M) − cierre(M−1) = delta(M), exacto', () => {
  const ch = (delta: number): PatrimonyChange => ({
    aportadoCents: delta,
    rendimientoCents: 0,
    deltaCents: delta,
  });
  const changes = new Map([
    ['2026-08', ch(50_000)],
    ['2026-09', ch(-12_345)],
    ['2026-10', ch(20_000)],
  ]);
  const close = patrimonyAtCloseByMonth(400_000, changes, ['2026-07', '2026-10']);
  assert.equal(close.get('2026-10'), 400_000); // mes en curso = saldo de hoy
  assert.equal(close.get('2026-09'), 380_000);
  assert.equal(close.get('2026-08'), 392_345);
  assert.equal(close.get('2026-07'), 342_345);
  assert.equal(close.get('2026-09')! - close.get('2026-08')!, -12_345);
});

test('nómina adelantada: hasta 5 días antes del inicio es la del ciclo que empieza', () => {
  // 25 dic 2026 es festivo: se cobra el 23 → nómina de diciembre, no segunda de noviembre.
  assert.deepEqual(nominaCycleOf(desdeOctubre, madrid('2026-12-23')), { year: 2026, month: 12 });
  assert.deepEqual(nominaCycleOf(desdeOctubre, madrid('2026-12-20')), { year: 2026, month: 12 });
  assert.deepEqual(nominaCycleOf(desdeOctubre, madrid('2026-12-19')), { year: 2026, month: 11 });
  assert.deepEqual(nominaCycleOf(desdeOctubre, madrid('2026-10-25')), { year: 2026, month: 10 });
  // En mes natural no hay margen: el 25 sep es de septiembre (que empieza el 1).
  assert.deepEqual(nominaCycleOf(desdeOctubre, madrid('2026-09-25')), { year: 2026, month: 9 });
  const w = nominaWindow(desdeOctubre, 2026, 9);
  assert.equal(madridDayKey(w.start), '2026-09-01');
  assert.equal(madridDayKey(new Date(w.end.getTime() - 1)), '2026-10-19');
});
