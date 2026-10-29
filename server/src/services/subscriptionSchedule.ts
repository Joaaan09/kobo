import type { SubscriptionFrequency } from '../models/Subscription.js';

/**
 * Calendario de cargos de las suscripciones (定期), **puro** (sin BD ni red) para
 * poder probarlo. Las fechas son días de Madrid `YYYY-MM-DD` y se calculan con
 * aritmética de calendario (`Date.UTC`), sin horas: un cargo es "el día 15".
 */

export interface Schedule {
  frequency: SubscriptionFrequency;
  dayOfMonth: number;
  monthOfYear?: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Día `dayOfMonth` del mes, acotado a su último día (31 → 28 feb). */
export function occurrenceOn(year: number, month: number, dayOfMonth: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(dayOfMonth, last))}`;
}

/** Día siguiente a `dayKey`. */
export function dayAfter(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** Primer cargo del calendario en `fromKey` o después. */
export function firstOccurrence(s: Schedule, fromKey: string): string {
  const [y, m] = fromKey.split('-').map(Number);
  if (s.frequency === 'yearly') {
    const month = s.monthOfYear ?? 1;
    const candidate = occurrenceOn(y, month, s.dayOfMonth);
    return candidate >= fromKey ? candidate : occurrenceOn(y + 1, month, s.dayOfMonth);
  }
  const candidate = occurrenceOn(y, m, s.dayOfMonth);
  if (candidate >= fromKey) return candidate;
  return m === 12 ? occurrenceOn(y + 1, 1, s.dayOfMonth) : occurrenceOn(y, m + 1, s.dayOfMonth);
}

/** Cargo siguiente a uno dado (el ancla `dayOfMonth` manda, no el día acotado). */
export function nextOccurrence(s: Schedule, afterKey: string): string {
  return firstOccurrence(s, dayAfter(afterKey));
}

/** ¿Caen dos cargos en el mismo periodo (mismo mes, o mismo año si es anual)? */
function samePeriod(s: Schedule, a: string, b: string): boolean {
  return s.frequency === 'yearly' ? a.slice(0, 4) === b.slice(0, 4) : a.slice(0, 7) === b.slice(0, 7);
}

/**
 * Próximo cargo al (re)programar: el primero desde hoy, **saltando el periodo ya
 * cobrado**. Sin esto, mover el día de cobro del 15 al 20 el día 16 volvería a
 * cobrar ese mismo mes (el dinero es sagrado: un periodo, un cargo).
 */
export function scheduleNextCharge(s: Schedule, todayKey: string, lastChargeDate?: string): string {
  const candidate = firstOccurrence(s, todayKey);
  if (lastChargeDate && (candidate <= lastChargeDate || samePeriod(s, candidate, lastChargeDate))) {
    return nextOccurrence(s, candidate);
  }
  return candidate;
}
