import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { parseInputToCents, bpToPctInput } from '../../lib/money';
import { today } from '../../lib/month';
import { useData } from '../../data/RefreshContext';
import type { Account, Bucket, NewValuation, ValuationContext } from '../../lib/types';
import { BottomSheet, Button, Field, Money, NumberInput, Spinner, TextInput } from '../../ui';
import { centsToInput } from './helpers';
import styles from './sheets.module.css';

interface ValuationSheetProps {
  open: boolean;
  account: Account | null;
  bucket: Bucket | null;
  onClose: () => void;
}

/** Fecha corta en Madrid: `"3 ago"`. */
const shortDateFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: 'numeric',
  month: 'short',
});
const shortDate = (iso: string) => shortDateFmt.format(new Date(iso)).replace('.', '');

/** Traduce los errores del borde a algo que se entienda en la mano. */
function messageFor(err: unknown): string {
  if (!(err instanceof ApiError)) return 'No se pudo guardar.';
  switch (err.message) {
    case 'no_change':
      return 'El valor no ha cambiado: no hay nada que registrar.';
    case 'bucket_not_found':
      return 'El sub-saldo ya no existe.';
    case 'valuation_failed':
      return 'No se pudo aplicar al saldo. Inténtalo otra vez.';
    default:
      return 'No se pudo guardar.';
  }
}

/**
 * Hoja de rendimiento (評価). Dos caras del mismo evento, según el sub-saldo:
 *
 * - **Inversión** — preguntamos **cuánto vale ahora**, no cuánto ha subido. El
 *   servidor calcula el delta contra el saldo real, así que la aportación que ya
 *   registraste como movimiento **no** se cuela como rendimiento tuyo.
 * - **Remunerado** — preguntamos **cuánto te han abonado**, con la estimación
 *   (saldo × tipo × días/365, menos retención) ya prefijada. Manda el extracto.
 *
 * En ningún caso esto es un ingreso: no toca el presupuesto ni el ritmo del mes.
 */
export function ValuationSheet({ open, account, bucket, onClose }: ValuationSheetProps) {
  const { refresh } = useData();

  const [ctx, setCtx] = useState<ValuationContext | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<string>(today());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInvestment = bucket?.kind === 'investment';

  // Carga el contexto al abrir: saldo real, aportaciones desde la última
  // valoración y estimación de intereses (todo calculado en el servidor).
  useEffect(() => {
    if (!open || !account || !bucket) return;
    let alive = true;
    setCtx(null);
    setAmount('');
    setDate(today());
    setSaving(false);
    setError(null);

    void (async () => {
      try {
        const data = await api.get<ValuationContext>(
          `/valuations/context?accountId=${account.id}&bucketId=${bucket._id}`,
        );
        if (!alive) return;
        setCtx(data);
        // Inversión: partimos del valor registrado (lo edita a lo que vale hoy).
        // Remunerado: partimos del neto estimado (lo corrige con su extracto).
        setAmount(
          bucket.kind === 'investment'
            ? centsToInput(data.balanceCents)
            : data.estimate
              ? centsToInput(data.estimate.netCents)
              : '',
        );
      } catch (err) {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar el sub-saldo.');
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, account, bucket]);

  if (!account || !bucket) return null;

  const typed = parseInputToCents(amount);
  // Rendimiento que se va a registrar, en vivo: en inversión es la diferencia
  // contra el saldo; en remunerado es el propio abono.
  const deltaCents = ctx ? (isInvestment ? typed - ctx.balanceCents : typed) : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!account || !bucket || !ctx) return;

    if (deltaCents === 0) {
      setError(
        isInvestment
          ? 'El valor es el mismo que ya tenías registrado.'
          : 'Pon el importe que te han abonado.',
      );
      return;
    }

    const payload: NewValuation = {
      accountId: account.id,
      bucketId: bucket._id,
      date,
      kind: isInvestment ? 'revalorizacion' : 'interes',
      ...(isInvestment ? { targetCents: typed } : { deltaCents: typed }),
      // El bruto solo se guarda si el abono es exactamente el estimado; si lo
      // corrige a mano no sabemos qué retención le aplicaron de verdad.
      ...(!isInvestment && ctx.estimate && typed === ctx.estimate.netCents
        ? { grossCents: ctx.estimate.grossCents }
        : {}),
    };

    setSaving(true);
    setError(null);
    try {
      await api.post('/valuations', payload);
      refresh();
      onClose();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSaving(false);
    }
  }

  const title = isInvestment ? 'Actualizar valor' : 'Registrar intereses';

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {!ctx ? (
        <div className={styles.loading}>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : (
            <Spinner />
          )}
        </div>
      ) : (
        <form className={styles.form} onSubmit={handleSubmit}>
          <p className={styles.subhint}>
            {account.name} · {bucket.name}
          </p>

          {isInvestment ? (
            <>
              <div className={styles.factRow}>
                <span className={styles.factLabel}>Valor registrado</span>
                <Money cents={ctx.balanceCents} className={styles.factValue} />
              </div>
              {ctx.contributedSinceCents !== 0 ? (
                <div className={styles.factRow}>
                  <span className={styles.factLabel}>
                    {ctx.lastValuationAt
                      ? `Aportado desde el ${shortDate(ctx.lastValuationAt)}`
                      : 'Aportado hasta ahora'}
                  </span>
                  <Money cents={ctx.contributedSinceCents} className={styles.factValue} />
                </div>
              ) : null}

              <Field
                label="¿Cuánto vale ahora?"
                htmlFor="val-amount"
                hint="Lo que ves hoy en tu banco o bróker."
              >
                <NumberInput
                  id="val-amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                  data-autofocus
                />
              </Field>

              <div className={styles.factRow}>
                <span className={styles.factLabel}>Rendimiento</span>
                <Money cents={deltaCents} className={styles.factStrong} />
              </div>

              {ctx.contributedSinceCents === 0 ? (
                <p className={styles.subhint}>
                  Si has aportado dinero desde la última vez, regístralo antes como movimiento:
                  si no, esa aportación se contará como rendimiento tuyo.
                </p>
              ) : (
                <p className={styles.subhint}>
                  Tus aportaciones ya están descontadas: esto es solo lo que ha rendido el dinero.
                </p>
              )}
            </>
          ) : (
            <>
              {ctx.estimate ? (
                <>
                  <div className={styles.factRow}>
                    <span className={styles.factLabel}>
                      Estimado · {ctx.estimate.days}{' '}
                      {ctx.estimate.days === 1 ? 'día' : 'días'} al{' '}
                      {bpToPctInput(ctx.estimate.rateBps)} %
                    </span>
                    <Money cents={ctx.estimate.grossCents} className={styles.factValue} />
                  </div>
                  {ctx.estimate.withheldCents > 0 ? (
                    <div className={styles.factRow}>
                      <span className={styles.factLabel}>
                        Retención {bpToPctInput(ctx.estimate.withholdingBps)} %
                      </span>
                      <Money cents={-ctx.estimate.withheldCents} className={styles.factValue} />
                    </div>
                  ) : null}
                </>
              ) : (
                <p className={styles.subhint}>
                  Todavía no hay intereses estimados para este periodo. Registra lo que te haya
                  abonado tu banco.
                </p>
              )}

              <Field
                label="¿Cuánto te han abonado?"
                htmlFor="val-amount"
                hint="El importe de tu extracto: es el que manda."
              >
                <NumberInput
                  id="val-amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                  data-autofocus
                />
              </Field>
            </>
          )}

          <Field label="Fecha" htmlFor="val-date">
            <TextInput
              id="val-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="accent" block loading={saving}>
            {isInvestment ? 'Guardar valor' : 'Registrar abono'}
          </Button>

          <p className={styles.subhint}>
            El rendimiento mueve tu patrimonio, pero no es un ingreso: no toca el presupuesto del
            mes ni el ritmo de gasto.
          </p>
        </form>
      )}
    </BottomSheet>
  );
}
