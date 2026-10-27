import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { cx } from '../../lib/cx';
import { formatBp, formatEuros } from '../../lib/money';
import type {
  DashboardCategory,
  Distribution,
  Expense,
  FundView,
  Subcategory,
  Transfer,
} from '../../lib/types';
import { useMonth } from '../../shell/MonthContext';
import { useData } from '../../data/RefreshContext';
import { Button, IconChevronDown, Money, ProgressBar } from '../../ui';
import { CategoryBreakdown, type NamedAmount } from './CategoryBreakdown';
import { RepartoSheet } from './RepartoSheet';
// La hoja de fondos vive en Ajustes, pero se abre también desde aquí: es donde el
// usuario descubre que un gasto no mensual se puede suavizar (§17.3).
import { FondosSheet } from '../yo/FondosSheet';
import styles from './Categorias.module.css';

interface CategoriasProps {
  categories: DashboardCategory[];
  funds: FundView[];
  sinAsignarCents: number;
  sinAsignarBp: number;
}

const EMPTY_FUNDS: FundView[] = [];

/** Detalle del mes cargado bajo demanda (al abrir la primera categoría). */
interface Detail {
  /** Mes + versión de datos + intento con el que se cargó; si cambia, está caduco. */
  key: string;
  expenses: Expense[];
  subcategories: Subcategory[];
  distributions: Distribution[];
  /** Traspasos del mes: alimentan el desglose de los sobres de ahorro. */
  transfers: Transfer[];
  error: boolean;
}

const EMPTY_EXPENSES: Expense[] = [];
const EMPTY_SUBS: Subcategory[] = [];
const EMPTY_TRANSFERS: Transfer[] = [];
const EMPTY_SHARES: NamedAmount[] = [];

/**
 * Dinero repartible de un comodín este mes = su asignado **base** (el efectivo ya
 * lleva sumado lo recibido y restado lo repartido). Es el mismo tope que valida el
 * backend en `PUT /distributions`.
 */
function poolCentsOf(c: DashboardCategory): number {
  return Math.max(0, c.assignedCents + c.distributedCents - c.receivedCents);
}

/**
 * Sección "Categorías": cabecera `gastado / asignado` + tarjeta agrupada con una
 * fila por categoría (punto de color · nombre · gastado/asignado · progreso) y pie
 * con el total de categorías y lo que queda sin asignar.
 *
 * Cada fila es un acordeón: al abrirla despliega el **desglose** de esa categoría
 * (sobre, reparto por subcategoría y movimientos del mes). Los gastos del mes se
 * piden **una sola vez** al abrir la primera categoría y se reparten en cliente:
 * un mes cabe de sobra en memoria y evita una petición por categoría.
 */
export function Categorias({ categories, funds, sinAsignarCents, sinAsignarBp }: CategoriasProps) {
  const { month } = useMonth();
  const { dataVersion } = useData();
  const baseId = useId();

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Comodín cuyo reparto se está editando (hoja "Repartir este mes").
  const [repartoFor, setRepartoFor] = useState<DashboardCategory | null>(null);
  const [fondosFor, setFondosFor] = useState<DashboardCategory | null>(null);

  const key = `${month}:${dataVersion}:${attempt}`;
  const fresh = detail && detail.key === key ? detail : null;

  useEffect(() => {
    if (!openId || fresh) return;
    let alive = true;
    void (async () => {
      try {
        const [expenses, subcategories, distributions, transfers] = await Promise.all([
          api.get<Expense[]>(`/expenses?month=${month}`),
          api.get<Subcategory[]>('/subcategories'),
          // El reparto es información de apoyo: si falla, el desglose sigue siendo útil.
          api.get<Distribution[]>(`/distributions?month=${month}`).catch(() => []),
          // Ídem los traspasos (solo los usan los sobres de ahorro).
          api.get<Transfer[]>(`/transfers?month=${month}`).catch(() => []),
        ]);
        if (!alive) return;
        setDetail({
          key,
          expenses: Array.isArray(expenses) ? expenses : [],
          subcategories: Array.isArray(subcategories) ? subcategories : [],
          distributions: Array.isArray(distributions) ? distributions : [],
          transfers: Array.isArray(transfers) ? transfers : [],
          error: false,
        });
      } catch {
        if (alive)
          setDetail({
            key,
            expenses: [],
            subcategories: [],
            distributions: [],
            transfers: [],
            error: true,
          });
      }
    })();
    return () => {
      alive = false;
    };
  }, [openId, fresh, key, month]);

  // Filas montadas, para poder subir a la vista la que se abre.
  const items = useRef(new Map<string, HTMLLIElement>());
  const setItemRef = useCallback(
    (id: string) => (el: HTMLLIElement | null) => {
      if (el) items.current.set(id, el);
      else items.current.delete(id);
    },
    [],
  );

  /*
   * Abrir una categoría del final de la lista desplegaba el panel fuera de la
   * pantalla: parecía que el toque no hacía nada. Si el desglose no cabe, se sube
   * la fila justo debajo de la cabecera (`scroll-margin-top` en `.item`). Se
   * reevalúa al llegar el detalle porque el panel crece al soltar el spinner.
   */
  useEffect(() => {
    if (!openId) return;
    const el = items.current.get(openId);
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      if (el.getBoundingClientRect().bottom <= window.innerHeight) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [openId, fresh]);

  // Fondos indexados por categoría (vienen del panel, con saldo/reserva del mes ya calculados).
  const fundsByCategory = useMemo(() => {
    const map = new Map<string, FundView[]>();
    for (const f of funds) {
      const list = map.get(f.categoryId);
      if (list) list.push(f);
      else map.set(f.categoryId, [f]);
    }
    return map;
  }, [funds]);

  /*
   * Comodines con dinero sin repartir este mes: cada uno pide una decisión, así que
   * se avisa sobre la lista con acceso directo a la hoja. Si está todo repartido, el
   * aviso desaparece (un aviso permanente es ruido, no información).
   */
  const pendientes = useMemo(
    () =>
      categories
        .filter((c) => c.flexible)
        .map((c) => ({
          category: c,
          pendingCents: poolCentsOf(c) - c.distributedCents,
        }))
        .filter((x) => x.pendingCents > 0),
    [categories],
  );

  /*
   * Tramos del reparto del mes, resueltos a nombres para pintar los dos extremos:
   * `destinos` (a dónde va el dinero de un comodín) y `recibido` (de qué comodín le
   * vino a un destino). Se descarta lo que el backend tampoco cuenta: destino que ya
   * no existe, origen que dejó de ser comodín y tramos a sí mismo (`reparto.ts`).
   */
  const { destinos, recibido, recibidoBySub } = useMemo(() => {
    const destinos = new Map<string, NamedAmount[]>();
    const recibido = new Map<string, NamedAmount[]>();
    // Reparto afinado a una subcategoría (clave: subcategoryId): el desglose lo baja
    // a esa subcategoría y lo suma a su límite del mes.
    const recibidoBySub = new Map<string, NamedAmount[]>();
    if (!fresh) return { destinos, recibido, recibidoBySub };
    const byId = new Map(categories.map((c) => [c.id, c]));
    const add = (
      map: Map<string, NamedAmount[]>,
      key: string,
      side: DashboardCategory,
      cents: number,
    ) => {
      const list = map.get(key);
      if (!list) {
        map.set(key, [{ id: side.id, name: side.name, cents }]);
        return;
      }
      // Dos tramos al mismo destino (p. ej. con subcategorías distintas) se suman.
      const found = list.find((x) => x.id === side.id);
      if (found) found.cents += cents;
      else list.push({ id: side.id, name: side.name, cents });
    };
    for (const d of fresh.distributions) {
      const origen = byId.get(d.categoryId);
      if (!origen?.flexible) continue;
      for (const s of d.shares) {
        const dest = byId.get(s.toCategoryId);
        if (!dest || dest.id === origen.id || s.amountCents <= 0) continue;
        add(destinos, origen.id, dest, s.amountCents);
        add(recibido, dest.id, origen, s.amountCents);
        // Si el tramo apunta a una subcategoría del destino, se registra para bajarlo
        // al desglose de esa subcategoría (nombrando al comodín de origen).
        if (s.toSubcategoryId) add(recibidoBySub, s.toSubcategoryId, origen, s.amountCents);
      }
    }
    for (const list of destinos.values()) list.sort((a, b) => b.cents - a.cents);
    for (const list of recibido.values()) list.sort((a, b) => b.cents - a.cents);
    for (const list of recibidoBySub.values()) list.sort((a, b) => b.cents - a.cents);
    return { destinos, recibido, recibidoBySub };
  }, [fresh, categories]);

  // Gastos y subcategorías indexados por categoría (el backend ya los ordena por fecha desc).
  const byCategory = useMemo(() => {
    const expenses = new Map<string, Expense[]>();
    const subs = new Map<string, Subcategory[]>();
    const transfers = new Map<string, Transfer[]>();
    if (fresh) {
      for (const t of fresh.transfers) {
        if (!t.categoryId) continue;
        const list = transfers.get(t.categoryId);
        if (list) list.push(t);
        else transfers.set(t.categoryId, [t]);
      }
      for (const e of fresh.expenses) {
        const list = expenses.get(e.categoryId);
        if (list) list.push(e);
        else expenses.set(e.categoryId, [e]);
      }
      for (const s of fresh.subcategories) {
        const list = subs.get(s.categoryId);
        if (list) list.push(s);
        else subs.set(s.categoryId, [s]);
      }
    }
    return { expenses, subs, transfers };
  }, [fresh]);

  return (
    <section className={styles.section} aria-labelledby="cats-title">
      <header className={styles.head}>
        <h2 id="cats-title" className={styles.title}>
          Categorías
        </h2>
        <span className={styles.legend}>
          {categories.some((c) => c.savings) ? 'gastado o ahorrado / asignado' : 'gastado / asignado'}
        </span>
      </header>

      {pendientes.map(({ category, pendingCents }) => (
        <div key={category.id} className={styles.aviso}>
          <div className={styles.avisoText}>
            <span className={styles.avisoLabel}>
              Comodín
              <span className={styles.avisoKanji} aria-hidden>
                割
              </span>
            </span>
            <span className={styles.avisoLine}>
              <strong className={styles.avisoName}>{category.name}</strong> ·{' '}
              <Money cents={pendingCents} /> sin repartir este mes
            </span>
          </div>
          <Button
            variant="accent"
            className={styles.avisoBtn}
            onClick={() => setRepartoFor(category)}
          >
            Repartir
          </Button>
        </div>
      ))}

      <div className={styles.card}>
        <ul className={styles.list}>
          {categories.map((c) => {
            // En un sobre de ahorro el progreso no es lo gastado, es lo **movido**
            // a tus cuentas: ahorrar no es gastar (ver decisiones.md).
            const usedCents = c.savings ? c.savedCents : c.spentCents;
            const over = usedCents > c.assignedCents;
            const isOpen = openId === c.id;
            const regionId = `${baseId}-${c.id}`;
            // Estado del reparto (solo comodines): lo que aún no ha salido a otras categorías.
            const pendingCents = c.flexible ? poolCentsOf(c) - c.distributedCents : 0;
            const repartoNote = !c.flexible
              ? null
              : pendingCents > 0
                ? `${formatEuros(pendingCents)} sin repartir`
                : c.distributedCents > 0
                  ? `Repartido ${formatEuros(c.distributedCents)}`
                  : null;
            return (
              <li key={c.id} className={styles.item} ref={setItemRef(c.id)}>
                <button
                  type="button"
                  className={cx(styles.row, isOpen && styles.rowOpen)}
                  aria-expanded={isOpen}
                  aria-controls={regionId}
                  aria-label={`${c.name}${c.flexible ? ' (comodín)' : ''}${
                    c.savings ? ' (sobre de ahorro)' : ''
                  }: ${formatEuros(usedCents)} ${
                    c.savings ? 'ahorrado' : 'gastado'
                  } de ${formatEuros(c.assignedCents)} asignado (${formatBp(
                    c.percentBp,
                  )} de la nómina).${repartoNote ? ` ${repartoNote}.` : ''} Ver desglose`}
                  onClick={() => setOpenId(isOpen ? null : c.id)}
                >
                  <span
                    className={styles.dot}
                    style={{ background: c.color || 'var(--accent)' }}
                    aria-hidden
                  />
                  <span className={styles.main}>
                    <span className={styles.rowHead}>
                      <span className={styles.name}>
                        <span className={styles.nameText}>{c.name}</span>
                        {c.kanji ? <span className={styles.kanji}>{c.kanji}</span> : null}
                        {c.flexible ? (
                          <span className={styles.tagComodin} aria-hidden>
                            割
                          </span>
                        ) : null}
                        {c.savings ? (
                          <span className={styles.tagComodin} aria-hidden>
                            貯
                          </span>
                        ) : null}
                      </span>
                      <span className={cx(styles.amount, over && styles.amountOver)} aria-hidden>
                        <Money cents={usedCents} />
                        <span className={styles.slash}>/</span>
                        <Money cents={c.assignedCents} />
                        {/* % de reparto de la nómina de esta categoría (apoyo, no foco). */}
                        <span className={styles.percent}>{formatBp(c.percentBp)}</span>
                      </span>
                    </span>
                    <ProgressBar
                      value={usedCents}
                      max={c.assignedCents}
                      over={over}
                      label={`${c.name}: ${c.savings ? 'ahorrado' : 'gastado'} sobre asignado`}
                    />
                    {repartoNote ? (
                      <span
                        className={cx(
                          styles.repartoNote,
                          pendingCents > 0 && styles.repartoPending,
                        )}
                        aria-hidden
                      >
                        {repartoNote}
                      </span>
                    ) : null}
                  </span>
                  <IconChevronDown
                    size={18}
                    className={cx(styles.chev, isOpen && styles.chevOpen)}
                  />
                </button>

                {isOpen ? (
                  <div id={regionId} className={styles.region}>
                    <CategoryBreakdown
                      category={c}
                      funds={fundsByCategory.get(c.id) ?? EMPTY_FUNDS}
                      expenses={byCategory.expenses.get(c.id) ?? EMPTY_EXPENSES}
                      transfers={byCategory.transfers.get(c.id) ?? EMPTY_TRANSFERS}
                      subcategories={byCategory.subs.get(c.id) ?? EMPTY_SUBS}
                      loading={!fresh}
                      error={fresh?.error ?? false}
                      onRetry={() => setAttempt((n) => n + 1)}
                      onRepartir={c.flexible ? () => setRepartoFor(c) : undefined}
                      onGestionarFondos={() => setFondosFor(c)}
                      destinos={destinos.get(c.id) ?? EMPTY_SHARES}
                      recibido={recibido.get(c.id) ?? EMPTY_SHARES}
                      recibidoBySub={recibidoBySub}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <footer className={styles.foot}>
          <span className={styles.count}>
            {categories.length} {categories.length === 1 ? 'categoría' : 'categorías'}
          </span>
          <span className={cx(styles.chip, sinAsignarBp > 0 && styles.chipAlert)}>
            <Money cents={sinAsignarCents} /> sin asignar
          </span>
        </footer>
      </div>

      <RepartoSheet
        open={repartoFor !== null}
        comodin={repartoFor}
        categories={categories}
        month={month}
        onClose={() => setRepartoFor(null)}
      />

      <FondosSheet open={fondosFor !== null} category={fondosFor} onClose={() => setFondosFor(null)} />
    </section>
  );
}
