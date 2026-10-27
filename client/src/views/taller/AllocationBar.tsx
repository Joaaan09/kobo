import type { DashboardCategory } from '../../lib/types';
import styles from './AllocationBar.module.css';

interface AllocationBarProps {
  categories: DashboardCategory[];
  /** Céntimos de nómina aún sin repartir (segmento tenue al final). */
  sinAsignarCents: number;
}

/**
 * Barra de asignación segmentada del hero: un segmento por categoría con ancho
 * proporcional a lo asignado. La intensidad de la tinta refleja cuánto se ha
 * gastado; si una categoría se pasa de su asignación, se tiñe de acento. El
 * remanente "sin asignar" cierra la barra con un segmento muy tenue.
 */
export function AllocationBar({ categories, sinAsignarCents }: AllocationBarProps) {
  const segments = categories.filter((c) => c.assignedCents > 0);
  const remainder = Math.max(0, sinAsignarCents);

  return (
    <div className={styles.track} aria-hidden>
      {segments.map((c) => {
        // En un sobre de ahorro (貯) el "uso" es lo traspasado, no el gasto: su
        // gasto es 0 y vive en `savedCents`. Sin esto, un sobre ahorrado al 100 %
        // se pintaba vacío en la barra del panel (no se reflejaba el ahorro).
        const usedCents = c.savings ? c.savedCents : c.spentCents;
        const over = usedCents > c.assignedCents;
        const ratio = c.assignedCents > 0 ? Math.min(1, usedCents / c.assignedCents) : 0;
        // Más gastado/ahorrado ⇒ tinta más plena (eco de los tonos escalonados del mockup).
        const opacity = 0.4 + 0.6 * ratio;
        return (
          <span
            key={c.id}
            className={over ? styles.segOver : styles.seg}
            style={{ flexGrow: c.assignedCents, opacity: over ? 1 : opacity }}
          />
        );
      })}
      {remainder > 0 ? <span className={styles.rest} style={{ flexGrow: remainder }} /> : null}
    </div>
  );
}
