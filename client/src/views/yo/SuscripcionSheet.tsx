import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { useData } from '../../data/RefreshContext';
import { parseInputToCents } from '../../lib/money';
import { today } from '../../lib/month';
import type { Account, Category, Subcategory, Subscription } from '../../lib/types';
import {
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  Field,
  NumberInput,
  Segmented,
  Switch,
  TextInput,
} from '../../ui';
import { centsToEuroInput } from './categoryAssign';
import styles from './index.module.css';

type Frequency = Subscription['frequency'];

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Primer cargo desde `fromKey` (inclusive). Espejo de `firstOccurrence` del
 * backend (`subscriptionSchedule.ts`): el día pedido, acotado al último del mes.
 */
function firstCharge(frequency: Frequency, day: number, month: number, fromKey: string): string {
  const on = (y: number, m: number) => {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${y}-${pad2(m)}-${pad2(Math.min(day, last))}`;
  };
  const [y, m] = fromKey.split('-').map(Number);
  if (frequency === 'yearly') {
    const c = on(y, month);
    return c >= fromKey ? c : on(y + 1, month);
  }
  const c = on(y, m);
  if (c >= fromKey) return c;
  return m === 12 ? on(y + 1, 1) : on(y, m + 1);
}

/** Día 1..31 a partir del texto del input (0 = no válido). */
function parseDay(text: string): number {
  const n = Number.parseInt(text, 10);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : 0;
}

interface SuscripcionSheetProps {
  open: boolean;
  /** Suscripción a editar; `null` = alta. */
  subscription: Subscription | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Alta / edición de una suscripción (定期). Kobo apunta el cargo solo, como gasto
 * real, el día que toca: en su categoría (y subcategoría) y descontando de la
 * cuenta elegida.
 *
 * El primer cargo se propone a partir de hoy y nunca puede ser pasado: un cargo
 * retroactivo duplicaría lo que ya apuntaste a mano. Si este mes ya te lo
 * cobraron y lo tienes apuntado, mueve el primer cargo al mes que viene.
 */
export function SuscripcionSheet({ open, subscription, onClose, onSaved }: SuscripcionSheetProps) {
  const { refresh } = useData();
  const editing = subscription !== null;

  const [cats, setCats] = useState<Category[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [dayText, setDayText] = useState('');
  const [monthOfYear, setMonthOfYear] = useState<number>(1);
  const [nextDate, setNextDate] = useState('');
  // ¿Fijó el usuario la fecha a mano? En el alta, mientras no lo haga, se propone
  // con el día elegido; al editar, solo viaja al servidor si la tocó.
  const [userSetDate, setUserSetDate] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [bucketId, setBucketId] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const s = subscription;
    setName(s?.name ?? '');
    setAmount(s ? centsToEuroInput(s.amountCents) : '');
    setFrequency(s?.frequency ?? 'monthly');
    setDayText(s ? String(s.dayOfMonth) : '');
    setMonthOfYear(s?.monthOfYear ?? Number(today().slice(5, 7)));
    setNextDate(s?.nextChargeDate ?? '');
    setUserSetDate(false);
    setCategoryId(s?.categoryId ?? null);
    setSubcategoryId(s?.subcategoryId ?? null);
    setAccountId(s?.accountId ?? null);
    setBucketId(s?.bucketId ?? null);
    setActive(s?.active ?? true);
    setConfirmDelete(false);
    setError(null);
    void Promise.all([
      api.get<Category[]>('/categories').catch(() => [] as Category[]),
      api.get<Subcategory[]>('/subcategories').catch(() => [] as Subcategory[]),
      api.get<Account[]>('/accounts').catch(() => [] as Account[]),
    ]).then(([c, sc, a]) => {
      setCats(Array.isArray(c) ? c : []);
      setSubs(Array.isArray(sc) ? sc : []);
      setAccounts(Array.isArray(a) ? a : []);
    });
  }, [open, subscription]);

  const day = parseDay(dayText);
  const todayKey = today();
  const suggested = useMemo(
    () => (day ? firstCharge(frequency, day, monthOfYear, todayKey) : ''),
    [frequency, day, monthOfYear, todayKey],
  );

  // Alta: propuesta viva del próximo cargo hasta que el usuario fije la fecha.
  useEffect(() => {
    if (!editing && !userSetDate) setNextDate(suggested);
  }, [suggested, userSetDate, editing]);

  // Edición: cambiar el calendario sin tocar la fecha la deja en manos del servidor,
  // que recalcula el próximo cargo saltando el periodo ya cobrado.
  const scheduleChanged =
    editing &&
    (frequency !== subscription.frequency ||
      day !== subscription.dayOfMonth ||
      (frequency === 'yearly' && monthOfYear !== subscription.monthOfYear));

  const subsOfSelected = subs.filter((s) => s.categoryId === categoryId);
  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;
  const amountCents = parseInputToCents(amount);

  function pickAccount(id: string) {
    if (accountId === id) {
      setAccountId(null);
      setBucketId(null);
      return;
    }
    const account = accounts.find((a) => a.id === id) ?? null;
    setAccountId(id);
    setBucketId(account && account.buckets.length === 1 ? account.buckets[0]._id : null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Ponle un nombre (p. ej. Netflix).');
    if (amountCents <= 0) return setError('El importe tiene que ser mayor que 0.');
    if (!day) return setError('El día de cobro va del 1 al 31.');
    if (!categoryId) return setError('Elige en qué categoría se apunta.');
    if (accountId && !bucketId) return setError('Elige de qué sub-saldo sale el dinero.');
    // Solo si la fecha la pones tú: la guardada de una pausada puede ser pasada y la recalcula el servidor.
    if ((!editing || userSetDate) && nextDate && nextDate < todayKey) {
      return setError('El próximo cargo no puede ser pasado.');
    }

    const sendDate = Boolean(nextDate) && (!editing || userSetDate);

    setBusy(true);
    setError(null);
    try {
      const body = {
        name: trimmed,
        amountCents,
        frequency,
        dayOfMonth: day,
        monthOfYear: frequency === 'yearly' ? monthOfYear : editing ? null : undefined,
        categoryId,
        subcategoryId: subcategoryId ?? (editing ? null : undefined),
        accountId: accountId ?? (editing ? null : undefined),
        bucketId: accountId ? bucketId : editing ? null : undefined,
        nextChargeDate: sendDate ? nextDate : undefined,
        ...(editing ? { active } : {}),
      };
      if (editing) await api.patch(`/subscriptions/${subscription.id}`, body);
      else await api.post('/subscriptions', body);
      onSaved();
      // Si el primer cargo era hoy, ya está apuntado: el panel tiene que verlo.
      refresh();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la suscripción.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!subscription) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/subscriptions/${subscription.id}`);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo borrar la suscripción.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? 'Editar suscripción' : 'Nueva suscripción'}>
      <form className={styles.sheetForm} onSubmit={handleSubmit}>
        {subscription?.lastError ? (
          <p className={styles.sheetError} role="alert">
            Pausada sola: su categoría ya no existe. Elige otra y reactívala.
          </p>
        ) : null}

        <div className={styles.sheetRow}>
          <Field label="Nombre" htmlFor="sus-name" className={styles.grow}>
            <TextInput
              id="sus-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="p. ej. Netflix"
              maxLength={60}
            />
          </Field>
          <Field label="Importe" htmlFor="sus-amount">
            <div className={styles.assignInputWrap}>
              <NumberInput
                id="sus-amount"
                className={styles.subLimitInput}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
              <span className={styles.pctSuffix} aria-hidden>
                €
              </span>
            </div>
          </Field>
        </div>

        <Field label="Cada cuánto">
          <Segmented<Frequency>
            label="Frecuencia"
            value={frequency}
            onChange={setFrequency}
            options={[
              { value: 'monthly', label: 'Cada mes' },
              { value: 'yearly', label: 'Cada año' },
            ]}
          />
        </Field>

        {frequency === 'yearly' ? (
          <Field label="Mes del cargo">
            <ChipGroup label="Mes del cargo">
              {MONTHS.map((m, i) => (
                <Chip key={m} selected={monthOfYear === i + 1} onClick={() => setMonthOfYear(i + 1)}>
                  {m}
                </Chip>
              ))}
            </ChipGroup>
          </Field>
        ) : null}

        <div className={styles.sheetRow}>
          <Field
            label="Día de cobro"
            htmlFor="sus-day"
            hint={day > 28 ? 'En los meses cortos, el último día.' : undefined}
          >
            <NumberInput
              id="sus-day"
              inputMode="numeric"
              value={dayText}
              onChange={(e) => setDayText(e.target.value)}
              placeholder="1–31"
              style={{ width: 76, textAlign: 'center' }}
            />
          </Field>
          <Field label="Próximo cargo" htmlFor="sus-next" className={styles.grow}>
            <TextInput
              id="sus-next"
              type="date"
              value={nextDate}
              min={todayKey}
              onChange={(e) => {
                setNextDate(e.target.value);
                setUserSetDate(true);
              }}
            />
          </Field>
        </div>
        <p className={styles.fundHint}>
          {scheduleChanged && !userSetDate
            ? 'El próximo cargo se recalcula al guardar, sin repetir el de este periodo.'
            : nextDate === todayKey
            ? 'El cargo es hoy: se apunta al guardar.'
            : 'Si este periodo ya lo pagaste y lo tienes apuntado, pasa el próximo cargo al siguiente.'}
        </p>

        <Field label="Categoría">
          <ChipGroup label="Categoría">
            {cats.map((c) => (
              <Chip
                key={c.id}
                selected={categoryId === c.id}
                dotColor={c.color}
                onClick={() => {
                  setCategoryId(categoryId === c.id ? null : c.id);
                  setSubcategoryId(null);
                }}
              >
                {c.name}
              </Chip>
            ))}
          </ChipGroup>
          {categoryId && subsOfSelected.length > 0 ? (
            <ChipGroup label="Subcategoría">
              {subsOfSelected.map((s) => (
                <Chip
                  key={s.id}
                  selected={subcategoryId === s.id}
                  onClick={() => setSubcategoryId(subcategoryId === s.id ? null : s.id)}
                >
                  {s.name}
                </Chip>
              ))}
            </ChipGroup>
          ) : null}
        </Field>

        {accounts.length > 0 ? (
          <Field label="Cuenta (opcional)">
            <ChipGroup label="Cuenta">
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
            {selectedAccount && selectedAccount.buckets.length > 1 ? (
              <ChipGroup label="Sub-saldo">
                {selectedAccount.buckets.map((b) => (
                  <Chip
                    key={b._id}
                    selected={bucketId === b._id}
                    onClick={() => setBucketId(bucketId === b._id ? null : b._id)}
                  >
                    {b.name}
                  </Chip>
                ))}
              </ChipGroup>
            ) : null}
            <p className={styles.fundHint}>
              {accountId
                ? 'Cada cargo descuenta también de este saldo.'
                : 'Sin cuenta, cuenta en el presupuesto pero no toca el patrimonio.'}
            </p>
          </Field>
        ) : null}

        {editing ? (
          <div className={styles.sheetRow}>
            <span className={styles.grow}>
              <span className={styles.rowTitle}>Activa</span>
              <br />
              <span className={styles.rowSub}>
                {active ? 'Se apunta sola cada periodo' : 'En pausa: no se apunta nada'}
              </span>
            </span>
            <Switch checked={active} onChange={setActive} label="Suscripción activa" />
          </div>
        ) : null}

        {error ? (
          <p className={styles.sheetError} role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="accent" block loading={busy && !confirmDelete}>
          {editing ? 'Guardar' : 'Añadir suscripción'}
        </Button>

        {editing ? (
          confirmDelete ? (
            <div className={styles.subActions}>
              <Button type="button" variant="accent" loading={busy} onClick={() => void handleDelete()}>
                Sí, borrar
              </Button>
              <Button type="button" variant="quiet" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
              <span className={styles.fundHint}>Los cargos ya apuntados se quedan.</span>
            </div>
          ) : (
            <Button type="button" variant="ghost" block onClick={() => setConfirmDelete(true)}>
              Borrar suscripción
            </Button>
          )
        ) : null}
      </form>
    </BottomSheet>
  );
}
