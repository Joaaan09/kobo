import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatBp, formatEuros } from '../../lib/money';
import { monthYear, shortDay } from '../../lib/month';
import type { MonthSummary } from '../../lib/types';
import { useMonth } from '../../shell/MonthContext';
import { useData } from '../../data/RefreshContext';
import { Card, Eyebrow, IconChevronRight, Money, ProgressBar, Spinner } from '../../ui';
import styles from './index.module.css';

/** Componente `YYYY-MM` a partir del resumen (mes en 1..12). */
function monthKey(m: MonthSummary): string {
  return `${m.year}-${String(m.month).padStart(2, '0')}`;
}

/**
 * Tramo del ciclo ("1 sep – 24 oct") si el mes no es el natural; vacío si lo es
 * (un mes natural empieza el día 1 y acaba en su mismo mes).
 */
function cycleRange(m: MonthSummary): string {
  const calendar = m.firstDay.endsWith('-01') && m.lastDay.slice(0, 7) === m.firstDay.slice(0, 7);
  if (calendar) return '';
  // Un mes de transición (al cambiar el inicio) dura más o menos que un mes: se
  // dice, porque su "% usado" compara ese tramo con UNA nómina.
  const days =
    Math.round(
      (Date.parse(`${m.lastDay}T00:00:00Z`) - Date.parse(`${m.firstDay}T00:00:00Z`)) / 86_400_000,
    ) + 1;
  const odd = days > 31 || days < 28 ? ` · ${days} días` : '';
  return `${shortDay(m.firstDay)} – ${shortDay(m.lastDay)}${odd}`;
}

/** Vista Meses (月々) — histórico por mes con comparativa contra el mes anterior. */
export function MesesView() {
  const navigate = useNavigate();
  const { setMonth } = useMonth();
  const { dataVersion } = useData();

  const [months, setMonths] = useState<MonthSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      const data = await api.get<MonthSummary[]>('/months').catch(() => [] as MonthSummary[]);
      if (!alive) return;
      setMonths(Array.isArray(data) ? data : []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  // La lista llega en orden desc: el "mes anterior" cronológico es el siguiente índice.
  const cards = useMemo(
    () =>
      months.map((m, i) => ({
        summary: m,
        prev: months[i + 1] ?? null,
      })),
    [months],
  );

  function openMonth(m: MonthSummary) {
    setMonth(monthKey(m));
    navigate('/');
  }

  return (
    <section className={styles.view} aria-labelledby="meses-title">
      <header className={styles.head}>
        <Eyebrow kanji="月々">Meses</Eyebrow>
        <h1 id="meses-title" className={styles.title}>
          Histórico
        </h1>
      </header>

      {loading ? (
        <Spinner label="Cargando meses" />
      ) : months.length === 0 ? (
        <Card className={styles.emptyCard}>
          <p className={styles.emptyText}>Aún no hay meses con actividad.</p>
        </Card>
      ) : (
        <div className={styles.list}>
          {cards.map(({ summary, prev }) => {
            const over = summary.gastadoCents > summary.nominaCents && summary.nominaCents > 0;
            const delta = prev ? summary.gastadoCents - prev.gastadoCents : null;
            return (
              <Card
                as="button"
                key={monthKey(summary)}
                className={styles.month}
                onClick={() => openMonth(summary)}
                aria-label={`Abrir ${monthYear(monthKey(summary))} en el Taller`}
              >
                <div className={styles.monthHead}>
                  <span className={styles.monthTitle}>
                    <span className={styles.monthName}>{monthYear(monthKey(summary))}</span>
                    {cycleRange(summary) ? (
                      <span className={styles.monthRange}>{cycleRange(summary)}</span>
                    ) : null}
                  </span>
                  <IconChevronRight size={18} className={styles.chev} />
                </div>

                <div className={styles.amounts}>
                  <Money cents={summary.gastadoCents} className={styles.gastado} />
                  <span className={styles.sub}>
                    de <Money cents={summary.nominaCents} className={styles.presupuesto} /> presupuesto
                  </span>
                </div>

                <ProgressBar
                  value={summary.gastadoCents}
                  max={summary.nominaCents}
                  over={over}
                  label={`${formatEuros(summary.gastadoCents)} de ${formatEuros(summary.nominaCents)}`}
                  className={styles.bar}
                />

                <div className={styles.meta}>
                  <span className={styles.used}>{formatBp(summary.usadoBp)} usado</span>
                  <span className={styles.metaRight}>
                    Ingresos <Money cents={summary.ingresosCents} signed className={styles.ingresos} />
                  </span>
                </div>

                {/* Comparativa de GASTO junto al gasto; la de patrimonio va en su bloque. */}
                {delta !== null && delta !== 0 ? (
                  <p className={delta > 0 ? styles.deltaUp : styles.deltaDown}>
                    <span aria-hidden>{delta > 0 ? '↑' : '↓'}</span>{' '}
                    Gastaste {formatEuros(Math.abs(delta))} {delta > 0 ? 'más' : 'menos'} que el mes anterior
                  </p>
                ) : delta === 0 ? (
                  <p className={styles.deltaFlat}>Gastaste lo mismo que el mes anterior</p>
                ) : null}
                {/* Patrimonio: cuánto tenías al cerrar el mes, cuánto más (o menos)
                    que al cerrar el anterior y **por qué** — lo que de verdad dice
                    si tu dinero trabaja o solo se acumula. Por construcción, la
                    variación es exactamente cierre − cierre del mes anterior. */}
                <div className={styles.patrimonio}>
                  <div className={styles.patRow}>
                    <span className={styles.patLabel}>
                      {summary.current ? 'Patrimonio hoy' : 'Patrimonio al cierre'}
                    </span>
                    <Money cents={summary.patrimonioCierreCents} className={styles.patTotal} />
                  </div>
                  {summary.patrimonioDeltaCents !== 0 ? (
                    <>
                      <p
                        className={
                          summary.patrimonioDeltaCents > 0 ? styles.patChangeUp : styles.patChange
                        }
                      >
                        <span aria-hidden>{summary.patrimonioDeltaCents > 0 ? '↑' : '↓'}</span>{' '}
                        <Money cents={summary.patrimonioDeltaCents} signed className={styles.patDelta} />{' '}
                        respecto al mes anterior
                      </p>
                      <span className={styles.patSplit}>
                        <span className={styles.patPart}>
                          aportado <Money cents={summary.aportadoCents} signed />
                        </span>
                        <span className={styles.patPart}>
                          rendimiento <Money cents={summary.rendimientoCents} signed />
                        </span>
                      </span>
                    </>
                  ) : (
                    <p className={styles.patChange}>Igual que al cerrar el mes anterior</p>
                  )}
                </div>

              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
