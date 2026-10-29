import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { shortDay } from '../../lib/month';
import { formatEuros } from '../../lib/money';
import type { Category, Subscription } from '../../lib/types';
import { Button, Eyebrow, Money } from '../../ui';
import { Group, Hairline, Row } from './SettingsGroup';
import { SuscripcionSheet } from './SuscripcionSheet';
import styles from './index.module.css';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Días del mes en un año no bisiesto (para no prometer un "31 feb"). */
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** "cada mes, el 15" · "cada año, el 3 feb" · "cada año, el último día de feb". */
function scheduleLabel(s: Subscription): string {
  if (s.frequency === 'yearly') {
    const m = (s.monthOfYear ?? 1) - 1;
    return s.dayOfMonth > MONTH_DAYS[m]
      ? `cada año, el último día de ${MONTHS[m]}`
      : `cada año, el ${s.dayOfMonth} ${MONTHS[m]}`;
  }
  return s.dayOfMonth > 28 ? `cada mes, el ${s.dayOfMonth} (o el último día)` : `cada mes, el ${s.dayOfMonth}`;
}

/**
 * 定期 · Suscripciones — pagos que se repiten (Netflix, gimnasio, seguro…) y que
 * Kobo apunta solo el día que tocan, en su categoría y descontando de su cuenta.
 *
 * Arriba, lo **comprometido al mes**: lo que ya está gastado antes de empezar
 * (las anuales cuentan su doceava parte, redondeada al céntimo).
 */
export function SuscripcionesCard() {
  const [items, setItems] = useState<Subscription[] | undefined>(undefined);
  const [cats, setCats] = useState<Category[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);

  const load = useCallback(() => {
    void api
      .get<Subscription[]>('/subscriptions')
      .then((list) => setItems(Array.isArray(list) ? list : []))
      .catch(() => setItems([]));
    void api
      .get<Category[]>('/categories')
      .then((list) => setCats(Array.isArray(list) ? list : []))
      .catch(() => setCats([]));
  }, []);

  useEffect(load, [load]);

  const monthlyCents = useMemo(
    () =>
      (items ?? [])
        .filter((s) => s.active)
        .reduce(
          (sum, s) => sum + (s.frequency === 'yearly' ? Math.round(s.amountCents / 12) : s.amountCents),
          0,
        ),
    [items],
  );

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(s: Subscription) {
    setEditing(s);
    setSheetOpen(true);
  }

  return (
    <section className={styles.section} aria-labelledby="yo-suscripciones">
      <Eyebrow kanji="定期" id="yo-suscripciones" className={styles.eyebrowIndent}>
        Suscripciones
      </Eyebrow>

      <Group>
        {items && items.length > 0 ? (
          <>
            <Row title="Comprometido al mes" sub="Lo que se apunta solo, antes de que gastes nada">
              <Money cents={monthlyCents} className={styles.subsTotal} />
            </Row>
            <Hairline />
          </>
        ) : null}

        {(items ?? []).map((s) => {
          const cat = cats.find((c) => c.id === s.categoryId);
          const sub = s.active
            ? `${formatEuros(s.amountCents)} · ${scheduleLabel(s)} · próximo ${shortDay(s.nextChargeDate)}`
            : `${formatEuros(s.amountCents)} · en pausa${s.lastError ? ' (revisa su categoría)' : ''}`;
          return (
            <Fragment key={s.id}>
              <Row
                title={
                  <span className={styles.subsName}>
                    {cat ? (
                      <span className={styles.subsDot} style={{ background: cat.color }} aria-hidden />
                    ) : null}
                    {s.name}
                  </span>
                }
                sub={sub}
              >
                <Button variant="ghost" onClick={() => openEdit(s)} aria-label={`Editar ${s.name}`}>
                  Editar
                </Button>
              </Row>
              <Hairline />
            </Fragment>
          );
        })}

        {items !== undefined && items.length === 0 ? (
          <p className={styles.noteRow}>
            Netflix, el gimnasio, el seguro… Añádelos una vez y Kobo los apunta solos el día que
            toca, en su categoría y descontando de su cuenta.
          </p>
        ) : null}

        <div className={styles.footer}>
          <span className={styles.note}>
            {items === undefined ? 'Cargando…' : 'Se apuntan como gasto real el día del cargo.'}
          </span>
          <Button variant="quiet" onClick={openNew}>
            Añadir
          </Button>
        </div>
      </Group>

      <SuscripcionSheet
        open={sheetOpen}
        subscription={editing}
        onClose={() => setSheetOpen(false)}
        onSaved={load}
      />
    </section>
  );
}
