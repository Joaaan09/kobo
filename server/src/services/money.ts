/**
 * Aritmética de dinero. Todo en **céntimos** (enteros); los % en **basis points**
 * (1 % = 100 bp). Nunca floats para importes.
 */

/** Importe asignado (céntimos) a un porcentaje en bp de la nómina. */
export function assignedCents(nominaCents: number, percentBp: number): number {
  return Math.round((nominaCents * percentBp) / 10000);
}
