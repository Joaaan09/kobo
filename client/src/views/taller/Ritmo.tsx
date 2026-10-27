import { cx } from '../../lib/cx';
import { formatBp } from '../../lib/money';
import { Money } from '../../ui';
import type { DashboardSummary } from '../../lib/types';
import styles from './Ritmo.module.css';

interface RitmoProps {
  data: DashboardSummary;
  /** Abreviatura del mes activo ("ago"), para el pie de la línea de tiempo. */
  monthAbbr: string;
}

/**
 * Módulo "Ritmo del mes". Aproximación: como aún NO hay endpoint de serie diaria,
 * mostramos una barra de progreso (gastado vs total asignado) con un marcador del
 * ritmo ideal (lo que "tocaría" llevar gastado hoy). El marcador y el día actual
 * coinciden porque `ritmoIdealCents ≈ totalAsignado · diaActual/diasMes`.
 * TODO: serie diaria real (barras por día) cuando exista el endpoint.
 */
export function Ritmo({ data, monthAbbr }: RitmoProps) {
  const { ritmo } = data;
  // El ritmo se mide contra el presupuesto LIBRE del mes: la nómina menos lo ya
  // apartado (ahorro a mano + reserva de fondos). Espejo de `gastableCents` del
  // backend, para que `base − gastado = queda por gastar`.
  const base = Math.max(0, data.nominaCents - data.ahorradoTotalCents - data.reservadoTotalCents);

  const usadoBp = base > 0 ? Math.round((ritmo.gastadoCents / base) * 10000) : 0;
  const fillPct = base > 0 ? Math.min(100, (ritmo.gastadoCents / base) * 100) : 0;
  const markerPct =
    base > 0 ? Math.min(100, Math.max(0, (ritmo.ritmoIdealCents / base) * 100)) : 0;
  const overPace = ritmo.gastadoCents > ritmo.ritmoIdealCents;

  return (
    <section className={styles.card} aria-labelledby="ritmo-title">
      <header className={styles.head}>
        <div className={styles.headLeft}>
          <h2 id="ritmo-title" className={styles.title}>
            Ritmo del mes
          </h2>
          <span className={styles.badge}>MÓDULO</span>
        </div>
        <span className={styles.stat}>
          <Money cents={ritmo.gastadoCents} /> · {formatBp(usadoBp)}
        </span>
      </header>

      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={Math.round(fillPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Gasto del mes respecto al ritmo ideal"
      >
        <span className={cx(styles.fill, overPace && styles.fillOver)} style={{ width: `${fillPct}%` }} />
        <span className={styles.marker} style={{ left: `${markerPct}%` }} aria-hidden />
      </div>

      <div className={styles.timeline}>
        <span>1 {monthAbbr}</span>
        <span>
          día {ritmo.diaActual}/{ritmo.diasMes}
        </span>
        <span>{ritmo.diasMes}</span>
      </div>
    </section>
  );
}
