import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { cx } from '../../lib/cx';
import { parseInputToCents } from '../../lib/money';
import { useData } from '../../data/RefreshContext';
import {
  BottomSheet,
  Button,
  Field,
  IconClose,
  IconButton,
  IconPlus,
  NumberInput,
  TextInput,
} from '../../ui';
import { ACCOUNT_COLORS } from './helpers';
import { ColorPicker } from './ColorPicker';
import styles from './sheets.module.css';

interface AddAccountSheetProps {
  open: boolean;
  onClose: () => void;
}

/** Fila del editor de sub-saldos. `key` estable para no reusar el índice al borrar. */
interface BucketRow {
  key: number;
  name: string;
  amount: string;
}

/** Tope de sub-saldos por cuenta (el mismo que valida `accountCreateSchema`). */
const MAX_BUCKETS = 20;

const emptyRow = (key: number): BucketRow => ({ key, name: '', amount: '' });

/** Hoja para crear una cuenta: nombre, color y sus sub-saldos iniciales (opcionales). */
export function AddAccountSheet({ open, onClose }: AddAccountSheetProps) {
  const { refresh } = useData();

  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(ACCOUNT_COLORS[0]);
  const [rows, setRows] = useState<BucketRow[]>([emptyRow(0)]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextKey = useRef(1);
  const focusKey = useRef<number | null>(null);

  // Reinicia el formulario cada vez que se abre.
  useEffect(() => {
    if (!open) return;
    setName('');
    setColor(ACCOUNT_COLORS[0]);
    setRows([emptyRow(0)]);
    nextKey.current = 1;
    setSaving(false);
    setError(null);
  }, [open]);

  function updateRow(key: number, patch: Partial<BucketRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => {
      if (prev.length >= MAX_BUCKETS) return prev;
      const key = nextKey.current++;
      focusKey.current = key; // el input nuevo se enfoca al montarse
      return [...prev, emptyRow(key)];
    });
  }

  function removeRow(key: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Ponle un nombre a la cuenta.');
      return;
    }

    // Los sub-saldos son opcionales: cuenta la fila que tenga nombre o importe.
    const filled = rows
      .map((r) => ({ name: r.name.trim(), cents: parseInputToCents(r.amount) }))
      .filter((r) => r.name !== '' || r.cents !== 0);

    // Con una sola fila sin nombre se hereda el de la cuenta (cuenta simple);
    // con varias, cada sub-saldo necesita nombre propio para distinguirlos.
    if (filled.length > 1 && filled.some((r) => r.name === '')) {
      setError('Ponle nombre a cada sub-saldo.');
      return;
    }
    const buckets = filled.map((r) => ({
      name: r.name || trimmed,
      balanceCents: r.cents,
    }));

    const names = buckets.map((b) => b.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      setError('Hay sub-saldos con el mismo nombre.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.post('/accounts', {
        name: trimmed,
        color,
        ...(buckets.length > 0 ? { buckets } : {}),
      });
      refresh();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la cuenta.');
    } finally {
      setSaving(false);
    }
  }

  const multi = rows.length > 1;

  return (
    <BottomSheet open={open} onClose={onClose} title="Nueva cuenta">
      <form className={styles.form} onSubmit={handleSubmit}>
        <Field label="Nombre" htmlFor="acc-name">
          <TextInput
            id="acc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="p. ej. BBVA, Efectivo, Broker"
            maxLength={60}
            /* Foco inicial: lo da `BottomSheet` al terminar la entrada (ver allí). */
            data-autofocus
          />
        </Field>

        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>

        <div className={styles.section}>
          <p className={styles.subhead}>Sub-saldos (opcional)</p>

          {/* Cabecera de columnas: una sola vez, las filas van con aria-label. */}
          <div
            className={cx(styles.bucketHead, multi && styles.withRemove)}
            aria-hidden="true"
          >
            <span>Nombre</span>
            <span>Saldo</span>
            {multi ? <span /> : null}
          </div>

          {rows.map((row, i) => (
            <div className={cx(styles.bucketRow, multi && styles.withRemove)} key={row.key}>
              <TextInput
                ref={(el) => {
                  if (el && focusKey.current === row.key) {
                    focusKey.current = null;
                    el.focus();
                  }
                }}
                className={styles.cell}
                value={row.name}
                onChange={(e) => updateRow(row.key, { name: e.target.value })}
                placeholder={i === 0 ? 'p. ej. General' : 'p. ej. Inversión'}
                maxLength={60}
                aria-label={`Nombre del sub-saldo ${i + 1}`}
              />
              <NumberInput
                className={styles.cell}
                value={row.amount}
                onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                placeholder="0,00"
                aria-label={`Saldo del sub-saldo ${i + 1}`}
              />
              {multi ? (
                <IconButton
                  label={`Quitar sub-saldo ${row.name.trim() || i + 1}`}
                  variant="quiet"
                  className={styles.rowRemove}
                  onClick={() => removeRow(row.key)}
                >
                  <IconClose size={18} />
                </IconButton>
              ) : null}
            </div>
          ))}

          {rows.length < MAX_BUCKETS ? (
            <Button
              type="button"
              variant="quiet"
              className={styles.addRow}
              onClick={addRow}
            >
              <IconPlus size={18} />
              Añadir sub-saldo
            </Button>
          ) : null}

          <p className={styles.subhint}>
            Si lo dejas vacío, la cuenta empieza con un sub-saldo a cero. Usa varios para separar
            dentro del mismo banco (p. ej. Corriente · Remunerada · Fondos).
          </p>
        </div>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="accent" block loading={saving}>
          Crear cuenta
        </Button>
      </form>
    </BottomSheet>
  );
}
