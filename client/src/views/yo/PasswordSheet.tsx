import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { ApiError } from '../../lib/api';
import { BottomSheet, Button, Field, TextInput } from '../../ui';
import styles from './index.module.css';

/** Longitud mínima de la contraseña nueva (espejo de `passwordSchema` en el backend). */
const MIN_LENGTH = 8;

/** Traduce el código de error del backend a un mensaje para el usuario. */
function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.message) {
      case 'invalid_password':
        return 'La contraseña actual no es correcta.';
      case 'same_password':
        return 'La nueva contraseña debe ser distinta de la actual.';
      case 'validation_error':
        return `La nueva contraseña debe tener al menos ${MIN_LENGTH} caracteres.`;
      case 'unauthorized':
        return 'Tu sesión ha caducado. Vuelve a entrar.';
    }
  }
  return 'No se pudo cambiar la contraseña.';
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
}

/** Campo de contraseña con interruptor Mostrar/Ocultar (escribir a ciegas en móvil es hostil). */
function PasswordField({ id, label, value, onChange, autoComplete, hint }: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className={styles.passwordWrap}>
        <TextInput
          id={id}
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          maxLength={200}
          className={styles.passwordInput}
        />
        <button
          type="button"
          className={styles.reveal}
          onClick={() => setRevealed((v) => !v)}
          aria-pressed={revealed}
          aria-label={revealed ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
        >
          {revealed ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
    </Field>
  );
}

interface PasswordSheetProps {
  open: boolean;
  onClose: () => void;
  /** Se llama tras un cambio correcto (la tarjeta cierra la hoja y confirma). */
  onSuccess: () => void;
}

/** Hoja "Cambiar contraseña": actual + nueva + repetición. */
export function PasswordSheet({ open, onClose, onSuccess }: PasswordSheetProps) {
  const { changePassword } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nunca dejar contraseñas en memoria de un formulario reabierto.
  useEffect(() => {
    if (open) return;
    setCurrent('');
    setNext('');
    setRepeat('');
    setSaving(false);
    setError(null);
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!current) {
      setError('Escribe tu contraseña actual.');
      return;
    }
    if (next.length < MIN_LENGTH) {
      setError(`La nueva contraseña debe tener al menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (next === current) {
      setError('La nueva contraseña debe ser distinta de la actual.');
      return;
    }
    if (next !== repeat) {
      setError('Las dos contraseñas nuevas no coinciden.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await changePassword(current, next);
      onSuccess();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Cambiar contraseña">
      <form className={styles.sheetForm} onSubmit={handleSubmit}>
        <PasswordField
          id="pwd-current"
          label="Contraseña actual"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
        />
        <PasswordField
          id="pwd-new"
          label="Nueva contraseña"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          hint={`Mínimo ${MIN_LENGTH} caracteres.`}
        />
        <PasswordField
          id="pwd-repeat"
          label="Repite la nueva contraseña"
          value={repeat}
          onChange={setRepeat}
          autoComplete="new-password"
        />

        {error ? (
          <p className={styles.sheetError} role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="accent" block loading={saving}>
          Cambiar contraseña
        </Button>
      </form>
    </BottomSheet>
  );
}
