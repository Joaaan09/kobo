import { IconCheck } from '../../ui';
import { cx } from '../../lib/cx';
import { ACCOUNT_COLORS } from './helpers';
import styles from './sheets.module.css';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  /** Etiqueta accesible del grupo (por defecto, "Color de la cuenta"). */
  label?: string;
}

/** Fila de swatches para elegir el color (dato) de una cuenta o categoría. */
export function ColorPicker({ value, onChange, label = 'Color de la cuenta' }: ColorPickerProps) {
  return (
    <div className={styles.swatches} role="radiogroup" aria-label={label}>
      {ACCOUNT_COLORS.map((color) => {
        const selected = value.toLowerCase() === color.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`Color ${color}`}
            className={cx(styles.swatch, selected && styles.swatchOn)}
            style={{ background: color }}
            onClick={() => onChange(color)}
          >
            {selected ? (
              <span className={styles.swatchCheck}>
                <IconCheck size={20} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
