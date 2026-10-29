/**
 * Utilidades de mes en formato `YYYY-MM`. El "mes actual" se calcula en zona
 * **Europe/Madrid** (coherente con el backend, que filtra los gastos por esa zona).
 *
 * **Ciclo de nómina:** el mes de Kobo puede empezar el día de cobro (p. ej. el 25)
 * en vez del día 1. La clave `YYYY-MM` es **el mes que vives** con esa nómina: el
 * mes natural con más días dentro del ciclo ("Noviembre" = 25 oct → 24 nov; con
 * inicio el 5, "Octubre" = 5 oct → 4 nov). Espejo exacto de `server/src/lib/time.ts`:
 * desde el tramo `from`, cada ciclo empieza el día `startDay` (del mes anterior si
 * es ≥ 17); antes, mes natural; y cada ciclo acaba el día antes de que empiece el
 * siguiente (contiguos siempre).
 */

import type { CycleChange } from './types';

const CYCLE_CACHE_KEY = 'kobo.cycle';

/** Lee los tramos cacheados para que el primer render ya caiga en el mes correcto. */
function readCachedCycle(): CycleChange[] {
  try {
    const raw = localStorage.getItem(CYCLE_CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CycleChange[]) : [];
  } catch {
    return [];
  }
}

let cycleChanges: CycleChange[] = readCachedCycle();
const cycleListeners = new Set<() => void>();

/** Fija el historial de inicio de mes (viene de `/income-config`) y avisa a quien escuche. */
export function setCycleChanges(changes: CycleChange[] | undefined): void {
  const next = [...(changes ?? [])].sort((a, b) => a.from.localeCompare(b.from));
  if (JSON.stringify(next) === JSON.stringify(cycleChanges)) return;
  cycleChanges = next;
  try {
    localStorage.setItem(CYCLE_CACHE_KEY, JSON.stringify(next));
  } catch {
    /* sin almacenamiento: se recalcula al cargar la config */
  }
  cycleListeners.forEach((fn) => fn());
}

/** Olvida el ciclo cacheado (al cerrar sesión: el siguiente usuario puede ser otro). */
export function clearCycleCache(): void {
  try {
    localStorage.removeItem(CYCLE_CACHE_KEY);
  } catch {
    /* sin almacenamiento: nada que borrar */
  }
  cycleChanges = [];
}

/** Suscripción a cambios del ciclo. Devuelve la función para darse de baja. */
export function subscribeCycle(fn: () => void): () => void {
  cycleListeners.add(fn);
  return () => cycleListeners.delete(fn);
}

/** Día (1..28) en que empieza el ciclo `month` (1 = mes natural). */
export function cycleStartDay(month: string): number {
  let day = 1;
  for (const change of cycleChanges) {
    if (change.from > month) break;
    day = change.startDay;
  }
  return Math.min(Math.max(Math.trunc(day) || 1, 1), 28);
}

/** ¿Este mes sigue siendo el mes natural (empieza el día 1 y acaba a fin de mes)? */
export function isCalendarCycle(month: string): boolean {
  return cycleStartDay(month) === 1 && cycleStartDay(addMonths(month, 1)) === 1;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Desplaza un día `YYYY-MM-DD` `n` días (±). */
function shiftDayKey(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** A partir de este día de inicio, el ciclo se nombra por el mes siguiente (tiene más días en él). */
export const NAME_BY_NEXT_MONTH_FROM_DAY = 17;

/** Primer día (`YYYY-MM-DD`) del ciclo `month`: puede caer en el mes anterior. */
function cycleStart(month: string): string {
  const day = cycleStartDay(month);
  const base = day >= NAME_BY_NEXT_MONTH_FROM_DAY ? addMonths(month, -1) : month;
  return `${base}-${pad2(day)}`;
}

/** Primer y último día (`YYYY-MM-DD`, ambos inclusive) del ciclo `month`. */
export function cycleBounds(month: string): { firstDay: string; lastDay: string } {
  return {
    firstDay: cycleStart(month),
    lastDay: shiftDayKey(cycleStart(addMonths(month, 1)), -1),
  };
}

/** Clave del ciclo al que pertenece un día `YYYY-MM-DD`. */
export function cycleOfDay(dayKey: string): string {
  // Candidatos: el ciclo de este mes, el del siguiente (si empieza en este mes)
  // o el del anterior. Las claves `YYYY-MM-DD` se comparan bien como texto.
  const month = dayKey.slice(0, 7);
  const next = addMonths(month, 1);
  if (cycleStart(next) <= dayKey) return next;
  if (cycleStart(month) <= dayKey) return month;
  return addMonths(month, -1);
}

/** Mes actual (el ciclo en curso) como `YYYY-MM` (Europe/Madrid). */
export function currentMonth(): string {
  return cycleOfDay(today());
}

/** "25 oct – 24 nov" (vacío si el ciclo es el mes natural: no hace falta decirlo). */
export function cycleRangeLabel(month: string): string {
  if (isCalendarCycle(month)) return '';
  const { firstDay, lastDay } = cycleBounds(month);
  return `${shortDay(firstDay)} – ${shortDay(lastDay)}`;
}

/** "25 oct" a partir de `YYYY-MM-DD`. */
export function shortDay(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const label = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', month: 'short' })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace('.', '');
  return `${d} ${label}`;
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
 * Fecha `YYYY-MM-DD` en la que se espera la nómina del ciclo `month`: su día de
 * ingreso **dentro del ciclo** (con inicio el 25 y cobro el 25, el día 1 del
 * ciclo), acotado a los días reales del mes (`payDay` 31 en febrero → 28/29).
 * `null` si el ciclo no contiene ningún día de cobro (mes de transición corto).
 *
 * En el **mes en curso** nunca se proyecta al futuro: si el día de cobro todavía
 * no ha llegado, se propone hoy — el ingreso se registra el día que el dinero
 * entra, no el día que estaba previsto (el dinero es sagrado: nada de fechas
 * futuras en un movimiento real).
 *
 * `todayKey` es inyectable para poder probar la función; por defecto, hoy (Madrid).
 */
export function nominaDate(month: string, payDay: number, todayKey: string = today()): string | null {
  const onMonth = (key: string) => {
    const { year, month: m } = splitMonth(key);
    const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
    const day = Math.min(Math.max(Math.trunc(payDay) || 1, 1), lastDay);
    return `${key}-${pad2(day)}`;
  };
  const { firstDay, lastDay } = cycleBounds(month);
  // El día de cobro en el mes en que empieza el ciclo; si cae antes del inicio, el
  // del mes siguiente (un ciclo de 25 a 24 con cobro el día 3 → el 3 del siguiente).
  const startMonth = firstDay.slice(0, 7);
  let key = onMonth(startMonth);
  if (key < firstDay) key = onMonth(addMonths(startMonth, 1));
  // Un mes de transición corto puede no contener ningún día de cobro: no hay
  // nómina prevista (la de ese dinero vive en el mes vecino).
  if (key > lastDay) return null;
  return month === cycleOfDay(todayKey) && key > todayKey ? todayKey : key;
}

/** Clave de día `YYYY-MM-DD` (Madrid) de un instante ISO. */
export function dayKeyOf(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}


/**
 * Margen de **nómina adelantada** (espejo de `NOMINA_EARLY_DAYS` del servidor):
 * si el día de cobro cae en fin de semana o festivo, una nómina fechada hasta 5
 * días antes del inicio del ciclo es la de ese ciclo. Solo si el mes empieza el
 * día de cobro.
 */
const NOMINA_EARLY_DAYS = 5;

function nominaWindowFirstDay(month: string): string {
  const first = cycleBounds(month).firstDay;
  return cycleStartDay(month) > 1 ? shiftDayKey(first, -NOMINA_EARLY_DAYS) : first;
}

/** Días (inclusive) en los que una nómina cuenta como la del ciclo `month`. */
export function nominaWindow(month: string): { firstDay: string; lastDay: string } {
  return {
    firstDay: nominaWindowFirstDay(month),
    lastDay: shiftDayKey(nominaWindowFirstDay(addMonths(month, 1)), -1),
  };
}

/** Ciclo al que pertenece una nómina fechada el día `dayKey` (con el margen). */
export function nominaCycleOfDay(dayKey: string): string {
  const month = cycleOfDay(dayKey);
  const next = addMonths(month, 1);
  return dayKey >= nominaWindowFirstDay(next) ? next : month;
}
