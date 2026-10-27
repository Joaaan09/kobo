import { cx } from '../lib/cx';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  /** Valor actual (mismas unidades que `max`, p. ej. céntimos gastados). */
  value: number;
  /** Máximo (p. ej. céntimos asignados). Por defecto 100. */
  max?: number;
  /** Estado de alarma (gastado supera lo asignado / límite): relleno bermellón profundo. */
  over?: boolean;
  className?: string;
  label?: string;
}

/**
 * Barra de progreso. Se renderiza con `<span>` (display:block) en vez de `<div>`
 * para poder vivir dentro de un `<button>` sin invalidar el HTML: el contenido de
 * un botón es phrasing content, y un `<div>` no lo es (ver fila de Categorías).
 */
export function ProgressBar({ value, max = 100, over = false, className, label }: ProgressBarProps) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <span
      className={cx(styles.track, className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span className={cx(styles.fill, over && styles.over)} style={{ width: `${pct}%` }} />
    </span>
  );
}
