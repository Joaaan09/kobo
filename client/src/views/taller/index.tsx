import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { DashboardSummary } from '../../lib/types';
import { useMonth } from '../../shell/MonthContext';
import { useData } from '../../data/RefreshContext';
import { useAddTransaction } from '../../features/add-transaction/AddTransactionContext';
import { Button, IconPlus, Spinner } from '../../ui';
import { Hero } from './Hero';
import { Ritmo } from './Ritmo';
import { Categorias } from './Categorias';
import styles from './index.module.css';

type FetchState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: DashboardSummary };

/** Vista Taller (工房) — panel del mes: hero, ritmo y categorías. */
export function TallerView() {
  const { month, name } = useMonth();
  const { dataVersion } = useData();
  const { open } = useAddTransaction();

  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    api
      .get<DashboardSummary>(`/dashboard?month=${month}`)
      .then((data) => {
        if (alive) setState({ status: 'ready', data });
      })
      .catch(() => {
        if (alive) setState({ status: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [month, dataVersion, attempt]);

  if (state.status === 'loading') {
    return (
      <section className={styles.view} aria-label={`Taller — ${name}`} aria-busy>
        <div className={styles.state}>
          <Spinner size={28} label="Cargando panel" />
        </div>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className={styles.view} aria-label={`Taller — ${name}`}>
        <div className={styles.state} role="alert">
          <p className={styles.stateText}>No pudimos cargar tu panel del mes.</p>
          <Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      </section>
    );
  }

  const { data } = state;
  const isEmpty = data.nominaCents <= 0 || data.categories.length === 0;

  if (isEmpty) {
    return (
      <section className={styles.view} aria-label={`Taller — ${name}`}>
        <div className={styles.empty}>
          <span className={styles.emptyKanji} aria-hidden>
            工房
          </span>
          <h1 className={styles.emptyTitle}>Tu taller está vacío</h1>
          <p className={styles.emptyText}>
            Configura tu nómina y reparte por categorías en Ajustes para ver el panel del mes.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.view} aria-label={`Taller — ${name}`}>
      {/* Los dos envoltorios son `display: contents` en móvil (DESIGN.md §19.4):
          el DOM se comporta como si no existieran, así que la vista de móvil no
          cambia ni un píxel. En escritorio se convierten en las dos columnas —
          resumen fijo a la izquierda, categorías a la derecha. El orden del DOM
          es el del móvil y no se toca: es el que manda cuando no hay rejilla. */}
      <div className={styles.side}>
        <Hero data={data} month={month} />
        <Ritmo data={data} />
      </div>

      <div className={styles.stack}>
        <Categorias
          categories={data.categories}
          funds={data.funds}
          sinAsignarCents={data.sinAsignarCents}
          sinAsignarBp={data.sinAsignarBp}
        />
        <Button variant="accent" block className={styles.add} onClick={() => open('gasto')}>
          <IconPlus size={18} /> Añadir gasto
        </Button>
      </div>
    </section>
  );
}
