/**
 * Utilidades de fecha ancladas a la zona **Europe/Madrid**. El presupuesto es
 * mes a mes; los rangos deben respetar la medianoche local de Madrid (no la UTC).
 *
 * Decisión (documentada en decisiones.md): para convertir la medianoche local a
 * su instante UTC calculamos el offset de la zona con `Intl`. Los límites de mes
 * (día 1, 00:00) nunca caen en una transición de horario de verano (último domingo
 * de marzo/octubre a las 02:00/03:00), así que el offset es exacto en la práctica.
 */

export const TZ = 'Europe/Madrid';

export interface MonthRange {
  year: number;
  month: number;
  start: Date; // inclusive
  end: Date; // exclusivo (día 1 del mes siguiente, 00:00 local)
}

/** Offset (ms) entre la hora local de `tz` y UTC en el instante dado. */
function tzOffsetMs(instant: Date, tz: string): number {
  const asLocal = new Date(instant.toLocaleString('en-US', { timeZone: tz }));
  return asLocal.getTime() - instant.getTime();
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
