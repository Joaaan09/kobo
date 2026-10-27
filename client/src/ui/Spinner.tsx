import { cx } from '../lib/cx';
import styles from './Spinner.module.css';

interface SpinnerProps {
  size?: number;
  label?: string;
  /** En línea (junto a texto de un botón) en vez de bloque centrado. */
  inline?: boolean;
  className?: string;
}

export function Spinner({ size = 22, label, inline = false, className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cx(inline ? styles.inline : styles.block, className)}
    >
      <span className={styles.ring} style={{ width: size, height: size }} aria-hidden />
      {label ? <span className={styles.label}>{label}</span> : <span className="visually-hidden">Cargando</span>}
    </span>
  );
}
