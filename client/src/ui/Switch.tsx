import { cx } from '../lib/cx';
import styles from './Switch.module.css';

interface SwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Etiqueta accesible (si el switch no tiene texto visible asociado). */
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/** Interruptor on/off (rol `switch`). Alias exportado: `Toggle`. */
export function Switch({ checked, onChange, label, id, disabled = false, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(styles.switch, checked && styles.on, className)}
    >
      <span className={styles.knob} aria-hidden />
    </button>
  );
}

export const Toggle = Switch;
