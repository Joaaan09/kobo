import type { Account, Bucket, BucketKind } from '../../lib/types';

/**
 * Paleta de colores de cuenta (hex de **datos**, no de tema): identidad visual
 * que el usuario elige, igual que el `color` de categoría del seed. Muted y
 * legibles sobre Washi y Sumi (terracota, oro, matcha, índigo, ciruela, piedra).
 */
export const ACCOUNT_COLORS = [
  '#B4472F',
  '#C98A2B',
  '#3F7A6B',
  '#6E7AA8',
  '#8E5B6E',
  '#7A756C',
] as const;

/** Color por defecto para una cuenta sin `color` (token de acento). */
export const DEFAULT_ACCOUNT_COLOR = 'var(--accent)';

/** Total de una cuenta = Σ de los balances de sus sub-saldos (en céntimos). */
export function accountTotalCents(account: Account): number {
  return account.buckets.reduce((sum, b) => sum + b.balanceCents, 0);
}

/** Patrimonio total = Σ cuentas Σ buckets (en céntimos). */
export function patrimonioTotalCents(accounts: Account[]): number {
  return accounts.reduce((sum, acc) => sum + accountTotalCents(acc), 0);
}

/**
 * Céntimos → cadena editable en español (`123456` → `"1234,56"`), para prellenar
 * inputs de importe. `parseInputToCents` la reinterpreta sin pérdida.
 */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Etiquetas de cada naturaleza de sub-saldo (kanji + nombre). */
export const BUCKET_KINDS: { value: BucketKind; label: string; kanji: string; hint: string }[] = [
  { value: 'cash', label: 'Efectivo', kanji: '現金', hint: 'Corriente: solo se mueve con gastos, ingresos y traspasos.' },
  { value: 'savings', label: 'Remunerado', kanji: '貯蓄', hint: 'Liquida intereses cada cierto tiempo (tú confirmas el abono).' },
  { value: 'investment', label: 'Inversión', kanji: '投資', hint: 'Su valor fluctúa: actualizas cuánto vale y Kobo calcula el rendimiento.' },
];

/**
 * ¿Este sub-saldo puede rendir (intereses o revalorización)? Los `cash` solo se
 * mueven con gastos, ingresos y traspasos.
 *
 * El tipo y la retención se editan en % pero se guardan en **bps enteros**: para
 * convertir se usan `bpToPctInput`/`pctInputToBp` de `lib/money` (mismos que los
 * porcentajes de categoría), no aritmética suelta con floats.
 */
export function bucketRinde(bucket: Bucket): boolean {
  return bucket.kind === 'savings' || bucket.kind === 'investment';
}
