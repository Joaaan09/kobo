/**
 * Rendimiento del patrimonio (利息 intereses y 評価 revalorización). Aritmética
 * pura en **céntimos enteros**, aislada aquí y cubierta con tests porque el dinero
 * es sagrado: aquí se decide cuánto interés se estima y cuánto retiene Hacienda.
 *
 * Dos reglas de dominio que condicionan todo el módulo:
 *
 * 1. **El tipo es nominal, no TAE compuesta.** Los bancos que remuneran el saldo
 *    (Trade Republic y compañía) calculan sobre el **saldo diario** y abonan a mes
 *    vencido: `saldo × tipo × días/365`. Dividir el tipo entre 12 sería incorrecto —
 *    febrero y agosto no pagan lo mismo.
 * 2. **Estimar no es cobrar.** Nada de lo que hay aquí toca un saldo por su cuenta:
 *    solo prefija el importe que el usuario confirma contra su extracto.
 */

/** Base de días del año usada por la banca para el devengo (act/365). */
export const YEAR_BASIS_DAYS = 365;

const BPS = 10_000;

/**
 * División entera con redondeo **half-up** sobre el valor absoluto (simétrica en
 * torno a cero, para que un signo no cambie la magnitud del redondeo).
 * `divisor` debe ser positivo.
 */
function roundDiv(dividend: number, divisor: number): number {
  const sign = dividend < 0 ? -1 : 1;
  const abs = Math.abs(dividend);
  return sign * Math.floor((abs + Math.floor(divisor / 2)) / divisor);
}

/**
 * Interés **bruto** devengado por un saldo en un número de días:
 * `saldo × rateBps/10000 × días/365`, redondeado al céntimo.
 *
 * Un saldo negativo o cero no devenga nada (la cuenta remunerada no cobra por
 * estar en rojo: eso sería un descubierto, otro producto).
 */
export function accruedInterestCents(balanceCents: number, rateBps: number, days: number): number {
  if (balanceCents <= 0 || rateBps <= 0 || days <= 0) return 0;
  return roundDiv(balanceCents * rateBps * days, BPS * YEAR_BASIS_DAYS);
}

/** Retención practicada sobre un interés bruto (19 % → `withholdingBps` 1900). */
export function withholdingCents(grossCents: number, withholdingBps: number): number {
  if (grossCents <= 0 || withholdingBps <= 0) return 0;
  return roundDiv(grossCents * withholdingBps, BPS);
}

/** Lo que de verdad entra en la cuenta: bruto menos retención. */
export function netInterestCents(grossCents: number, withholdingBps: number): number {
  return grossCents - withholdingCents(grossCents, withholdingBps);
}

/** Días naturales completos entre dos instantes (nunca negativo). */
export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/** Estimación de una liquidación de intereses pendiente. */
export interface InterestEstimate {
  /** Desde cuándo se devenga (última liquidación registrada, o el alta del bucket). */
  since: Date;
  days: number;
  balanceCents: number;
  rateBps: number;
  withholdingBps: number;
  grossCents: number;
  withheldCents: number;
  /** Lo que se propone registrar: el neto abonado. */
  netCents: number;
}

/**
 * Estima la liquidación pendiente de un sub-saldo remunerado. Devuelve `null` si
 * no hay nada que estimar (sin tipo, sin días o sin saldo positivo): la UI no debe
 * proponer un apunte de 0 €.
 */
export function estimateInterest(params: {
  balanceCents: number;
  rateBps: number;
  withholdingBps: number;
  since: Date;
  until: Date;
}): InterestEstimate | null {
  const { balanceCents, rateBps, withholdingBps, since, until } = params;
  const days = daysBetween(since, until);
  const grossCents = accruedInterestCents(balanceCents, rateBps, days);
  if (grossCents <= 0) return null;
  const withheldCents = withholdingCents(grossCents, withholdingBps);
  return {
    since,
    days,
    balanceCents,
    rateBps,
    withholdingBps,
    grossCents,
    withheldCents,
    netCents: grossCents - withheldCents,
  };
}

/**
 * Descompone la variación del patrimonio de un periodo en lo que **aportaste** tú
 * (ahorro: nómina − gastos) y lo que **rindió** el dinero solo.
 *
 * `aportado` se calcula como **residuo** (`Δ − rendimiento`) a propósito: así la
 * identidad `Δ = aportado + rendimiento` se cumple exacta al céntimo por
 * construcción, en vez de sumar flujos por otro lado y descuadrar por un redondeo.
 */
export function splitPatrimonyChange(
  deltaTotalCents: number,
  yieldCents: number,
): { aportadoCents: number; rendimientoCents: number } {
  return { aportadoCents: deltaTotalCents - yieldCents, rendimientoCents: yieldCents };
}
