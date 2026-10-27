import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Spinner } from './Spinner';
import styles from './Button.module.css';

type Variant = 'accent' | 'ghost' | 'quiet';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Ancho completo. */
  block?: boolean;
  /** Muestra spinner y bloquea la acción. */
  loading?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'accent', block = false, loading = false, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(styles.btn, styles[variant], block && styles.block, className)}
      {...rest}
    >
      {loading && <Spinner size={16} inline />}
      {children}
    </button>
  );
});
