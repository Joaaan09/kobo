import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';
import styles from './Eyebrow.module.css';

interface EyebrowProps extends HTMLAttributes<HTMLParagraphElement> {
  /** Kanji de sección opcional (工房, 分類…), en Mincho, antes del label. */
  kanji?: string;
  children: ReactNode;
}

/** Antetítulo de sección: kanji opcional + label en mayúsculas con tracking amplio. */
export function Eyebrow({ kanji, children, className, ...rest }: EyebrowProps) {
  return (
    <p className={cx(styles.eyebrow, className)} {...rest}>
      {kanji ? <span className={styles.kanji}>{kanji}</span> : null}
      <span className={styles.label}>{children}</span>
    </p>
  );
}
