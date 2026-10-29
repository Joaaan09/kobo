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
 * día 1 (ver `CycleConfig`). La clave sigue siendo `YYYY-MM` = el mes que vives
 * con esa nómina ("Noviembre" = 25 oct → 24 nov).
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
 * **Nombre del mes = el mes que vives:** el ciclo se llama como el mes natural
 * con más días dentro. Si empieza el día 17 o después, casi todo cae en el mes
 * siguiente, así que se nombra por él: con cobro el 25, lo cobrado el 25 de
 * octubre es **Noviembre** (25 oct → 24 nov). Si empieza del 2 al 16, se nombra
 * por el mes en que empieza (5 oct → 4 nov = Octubre).
 *
 * Construcción: `inicio(clave)` = día `d(clave)` del mes de la clave (o del
 * anterior si `d ≥ 17`) y `fin(clave) = inicio(clave+1)`. Así los ciclos son
 * **contiguos por construcción** (ni huecos ni solapes), y la transición sale
 * sola: con un tramo `{ from: 2026-10, startDay: 25 }`, septiembre va del 1 al 24
 * sep (corto), octubre del 25 sep al 24 oct y noviembre del 25 oct al 24 nov.
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

/** A partir de este día de inicio, el ciclo se nombra por el mes siguiente (tiene más días en él). */
export const NAME_BY_NEXT_MONTH_FROM_DAY = 17;

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

/** Día de calendario en que empieza el ciclo `year-month` (puede ser del mes anterior). */
export function cycleStartFor(
  cfg: CycleConfig,
  year: number,
  month: number,
): { year: number; month: number; day: number } {
  const day = cycleStartDayFor(cfg, year, month);
  const base = day >= NAME_BY_NEXT_MONTH_FROM_DAY ? shiftMonth(year, month, -1) : { year, month };
  return { ...base, day };
}

/** Orden total de un día de calendario (para comparar sin crear fechas). */
const dayOrd = (d: { year: number; month: number; day: number }) =>
  monthIndex(d.year, d.month) * 32 + d.day;

/** Rango [start, end) del ciclo `year-month` en zona Europe/Madrid. */
export function cycleRange(cfg: CycleConfig, year: number, month: number): MonthRange {
  const next = shiftMonth(year, month, 1);
  const a = cycleStartFor(cfg, year, month);
  const b = cycleStartFor(cfg, next.year, next.month);
  const start = zonedMidnightToUtc(a.year, a.month - 1, a.day, TZ);
  const end = zonedMidnightToUtc(b.year, b.month - 1, b.day, TZ);
  return { year, month, start, end };
}

/** Clave del ciclo al que pertenece un día de calendario (Madrid). */
export function cycleOfDay(
  cfg: CycleConfig,
  year: number,
  month: number,
  day: number,
): { year: number; month: number } {
  const t = dayOrd({ year, month, day });
  // Candidatos: el ciclo de este mes, el del siguiente (si empieza en este mes)
  // o el del anterior. Un ciclo empieza como pronto en el mes previo a su nombre.
  const next = shiftMonth(year, month, 1);
  if (dayOrd(cycleStartFor(cfg, next.year, next.month)) <= t) return next;
  if (dayOrd(cycleStartFor(cfg, year, month)) <= t) return { year, month };
  return shiftMonth(year, month, -1);
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

/** `Date.UTC` del día de inicio de un ciclo (aritmética de calendario, sin horas). */
function cycleStartUtc(cfg: CycleConfig, year: number, month: number): number {
  const s = cycleStartFor(cfg, year, month);
  return Date.UTC(s.year, s.month - 1, s.day);
}

/** Nº de días del ciclo (más o menos de un mes en una transición). */
export function cycleLengthDays(cfg: CycleConfig, year: number, month: number): number {
  const next = shiftMonth(year, month, 1);
  // Diferencia en días de calendario (UTC puro: no le afecta el horario de verano).
  return Math.round(
    (cycleStartUtc(cfg, next.year, next.month) - cycleStartUtc(cfg, year, month)) / 86_400_000,
  );
}

/**
 * Día (1-based) del ciclo en que cae `instant`. 0 si el instante es anterior al
 * ciclo; la longitud del ciclo si es posterior (ciclo ya cerrado).
 */
export function cycleDayIndex(cfg: CycleConfig, year: number, month: number, instant: Date): number {
  const length = cycleLengthDays(cfg, year, month);
  const { year: y, month: m, day: d } = madridParts(instant);
  const idx = Math.floor((Date.UTC(y, m - 1, d) - cycleStartUtc(cfg, year, month)) / 86_400_000) + 1;
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
  const s = cycleStartFor(cfg, year, month);
  const day = s.day > 1 ? s.day - NOMINA_EARLY_DAYS : s.day;
  // `Date.UTC` resuelve días ≤ 0 hacia el mes anterior.
  return zonedMidnightToUtc(s.year, s.month - 1, day, TZ);
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
