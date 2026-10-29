import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useData } from '../../data/RefreshContext';
import { parseInputToCents } from '../../lib/money';
import {
  addMonths,
  cycleBounds,
  cycleStartDay,
  currentMonth,
  monthName,
  NAME_BY_NEXT_MONTH_FROM_DAY,
  setCycleChanges,
  shortDay,
  today,
} from '../../lib/month';
import type { Account, IncomeConfig } from '../../lib/types';
import { Button, Chip, ChipGroup, Eyebrow, Money, NumberInput, Segmented, Spinner } from '../../ui';
import { BlockRow, Group, Hairline, Row } from './SettingsGroup';
import styles from './index.module.css';

type IncomeType = 'fija' | 'variable';

/** Cuándo empieza el mes de Kobo: el día 1 o el día que entra la nómina. */
type CycleMode = 'natural' | 'cobro';
/** Desde qué mes rige un cambio de inicio de mes. */
type CycleFrom = 'este' | 'siguiente';

/** Céntimos → texto editable en euros ("245000" → "2.450,00"). */
function centsToEuroInput(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Normaliza el día de ingreso al rango válido [1, 31]. */
function clampDay(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(31, Math.max(1, Math.trunc(value)));
}

/** 給料 · Nómina — tipo, importe (en céntimos) y día de ingreso. */
export function NominaCard() {
  const { refresh } = useData();
  // `undefined` = cargando · `null` = sin configurar · objeto = configurada.
  const [config, setConfig] = useState<IncomeConfig | null | undefined>(undefined);
  const [type, setType] = useState<IncomeType>('fija');
  const [amountText, setAmountText] = useState('');
  const [dayText, setDayText] = useState('1');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [bucketId, setBucketId] = useState<string | null>(null);
  const [cycleMode, setCycleMode] = useState<CycleMode>('natural');
  const [cycleFrom, setCycleFrom] = useState<CycleFrom>('este');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .get<IncomeConfig | null>('/income-config')
      .then((data) => {
        if (!alive) return;
        setConfig(data ?? null);
        if (data) {
          setType(data.type);
          setAmountText(centsToEuroInput(data.amountCents));
          setDayText(String(data.payDay));
          setAccountId(data.defaultAccountId ?? null);
          setBucketId(data.defaultBucketId ?? null);
          setCycleChanges(data.cycleChanges);
          setCycleMode(cycleStartDay(currentMonth()) === 1 ? 'natural' : 'cobro');
        }
      })
      .catch(() => {
        if (alive) setConfig(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Cuentas para elegir el destino de la nómina.
  useEffect(() => {
    let alive = true;
    api
      .get<Account[]>('/accounts')
      .then((data) => {
        if (alive) setAccounts(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (alive) setAccounts([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;

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

  const amountCents = parseInputToCents(amountText);
  const payDay = clampDay(Number.parseInt(dayText, 10));

  // Inicio de mes deseado: el día de cobro (como mucho el 28: del 29 al 31 no
  // existen en todos los meses y el ciclo tiene que empezar cada mes).
  const desiredStartDay = cycleMode === 'natural' ? 1 : Math.min(payDay, 28);
  // Desde qué mes NATURAL rige (el anterior se alarga o acorta solo). Las opciones
  // llevan el nombre del mes: "este mes" sería ambiguo con el ciclo en curso.
  const thisCal = today().slice(0, 7);
  const nextCal = addMonths(thisCal, 1);
  const fromKey = cycleFrom === 'este' ? thisCal : nextCal;
  const cycleChanged = desiredStartDay !== cycleStartDay(fromKey);
  // La fila "Aplicar desde" se queda mientras la elección afecte a alguno de los
  // dos meses (si no, desaparecería al elegir el mes en que ya está programado).
  const showFrom =
    desiredStartDay !== cycleStartDay(thisCal) || desiredStartDay !== cycleStartDay(nextCal);
  // Cambio ya programado para el mes que viene (guardado antes): se dice.
  const scheduled =
    cycleStartDay(nextCal) !== cycleStartDay(thisCal) ? cycleStartDay(nextCal) : null;
  const current = cycleBounds(currentMonth());

  async function handleSave() {
    // Si eligió cuenta pero la cuenta tiene varios sub-saldos, exige elegir uno.
    if (accountId && !bucketId) {
      setError('Elige el sub-saldo de la cuenta de ingreso.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const linked = Boolean(accountId && bucketId);
      await api.put('/income-config', {
        type,
        amountCents,
        payDay,
        effectiveFrom: new Date().toISOString(),
        // Enviamos siempre el destino: valor si está enlazado, null para desvincular.
        defaultAccountId: linked ? accountId : null,
        defaultBucketId: linked ? bucketId : null,
        // Solo si cambia: el servidor lo añade como tramo y no reescribe el pasado.
        cycle: cycleChanged ? { startDay: desiredStartDay, from: fromKey } : undefined,
      });
      // El ciclo vive en la config: se relee para que cabecera y vistas cambien ya.
      const saved = await api.get<IncomeConfig | null>('/income-config');
      setCycleChanges(saved?.cycleChanges);
      setStatus('Nómina guardada.');
      setConfig(saved ?? null);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la nómina.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="yo-nomina">
      <Eyebrow kanji="給料" id="yo-nomina" className={styles.eyebrowIndent}>
        Nómina
      </Eyebrow>

      {config === undefined ? (
        <Group>
          <div className={styles.cardLoading}>
            <Spinner label="Cargando…" />
          </div>
        </Group>
      ) : (
        <Group>
          <Row title="Tipo" sub={type === 'fija' ? 'Fija cada mes' : 'Variable cada mes'}>
            <div className={styles.segShort}>
              <Segmented<IncomeType>
                label="Tipo de nómina"
                value={type}
                onChange={setType}
                options={[
                  { value: 'fija', label: 'Fija' },
                  { value: 'variable', label: 'Variable' },
                ]}
              />
            </div>
          </Row>
          <Hairline />

          <Row title="Importe" htmlFor="nomina-importe" sub={<Money cents={amountCents} />}>
            <NumberInput
              id="nomina-importe"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              placeholder="0,00"
              aria-label="Importe de la nómina en euros"
              style={{ width: 148, textAlign: 'right' }}
            />
          </Row>
          <Hairline />

          <Row title="Día de ingreso" htmlFor="nomina-dia">
            <NumberInput
              id="nomina-dia"
              inputMode="numeric"
              value={dayText}
              onChange={(e) => setDayText(e.target.value)}
              aria-label="Día de ingreso, del 1 al 31"
              style={{ width: 76, textAlign: 'center' }}
            />
          </Row>
          <Hairline />

          {/* Inicio del mes (DESIGN.md §17.10): si cobras el 25, tu mes de verdad
              va del 25 al 24, y así lo mide todo Kobo (presupuesto, ritmo, meses). */}
          <BlockRow
            title="Inicio del mes"
            sub={`${
              cycleStartDay(currentMonth()) === 1
                ? 'Ahora: mes natural, del día 1 al último'
                : `Ahora: ${monthName(currentMonth())} va del ${shortDay(current.firstDay)} al ${shortDay(current.lastDay)}`
            }${
              scheduled !== null
                ? `. Programado: desde ${monthName(nextCal).toLowerCase()}, ${scheduled === 1 ? 'mes natural' : `el día ${scheduled}`}`
                : ''
            }`}
          >
            <Segmented<CycleMode>
              label="Inicio del mes"
              value={cycleMode}
              onChange={setCycleMode}
              options={[
                { value: 'natural', label: 'Día 1' },
                { value: 'cobro', label: `Día ${Math.min(payDay, 28)} · cobro` },
              ]}
            />
          </BlockRow>
          {showFrom ? (
            <BlockRow
              child
              title="Aplicar desde"
              sub={
                cycleChanged
                  ? `${monthName(fromKey)} empezará el ${shortDay(
                      `${desiredStartDay >= NAME_BY_NEXT_MONTH_FROM_DAY ? addMonths(fromKey, -1) : fromKey}-${String(desiredStartDay).padStart(2, '0')}`,
                    )}. El mes anterior se alarga o acorta para que no quede ningún día suelto.`
                  : `Ya es así desde ${monthName(fromKey).toLowerCase()}.`
              }
            >
              <Segmented<CycleFrom>
                label="Aplicar el nuevo inicio desde"
                value={cycleFrom}
                onChange={setCycleFrom}
                options={[
                  { value: 'este', label: monthName(thisCal) },
                  { value: 'siguiente', label: monthName(nextCal) },
                ]}
              />
            </BlockRow>
          ) : null}
          {payDay > 28 && cycleMode === 'cobro' ? (
            <p className={styles.noteRow}>
              Cobras el {payDay}, pero no todos los meses tienen ese día: tu mes empezará el 28.
            </p>
          ) : null}
          <Hairline />

          <div className={styles.pickerBlock}>
            <span className={styles.rowTitle}>Cuenta de ingreso</span>
            <span className={styles.rowSub}>Dónde te llega la nómina (opcional)</span>
            {accounts.length === 0 ? (
              <p className={styles.note}>Crea una cuenta en Cuentas para vincular la nómina.</p>
            ) : (
              <>
                <ChipGroup label="Cuenta de ingreso" className={styles.pickerChips}>
                  <Chip
                    selected={!accountId}
                    onClick={() => {
                      setAccountId(null);
                      setBucketId(null);
                    }}
                  >
                    Sin cuenta
                  </Chip>
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
                  <ChipGroup label="Sub-saldo" className={styles.pickerChips}>
                    {selectedAccount.buckets.map((bucket) => (
                      <Chip
                        key={bucket._id}
                        selected={bucketId === bucket._id}
                        onClick={() => setBucketId((id) => (id === bucket._id ? null : bucket._id))}
                      >
                        {bucket.name}
                      </Chip>
                    ))}
                  </ChipGroup>
                ) : null}
              </>
            )}
          </div>
          <Hairline />

          <div className={styles.footer}>
            <p className={styles.note}>
              {config === null
                ? 'Aún sin configurar. Se aplica desde el mes siguiente.'
                : 'Los cambios se aplican desde el mes siguiente.'}
            </p>
            <Button onClick={handleSave} loading={saving} disabled={amountCents <= 0}>
              Guardar
            </Button>
          </div>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <p className="visually-hidden" role="status" aria-live="polite">
            {status}
          </p>
        </Group>
      )}
    </section>
  );
}
