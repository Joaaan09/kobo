import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import type { Account, ApiToken } from '../../lib/types';
import {
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  Field,
  IconButton,
  IconClose,
  TextInput,
} from '../../ui';
import styles from './index.module.css';

interface DispositivosSheetProps {
  open: boolean;
  tokens: ApiToken[];
  onClose: () => void;
  onChanged: () => void;
}

/** Fecha corta para "usado por última vez". */
function formatWhen(iso?: string): string {
  if (!iso) return 'sin usar todavía';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'sin usar todavía';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Motivo del último rechazo, en cristiano y accionable. Un código de error no le
 * dice a nadie qué tocar en el Atajo.
 */
const MOTIVO: Record<string, string> = {
  amount_required: 'el Atajo no mandó el importe',
  invalid_amount: 'el importe no se entendía',
  invalid_payload: 'el Atajo mandó algo que Kobo no entiende',
  refund_not_supported: 'era una devolución (apúntala como ingreso)',
  zero_amount: 'autorización de 0 €, no es un gasto',
  no_category: 'no había ninguna categoría donde ponerlo',
  revoked_token: 'este dispositivo está revocado',
  rate_limited: 'demasiados envíos seguidos',
};

/** ¿El último intento acabó mal? Solo alarma si el fallo es posterior al último acierto. */
function ultimoFallo(t: ApiToken): string | null {
  if (!t.lastFailureAt) return null;
  const fallo = new Date(t.lastFailureAt).getTime();
  if (Number.isNaN(fallo)) return null;
  const uso = t.lastUsedAt ? new Date(t.lastUsedAt).getTime() : 0;
  if (uso >= fallo) return null;
  const motivo = t.lastFailureReason ? (MOTIVO[t.lastFailureReason] ?? t.lastFailureReason) : '';
  return `Último pago rechazado (${formatWhen(t.lastFailureAt)})${motivo ? `: ${motivo}` : ''}`;
}

/**
 * Hoja de dispositivos: crea y revoca los **tokens de ingesta** que usa el Atajo
 * de iOS.
 *
 * El token en claro se enseña **una sola vez**, justo tras crearlo: el servidor
 * solo guarda su hash (§11). Si se pierde, se revoca y se crea otro; no hay
 * "volver a verlo". Enlazar una cuenta es opcional pero recomendable: es lo que
 * hace que el pago descuente también del patrimonio.
 */
export function DispositivosSheet({ open, tokens, onClose, onChanged }: DispositivosSheetProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [label, setLabel] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [bucketId, setBucketId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!open) return;
    setLabel('');
    setAccountId(null);
    setBucketId(null);
    setSecret(null);
    setCopied(false);
    setError(null);
    setStatus('');
    void api
      .get<Account[]>('/accounts')
      .then((list) => setAccounts(Array.isArray(list) ? list : []))
      .catch(() => setAccounts([]));
  }, [open]);

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;
  const endpoint = `${window.location.origin}/api/ingest/transaction`;

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

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) {
      setError('Ponle un nombre al dispositivo (p. ej. «iPhone · Visa»).');
      return;
    }
    // Una cuenta con varios sub-saldos necesita saber de cuál sale el dinero.
    if (accountId && !bucketId) {
      setError('Elige de qué sub-saldo sale el dinero de esta tarjeta.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<{ token: ApiToken; secret: string }>('/automation/tokens', {
        label: trimmed,
        accountId: accountId ?? undefined,
        bucketId: bucketId ?? undefined,
      });
      setSecret(created?.secret ?? null);
      setCopied(false);
      setLabel('');
      setAccountId(null);
      setBucketId(null);
      setStatus('Dispositivo creado.');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el dispositivo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(token: ApiToken) {
    setBusyId(token.id);
    setError(null);
    try {
      await api.del(`/automation/tokens/${token.id}`);
      setStatus('Dispositivo borrado.');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo borrar el dispositivo.');
    } finally {
      setBusyId(null);
    }
  }

  async function copy(text: string, onDone: () => void) {
    try {
      await navigator.clipboard.writeText(text);
      onDone();
    } catch {
      // Sin permiso de portapapeles (o sin HTTPS): el valor está visible para copiarlo a mano.
      setError('No se pudo copiar automáticamente. Cópialo a mano.');
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Dispositivos">
      <div className={styles.sheetForm}>
        <p className={styles.note}>
          Cada dispositivo es una llave que solo sirve para <strong>registrar gastos</strong>. No
          puede leer tus datos ni entrar en tu cuenta. Si pierdes el móvil, bórrala aquí.
        </p>

        {secret ? (
          <div className={styles.secretBox} role="alert">
            <p className={styles.subhead}>Copia este token ahora</p>
            <p className={styles.note}>
              Es la única vez que se muestra. Pégalo en el Atajo de iOS junto con la dirección de
              abajo.
            </p>
            <code className={styles.secretValue}>{secret}</code>
            <div className={styles.subActions}>
              <Button type="button" variant="quiet" onClick={() => void copy(secret, () => setCopied(true))}>
                {copied ? 'Copiado ✓' : 'Copiar token'}
              </Button>
            </div>
            <p className={styles.subhead}>Dirección</p>
            <code className={styles.secretValue}>{endpoint}</code>
            <div className={styles.subActions}>
              <Button
                type="button"
                variant="quiet"
                onClick={() => void copy(endpoint, () => setStatus('Dirección copiada.'))}
              >
                Copiar dirección
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSecret(null)}>
                Listo
              </Button>
            </div>
          </div>
        ) : null}

        <ul className={styles.subList}>
          {tokens.length === 0 ? (
            <li className={styles.subEmpty}>
              Aún no hay dispositivos. Crea el primero para conectar el Atajo.
            </li>
          ) : (
            tokens.map((t) => {
              const account = accounts.find((a) => a.id === t.accountId) ?? null;
              const bucket = account?.buckets.find((b) => b._id === t.bucketId) ?? null;
              const alerta = t.revokedAt ? null : ultimoFallo(t);
              return (
                <li key={t.id} className={styles.subRow}>
                  <div className={styles.tokenMain}>
                    <span className={styles.rowTitle}>{t.label}</span>
                    <span className={styles.rowSub}>
                      {t.prefix}… · {t.revokedAt ? 'revocado' : `usado: ${formatWhen(t.lastUsedAt)}`}
                    </span>
                    {account ? (
                      <span className={styles.rowSub}>
                        Descuenta de {account.name}
                        {bucket ? ` · ${bucket.name}` : ''}
                      </span>
                    ) : (
                      <span className={styles.rowSub}>Sin cuenta enlazada (no toca patrimonio)</span>
                    )}
                    {alerta ? <span className={styles.tokenAlert}>{alerta}</span> : null}
                  </div>
                  <div className={styles.subActions}>
                    <IconButton
                      label={`Borrar ${t.label}`}
                      disabled={busyId === t.id}
                      onClick={() => void handleRevoke(t)}
                    >
                      <IconClose />
                    </IconButton>
                  </div>
                </li>
              );
            })
          )}
        </ul>

        <form className={styles.subAdd} onSubmit={handleCreate}>
          <p className={styles.subhead}>Nuevo dispositivo</p>
          <Field label="Nombre" htmlFor="token-label">
            <TextInput
              id="token-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="p. ej. iPhone · Visa"
              maxLength={60}
            />
          </Field>

          {accounts.length > 0 ? (
            <Field label="Tarjeta enlazada (opcional)">
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
                Si la enlazas, cada pago descuenta también de ese saldo.
              </p>
            </Field>
          ) : null}

          <Button type="submit" variant="accent" block loading={busy}>
            Crear dispositivo
          </Button>
        </form>

        {error ? (
          <p className={styles.sheetError} role="alert">
            {error}
          </p>
        ) : null}
        <p className="visually-hidden" role="status" aria-live="polite">
          {status}
        </p>
      </div>
    </BottomSheet>
  );
}
