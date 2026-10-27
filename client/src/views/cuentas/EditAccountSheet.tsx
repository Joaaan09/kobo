import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { useData } from '../../data/RefreshContext';
import type { Account } from '../../lib/types';
import { BottomSheet, Button, Field, TextInput } from '../../ui';
import { ACCOUNT_COLORS } from './helpers';
import { ColorPicker } from './ColorPicker';
import styles from './sheets.module.css';

interface EditAccountSheetProps {
  open: boolean;
  account: Account | null;
  onClose: () => void;
}

/** Hoja para renombrar, recolorear o borrar una cuenta. */
export function EditAccountSheet({ open, account, onClose }: EditAccountSheetProps) {
  const { refresh } = useData();

  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(ACCOUNT_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Precarga los valores de la cuenta al abrir.
  useEffect(() => {
    if (!open || !account) return;
    setName(account.name);
    setColor(account.color ?? ACCOUNT_COLORS[0]);
    setSaving(false);
    setDeleting(false);
    setConfirmDelete(false);
    setError(null);
  }, [open, account]);

  if (!account) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!account) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('El nombre no puede quedar vacío.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/accounts/${account.id}`, { name: trimmed, color });
      refresh();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la cuenta.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!account) return;
    setDeleting(true);
    setError(null);
    try {
      await api.del(`/accounts/${account.id}`);
      refresh();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo borrar la cuenta.');
      setDeleting(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Editar cuenta">
      <form className={styles.form} onSubmit={handleSubmit}>
        <Field label="Nombre" htmlFor="edit-acc-name">
          <TextInput
            id="edit-acc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
        </Field>

        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="accent" block loading={saving}>
          Guardar cambios
        </Button>

        <div className={styles.danger}>
          {confirmDelete ? (
            <div className={styles.confirm}>
              <p className={styles.confirmText}>
                Se borrará <strong>{account.name}</strong> y todos sus sub-saldos. No se puede
                deshacer.
              </p>
              <div className={styles.confirmActions}>
                <Button type="button" variant="quiet" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </Button>
                <Button type="button" variant="accent" loading={deleting} onClick={handleDelete}>
                  Borrar cuenta
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
              Borrar cuenta
            </Button>
          )}
        </div>
      </form>
    </BottomSheet>
  );
}
