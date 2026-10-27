import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { bpToPctInput, parseInputToCents, pctInputToBp } from '../../lib/money';
import { useData } from '../../data/RefreshContext';
import type { Account, Bucket, BucketKind } from '../../lib/types';
import { BottomSheet, Button, Field, NumberInput, Segmented, TextInput } from '../../ui';
import { BUCKET_KINDS, centsToInput } from './helpers';
import styles from './sheets.module.css';

/** Retención por defecto en España sobre intereses (IRPF, capital mobiliario). */
const DEFAULT_WITHHOLDING_BPS = 1900;

interface BucketSheetProps {
  open: boolean;
  /** Cuenta a la que pertenece el sub-saldo. */
  account: Account | null;
  /** Sub-saldo a editar; `null` = crear uno nuevo. */
  bucket: Bucket | null;
  onClose: () => void;
}

/**
 * Hoja única para los sub-saldos: crea uno nuevo o edita nombre + balance de uno
 * existente. Permite borrar solo si la cuenta tiene más de un sub-saldo (una cuenta
 * simple = 1 bucket; para vaciarla del todo se borra la cuenta entera).
 */
export function BucketSheet({ open, account, bucket, onClose }: BucketSheetProps) {
  const { refresh } = useData();

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<BucketKind>('cash');
  const [rate, setRate] = useState('');
  const [withholding, setWithholding] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(bucket?.name ?? '');
    setAmount(bucket ? centsToInput(bucket.balanceCents) : '');
    setKind(bucket?.kind ?? 'cash');
    setRate(bucket?.rateBps ? bpToPctInput(bucket.rateBps) : '');
    // Al estrenar un remunerado se propone la retención española (19 %); si el
    // banco abona en bruto, se pone a 0 y el estimador deja de descontarla.
    setWithholding(
      bucket?.withholdingBps !== undefined
        ? bpToPctInput(bucket.withholdingBps)
        : bpToPctInput(DEFAULT_WITHHOLDING_BPS),
    );
    setSaving(false);
    setDeleting(false);
    setConfirmDelete(false);
    setError(null);
  }, [open, bucket]);

  if (!account) return null;

  const isEdit = bucket !== null;
  const canDelete = isEdit && account.buckets.length > 1;
  const kindHint = BUCKET_KINDS.find((k) => k.value === kind)?.hint ?? '';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!account) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Ponle un nombre al sub-saldo.');
      return;
    }
    const balanceCents = parseInputToCents(amount); // se permiten saldos negativos

    // El tipo y la retención solo viajan si el sub-saldo es remunerado; al dejar
    // de serlo se envía `null` para limpiarlos (el backend también lo fuerza).
    const rateBps = kind === 'savings' ? pctInputToBp(rate) : 0;
    if (kind === 'savings' && rateBps === 0) {
      setError('Pon el tipo anual (%) del sub-saldo remunerado.');
      return;
    }
    const rateFields =
      kind === 'savings'
        ? { rateBps, withholdingBps: pctInputToBp(withholding) }
        : { rateBps: null, withholdingBps: null };

    setSaving(true);
    setError(null);
    try {
      if (bucket) {
        await api.patch(`/accounts/${account.id}/buckets/${bucket._id}`, {
          name: trimmed,
          balanceCents,
          kind,
          ...rateFields,
        });
      } else {
        await api.post(`/accounts/${account.id}/buckets`, {
          name: trimmed,
          balanceCents,
          kind,
          // En el alta no se admite `null`: se omiten si no es remunerado.
          ...(kind === 'savings' ? rateFields : {}),
        });
      }
      refresh();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el sub-saldo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!account || !bucket) return;
    setDeleting(true);
    setError(null);
    try {
      await api.del(`/accounts/${account.id}/buckets/${bucket._id}`);
      refresh();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo borrar el sub-saldo.');
      setDeleting(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={isEdit ? 'Editar sub-saldo' : 'Nuevo sub-saldo'}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <Field label="Nombre" htmlFor="bucket-name">
          <TextInput
            id="bucket-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="p. ej. Sueldo base, Inversión"
            maxLength={60}
            /* Foco inicial (solo al crear): lo da `BottomSheet` al terminar la entrada. */
            data-autofocus={!isEdit || undefined}
          />
        </Field>

        <Field label="Saldo" htmlFor="bucket-amount" hint="Ajústalo a mano para reconciliar.">
          <NumberInput
            id="bucket-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
          />
        </Field>

        <Field label="Tipo de sub-saldo">
          <Segmented
            label="Tipo de sub-saldo"
            options={BUCKET_KINDS.map((k) => ({ value: k.value, label: k.label }))}
            value={kind}
            onChange={setKind}
          />
          <p className={styles.subhint}>{kindHint}</p>
        </Field>

        {kind === 'savings' ? (
          <div className={styles.section}>
            <div className={styles.row}>
              <Field
                label="Tipo anual (%)"
                htmlFor="bucket-rate"
                className={styles.grow}
                hint="Nominal, no TAE."
              >
                <NumberInput
                  id="bucket-rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="3"
                />
              </Field>
              <Field
                label="Retención (%)"
                htmlFor="bucket-withholding"
                className={styles.grow}
                hint="0 si te abonan en bruto."
              >
                <NumberInput
                  id="bucket-withholding"
                  value={withholding}
                  onChange={(e) => setWithholding(e.target.value)}
                  placeholder="19"
                />
              </Field>
            </div>
            <p className={styles.subhint}>
              Kobo estima el interés (saldo × tipo × días/365) para prefijar el abono, pero el
              saldo solo cambia cuando confirmas la liquidación real de tu banco.
            </p>
          </div>
        ) : null}

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="accent" block loading={saving}>
          {isEdit ? 'Guardar saldo' : 'Añadir sub-saldo'}
        </Button>

        {isEdit ? (
          <div className={styles.danger}>
            {!canDelete ? (
              <p className={styles.empty}>
                Es el único sub-saldo de la cuenta. Para eliminarlo, borra la cuenta entera.
              </p>
            ) : confirmDelete ? (
              <div className={styles.confirm}>
                <p className={styles.confirmText}>
                  Se borrará <strong>{bucket?.name}</strong> y su saldo dejará de sumar al
                  patrimonio.
                </p>
                <div className={styles.confirmActions}>
                  <Button type="button" variant="quiet" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </Button>
                  <Button type="button" variant="accent" loading={deleting} onClick={handleDelete}>
                    Borrar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className={styles.dangerBtn}
                onClick={() => setConfirmDelete(true)}
              >
                Borrar sub-saldo
              </Button>
            )}
          </div>
        ) : null}
      </form>
    </BottomSheet>
  );
}
