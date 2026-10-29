import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import type { Account, ApiToken, Category, Subcategory } from '../../lib/types';
import { BottomSheet, Button, Chip, ChipGroup, Field, TextInput } from '../../ui';
import styles from './index.module.css';

interface DispositivoEditorSheetProps {
  /** Dispositivo a editar; `null` = hoja cerrada. */
  token: ApiToken | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Editar un dispositivo (自動): nombre, **la tarjeta que hay detrás** (cuenta +
 * sub-saldo, de donde descuenta cada pago) y **la categoría por defecto** de los
 * pagos que ninguna regla reconoce.
 *
 * La categoría por defecto es una suposición, no una clasificación: el pago sigue
 * entrando "por revisar" para que lo confirmes (y enseñes una regla). Así el
 * presupuesto ya lo cuenta donde casi siempre va, sin esconder el error.
 */
export function DispositivoEditorSheet({ token, onClose, onSaved }: DispositivoEditorSheetProps) {
  const open = token !== null;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [label, setLabel] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [bucketId, setBucketId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLabel(token.label);
    setAccountId(token.accountId ?? null);
    setBucketId(token.bucketId ?? null);
    setCategoryId(token.defaultCategoryId ?? null);
    setSubcategoryId(token.defaultSubcategoryId ?? null);
    setError(null);
    void Promise.all([
      api.get<Account[]>('/accounts').catch(() => [] as Account[]),
      api.get<Category[]>('/categories').catch(() => [] as Category[]),
      api.get<Subcategory[]>('/subcategories').catch(() => [] as Subcategory[]),
    ]).then(([a, c, s]) => {
      setAccounts(Array.isArray(a) ? a : []);
      setCats(Array.isArray(c) ? c : []);
      setSubs(Array.isArray(s) ? s : []);
    });
  }, [token]);

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;
  const subsOfSelected = subs.filter((s) => s.categoryId === categoryId);

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
    if (!token) return;
    const trimmed = label.trim();
    if (!trimmed) {
      setError('Ponle un nombre al dispositivo.');
      return;
    }
    if (accountId && !bucketId) {
      setError('Elige de qué sub-saldo sale el dinero de esta tarjeta.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/automation/tokens/${token.id}`, {
        label: trimmed,
        // `null` desvincula: el PATCH distingue "quitar" de "no tocar".
        accountId: accountId ?? null,
        bucketId: accountId ? bucketId : null,
        defaultCategoryId: categoryId ?? null,
        defaultSubcategoryId: categoryId ? subcategoryId : null,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el dispositivo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Editar dispositivo">
      <form className={styles.sheetForm} onSubmit={handleSubmit}>
        <Field label="Nombre" htmlFor="device-label">
          <TextInput
            id="device-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="p. ej. iPhone · Visa"
            maxLength={60}
          />
        </Field>

        <Field label="Cuenta de la tarjeta">
          {accounts.length === 0 ? (
            <p className={styles.fundHint}>Crea una cuenta en Cuentas para poder enlazarla.</p>
          ) : (
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
          )}
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
              ? 'Cada pago descuenta de este saldo.'
              : 'Sin cuenta, los pagos cuentan en el presupuesto pero no tocan el patrimonio.'}
          </p>
        </Field>

        <Field label="Categoría por defecto">
          <ChipGroup label="Categoría por defecto">
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
            <ChipGroup label="Subcategoría por defecto">
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
          <p className={styles.fundHint}>
            Para los pagos que ninguna regla reconoce. Entran aquí, pero marcados «por revisar»
            {categoryId ? '.' : ': sin elegir, van a la categoría comodín.'}
          </p>
        </Field>

        {error ? (
          <p className={styles.sheetError} role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="accent" block loading={busy}>
          Guardar
        </Button>
      </form>
    </BottomSheet>
  );
}
