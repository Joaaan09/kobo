import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { parseInputToCents } from '../../lib/money';
import { currentMonth, monthName, nominaDate, today } from '../../lib/month';
import type {
  Account,
  Category,
  Expense,
  Income,
  IncomeConfig,
  NewIncome,
  Subcategory,
} from '../../lib/types';
import { useMonth } from '../../shell/MonthContext';
import { useData } from '../../data/RefreshContext';
import { useAddTransaction } from '../../features/add-transaction/AddTransactionContext';
import {
  Button,
  Card,
  Chip,
  ChipGroup,
  Eyebrow,
  Field,
  IconChevronDown,
  Money,
  Segmented,
  Spinner,
  TextInput,
  Toggle,
} from '../../ui';
import styles from './index.module.css';

/**
 * Fila unificada del historial: un gasto, un ingreso o la **nómina prevista** del
 * mes (fila virtual: aún no es dinero cobrado, ver `nominaPrevista`).
 */
type Row =
  | {
      kind: 'gasto';
      id: string;
      date: string;
      amountCents: number;
      categoryId: string;
      subcategoryId?: string;
      accountId?: string;
      bucketId?: string;
      note?: string;
      affectsPatrimony?: boolean;
      /** Comercio que informó Wallet (solo si vino por automatización). */
      merchant?: string;
      /** Entró sin regla que lo clasificara: falta confirmar su categoría. */
      needsReview?: boolean;
    }
  | {
      kind: 'ingreso';
      id: string;
      date: string;
      amountCents: number;
      source?: string;
      isNomina?: boolean;
    }
  | { kind: 'nomina'; id: string; date: string; amountCents: number };

type TypeFilter = 'todos' | 'gasto' | 'ingreso';

/** A efectos de filtro, la nómina prevista cuenta como ingreso. */
function rowType(row: Row): Exclude<TypeFilter, 'todos'> {
  return row.kind === 'gasto' ? 'gasto' : 'ingreso';
}

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'gasto', label: 'Gastos' },
  { value: 'ingreso', label: 'Ingresos' },
];

// Formateadores de día en zona Europe/Madrid (coherentes con el backend).
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Clave de día `YYYY-MM-DD` (Madrid) a partir de un ISO. */
function dayKey(iso: string): string {
  return dayKeyFmt.format(new Date(iso));
}

/** Desplaza una clave de día `n` días (para calcular "ayer"). */
function shiftDay(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - n));
  return dt.toISOString().slice(0, 10);
}

/** Encabezado humano del día: "Hoy" · "Ayer" · "Martes, 5 de agosto". */
function dayLabel(key: string, todayKey: string, yesterdayKey: string): string {
  if (key === todayKey) return 'Hoy';
  if (key === yesterdayKey) return 'Ayer';
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const s = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(dt);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Formatea céntimos a un string editable simple: `123400` → `"1234,00"`. */
function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

interface EditForm {
  amount: string;
  /** Fecha del movimiento en `YYYY-MM-DD` (Europe/Madrid), para el input `type="date"`. */
  date: string;
  note: string;
  categoryId: string | null;
  subcategoryId: string | null;
  /** Enlace al patrimonio: cuenta + sub-saldo. `null` = sin cuenta. */
  accountId: string | null;
  bucketId: string | null;
}

/** Vista Gastos (支出) — historial del mes activo, con filtros y edición por fila. */
export function GastosView() {
  const { month, name } = useMonth();
  const { dataVersion, refresh } = useData();
  const { open } = useAddTransaction();

  // Al llegar desde el desglose de una categoría (Taller) se preselecciona su filtro.
  const location = useLocation();
  const fromCategoryId = (location.state as { categoryId?: string } | null)?.categoryId;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [incomeConfig, setIncomeConfig] = useState<IncomeConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('todos');
  const [selectedCats, setSelectedCats] = useState<Set<string>>(() =>
    fromCategoryId ? new Set([fromCategoryId]) : new Set(),
  );
  // `/gastos?revisar=1` — a donde lleva la notificación de un gasto sin clasificar.
  const [onlyReview, setOnlyReview] = useState(
    () => new URLSearchParams(location.search).get('revisar') === '1',
  );

  // Edición inline: solo una fila abierta a la vez.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>({
    amount: '',
    date: '',
    note: '',
    categoryId: null,
    subcategoryId: null,
    accountId: null,
    bucketId: null,
  });
  // "Recordar esta categoría para este comercio" al clasificar un gasto por revisar.
  const [remember, setRemember] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      const [exp, inc, cats, subs, accs, cfg] = await Promise.all([
        api.get<Expense[]>(`/expenses?month=${month}`).catch(() => [] as Expense[]),
        api.get<Income[]>(`/incomes?month=${month}`).catch(() => [] as Income[]),
        api.get<Category[]>('/categories').catch(() => [] as Category[]),
        api.get<Subcategory[]>('/subcategories').catch(() => [] as Subcategory[]),
        api.get<Account[]>('/accounts').catch(() => [] as Account[]),
        api.get<IncomeConfig | null>('/income-config').catch(() => null),
      ]);
      if (!alive) return;
      setExpenses(Array.isArray(exp) ? exp : []);
      setIncomes(Array.isArray(inc) ? inc : []);
      setCategories(Array.isArray(cats) ? cats : []);
      setSubcategories(Array.isArray(subs) ? subs : []);
      setAccounts(Array.isArray(accs) ? accs : []);
      setIncomeConfig(cfg ?? null);
      setEditingKey(null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [month, dataVersion]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const subcategoryMap = useMemo(() => {
    const map = new Map<string, Subcategory>();
    for (const s of subcategories) map.set(s.id, s);
    return map;
  }, [subcategories]);

  // Subcategorías que puede elegir la fila en edición (las de su categoría actual).
  const editSubcats = useMemo(
    () => (form.categoryId ? subcategories.filter((s) => s.categoryId === form.categoryId) : []),
    [subcategories, form.categoryId],
  );

  // Cuenta seleccionada en la fila en edición (para mostrar sus sub-saldos).
  const editAccount = useMemo(
    () => accounts.find((a) => a.id === form.accountId) ?? null,
    [accounts, form.accountId],
  );

  // Totales del mes (sobre todo lo cargado, sin aplicar filtros).
  const gastadoTotal = useMemo(
    () => expenses.reduce((sum, e) => sum + e.amountCents, 0),
    [expenses],
  );
  const ingresosTotal = useMemo(
    () => incomes.reduce((sum, i) => sum + i.amountCents, 0),
    [incomes],
  );

  /**
   * Nómina del mes como fila del historial. Si ya se registró el cobro es un
   * `Income` normal; si no, se muestra **prevista** a partir de la configuración.
   * El dinero es sagrado: la prevista NO suma a "Ingresos" ni al patrimonio
   * (nadie ha cobrado todavía) — se convierte en ingreso real al confirmarla.
   */
  const nominaPrevista = useMemo(() => {
    if (incomes.some((i) => i.isNomina)) return null; // ya cobrada este mes
    if (!incomeConfig || incomeConfig.amountCents <= 0) return null;
    if (month > currentMonth()) return null; // un mes futuro aún no se cobra
    return {
      date: nominaDate(month, incomeConfig.payDay),
      amountCents: incomeConfig.amountCents,
    };
  }, [incomes, incomeConfig, month]);

  // Categorías presentes en los gastos del mes (para acotar los chips de filtro).
  const usedCategories = useMemo(() => {
    const used = new Set(expenses.map((e) => e.categoryId));
    return categories.filter((c) => used.has(c.id));
  }, [expenses, categories]);

  // Gastos del mes que entraron sin clasificar y esperan confirmación. Es lo que
  // hace descubrible el filtro "Por revisar" sin depender de la notificación.
  const reviewCount = useMemo(
    () => expenses.reduce((n, e) => (e.needsReview ? n + 1 : n), 0),
    [expenses],
  );

  // Filas combinadas y ordenadas cronológicamente (desc por fecha ISO).
  const rows = useMemo<Row[]>(() => {
    const all: Row[] = [
      ...expenses.map<Row>((e) => ({
        kind: 'gasto',
        id: e.id,
        date: e.date,
        amountCents: e.amountCents,
        categoryId: e.categoryId,
        subcategoryId: e.subcategoryId,
        accountId: e.accountId,
        bucketId: e.bucketId,
        note: e.note,
        affectsPatrimony: e.affectsPatrimony,
        merchant: e.merchant,
        needsReview: e.needsReview,
      })),
      ...incomes.map<Row>((i) => ({
        kind: 'ingreso',
        id: i.id,
        date: i.date,
        amountCents: i.amountCents,
        source: i.source,
        isNomina: i.isNomina,
      })),
      ...(nominaPrevista
        ? [{ kind: 'nomina' as const, id: 'prevista', ...nominaPrevista }]
        : []),
    ];
    return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [expenses, incomes, nominaPrevista]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // Filtro "por revisar": solo gastos que entraron sin clasificar.
      if (onlyReview && !(row.kind === 'gasto' && row.needsReview)) return false;
      if (typeFilter !== 'todos' && rowType(row) !== typeFilter) return false;
      if (selectedCats.size > 0) {
        // El filtro por categoría solo aplica a gastos; los ingresos quedan fuera.
        if (row.kind !== 'gasto') return false;
        if (!selectedCats.has(row.categoryId)) return false;
      }
      return true;
    });
  }, [rows, typeFilter, selectedCats, onlyReview]);

  // Agrupa las filas filtradas por día conservando el orden desc.
  const groups = useMemo(() => {
    const byDay = new Map<string, Row[]>();
    for (const row of filteredRows) {
      const key = dayKey(row.date);
      const list = byDay.get(key);
      if (list) list.push(row);
      else byDay.set(key, [row]);
    }
    return [...byDay.entries()];
  }, [filteredRows]);

  const todayKey = today();
  const yesterdayKey = shiftDay(todayKey, 1);

  const totalItems = expenses.length + incomes.length + (nominaPrevista ? 1 : 0);

  function toggleCategory(id: string) {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openEditor(row: Row) {
    const key = `${row.kind}:${row.id}`;
    if (editingKey === key) {
      setEditingKey(null);
      return;
    }
    setEditingKey(key);
    setConfirmDelete(false);
    setEditError(null);
    setBusy(false);
    // Por defecto, clasificar un gasto por revisar deja también la regla aprendida.
    setRemember(row.kind === 'gasto' && Boolean(row.needsReview && row.merchant));
    setForm({
      amount: centsToInput(row.amountCents),
      // Fecha del movimiento como día de Madrid (coherente con el agrupado por días).
      date: dayKey(row.date),
      note:
        row.kind === 'gasto'
          ? (row.note ?? '')
          : row.kind === 'nomina'
            ? 'Nómina'
            : (row.source ?? ''),
      categoryId: row.kind === 'gasto' ? row.categoryId : null,
      subcategoryId: row.kind === 'gasto' ? (row.subcategoryId ?? null) : null,
      accountId: row.kind === 'gasto' ? (row.accountId ?? null) : null,
      bucketId: row.kind === 'gasto' ? (row.bucketId ?? null) : null,
    });
  }

  /**
   * Cambia la cuenta (y sub-saldo) a la que afecta el gasto en edición. Si la
   * cuenta tiene un único sub-saldo se autoselecciona; si tiene varios, hay que
   * elegirlo. Volver a tocar la cuenta activa la desvincula ("sin cuenta").
   */
  function pickAccount(id: string) {
    setForm((f) => {
      if (f.accountId === id) return { ...f, accountId: null, bucketId: null };
      const account = accounts.find((a) => a.id === id) ?? null;
      return {
        ...f,
        accountId: id,
        bucketId: account && account.buckets.length === 1 ? account.buckets[0]._id : null,
      };
    });
  }

  /**
   * Cambia la categoría del gasto en edición. Al mover el gasto de categoría su
   * subcategoría deja de aplicar (cuelga de la anterior), así que se descarta.
   */
  function pickCategory(id: string) {
    setForm((f) =>
      f.categoryId === id ? f : { ...f, categoryId: id, subcategoryId: null },
    );
  }

  /**
   * Convierte la nómina prevista en un ingreso real (mismo camino que el chip de
   * la hoja de añadir): importe editable —clave con nómina variable— y destino
   * la cuenta vinculada en Ajustes, si la hay. El backend impide una segunda
   * nómina en el mismo mes (`nomina_already_collected`).
   */
  async function registrarNomina() {
    if (!nominaPrevista) return;
    const amountCents = parseInputToCents(form.amount);
    if (amountCents <= 0) {
      setEditError('Introduce un importe válido.');
      return;
    }
    setBusy(true);
    setEditError(null);
    try {
      const body: NewIncome = {
        amountCents,
        date: nominaPrevista.date,
        isNomina: true,
        source: form.note.trim() || 'Nómina',
        ...(incomeConfig?.defaultAccountId && incomeConfig?.defaultBucketId
          ? { accountId: incomeConfig.defaultAccountId, bucketId: incomeConfig.defaultBucketId }
          : {}),
      };
      await api.post('/incomes', body);
      setEditingKey(null);
      refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.message : '';
      setEditError(
        code === 'nomina_already_collected'
          ? 'La nómina de este mes ya está registrada.'
          : 'No se pudo registrar. Inténtalo de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveRow(row: Row) {
    const amountCents = parseInputToCents(form.amount);
    if (amountCents <= 0) {
      setEditError('Introduce un importe válido.');
      return;
    }
    // La fecha es obligatoria: un movimiento sin día no se puede ubicar en su mes.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setEditError('Elige una fecha válida.');
      return;
    }
    // Un gasto que enlaza cuenta necesita sub-saldo: si hay cuenta pero falta el
    // sub-saldo (cuenta con varios), el backend lo rechazaría — avísalo antes.
    const linksAccount = row.kind === 'gasto' && row.affectsPatrimony !== false;
    if (linksAccount && form.accountId && !form.bucketId) {
      setEditError('Elige el sub-saldo de la cuenta.');
      return;
    }
    setBusy(true);
    setEditError(null);
    try {
      if (row.kind === 'gasto') {
        const body: Record<string, unknown> = { amountCents, date: form.date, note: form.note.trim() };
        if (form.categoryId) body.categoryId = form.categoryId;
        // Explícito siempre: `null` es la forma de dejar el gasto sin subcategoría.
        body.subcategoryId = form.subcategoryId;
        // Enlace a cuenta: `null` desvincula. Solo lo tocan los gastos que afectan
        // al patrimonio (un histórico no mueve saldos, ver invariante del backend).
        if (linksAccount) {
          body.accountId = form.accountId;
          body.bucketId = form.bucketId;
        }
        // Confirmar la categoría a mano es justo lo que saca al gasto de la bandeja.
        if (row.needsReview) body.needsReview = false;
        await api.patch(`/expenses/${row.id}`, body);

        // Y, si se pide, deja aprendida la regla para que la próxima entre sola.
        if (row.needsReview && remember && row.merchant && form.categoryId) {
          try {
            await api.post('/automation/rules', {
              label: row.merchant,
              categoryId: form.categoryId,
            });
          } catch {
            // El gasto ya está guardado: la regla es un extra, no puede tumbar el guardado.
            setEditError('Gasto guardado, pero no se pudo crear la regla. Créala en Ajustes.');
            setBusy(false);
            refresh();
            return;
          }
        }
      } else {
        await api.patch(`/incomes/${row.id}`, {
          amountCents,
          date: form.date,
          source: form.note.trim(),
        });
      }
      setEditingKey(null);
      refresh();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteRow(row: Row) {
    setBusy(true);
    setEditError(null);
    try {
      const path = row.kind === 'gasto' ? `/expenses/${row.id}` : `/incomes/${row.id}`;
      await api.del(path);
      setEditingKey(null);
      refresh();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'No se pudo eliminar. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.view} aria-labelledby="gastos-title">
      {/* `display: contents` en móvil (DESIGN.md §19.4): la vista de móvil no
          cambia. En escritorio, `side` es el costado sticky (resumen del mes +
          filtros) y `stack` la lista de días. */}
      <div className={styles.side}>
        <header className={styles.head}>
          <Eyebrow kanji="支出">Gastos</Eyebrow>
          <h1 id="gastos-title" className={styles.title}>
            {name}
          </h1>
          {totalItems > 0 ? (
            <p className={styles.summary}>
              <span>
                Gastado <Money cents={gastadoTotal} className={styles.summaryNum} />
              </span>
              <span aria-hidden className={styles.sep}>
                ·
              </span>
              <span>
                Ingresos <Money cents={ingresosTotal} signed className={styles.summaryNum} />
              </span>
              {nominaPrevista ? (
                <>
                  <span aria-hidden className={styles.sep}>
                    ·
                  </span>
                  <span className={styles.pending}>
                    Nómina prevista{' '}
                    <Money cents={nominaPrevista.amountCents} signed className={styles.pendingNum} />
                  </span>
                </>
              ) : null}
            </p>
          ) : null}
        </header>

        {!loading && totalItems > 0 ? (
          <div className={styles.filters}>
            {/* Bandeja de "por revisar": los gastos que la automatización dejó sin
                clasificar. Antes solo se llegaba desde la notificación; ahora el
                chip es un control PERMANENTE del mes (aunque no haya pendientes),
                para poder comprobarlo cuando quieras sin depender del aviso. El
                badge de recuento solo aparece si hay algo que revisar. */}
            <ChipGroup label="Pendientes de clasificar">
              <Chip
                selected={onlyReview}
                onClick={() => setOnlyReview((v) => !v)}
                aria-label={
                  onlyReview
                    ? 'Quitar el filtro por revisar'
                    : reviewCount > 0
                      ? `Ver solo gastos por revisar (${reviewCount} pendientes)`
                      : 'No hay gastos por revisar este mes'
                }
              >
                Por revisar
                {reviewCount > 0 ? (
                  <span className={styles.reviewCount}>{reviewCount}</span>
                ) : null}
                {onlyReview ? <span aria-hidden>✕</span> : null}
              </Chip>
            </ChipGroup>
            <Segmented
              options={TYPE_OPTIONS}
              value={typeFilter}
              onChange={setTypeFilter}
              label="Filtrar por tipo"
            />
            {usedCategories.length > 0 ? (
              <ChipGroup label="Filtrar por categoría" className={styles.catFilter}>
                {usedCategories.map((cat) => (
                  <Chip
                    key={cat.id}
                    selected={selectedCats.has(cat.id)}
                    dotColor={cat.color}
                    onClick={() => toggleCategory(cat.id)}
                  >
                    {cat.name}
                  </Chip>
                ))}
              </ChipGroup>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={styles.stack}>
        {loading ? (
          <Spinner label="Cargando movimientos" />
        ) : totalItems === 0 ? (
          <Card className={styles.emptyCard}>
            <p className={styles.emptyText}>Sin movimientos este mes.</p>
            <Button variant="accent" onClick={() => open('gasto')}>
              Añadir gasto
            </Button>
          </Card>
        ) : filteredRows.length === 0 ? (
          <Card className={styles.emptyCard}>
            <p className={styles.emptyText}>
              {onlyReview
                ? 'Nada por revisar: todos los gastos del mes están clasificados.'
                : 'No hay movimientos con estos filtros.'}
            </p>
            <Button
              variant="ghost"
              onClick={() => {
                setTypeFilter('todos');
                setSelectedCats(new Set());
                setOnlyReview(false);
              }}
            >
              {onlyReview ? 'Ver todo' : 'Limpiar filtros'}
            </Button>
          </Card>
        ) : (
          <div className={styles.days}>
            {groups.map(([key, dayRows]) => (
              <section key={key} className={styles.dayGroup} aria-label={dayLabel(key, todayKey, yesterdayKey)}>
                <h2 className={styles.dayHeader}>{dayLabel(key, todayKey, yesterdayKey)}</h2>
                <Card className={styles.list}>
                  <ul className={styles.rows}>
                    {dayRows.map((row) => {
                      const rowKey = `${row.kind}:${row.id}`;
                      const isOpen = editingKey === rowKey;
                      const cat = row.kind === 'gasto' ? categoryMap.get(row.categoryId) : null;
                      const sub =
                        row.kind === 'gasto' && row.subcategoryId
                          ? subcategoryMap.get(row.subcategoryId)
                          : null;
                      const isPrevista = row.kind === 'nomina';
                      const primary =
                        row.kind === 'gasto'
                          ? `${cat?.name ?? 'Sin categoría'}${sub ? ` · ${sub.name}` : ''}`
                          : row.kind === 'nomina'
                            ? `Nómina de ${monthName(month)}`
                            : row.source || (row.isNomina ? 'Nómina' : 'Ingreso');
                      // El comercio manda sobre la nota: es lo que identifica el gasto ingerido.
                      const secondary =
                        row.kind === 'gasto' ? (row.merchant ?? row.note ?? null) : null;
                      const isHistorical = row.kind === 'gasto' && row.affectsPatrimony === false;
                      const needsReview = row.kind === 'gasto' && row.needsReview === true;
                      return (
                        <li key={rowKey} className={styles.row}>
                          <button
                            type="button"
                            className={styles.rowBtn}
                            aria-expanded={isOpen}
                            aria-controls={`editor-${rowKey}`}
                            onClick={() => openEditor(row)}
                          >
                            <span className={styles.rowMain}>
                              {row.kind === 'gasto' ? (
                                <span
                                  className={styles.dot}
                                  style={{ background: cat?.color ?? 'var(--ink-4)' }}
                                  aria-hidden
                                />
                              ) : (
                                <span
                                  className={isPrevista ? styles.dotPrev : styles.dotIn}
                                  aria-hidden
                                />
                              )}
                              <span className={styles.rowText}>
                                <span className={styles.rowName}>{primary}</span>
                                {secondary ? <span className={styles.rowNote}>{secondary}</span> : null}
                                {isHistorical ? (
                                  <span className={styles.histTag}>No afecta al patrimonio</span>
                                ) : null}
                                {isPrevista ? (
                                  <span className={styles.prevTag}>Prevista · sin cobrar</span>
                                ) : null}
                                {needsReview ? (
                                  <span className={styles.reviewTag}>Por revisar</span>
                                ) : null}
                              </span>
                            </span>
                            <span className={styles.rowRight}>
                              {row.kind === 'gasto' ? (
                                <Money cents={-row.amountCents} className={styles.amount} />
                              ) : (
                                <Money
                                  cents={row.amountCents}
                                  signed
                                  className={isPrevista ? styles.amountPrev : styles.amountIn}
                                />
                              )}
                              <IconChevronDown
                                size={18}
                                className={isOpen ? styles.chevOpen : styles.chev}
                              />
                            </span>
                          </button>

                          {isOpen ? (
                            <div id={`editor-${rowKey}`} className={styles.editor}>
                              <div className={styles.editRow}>
                                <Field label="Importe" htmlFor={`amt-${rowKey}`} className={styles.grow}>
                                  <TextInput
                                    id={`amt-${rowKey}`}
                                    inputMode="decimal"
                                    value={form.amount}
                                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                                    placeholder="0,00"
                                  />
                                </Field>
                              </div>

                              {/* La nómina prevista aún no es un movimiento real: su
                                  fecha se fija al registrarla, no se edita aquí. */}
                              {!isPrevista ? (
                                <Field label="Fecha" htmlFor={`date-${rowKey}`}>
                                  <TextInput
                                    id={`date-${rowKey}`}
                                    type="date"
                                    value={form.date}
                                    onChange={(e) =>
                                      setForm((f) => ({ ...f, date: e.target.value }))
                                    }
                                  />
                                </Field>
                              ) : null}

                              <Field
                                label={row.kind === 'gasto' ? 'Nota' : 'Origen'}
                                htmlFor={`note-${rowKey}`}
                              >
                                <TextInput
                                  id={`note-${rowKey}`}
                                  value={form.note}
                                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                                  placeholder={row.kind === 'gasto' ? 'p. ej. Súper' : 'p. ej. Nómina'}
                                  maxLength={row.kind === 'gasto' ? 280 : 120}
                                />
                              </Field>

                              {row.kind === 'gasto' && categories.length > 0 ? (
                                <Field label="Categoría">
                                  <ChipGroup label="Categoría">
                                    {categories.map((c) => (
                                      <Chip
                                        key={c.id}
                                        selected={form.categoryId === c.id}
                                        dotColor={c.color}
                                        onClick={() => pickCategory(c.id)}
                                      >
                                        {c.name}
                                      </Chip>
                                    ))}
                                  </ChipGroup>
                                  {editSubcats.length > 0 ? (
                                    <ChipGroup
                                      label="Subcategoría (opcional)"
                                      className={styles.subcats}
                                    >
                                      {editSubcats.map((s) => (
                                        <Chip
                                          key={s.id}
                                          selected={form.subcategoryId === s.id}
                                          onClick={() =>
                                            setForm((f) => ({
                                              ...f,
                                              subcategoryId: f.subcategoryId === s.id ? null : s.id,
                                            }))
                                          }
                                        >
                                          {s.name}
                                        </Chip>
                                      ))}
                                    </ChipGroup>
                                  ) : null}
                                </Field>
                              ) : null}

                              {/* Cuenta a la que afecta el gasto. Solo en gastos que
                                  mueven patrimonio (un histórico no toca saldos). */}
                              {row.kind === 'gasto' &&
                              row.affectsPatrimony !== false &&
                              accounts.length > 0 ? (
                                <Field label="Cuenta (opcional)">
                                  <ChipGroup label="Cuenta">
                                    {accounts.map((acc) => (
                                      <Chip
                                        key={acc.id}
                                        selected={form.accountId === acc.id}
                                        dotColor={acc.color}
                                        onClick={() => pickAccount(acc.id)}
                                      >
                                        {acc.name}
                                      </Chip>
                                    ))}
                                  </ChipGroup>
                                  {editAccount && editAccount.buckets.length > 1 ? (
                                    <ChipGroup label="Sub-saldo" className={styles.subcats}>
                                      {editAccount.buckets.map((bucket) => (
                                        <Chip
                                          key={bucket._id}
                                          selected={form.bucketId === bucket._id}
                                          onClick={() =>
                                            setForm((f) => ({
                                              ...f,
                                              bucketId:
                                                f.bucketId === bucket._id ? null : bucket._id,
                                            }))
                                          }
                                        >
                                          {bucket.name}
                                        </Chip>
                                      ))}
                                    </ChipGroup>
                                  ) : null}
                                </Field>
                              ) : null}

                              {/* Clasificar a mano una vez enseña a Kobo a hacerlo solo la próxima. */}
                              {needsReview && row.kind === 'gasto' && row.merchant ? (
                                <div className={styles.rememberRow}>
                                  <Toggle
                                    id={`remember-${rowKey}`}
                                    checked={remember}
                                    onChange={setRemember}
                                    label={`Recordar la categoría para ${row.merchant}`}
                                  />
                                  <label htmlFor={`remember-${rowKey}`} className={styles.prevHint}>
                                    Recordar: «{row.merchant}» irá siempre a esta categoría.
                                  </label>
                                </div>
                              ) : null}

                              {editError ? (
                                <p className={styles.editError} role="alert">
                                  {editError}
                                </p>
                              ) : null}

                              {isPrevista ? (
                                <>
                                  <p className={styles.prevHint}>
                                    {incomeConfig?.defaultAccountId
                                      ? 'Al registrarla se suma a la cuenta donde cae tu nómina.'
                                      : 'Vincula una cuenta en Ajustes → Nómina para que sume al patrimonio.'}
                                  </p>
                                  <div className={styles.actions}>
                                    <Button
                                      variant="accent"
                                      onClick={() => void registrarNomina()}
                                      loading={busy}
                                    >
                                      Registrar ingreso
                                    </Button>
                                  </div>
                                </>
                              ) : confirmDelete ? (
                                <div className={styles.confirm}>
                                  <span className={styles.confirmText}>¿Eliminar este movimiento?</span>
                                  <div className={styles.confirmActions}>
                                    <Button
                                      variant="ghost"
                                      onClick={() => setConfirmDelete(false)}
                                      disabled={busy}
                                    >
                                      Cancelar
                                    </Button>
                                    <Button
                                      variant="accent"
                                      onClick={() => void deleteRow(row)}
                                      loading={busy}
                                    >
                                      Sí, eliminar
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className={styles.actions}>
                                  <Button
                                    variant="quiet"
                                    onClick={() => setConfirmDelete(true)}
                                    disabled={busy}
                                  >
                                    Eliminar
                                  </Button>
                                  <Button
                                    variant="accent"
                                    onClick={() => void saveRow(row)}
                                    loading={busy}
                                  >
                                    Guardar
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
