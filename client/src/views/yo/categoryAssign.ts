/**
 * Helpers de asignación de categorías: el usuario reparte en **%** o en **€**,
 * pero la categoría solo guarda `percentBp` (basis points). Estas utilidades
 * traducen entre la unidad que edita el usuario y los basis points, apoyándose
 * en `money.ts` (aritmética entera: el dinero es sagrado). No redefinen la
 * matemática de money.ts, solo la orquestan según la unidad activa.
 */

import {
  bpToCents,
  bpToPctInput,
  centsToBp,
  parseInputToCents,
  pctInputToBp,
  TOTAL_BP,
} from '../../lib/money';

/** Unidad de edición de la asignación: porcentaje o cantidad en euros. */
export type AssignUnit = 'pct' | 'eur';

/**
 * Céntimos → texto editable en euros con **aritmética entera** (nunca floats):
 * `245000` → `"2.450,00"`. `parseInputToCents` lo reinterpreta sin pérdida.
 */
export function centsToEuroInput(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = Math.trunc(abs / 100).toLocaleString('es-ES');
  const dec = String(abs % 100).padStart(2, '0');
  return `${sign}${euros},${dec}`;
}

/**
 * Texto de asignación (en la unidad dada) → basis points. En `eur` convierte
 * los euros a céntimos y de ahí a bp respecto a la nómina; en `pct` usa el
 * parseo de porcentaje. Ambos caminos acotan a `[0, 10000]`.
 */
export function assignInputToBp(text: string, unit: AssignUnit, nominaCents: number): number {
  if (unit === 'eur') return centsToBp(parseInputToCents(text), nominaCents);
  return pctInputToBp(text);
}

/**
 * Basis points → texto de asignación en la unidad dada, para prellenar inputs.
 * En `eur` recalcula el importe desde la nómina (por eso una categoría creada
 * "por cantidad" seguirá al % si cambia la nómina — ver limitación de v1).
 */
export function bpToAssignInput(bp: number, unit: AssignUnit, nominaCents: number): string {
  if (unit === 'eur') return centsToEuroInput(bpToCents(bp, nominaCents));
  return bpToPctInput(bp);
}

/** Acota unos basis points a `[0, maxBp]` (el tope nunca es negativo). */
export function clampBp(bp: number, maxBp: number): number {
  const ceil = Math.max(0, Math.min(TOTAL_BP, maxBp));
  return Math.min(ceil, Math.max(0, bp));
}
