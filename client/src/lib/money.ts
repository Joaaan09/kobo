/**
 * El dinero es sagrado: se guarda en **céntimos** (enteros) y solo se formatea a € en la vista.
 * Los porcentajes viajan en **basis points** (100 bp = 1 %).
 */

const eurosFmt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pctFmt = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Formatea céntimos a euros: `123456` → `"1.234,56 €"`. */
export function formatEuros(cents: number): string {
  return eurosFmt.format(cents / 100);
}

/** Formatea basis points a porcentaje legible: `520` → `"5,2 %"`. */
export function formatBp(bp: number): string {
  return `${pctFmt.format(bp / 100)} %`;
}

/** 100 % en basis points. */
export const TOTAL_BP = 10_000;

/**
 * Basis points → texto editable en % (`1250` → `"12,5"`). Conserva hasta 2
 * decimales para no perder precisión (1 bp = 0,01 %).
 */
export function bpToPctInput(bp: number): string {
  return (bp / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

/**
 * Texto en % → basis points, admitiendo coma o punto decimal. Acota a
 * `[0, 10000]` (0–100 %). `"12,5"` → 1250 · `"100"` → 10000.
 */
export function pctInputToBp(text: string): number {
  const s = text.trim();
  if (!s) return 0;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number.parseFloat(normalized);
  if (Number.isNaN(n)) return 0;
  return Math.min(TOTAL_BP, Math.max(0, Math.round(n * 100)));
}

/**
 * Importe asignado (céntimos) a partir de basis points y la nómina, con
 * aritmética entera. Espejo exacto de `assignedCents` del backend
 * (`Math.round(nominaCents * bp / 10000)`). El dinero es sagrado.
 */
export function bpToCents(bp: number, nominaCents: number): number {
  return Math.round((nominaCents * bp) / TOTAL_BP);
}

/**
 * Céntimos → basis points respecto a la nómina, con aritmética entera. Sirve
 * para el modo "cantidad": el usuario escribe €, se guarda el % equivalente.
 * Si la nómina es 0 no hay conversión posible (devuelve 0). Acota a `[0, 10000]`.
 */
export function centsToBp(cents: number, nominaCents: number): number {
  if (nominaCents <= 0) return 0;
  const bp = Math.round((cents * TOTAL_BP) / nominaCents);
  return Math.min(TOTAL_BP, Math.max(0, bp));
}

/**
 * Convierte lo que el usuario escribe a céntimos (enteros), con **aritmética
 * entera** (nunca floats: el dinero es sagrado). Acepta coma o punto decimal y
 * separadores de millar al estilo español. Regla para moneda: el ÚLTIMO
 * separador cuenta como decimal solo si le siguen 1–2 dígitos; si le siguen 3
 * (o no hay decimales válidos) se interpreta como separador de millar, porque
 * el euro no tiene 3 decimales. Los demás separadores son siempre de millar.
 *
 * `"12,50"` → 1250 · `"1.234,56"` → 123456 · `"12.5"` → 1250 ·
 * `"1.234"` → 123400 · `"1234"` → 123400 · `"0,00"` → 0.
 */
export function parseInputToCents(input: string): number {
  if (!input) return 0;
  let s = input.trim().replace(/[^\d.,-]/g, '');
  if (!s) return 0;

  const negative = s.startsWith('-');
  s = s.replace(/-/g, '');
  if (!s) return 0;

  const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));

  let eurosPart: string;
  let centsPart: string;
  if (lastSep === -1) {
    eurosPart = s;
    centsPart = '';
  } else {
    const decimals = s.slice(lastSep + 1);
    if (decimals.length === 1 || decimals.length === 2) {
      // Último separador = decimal; el resto, separadores de millar.
      eurosPart = s.slice(0, lastSep).replace(/[.,]/g, '');
      centsPart = decimals;
    } else {
      // 3+ dígitos tras el separador ⇒ es de millar (moneda sin 3 decimales).
      eurosPart = s.replace(/[.,]/g, '');
      centsPart = '';
    }
  }

  const euros = Number.parseInt(eurosPart || '0', 10);
  if (Number.isNaN(euros)) return 0;
  const cents = centsPart ? Number.parseInt((centsPart + '00').slice(0, 2), 10) : 0;

  const total = euros * 100 + cents;
  return negative ? -total : total;
}
