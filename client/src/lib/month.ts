/**
 * Utilidades de mes en formato `YYYY-MM`. El "mes actual" se calcula en zona
 * **Europe/Madrid** (coherente con el backend, que filtra los gastos por esa zona).
 */

/** Mes actual como `YYYY-MM` (Europe/Madrid). */
export function currentMonth(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  return `${year}-${month}`;
}

/** Fecha de hoy como `YYYY-MM-DD` (Europe/Madrid), útil para inputs `type="date"`. */
export function today(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

/** Descompone `YYYY-MM` en números. */
export function splitMonth(month: string): { year: number; month: number } {
  const [y, m] = month.split('-').map(Number);
  return { year: y, month: m };
}

/** Navega `delta` meses (±) manteniendo el formato `YYYY-MM`. */
export function addMonths(month: string, delta: number): string {
  const { year, month: m } = splitMonth(month);
  const d = new Date(Date.UTC(year, m - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}

/** Nombre del mes en español, capitalizado: `"2026-08"` → `"Agosto"`. */
export function monthName(month: string): string {
  const { year, month: m } = splitMonth(month);
  const d = new Date(Date.UTC(year, m - 1, 1));
  const name = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', month: 'long' }).format(d);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Nombre del mes con año: `"2026-08"` → `"Agosto 2026"`. */
export function monthYear(month: string): string {
  return `${monthName(month)} ${splitMonth(month).year}`;
}

/**
 * Fecha `YYYY-MM-DD` en la que se espera la nómina de `month`: su día de ingreso,
 * acotado a los días reales del mes (`payDay` 31 en febrero → día 28/29).
 *
 * En el **mes en curso** nunca se proyecta al futuro: si el día de cobro todavía
 * no ha llegado, se propone hoy — el ingreso se registra el día que el dinero
 * entra, no el día que estaba previsto (el dinero es sagrado: nada de fechas
 * futuras en un movimiento real).
 *
 * `todayKey` es inyectable para poder probar la función; por defecto, hoy (Madrid).
 */
export function nominaDate(month: string, payDay: number, todayKey: string = today()): string {
  const { year, month: m } = splitMonth(month);
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const day = Math.min(Math.max(Math.trunc(payDay) || 1, 1), lastDay);
  const key = `${month}-${String(day).padStart(2, '0')}`;
  return month === todayKey.slice(0, 7) && key > todayKey ? todayKey : key;
}
