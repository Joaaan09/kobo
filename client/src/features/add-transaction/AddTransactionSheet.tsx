import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { parseInputToCents } from '../../lib/money';
import { addMonths, dayKeyOf, monthName, nominaCycleOfDay, nominaWindow, today } from '../../lib/month';
import type {
  Account,
  Category,
  Fund,
  Income,
  IncomeConfig,
  NewExpense,
  NewIncome,
  NewTransfer,
  Subcategory,
} from '../../lib/types';
import { useData } from '../../data/RefreshContext';
import {
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  Field,
  Segmented,
  Switch,
  TextInput,
} from '../../ui';
import styles from './AddTransactionSheet.module.css';

type Kind = 'gasto' | 'ingreso' | 'movimiento';

interface AddTransactionSheetProps {
  open: boolean;
  initialKind: Kind;
  onClose: () => void;
}

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'gasto', label: 'Gasto' },
  { value: 'ingreso', label: 'Ingreso' },
  { value: 'movimiento', label: 'Mover' },
];

/**
 * Selector de un extremo (cuenta + sub-saldo) de un movimiento. Si la cuenta
 * tiene un solo bucket, se autoselecciona; si tiene varios, muestra sus chips.
 */
function EndpointPicker({
  label,
  accounts,
  accountId,
  bucketId,
  onChange,
}: {
  label: string;
  accounts: Account[];
  accountId: string | null;
  bucketId: string | null;
  onChange: (accountId: string | null, bucketId: string | null) => void;
}) {
  const selected = accounts.find((a) => a.id === accountId) ?? null;

  function pickAccount(id: string) {
    if (accountId === id) {
      onChange(null, null);
      return;
    }
    const account = accounts.find((a) => a.id === id) ?? null;
    onChange(id, account && account.buckets.length === 1 ? account.buckets[0]._id : null);
  }

  return (
    <Field label={label}>
      <ChipGroup label={label}>
        {accounts.map((acc) => (
          <Chip
            key={acc.id}
            selected={accountId === acc.id}
            dotColor={acc.color}
            onClick={() => pickAccount(acc.id)}
          >
            {acc.name}
          </Chip>
        ))}
      </ChipGroup>
      {selected && selected.buckets.length > 1 ? (
        <ChipGroup label="Sub-saldo" className={styles.buckets}>
          {selected.buckets.map((bucket) => (
            <Chip
              key={bucket._id}
              selected={bucketId === bucket._id}
              onClick={() => onChange(accountId, bucketId === bucket._id ? null : bucket._id)}
            >
              {bucket.name}
            </Chip>
          ))}
        </ChipGroup>
      ) : null}
    </Field>
  );
}

export function AddTransactionSheet({ open, initialKind, onClose }: AddTransactionSheetProps) {
  const { refresh } = useData();

  const [kind, setKind] = useState<Kind>(initialKind);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [fundId, setFundId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [bucketId, setBucketId] = useState<string | null>(null);
  // Extremos de un movimiento (traspaso entre buckets del patrimonio).
  const [fromAccountId, setFromAccountId] = useState<string | null>(null);
  const [fromBucketId, setFromBucketId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [toBucketId, setToBucketId] = useState<string | null>(null);
  // Sobre de ahorro que consume el movimiento (opcional).
  const [transferCategoryId, setTransferCategoryId] = useState<string | null>(null);
  // Por defecto un gasto afecta al patrimonio. Al desactivarlo se registra sin mover cuentas
  // (p. ej. un gasto pasado que ya no cuenta para el saldo actual).
  const [affectsPatrimony, setAffectsPatrimony] = useState(true);
  const [date, setDate] = useState<string>(today());
  const [note, setNote] = useState('');
  // Marca este ingreso como la nómina del mes (prefija importe + cuenta).
  const [isNomina, setIsNomina] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [incomeConfig, setIncomeConfig] = useState<IncomeConfig | null>(null);
  const [nominaThisMonth, setNominaThisMonth] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reinicia el formulario cada vez que se abre.
  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setAmount('');
    setCategoryId(null);
    setSubcategoryId(null);
    setFundId(null);
    setAccountId(null);
    setBucketId(null);
    setFromAccountId(null);
    setFromBucketId(null);
    setToAccountId(null);
    setToBucketId(null);
    setTransferCategoryId(null);
    setAffectsPatrimony(true);
    setDate(today());
    setNote('');
    setIsNomina(false);
    setError(null);
    setSaving(false);
  }, [open, initialKind]);

  // Carga catálogos (categorías + cuentas) al abrir.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      const [cats, subs, fnds, accs, cfg, monthIncomes] = await Promise.all([
        api.get<Category[]>('/categories').catch(() => [] as Category[]),
        api.get<Subcategory[]>('/subcategories').catch(() => [] as Subcategory[]),
        api.get<Fund[]>('/funds').catch(() => [] as Fund[]),
        api.get<Account[]>('/accounts').catch(() => [] as Account[]),
        api.get<IncomeConfig | null>('/income-config').catch(() => null),
        // La nómina de hoy puede venir adelantada (fin de semana, festivo): su ventana
        // empieza unos días antes del ciclo, así que se mira también el ciclo anterior.
        Promise.all([
          api.get<Income[]>(`/incomes?month=${nominaCycleOfDay(today())}`).catch(() => [] as Income[]),
          api
            .get<Income[]>(`/incomes?month=${addMonths(nominaCycleOfDay(today()), -1)}`)
            .catch(() => [] as Income[]),
        ]).then((lists) => lists.flat()),
      ]);
      if (!alive) return;
      setCategories(Array.isArray(cats) ? cats : []);
      setSubcategories(Array.isArray(subs) ? subs : []);
      setFunds(Array.isArray(fnds) ? fnds : []);
      setAccounts(Array.isArray(accs) ? accs : []);
      setIncomeConfig(cfg ?? null);
      const win = nominaWindow(nominaCycleOfDay(today()));
      setNominaThisMonth(
        monthIncomes.some((i) => {
          if (!i.isNomina) return false;
          const key = dayKeyOf(i.date);
          return key >= win.firstDay && key <= win.lastDay;
        }),
      );
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;
  // El interruptor de patrimonio solo tiene sentido en gastos y si hay cuentas que mover.
  const canTogglePatrimony = kind === 'gasto' && accounts.length > 0;
  // El selector de cuenta aparece en ingresos siempre, y en gastos solo si afectan al patrimonio.
  const showAccountPicker =
    accounts.length > 0 && (kind === 'ingreso' || (kind === 'gasto' && affectsPatrimony));
  // Para mover dinero hacen falta al menos dos sub-saldos (en una o varias cuentas).
  const bucketCount = accounts.reduce((n, a) => n + a.buckets.length, 0);
  const canMove = bucketCount >= 2;
  // Sobres de ahorro: su presupuesto se consume moviendo dinero, no gastando.
  const savingsCategories = categories.filter((c) => c.savings);
  // De un sobre de ahorro no se gasta: para eso, tráete el dinero con un movimiento
  // y gasta contra una categoría normal.
  const spendableCategories = categories.filter((c) => !c.savings);
  // Nómina del mes: registrable si hay config con importe y aún no se registró. El
  // mes es el de la nómina de hoy: unos días antes del cobro ya es la del que empieza.
  const nominaMonthLabel = monthName(nominaCycleOfDay(today()));
  const canRegisterNomina =
    kind === 'ingreso' && !!incomeConfig && incomeConfig.amountCents > 0 && !nominaThisMonth;

  // Marca/desmarca el ingreso como nómina; al marcarlo prefija importe y cuenta destino.
  function toggleNomina() {
    setIsNomina((prev) => {
      const next = !prev;
      if (next && incomeConfig) {
        setAmount((cur) =>
          cur.trim()
            ? cur
            : (incomeConfig.amountCents / 100).toLocaleString('es-ES', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
        );
        if (incomeConfig.defaultAccountId && incomeConfig.defaultBucketId) {
          setAccountId(incomeConfig.defaultAccountId);
          setBucketId(incomeConfig.defaultBucketId);
        }
        setNote((cur) => (cur.trim() ? cur : 'Nómina'));
      }
      return next;
    });
  }
  // Subcategorías y fondos de la categoría elegida (se piden todos al abrir y se filtran).
  const subcatsForCategory = categoryId
    ? subcategories.filter((s) => s.categoryId === categoryId)
    : [];
  const fundsForCategory = categoryId ? funds.filter((f) => f.categoryId === categoryId) : [];

  function selectCategory(id: string) {
    setCategoryId((prev) => (prev === id ? null : id));
    // Al cambiar (o deseleccionar) la categoría, su subcategoría y su fondo dejan de aplicar.
    setSubcategoryId(null);
    setFundId(null);
  }

  // Al elegir un fondo se hereda su subcategoría si la tiene anclada (el pago del
  // gimnasio sigue siendo de su subcategoría, solo que se paga a saltos) y, por
  // comodidad, se propone el importe objetivo si aún no hay importe tecleado. Un
  // fondo sin ancla respeta la subcategoría que hubiera elegido el usuario.
  function selectFund(fund: Fund) {
    setFundId((prev) => {
      const next = prev === fund.id ? null : fund.id;
      if (next) {
        if (fund.subcategoryId) setSubcategoryId(fund.subcategoryId);
        setAmount((cur) => (cur.trim() ? cur : String(fund.targetCents / 100).replace('.', ',')));
      }
      return next;
    });
  }

  function selectAccount(id: string) {
    if (accountId === id) {
      setAccountId(null);
      setBucketId(null);
      return;
    }
    const account = accounts.find((a) => a.id === id) ?? null;
    setAccountId(id);
    setBucketId(account && account.buckets.length === 1 ? account.buckets[0]._id : null);
  }

  // Al marcar que no afecta al patrimonio, se desvincula la cuenta (no debe mover ningún saldo).
  function togglePatrimony(value: boolean) {
    setAffectsPatrimony(value);
    if (!value) {
      setAccountId(null);
      setBucketId(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const amountCents = parseInputToCents(amount);
    if (amountCents <= 0) {
      setError('Introduce un importe válido.');
      return;
    }
    if (kind === 'gasto' && !categoryId) {
      setError('Elige una categoría.');
      return;
    }
    if (kind === 'movimiento') {
      if (!fromAccountId || !fromBucketId || !toAccountId || !toBucketId) {
        setError('Elige el sub-saldo de origen y el de destino.');
        return;
      }
      if (fromAccountId === toAccountId && fromBucketId === toBucketId) {
        setError('El origen y el destino no pueden ser el mismo.');
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      if (kind === 'gasto') {
        const body: NewExpense = {
          amountCents,
          date,
          categoryId: categoryId as string,
          ...(subcategoryId ? { subcategoryId } : {}),
          ...(fundId ? { fundId } : {}),
          ...(accountId ? { accountId } : {}),
          ...(bucketId ? { bucketId } : {}),
          // Solo se envía cuando es `false` (el backend asume `true` por defecto).
          ...(affectsPatrimony ? {} : { affectsPatrimony: false }),
          ...(note.trim() ? { note: note.trim() } : {}),
        };
        await api.post('/expenses', body);
      } else if (kind === 'ingreso') {
        const body: NewIncome = {
          amountCents,
          date,
          isNomina,
          ...(accountId ? { accountId } : {}),
          ...(bucketId ? { bucketId } : {}),
          ...(note.trim() ? { source: note.trim() } : {}),
        };
        await api.post('/incomes', body);
      } else {
        const body: NewTransfer = {
          amountCents,
          date,
          fromAccountId: fromAccountId as string,
          fromBucketId: fromBucketId as string,
          toAccountId: toAccountId as string,
          toBucketId: toBucketId as string,
          ...(transferCategoryId ? { categoryId: transferCategoryId } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        };
        await api.post('/transfers', body);
      }
      refresh();
      onClose();
    } catch (err) {
      const code = err instanceof ApiError ? err.message : '';
      setError(
        code === 'nomina_already_collected'
          ? `La nómina de ${nominaMonthLabel} ya está registrada este mes.`
          : code === 'category_not_savings'
            ? 'Ese sobre ya no es de ahorro: elige otro o déjalo sin sobre.'
            : code || 'No se pudo guardar. Inténtalo de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Nuevo movimiento">
      <form className={styles.form} onSubmit={handleSubmit}>
        <Segmented options={KIND_OPTIONS} value={kind} onChange={setKind} label="Tipo de movimiento" />

        <div className={styles.amount}>
          <input
            className={styles.amountInput}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            aria-label="Importe"
            /* Foco inicial: lo da `BottomSheet` cuando la hoja termina de entrar.
             * `autoFocus` no sirve aquí — React lo aplica en el commit, con el
             * `dialog` todavía en `display: none`, y el foco se pierde. */
            data-autofocus
          />
          <span className={styles.amountCurrency} aria-hidden>
            €
          </span>
        </div>

        {kind === 'gasto' ? (
          <Field label="Categoría">
            {spendableCategories.length === 0 ? (
              <p className={styles.empty}>No hay categorías todavía.</p>
            ) : (
              <ChipGroup label="Categoría">
                {spendableCategories.map((cat) => (
                  <Chip
                    key={cat.id}
                    selected={categoryId === cat.id}
                    dotColor={cat.color}
                    onClick={() => selectCategory(cat.id)}
                  >
                    {cat.name}
                  </Chip>
                ))}
              </ChipGroup>
            )}
            {subcatsForCategory.length > 0 ? (
              <ChipGroup label="Subcategoría (opcional)" className={styles.buckets}>
                {subcatsForCategory.map((sub) => (
                  <Chip
                    key={sub.id}
                    selected={subcategoryId === sub.id}
                    onClick={() => setSubcategoryId((id) => (id === sub.id ? null : sub.id))}
                  >
                    {sub.name}
                  </Chip>
                ))}
              </ChipGroup>
            ) : null}
            {fundsForCategory.length > 0 ? (
              <ChipGroup label="Pago de fondo 積立 (opcional)" className={styles.buckets}>
                {fundsForCategory.map((fund) => (
                  <Chip
                    key={fund.id}
                    selected={fundId === fund.id}
                    onClick={() => selectFund(fund)}
                  >
                    {fund.name}
                  </Chip>
                ))}
              </ChipGroup>
            ) : null}
          </Field>
        ) : null}

        {kind === 'movimiento' ? (
          canMove ? (
            <>
              <EndpointPicker
                label="Desde"
                accounts={accounts}
                accountId={fromAccountId}
                bucketId={fromBucketId}
                onChange={(a, b) => {
                  setFromAccountId(a);
                  setFromBucketId(b);
                }}
              />
              <EndpointPicker
                label="Hacia"
                accounts={accounts}
                accountId={toAccountId}
                bucketId={toBucketId}
                onChange={(a, b) => {
                  setToAccountId(a);
                  setToBucketId(b);
                }}
              />
              <Field
                label="Categoría de ahorro (opcional)"
                hint="Imputa el movimiento a un sobre 貯: ahorrar no es gastar, pero sí consume el presupuesto del mes."
              >
                {savingsCategories.length === 0 ? (
                  /* Sin sobres de ahorro el selector no tendría nada que ofrecer. Antes
                     desaparecía sin más y parecía que un movimiento no admitía categoría:
                     ahora se explica qué falta y dónde se activa. */
                  <p className={styles.empty}>
                    Ninguna de tus categorías es todavía un sobre de ahorro. Márcala en Ajustes →
                    Categorías → <strong>貯 Sobre de ahorro</strong> y podrás imputarle los
                    movimientos.
                  </p>
                ) : (
                  <ChipGroup label="Sobre de ahorro">
                    <Chip
                      selected={transferCategoryId === null}
                      onClick={() => setTransferCategoryId(null)}
                    >
                      Ninguno
                    </Chip>
                    {savingsCategories.map((cat) => (
                      <Chip
                        key={cat.id}
                        selected={transferCategoryId === cat.id}
                        dotColor={cat.color}
                        onClick={() => setTransferCategoryId(cat.id)}
                      >
                        {cat.name}
                      </Chip>
                    ))}
                  </ChipGroup>
                )}
              </Field>
            </>
          ) : (
            <p className={styles.empty}>
              Necesitas al menos dos sub-saldos (en una o varias cuentas) para mover dinero.
            </p>
          )
        ) : null}

        {canRegisterNomina ? (
          <ChipGroup label="Nómina (opcional)">
            <Chip selected={isNomina} onClick={toggleNomina}>
              給料 Nómina de {nominaMonthLabel}
            </Chip>
          </ChipGroup>
        ) : null}
        {kind === 'ingreso' && nominaThisMonth ? (
          <p className={styles.empty}>La nómina de {nominaMonthLabel} ya está registrada este mes.</p>
        ) : null}

        {canTogglePatrimony ? (
          <div className={styles.patrimonyRow}>
            <div className={styles.patrimonyText}>
              <span className={styles.patrimonyTitle}>Afecta a mi patrimonio</span>
              <span className={styles.patrimonyHint}>
                Desactívalo para registrar un gasto pasado sin descontarlo de tus cuentas.
              </span>
            </div>
            <Switch
              checked={affectsPatrimony}
              onChange={togglePatrimony}
              label="Afecta a mi patrimonio"
            />
          </div>
        ) : null}

        {showAccountPicker ? (
          <Field label="Cuenta (opcional)">
            <ChipGroup label="Cuenta">
              {accounts.map((acc) => (
                <Chip
                  key={acc.id}
                  selected={accountId === acc.id}
                  dotColor={acc.color}
                  onClick={() => selectAccount(acc.id)}
                >
                  {acc.name}
                </Chip>
              ))}
            </ChipGroup>
            {selectedAccount && selectedAccount.buckets.length > 1 ? (
              <ChipGroup label="Sub-saldo" className={styles.buckets}>
                {selectedAccount.buckets.map((bucket) => (
                  <Chip
                    key={bucket._id}
                    selected={bucketId === bucket._id}
                    onClick={() =>
                      setBucketId((id) => (id === bucket._id ? null : bucket._id))
                    }
                  >
                    {bucket.name}
                  </Chip>
                ))}
              </ChipGroup>
            ) : null}
          </Field>
        ) : null}

        <div className={styles.row}>
          <Field label="Fecha" htmlFor="tx-date" className={styles.grow}>
            <TextInput
              id="tx-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>

        <Field label={kind === 'ingreso' ? 'Origen (opcional)' : 'Nota (opcional)'} htmlFor="tx-note">
          <TextInput
            id="tx-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              kind === 'ingreso'
                ? 'p. ej. Nómina'
                : kind === 'movimiento'
                  ? 'p. ej. Traspaso a ahorro'
                  : 'p. ej. Súper'
            }
            maxLength={120}
          />
        </Field>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="accent" block loading={saving}>
          {kind === 'gasto'
            ? 'Guardar gasto'
            : kind === 'ingreso'
              ? 'Guardar ingreso'
              : 'Guardar movimiento'}
        </Button>
      </form>
    </BottomSheet>
  );
}
