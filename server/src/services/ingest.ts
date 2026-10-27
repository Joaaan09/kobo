/**
 * Ingesta automática de transacciones (自動): convertir lo que manda el Atajo de
 * iOS (un importe con formato humano y un nombre de comercio sucio) en un gasto
 * de Kobo bien tipado.
 *
 * Dos piezas delicadas y por eso testeadas:
 * 1. **El importe** — llega como texto de moneda localizado ("12,50 €", "1.234,56").
 *    Se parsea a **céntimos enteros** manipulando la cadena, nunca con floats
 *    (§9: el dinero es sagrado; `0.1 + 0.2` no vale para presupuestar).
 * 2. **El comercio** — "MERCADONA S.A. 4021" y "Mercadona 3312" son el mismo sitio.
 *    Se normaliza para que una sola regla los cace a los dos.
 */

/** Ningún gasto real llega aquí: tope de cordura para descartar basura del parser. */
const MAX_CENTS = 1_000_000_000_00; // mil millones de euros

/**
 * Un importe no mide esto ni escrito con todos los adornos del mundo. Sirve de
 * cortafuegos: si en el Atajo se insertó la variable equivocada (la transacción
 * entera en vez de su Importe), se descarta en vez de sacarle dígitos a un texto.
 */
const MAX_AMOUNT_CHARS = 64;

/**
 * Normaliza un nombre de comercio para compararlo: minúsculas, sin acentos y con
 * cualquier signo colapsado a un espacio. "MERCADONA S.A. 4021" → "mercadona s a 4021".
 */
export function normalizeMerchant(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // diacríticos que separa el NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Parsea un importe con formato humano a **céntimos enteros** (con signo).
 * Devuelve `null` si no hay un número reconocible.
 *
 * Acepta lo que sea que mande Wallet: "12,50 €", "€12.50", "1.234,56", "1,234.56",
 * "(12,50)" (contable = negativo), o un `number` de JSON.
 *
 * Reglas del separador decimal, sin adivinar la localización:
 * - El **último** `,` o `.` manda.
 * - Si tras él quedan exactamente 3 dígitos es separador de **miles** ("1.234" = 1234 €,
 *   que es como escribe los importes un iPhone en español). Para 1234,00 € con
 *   decimales explícitos, "1.234,00" se lee bien igualmente.
 * - Con más de 2 decimales se redondea al céntimo (half-up), nunca se truncan.
 */
export function parseAmountToCents(input: string | number): number | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    // toFixed(4) evita la notación científica y conserva más precisión de la que
    // tiene cualquier importe; el redondeo al céntimo lo hace el parser de abajo.
    return parseAmountToCents(input.toFixed(4));
  }

  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_AMOUNT_CHARS) return null;

  // Contable: (12,50) es -12,50.
  const parenthesized = /^\(.*\)$/.test(trimmed);
  // Fuera símbolos de moneda, códigos ISO, espacios finos y demás adorno.
  const cleaned = trimmed.replace(/[^0-9.,+-]/g, '');
  const negative = parenthesized || cleaned.includes('-');
  const digitsAndSeps = cleaned.replace(/[+-]/g, '');
  if (!/[0-9]/.test(digitsAndSeps)) return null;

  const lastSep = Math.max(digitsAndSeps.lastIndexOf(','), digitsAndSeps.lastIndexOf('.'));
  let intRaw: string;
  let fracRaw: string;
  if (lastSep === -1) {
    intRaw = digitsAndSeps;
    fracRaw = '';
  } else {
    const tail = digitsAndSeps.slice(lastSep + 1);
    if (!/^[0-9]*$/.test(tail)) return null;
    const headIsZero = /^0*$/.test(digitsAndSeps.slice(0, lastSep).replace(/[^0-9]/g, ''));
    if (tail.length === 3 && !headIsZero) {
      // Separador de miles: el importe no tiene decimales. Con la parte entera a
      // cero ("0,005") no puede serlo —nadie escribe miles ahí—, así que decimales.
      intRaw = digitsAndSeps;
      fracRaw = '';
    } else {
      intRaw = digitsAndSeps.slice(0, lastSep);
      fracRaw = tail;
    }
  }

  const intDigits = intRaw.replace(/[^0-9]/g, '') || '0';
  if (!/^[0-9]*$/.test(fracRaw)) return null;

  // Céntimos = parte entera × 100 + decimales redondeados a 2 (half-up).
  let cents = BigInt(intDigits) * 100n;
  if (fracRaw.length > 0) {
    const twoDigits = fracRaw.slice(0, 2).padEnd(2, '0');
    cents += BigInt(twoDigits);
    if (fracRaw.length > 2 && fracRaw.charCodeAt(2) >= 53 /* '5' */) cents += 1n;
  }

  if (cents > BigInt(MAX_CENTS)) return null;
  const value = Number(cents);
  return negative ? -value : value;
}

/** Regla mínima que necesita el matcher (el modelo real trae más campos). */
export interface MatchableRule {
  match: string;
}

/**
 * Elige la regla que aplica a un comercio ya normalizado. Gana la **más
 * específica** (el `match` más largo), para que "mercadona online" pueda afinar
 * sobre "mercadona" sin tener que borrarla. Empate → la primera de la lista.
 */
export function matchRule<T extends MatchableRule>(rules: T[], merchantNorm: string): T | null {
  if (!merchantNorm) return null;
  let best: T | null = null;
  for (const rule of rules) {
    if (!rule.match) continue;
    if (!merchantNorm.includes(rule.match)) continue;
    if (!best || rule.match.length > best.match.length) best = rule;
  }
  return best;
}
