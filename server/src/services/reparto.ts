/**
 * Reparto de categorías **comodín** (`flexible`): mueve presupuesto entre
 * categorías del mismo mes. La regla de oro es que es **neutro** sobre el total
 * del mes (no crea ni destruye dinero), así que se aísla aquí como función pura
 * y se cubre con tests. La aritmética es en **céntimos** (enteros).
 */

/** Un tramo del reparto ya normalizado a strings (ids). */
export interface RepartoShare {
  toCategoryId: string;
  amountCents: number;
}

/** Reparto de un comodín (su categoría + tramos). */
export interface RepartoDist {
  categoryId: string;
  shares: RepartoShare[];
}

export interface RepartoTotals {
  /** Céntimos recibidos por categoría (destino de algún comodín). */
  received: Map<string, number>;
  /** Céntimos repartidos por categoría (comodín que reparte). */
  distributed: Map<string, number>;
}

/**
 * Pliega los repartos en dos mapas por categoría: lo recibido y lo repartido.
 *
 * Neutralidad garantizada: solo cuenta un tramo si su destino es una categoría
 * **viva** (`liveCatIds`), su origen es un comodín **vivo** (`flexibleIds`) y el
 * destino no es el propio comodín. Como cada tramo válido suma a la vez en
 * `received[destino]` y en `distributed[origen]`, siempre se cumple
 * `Σ received === Σ distributed`: nada de dinero aparece o desaparece aunque se
 * haya borrado un destino o el comodín haya dejado de serlo.
 */
export function foldReparto(
  distributions: RepartoDist[],
  liveCatIds: Set<string>,
  flexibleIds: Set<string>,
): RepartoTotals {
  const received = new Map<string, number>();
  const distributed = new Map<string, number>();
  for (const dist of distributions) {
    const fromId = dist.categoryId;
    if (!flexibleIds.has(fromId)) continue;
    for (const share of dist.shares) {
      const toId = share.toCategoryId;
      if (toId === fromId || !liveCatIds.has(toId)) continue;
      if (share.amountCents <= 0) continue;
      received.set(toId, (received.get(toId) ?? 0) + share.amountCents);
      distributed.set(fromId, (distributed.get(fromId) ?? 0) + share.amountCents);
    }
  }
  return { received, distributed };
}

/**
 * Asignado **efectivo** de una categoría: su base (% de la nómina) más lo
 * recibido de comodines menos lo repartido a otras. Nunca negativo (si un
 * comodín repartió más de su base tras bajar la nómina, se acota a 0).
 */
export function effectiveAssignedCents(
  baseAssignedCents: number,
  receivedCents: number,
  distributedCents: number,
): number {
  return Math.max(0, baseAssignedCents + receivedCents - distributedCents);
}
