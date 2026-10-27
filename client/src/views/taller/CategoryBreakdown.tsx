import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { cx } from '../../lib/cx';
import { formatBp } from '../../lib/money';
import type { DashboardCategory, Expense, FundView, Subcategory, Transfer } from '../../lib/types';
import { Button, Money, ProgressBar, Spinner } from '../../ui';
import styles from './CategoryBreakdown.module.css';

/** Movimientos que se listan dentro del panel; el resto se ve en Gastos. */
const MAX_ROWS = 6;

/** Referencia estable para las subcategorías sin fondos (evita arrays nuevos por render). */
const EMPTY_FUNDS: FundView[] = [];

/** Referencia estable para las subcategorías sin reparto recibido. */
const EMPTY_SHARES: NamedAmount[] = [];

const dayFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: 'numeric',
  month: 'short',
});

/** `2026-08-05T…` → `"5 ago"` (sin punto final, en Madrid). */
function shortDay(iso: string): string {
  return dayFmt.format(new Date(iso)).replace('.', '');
}

/** Un tramo de reparto ya resuelto a categoría + importe (destino u origen). */
export interface NamedAmount {
  /** Id de la categoría (clave estable: dos categorías pueden llamarse igual). */
  id: string;
  name: string;
  cents: number;
}

interface SubTotal {
  id: string;
  name: string;
  cents: number;
  limitCents?: number;
  /** Reparto recibido este mes de comodines afinado a esta subcategoría. */
  received: NamedAmount[];
}

/**
 * Una hucha (積立): saldo acumulado sobre el objetivo. Se pinta igual esté suelta
 * en el bloque de fondos o anclada dentro de su subcategoría.
 */
function FundItem({ fund }: { fund: FundView }) {
  const ready = fund.balanceCents >= fund.targetCents;
  // Un saldo negativo (pago adelantado) no dibuja barra: la hucha está a cero.
  const balForBar = Math.max(0, fund.balanceCents);
  return (
    <li className={styles.fund}>
      <div className={styles.subHead}>
        <span className={styles.subName}>
          {fund.name}
          {fund.kanji ? <span className={styles.fundKanji}>{fund.kanji}</span> : null}
        </span>
        <span className={styles.subAmount}>
          <Money cents={balForBar} />
          <span className={styles.subLimit}>
            <span aria-hidden> / </span>
            <Money cents={fund.targetCents} />
          </span>
        </span>
      </div>
      <ProgressBar
        value={balForBar}
        max={fund.targetCents}
        className={styles.subBar}
        label={`${fund.name}: ahorrado sobre el objetivo`}
      />
      <p className={styles.fundMeta}>
        <span>
          <Money cents={fund.provisionCents} />
          /mes
        </span>
        <span aria-hidden>·</span>
        <span className={cx(ready && styles.fundReady)}>
          {ready
            ? 'Listo para pagar'
            : fund.monthsUntilTarget != null
              ? `≈ ${fund.monthsUntilTarget} ${fund.monthsUntilTarget === 1 ? 'mes' : 'meses'} para el objetivo`
              : `cada ${fund.everyMonths} meses`}
        </span>
        {fund.paidThisMonthCents > 0 ? (
          <>
            <span aria-hidden>·</span>
            <span className={styles.fundPaid}>
              pagado <Money cents={fund.paidThisMonthCents} />
            </span>
          </>
        ) : null}
      </p>
    </li>
  );
}

interface CategoryBreakdownProps {
  category: DashboardCategory;
  /** Fondos de previsión (積立) de esta categoría, con saldo/reserva del mes. */
  funds: FundView[];
  /** Gastos del mes de ESTA categoría, ya ordenados de más reciente a más antiguo. */
  expenses: Expense[];
  /** Subcategorías de esta categoría. */
  subcategories: Subcategory[];
  /** Traspasos del mes que consumen este sobre (solo sobres de ahorro). */
  transfers: Transfer[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** Abre la hoja de reparto (solo se pasa para categorías comodín). */
  onRepartir?: () => void;
  /** Abre la hoja de fondos de esta categoría (Ajustes vive lejos: se ofrece aquí). */
  onGestionarFondos?: () => void;
  /** A dónde va el dinero de este comodín este mes (vacío si no es comodín o no reparte). */
  destinos: NamedAmount[];
  /** De qué comodines ha recibido dinero esta categoría este mes. */
  recibido: NamedAmount[];
  /** Reparto recibido afinado a una subcategoría (clave: subcategoryId). */
  recibidoBySub: Map<string, NamedAmount[]>;
}

/**
 * Desglose de una categoría del mes: sobre (asignado · gastado · queda), reparto
 * por subcategoría y los últimos movimientos, con salida a la vista Gastos.
 */
export function CategoryBreakdown({
  category,
  funds,
  expenses,
  transfers,
  subcategories,
  loading,
  error,
  onRetry,
  onRepartir,
  onGestionarFondos,
  destinos,
  recibido,
  recibidoBySub,
}: CategoryBreakdownProps) {
  const navigate = useNavigate();

  // En un sobre de ahorro lo que consume el asignado es lo **movido** a tus
  // cuentas, no un gasto: el "queda" es lo que aún te falta por ahorrar este mes.
  const usedCents = category.savings ? category.savedCents : category.spentCents;
  // "Queda" para gasto libre = asignado − reservado a fondos − gastado normal.
  const restanteCents = category.assignedCents - category.reservedCents - usedCents;
  const excedido = restanteCents < 0;

  // Dinero repartible de un comodín: su asignado base (efectivo + repartido − recibido).
  const poolCents = category.assignedCents + category.distributedCents - category.receivedCents;

  // Los pagos de fondo (con `fundId`) NO son gasto normal: se muestran en el
  // bloque de fondos, no en el reparto por subcategoría ni en los movimientos.
  const normalExpenses = useMemo(() => expenses.filter((e) => !e.fundId), [expenses]);

  /*
   * Los fondos anclados se pintan dentro de su subcategoría (es donde el gasto vive
   * de verdad); los sueltos —o los que apuntan a una subcategoría ya borrada— se
   * quedan en el bloque general.
   */
  const { fundsBySub, looseFunds } = useMemo(() => {
    const known = new Set(subcategories.map((s) => s.id));
    const bySub = new Map<string, FundView[]>();
    const loose: FundView[] = [];
    for (const f of funds) {
      if (f.subcategoryId && known.has(f.subcategoryId)) {
        const list = bySub.get(f.subcategoryId);
        if (list) list.push(f);
        else bySub.set(f.subcategoryId, [f]);
      } else {
        loose.push(f);
      }
    }
    return { fundsBySub: bySub, looseFunds: loose };
  }, [funds, subcategories]);

  // Reparto por subcategoría. Un gasto cuya subcategoría ya no existe cuenta como suelto.
  const subTotals = useMemo<SubTotal[]>(() => {
    const known = new Map(subcategories.map((s) => [s.id, s]));
    const totals = new Map<string, number>();
    for (const e of normalExpenses) {
      const key = e.subcategoryId && known.has(e.subcategoryId) ? e.subcategoryId : '';
      totals.set(key, (totals.get(key) ?? 0) + e.amountCents);
    }
    // Una subcategoría con fondo aparece aunque este mes no haya gastado nada: si no,
    // la hucha del gimnasio se esfumaría justo los meses en que no se paga.
    for (const f of funds) {
      if (f.subcategoryId && known.has(f.subcategoryId) && !totals.has(f.subcategoryId)) {
        totals.set(f.subcategoryId, 0);
      }
    }
    // Ídem una subcategoría que recibió reparto de un comodín este mes: destinaste
    // ese dinero aquí, así que debe verse aunque todavía no hayas gastado nada.
    for (const subId of recibidoBySub.keys()) {
      if (known.has(subId) && !totals.has(subId)) totals.set(subId, 0);
    }
    const rows: SubTotal[] = [];
    for (const [key, cents] of totals) {
      if (key === '') continue;
      const sub = known.get(key)!;
      rows.push({
        id: sub.id,
        name: sub.name,
        cents,
        limitCents: sub.limitCents,
        received: recibidoBySub.get(sub.id) ?? EMPTY_SHARES,
      });
    }
    rows.sort((a, b) => b.cents - a.cents);
    const sueltos = totals.get('') ?? 0;
    if (rows.length > 0 && sueltos > 0) {
      rows.push({ id: '', name: 'Sin subcategoría', cents: sueltos, received: EMPTY_SHARES });
    }
    return rows;
  }, [expenses, subcategories, funds, recibidoBySub]);

  const subById = useMemo(() => new Map(subcategories.map((s) => [s.id, s.name])), [subcategories]);

  if (loading) {
    return (
      <div className={styles.state} aria-busy>
        <Spinner size={20} label="Cargando desglose" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.state} role="alert">
        <p className={styles.stateText}>No pudimos cargar el desglose.</p>
        <Button variant="ghost" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    );
  }

  const visible = normalExpenses.slice(0, MAX_ROWS);
  const hidden = normalExpenses.length - visible.length;
  // Qué se lista en "Movimientos": traspasos en un sobre de ahorro, gastos si no.
  const rows = category.savings ? transfers : normalExpenses;

  return (
    <div className={styles.panel}>
      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>Asignado</dt>
          <dd className={styles.statValue}>
            <Money cents={category.assignedCents} />
            {/* % de la nómina que se lleva la categoría, bajo el importe. */}
            <span className={styles.statPct}>{formatBp(category.percentBp)}</span>
          </dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>{category.savings ? 'Ahorrado' : 'Gastado'}</dt>
          <dd className={styles.statValue}>
            <Money cents={usedCents} />
          </dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>
            {excedido ? 'Excedido' : category.savings ? 'Por ahorrar' : 'Queda'}
          </dt>
          <dd className={cx(styles.statValue, excedido && styles.statOver)}>
            <Money cents={Math.abs(restanteCents)} />
          </dd>
        </div>
      </dl>

      {category.reservedCents > 0 ? (
        <p className={styles.reservedNote}>
          <Money cents={category.reservedCents} /> reservado a fondos este mes
        </p>
      ) : null}

      {/* El asignado subió porque un comodín le pasó dinero: se dice de dónde vino. */}
      {recibido.map((r) => (
        <p key={r.id} className={styles.receivedNote}>
          <span className={styles.receivedKanji} aria-hidden>
            割
          </span>
          +<Money cents={r.cents} /> de {r.name} este mes
        </p>
      ))}

      {category.flexible ? (
        <div className={styles.comodinBox}>
          <div className={styles.comodin}>
            <div className={styles.comodinInfo}>
              <span className={styles.comodinLabel}>
                Comodín
                <span className={styles.comodinKanji} aria-hidden>
                  割
                </span>
              </span>
              <span className={styles.comodinAmount}>
                <Money cents={category.distributedCents} /> repartido de <Money cents={poolCents} />
              </span>
            </div>
            {onRepartir ? (
              <Button variant="accent" className={styles.comodinBtn} onClick={onRepartir}>
                {category.distributedCents > 0 ? 'Cambiar reparto' : 'Repartir este mes'}
              </Button>
            ) : null}
          </div>

          {destinos.length > 0 ? (
            <ul className={styles.destinos} aria-label="A dónde va este mes">
              {destinos.map((d) => (
                <li key={d.id} className={styles.destino}>
                  <span className={styles.destinoName}>{d.name}</span>
                  <Money cents={d.cents} className={styles.destinoAmount} />
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.comodinHint}>
              {poolCents > 0
                ? 'Su dinero no se gasta aquí: repártelo entre tus categorías para este mes.'
                : 'Sin dinero que repartir: dale un % a esta categoría en Ajustes → Categorías.'}
            </p>
          )}
        </div>
      ) : null}

      {/* En un sobre de ahorro el dinero se traspasa, no se gasta: ahí un fondo no
          pinta nada, así que el bloque solo aparece si ya existe alguno. */}
      {looseFunds.length > 0 || (!category.savings && onGestionarFondos) ? (
        <section className={styles.block} aria-label={`Fondos de ${category.name}`}>
          <h3 className={styles.blockTitle}>
            Fondos
            <span className={styles.blockKanji} aria-hidden>
              積立
            </span>
          </h3>
          {looseFunds.length > 0 ? (
            <ul className={styles.funds}>
              {looseFunds.map((f) => (
                <FundItem key={f.id} fund={f} />
              ))}
            </ul>
          ) : funds.length > 0 ? (
            <p className={styles.empty}>Tus fondos están dentro de sus subcategorías, aquí abajo.</p>
          ) : (
            <p className={styles.empty}>
              Para lo que no pagas todos los meses (el pase del gimnasio, el seguro): reserva su
              parte cada mes y págalo llegado el día sin descuadrar el sobre.
            </p>
          )}
          {onGestionarFondos ? (
            <Button variant="ghost" block className={styles.fundsCta} onClick={onGestionarFondos}>
              {funds.length > 0 ? 'Gestionar fondos' : 'Crear un fondo'}
            </Button>
          ) : null}
        </section>
      ) : null}

      {subTotals.length > 0 ? (
        <section className={styles.block} aria-label={`Subcategorías de ${category.name}`}>
          <h3 className={styles.blockTitle}>Por subcategoría</h3>
          <ul className={styles.subs}>
            {subTotals.map((sub) => {
              // 0 (o ausente) = "sin límite": el backend guarda 0 al vaciar el
              // campo, así que aquí NO lo tratamos como un tope real de 0 €.
              const hasBaseLimit = sub.limitCents != null && sub.limitCents > 0;
              // Reparto de un comodín afinado a esta subcategoría: dinero extra que
              // destinaste aquí este mes. Se suma a su límite (el sobre sigue siendo el
              // de la categoría; esto solo afina cuánto puedes gastar en la subcategoría).
              const recibidoCents = sub.received.reduce((n, r) => n + r.cents, 0);
              const limitCents = hasBaseLimit ? sub.limitCents! + recibidoCents : 0;
              const hasLimit = limitCents > 0;
              const subFunds = sub.id ? (fundsBySub.get(sub.id) ?? EMPTY_FUNDS) : EMPTY_FUNDS;
              const overLimit = hasLimit && sub.cents > limitCents;
              // Lo que queda de SU límite efectivo (no del sobre de la categoría).
              const subRestanteCents = hasLimit ? limitCents - sub.cents : 0;
              return (
                <li key={sub.id || 'sueltos'} className={styles.sub}>
                  <div className={styles.subHead}>
                    <span className={styles.subName}>{sub.name}</span>
                    <span className={cx(styles.subAmount, overLimit && styles.subOver)}>
                      <Money cents={sub.cents} />
                      {hasLimit ? (
                        <span className={styles.subLimit}>
                          <span aria-hidden> / </span>
                          <Money cents={limitCents} />
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {hasLimit ? (
                    <>
                      <ProgressBar
                        value={sub.cents}
                        max={limitCents}
                        over={overLimit}
                        className={styles.subBar}
                        label={`${sub.name}: gastado sobre su límite`}
                      />
                      <p className={cx(styles.subMeta, overLimit && styles.subOver)}>
                        {overLimit ? 'Excedido' : 'Queda'}{' '}
                        <Money cents={Math.abs(subRestanteCents)} />
                      </p>
                    </>
                  ) : null}
                  {/* De dónde vino el extra del mes: reparto de un comodín afinado aquí.
                      Explica por qué el límite de esta subcategoría subió este mes. */}
                  {sub.received.map((r) => (
                    <p key={r.id} className={styles.subReceived}>
                      <span className={styles.subReceivedKanji} aria-hidden>
                        割
                      </span>
                      +<Money cents={r.cents} /> de {r.name} este mes
                    </p>
                  ))}
                  {/* La hucha del gasto no mensual de esta subcategoría. Su reserva
                      no cuenta contra el límite: ese dinero ya estaba apartado. */}
                  {subFunds.length > 0 ? (
                    <ul className={styles.subFunds} aria-label={`Fondos de ${sub.name}`}>
                      {subFunds.map((f) => (
                        <FundItem key={f.id} fund={f} />
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className={styles.block} aria-label={`Movimientos de ${category.name}`}>
        <h3 className={styles.blockTitle}>
          Movimientos
          {rows.length > 0 ? <span className={styles.count}>{rows.length}</span> : null}
        </h3>

        {/* En un sobre de ahorro los movimientos son los traspasos que lo
            consumieron: aquí no hay gastos que listar. */}
        {category.savings ? (
          transfers.length === 0 ? (
            <p className={styles.empty}>Aún no has movido nada a este sobre este mes.</p>
          ) : (
            <ul className={styles.rows}>
              {transfers.slice(0, MAX_ROWS).map((t) => (
                <li key={t.id} className={styles.row}>
                  <span className={styles.date}>{shortDay(t.date)}</span>
                  <span className={styles.label}>{t.note?.trim() || 'Movimiento a ahorro'}</span>
                  <Money cents={t.amountCents} className={styles.amount} />
                </li>
              ))}
            </ul>
          )
        ) : expenses.length === 0 ? (
          <p className={styles.empty}>Sin gastos en esta categoría este mes.</p>
        ) : (
          <ul className={styles.rows}>
            {visible.map((e) => {
              const sub = e.subcategoryId ? subById.get(e.subcategoryId) : undefined;
              const label = e.note?.trim() || sub || 'Gasto';
              return (
                <li key={e.id} className={styles.row}>
                  <span className={styles.date}>{shortDay(e.date)}</span>
                  <span className={styles.label}>
                    <span className={styles.labelText}>{label}</span>
                    {sub && e.note?.trim() ? <span className={styles.tag}>{sub}</span> : null}
                  </span>
                  <Money cents={-e.amountCents} className={styles.amount} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!category.savings && expenses.length > 0 ? (
        <Button
          variant="ghost"
          block
          className={styles.more}
          onClick={() => navigate('/gastos', { state: { categoryId: category.id } })}
        >
          {hidden > 0 ? `Ver los ${expenses.length} movimientos en Gastos` : 'Ver en Gastos'}
        </Button>
      ) : null}
    </div>
  );
}
