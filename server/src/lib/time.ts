/**
 * Utilidades de fecha ancladas a la zona **Europe/Madrid**. El presupuesto es
 * mes a mes; los rangos deben respetar la medianoche local de Madrid (no la UTC).
 *
 * Decisión (documentada en decisiones.md): para convertir la medianoche local a
 * su instante UTC calculamos el offset de la zona con `Intl`. Los límites de mes
 * (día N, 00:00) nunca caen en una transición de horario de verano (último domingo
 * de marzo/octubre a las 02:00/03:00), así que el offset es exacto en la práctica.
 *
 * **Ciclo de nómina:** el "mes" de Kobo puede empezar el día de cobro en vez del
 * día 1 (ver `CycleConfig`). La clave sigue siendo `YYYY-MM` = el mes en que el
 * ciclo **empieza** ("Octubre" = 25 oct → 24 nov).
 */

export const TZ = 'Europe/Madrid';

export interface MonthRange {
  year: number;
  month: number;
  start: Date; // inclusive
  end: Date; // exclusivo (día 1 del mes siguiente, 00:00 local)
}

/**
 * Offset (ms) entre la hora local de `tz` y UTC en el instante dado.
 *
 * Se reconstruye el reloj de pared con `formatToParts` + `Date.UTC`, nunca
 * re-parseando un texto con `new Date(...)`: eso lo interpreta en la zona del
 * **proceso**, y fuera de un contenedor en UTC el offset salía 0 (rangos de mes
 * desplazados una o dos horas).
 */
function tzOffsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return wallAsUtc - (instant.getTime() - instant.getUTCMilliseconds());
}

/** Instante UTC cuyo reloj de pared en `tz` es `year-month0-day 00:00:00`. */
function zonedMidnightToUtc(year: number, month0: number, day: number, tz: string): Date {
  const guess = new Date(Date.UTC(year, month0, day, 0, 0, 0, 0));
  const offset = tzOffsetMs(guess, tz);
  return new Date(guess.getTime() - offset);
}

/** Rango [start, end) del mes en zona Europe/Madrid. `month` es 1..12. */
export function madridMonthRange(year: number, month: number): MonthRange {
  const start = zonedMidnightToUtc(year, month - 1, 1, TZ);
  const end = zonedMidnightToUtc(year, month, 1, TZ);
  return { year, month, start, end };
}

/** Rango [start, end) de un día concreto en zona Europe/Madrid. `month` es 1..12. */
export function madridDayRange(year: number, month: number, day: number): { start: Date; end: Date } {
  const start = zonedMidnightToUtc(year, month - 1, day, TZ);
  const end = zonedMidnightToUtc(year, month - 1, day + 1, TZ);
  return { start, end };
}

/** Hora local (0–23) de un instante en zona Europe/Madrid. */
export function madridHour(instant: Date): number {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false });
  return Number(fmt.format(instant));
}

/** Clave de día `YYYY-MM-DD` en zona Europe/Madrid. */
export function madridDayKey(instant: Date): string {
  const { year, month, day } = madridParts(instant);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Parsea 'YYYY-MM'; devuelve null si no es válido. */
export function parseMonthParam(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** Componentes (año, mes 1..12, día) de un instante en zona Europe/Madrid. */
export function madridParts(instant: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Número de días del mes (`month` 1..12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Índice absoluto de mes (`month` 1..12): `year*12 + (month-1)`. Permite restar
 * dos meses para saber cuántos meses hay entre ellos (lo usan los fondos para
 * derivar cuántas provisiones se han acumulado desde su mes de inicio).
 */
export function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

/**
 * Inicio del mes de Kobo como **historial de tramos**: desde la clave `from`
 * (inclusive) cada ciclo empieza el día `startDay` (1..28). Antes del primer
 * tramo, mes natural (día 1). Un historial —y no un único valor— para que cambiar
 * el día más adelante no reescriba los ciclos ya vividos.
 *
 * Construcción: `inicio(clave) = día d(clave) 00:00` y `fin(clave) = inicio(clave+1)`.
 * Así los ciclos son **contiguos por construcción** (ni huecos ni solapes), y la
 * transición sale sola: con un tramo `{ from: 2026-10, startDay: 25 }`, septiembre
 * va del 1 sep al 24 oct (absorbe el tramo) y octubre arranca el 25 oct.
 */
export interface CycleChange {
  from: { year: number; month: number };
  startDay: number;
}

export interface CycleConfig {
  /** Tramos en orden ascendente de `from`. */
  changes: CycleChange[];
}

/** Mes natural: el comportamiento histórico de Kobo. */
export const CALENDAR_CYCLE: CycleConfig = { changes: [] };

/** Clave anterior/siguiente (`month` 1..12) sin pasar por `Date`. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = monthIndex(year, month) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** Día (1..28) en que empieza el ciclo de la clave dada. */
export function cycleStartDayFor(cfg: CycleConfig, year: number, month: number): number {
  const idx = monthIndex(year, month);
  let day = 1;
  for (const change of cfg.changes) {
    if (monthIndex(change.from.year, change.from.month) > idx) break;
    day = change.startDay;
  }
  return Math.min(Math.max(Math.trunc(day) || 1, 1), 28);
}

/** Rango [start, end) del ciclo `year-month` en zona Europe/Madrid. */
export function cycleRange(cfg: CycleConfig, year: number, month: number): MonthRange {
  const next = shiftMonth(year, month, 1);
  const start = zonedMidnightToUtc(year, month - 1, cycleStartDayFor(cfg, year, month), TZ);
  const end = zonedMidnightToUtc(
    next.year,
    next.month - 1,
    cycleStartDayFor(cfg, next.year, next.month),
    TZ,
  );
  return { year, month, start, end };
}

/** Clave del ciclo al que pertenece un día de calendario (Madrid). */
export function cycleOfDay(
  cfg: CycleConfig,
  year: number,
  month: number,
  day: number,
): { year: number; month: number } {
  return day >= cycleStartDayFor(cfg, year, month) ? { year, month } : shiftMonth(year, month, -1);
}

/** Clave del ciclo al que pertenece un instante. */
export function cycleOf(cfg: CycleConfig, instant: Date): { year: number; month: number } {
  const { year, month, day } = madridParts(instant);
  return cycleOfDay(cfg, year, month, day);
}

/** Clave `YYYY-MM` del ciclo de un día `YYYY-MM-DD` (para plegar agregados por día). */
export function cycleKeyOfDayKey(cfg: CycleConfig, dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const c = cycleOfDay(cfg, y, m, d);
  return `${c.year}-${String(c.month).padStart(2, '0')}`;
}

/** Nº de días del ciclo (28..62 en una transición). */
export function cycleLengthDays(cfg: CycleConfig, year: number, month: number): number {
  const next = shiftMonth(year, month, 1);
  const startDay = cycleStartDayFor(cfg, year, month);
  const endDay = cycleStartDayFor(cfg, next.year, next.month);
  // Diferencia en días de calendario (UTC puro: no le afecta el horario de verano).
  const a = Date.UTC(year, month - 1, startDay);
  const b = Date.UTC(next.year, next.month - 1, endDay);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Día (1-based) del ciclo en que cae `instant`. 0 si el instante es anterior al
 * ciclo; la longitud del ciclo si es posterior (ciclo ya cerrado).
 */
export function cycleDayIndex(cfg: CycleConfig, year: number, month: number, instant: Date): number {
  const length = cycleLengthDays(cfg, year, month);
  const { year: y, month: m, day: d } = madridParts(instant);
  const a = Date.UTC(year, month - 1, cycleStartDayFor(cfg, year, month));
  const t = Date.UTC(y, m - 1, d);
  const idx = Math.floor((t - a) / 86_400_000) + 1;
  if (idx < 1) return 0;
  return Math.min(idx, length);
}

/**
 * Margen (días) para una **nómina adelantada**: si el día de cobro cae en fin de
 * semana o festivo, el banco paga antes (el 25 de diciembre se cobra el 23 o el
 * 24). Una nómina fechada hasta 5 días antes del inicio de un ciclo es la de ESE
 * ciclo, no una segunda del anterior. Solo aplica si el mes empieza el día de
 * cobro (`startDay > 1`); en mes natural no hay "antes del día de cobro".
 */
export const NOMINA_EARLY_DAYS = 5;

/** Inicio de la ventana de nómina del ciclo (su inicio, adelantado si empieza el día de cobro). */
function nominaWindowStart(cfg: CycleConfig, year: number, month: number): Date {
  const startDay = cycleStartDayFor(cfg, year, month);
  const day = startDay > 1 ? startDay - NOMINA_EARLY_DAYS : startDay;
  // `Date.UTC` resuelve días ≤ 0 hacia el mes anterior.
  return zonedMidnightToUtc(year, month - 1, day, TZ);
}

/** Ventana [start, end) en la que una nómina cuenta como la del ciclo `year-month`. */
export function nominaWindow(cfg: CycleConfig, year: number, month: number): { start: Date; end: Date } {
  const next = shiftMonth(year, month, 1);
  return { start: nominaWindowStart(cfg, year, month), end: nominaWindowStart(cfg, next.year, next.month) };
}

/** Ciclo al que pertenece una nómina fechada en `instant` (con el margen de adelanto). */
export function nominaCycleOf(cfg: CycleConfig, instant: Date): { year: number; month: number } {
  const c = cycleOf(cfg, instant);
  const next = shiftMonth(c.year, c.month, 1);
  return instant >= nominaWindowStart(cfg, next.year, next.month) ? next : c;
}
