import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import styles from './Field.module.css';

interface FieldProps {
  label: string;
  /** Enlaza el `<label>` con el control (usa el mismo `id` en el input). */
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

/** Envoltura de formulario: label + control + pista/errores. */
export function Field({ label, htmlFor, hint, error, children, className }: FieldProps) {
  return (
    <div className={cx(styles.field, className)}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className={styles.hint}>{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput(
  { invalid = false, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(styles.input, invalid && styles.invalid, className)}
      {...rest}
    />
  );
});

/** Input para importes/cantidades: teclado decimal por defecto. */
export const NumberInput = forwardRef<HTMLInputElement, InputProps>(function NumberInput(
  { invalid = false, inputMode = 'decimal', className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      inputMode={inputMode}
      aria-invalid={invalid || undefined}
      className={cx(styles.input, invalid && styles.invalid, className)}
      {...rest}
    />
  );
});
