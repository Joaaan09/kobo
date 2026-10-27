import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';
import styles from './Card.module.css';

interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Etiqueta HTML a renderizar (`div` por defecto; usa `section`/`article` si aporta semántica). */
  as?: ElementType;
  /** Elevación mayor (hojas / tarjetas flotantes). */
  raised?: boolean;
  children?: ReactNode;
}

export function Card({ as: Tag = 'div', raised = false, className, children, ...rest }: CardProps) {
  return (
    <Tag className={cx(styles.card, raised && styles.raised, className)} {...rest}>
      {children}
    </Tag>
  );
}
