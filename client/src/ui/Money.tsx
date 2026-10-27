import type { HTMLAttributes } from 'react';
import { cx } from '../lib/cx';
import { formatEuros } from '../lib/money';
import styles from './Money.module.css';

interface MoneyProps extends HTMLAttributes<HTMLSpanElement> {
  /** Importe en céntimos (entero). */
  cents: number;
  /** Antepone `+` a los positivos (útil para ingresos). */
  signed?: boolean;
}

/** Muestra un importe en euros. Respeta "Cifras en Mincho" vía el token --font-numbers. */
export function Money({ cents, signed = false, className, ...rest }: MoneyProps) {
  const text = signed && cents > 0 ? `+${formatEuros(cents)}` : formatEuros(cents);
  return (
    <span className={cx(styles.money, className)} {...rest}>
      {text}
    </span>
  );
}
