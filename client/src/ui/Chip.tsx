import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';
import { cx } from '../lib/cx';
import styles from './Chip.module.css';

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  /** Punto de color (categoría) antes del texto. */
  dotColor?: string;
}

export function Chip({ selected = false, dotColor, className, type = 'button', children, ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cx(styles.chip, selected && styles.selected, className)}
      {...rest}
    >
      {dotColor ? <span className={styles.dot} style={{ background: dotColor }} aria-hidden /> : null}
      {children}
    </button>
  );
}

interface ChipGroupProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
}

/** Contenedor de chips (selección). Envuelve y hace wrap. */
export function ChipGroup({ label, className, ...rest }: ChipGroupProps) {
  return <div role="group" aria-label={label} className={cx(styles.group, className)} {...rest} />;
}
