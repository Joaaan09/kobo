import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './index.module.css';

/** Tarjeta de ajustes: filas apiladas separadas por hairlines (`<Hairline />`). */
export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.group, className)}>{children}</div>;
}

interface RowProps {
  /** Título de la fila. Si etiqueta un input, pasa también `htmlFor`. */
  title: ReactNode;
  /** Subtítulo tenue opcional. */
  sub?: ReactNode;
  /** Enlaza el título (`<label>`) con el `id` del control a la derecha. */
  htmlFor?: string;
  /** Control a la derecha (segmentado, input, switch…). */
  children?: ReactNode;
}

/** Fila de ajuste: título/subtítulo a la izquierda y un control opcional a la derecha. */
export function Row({ title, sub, htmlFor, children }: RowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        {htmlFor ? (
          <label className={styles.rowTitle} htmlFor={htmlFor}>
            {title}
          </label>
        ) : (
          <span className={styles.rowTitle}>{title}</span>
        )}
        {sub != null ? <span className={styles.rowSub}>{sub}</span> : null}
      </div>
      {children != null ? <div className={styles.rowControl}>{children}</div> : null}
    </div>
  );
}

interface BlockRowProps {
  /** Título del ajuste. */
  title: ReactNode;
  /** Subtítulo tenue opcional. */
  sub?: ReactNode;
  /** Depende del ajuste de la fila anterior: se pega a ella, sin hairline. */
  child?: boolean;
  /** Control, a lo ancho de la tarjeta. */
  children: ReactNode;
}

/**
 * Fila de ajuste con el control **a lo ancho, debajo del texto**.
 *
 * Úsala cuando el control no cabe cómodo a la derecha en móvil (segmentados de
 * tres o más opciones, tiras de chips): en una fila normal el control no encoge
 * y es el título el que se queda sin sitio.
 */
export function BlockRow({ title, sub, child = false, children }: BlockRowProps) {
  return (
    <div className={cx(styles.blockRow, child && styles.blockChild)}>
      <span className={styles.rowTitle}>{title}</span>
      {sub != null ? <span className={styles.rowSub}>{sub}</span> : null}
      <div className={styles.blockControl}>{children}</div>
    </div>
  );
}

/** Separador fino entre filas (sangrado a la izquierda, como el mockup). */
export function Hairline() {
  return <div className={styles.hairline} aria-hidden />;
}
