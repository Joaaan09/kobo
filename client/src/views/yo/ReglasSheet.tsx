import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import type { Category, IngestRule, Subcategory } from '../../lib/types';
import {
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  Field,
  IconButton,
  IconClose,
  Spinner,
  TextInput,
} from '../../ui';
import styles from './index.module.css';

interface ReglasSheetProps {
  open: boolean;
  rules: IngestRule[];
  onClose: () => void;
  onChanged: () => void;
}

/**
 * Hoja de reglas de comercio: "si el comercio contiene X → esta categoría".
 *
 * Es lo que hace que un cobro anónimo entre ya clasificado. El texto se compara
 * en forma normalizada (sin mayúsculas ni acentos), así que basta con la parte
 * reconocible del nombre: "mercadona" caza "MERCADONA S.A. 4021". Ante varias
 * coincidencias gana la más específica.
 */
export function ReglasSheet({ open, rules, onClose, onChanged }: ReglasSheetProps) {
  const [cats, setCats] = useState<Category[] | undefined>(undefined);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [label, setLabel] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!open) return;
    setLabel('');
    setCategoryId(null);
    setSubcategoryId(null);
    setError(null);
    setStatus('');
    void Promise.all([
      api.get<Category[]>('/categories').catch(() => [] as Category[]),
      api.get<Subcategory[]>('/subcategories').catch(() => [] as Subcategory[]),
    ]).then(([c, s]) => {
      setCats(Array.isArray(c) ? c : []);
      setSubs(Array.isArray(s) ? s : []);
    });
  }, [open]);

  const catById = useMemo(() => new Map((cats ?? []).map((c) => [c.id, c])), [cats]);
  const subById = useMemo(() => new Map(subs.map((s) => [s.id, s])), [subs]);
  const subsOfSelected = subs.filter((s) => s.categoryId === categoryId);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = label.trim();
    if (trimmed.length < 2) {
      setError('Escribe al menos dos letras del nombre del comercio.');
      return;
    }
    if (!categoryId) {
      setError('Elige a qué categoría va.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post<IngestRule>('/automation/rules', {
        label: trimmed,
        categoryId,
        subcategoryId: subcategoryId ?? undefined,
      });
      setLabel('');
      setSubcategoryId(null);
      setStatus('Regla guardada.');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la regla.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(rule: IngestRule) {
    setBusyId(rule.id);
    setError(null);
    try {
      await api.del(`/automation/rules/${rule.id}`);
      setStatus('Regla borrada.');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo borrar la regla.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Reglas de comercio">
      <div className={styles.sheetForm}>
        <p className={styles.note}>
          Cuando llega un pago, Kobo busca estas palabras en el nombre del comercio y lo clasifica
          solo. Lo que no reconoce entra marcado «por revisar».
        </p>

        {cats === undefined ? (
          <div className={styles.cardLoading}>
            <Spinner label="Cargando…" />
          </div>
        ) : (
          <ul className={styles.subList}>
            {rules.length === 0 ? (
              <li className={styles.subEmpty}>Aún no hay reglas. Añade la primera abajo.</li>
            ) : (
              rules.map((r) => {
                const cat = catById.get(r.categoryId);
                const sub = r.subcategoryId ? subById.get(r.subcategoryId) : null;
                return (
                  <li key={r.id} className={styles.subRow}>
                    <div className={styles.tokenMain}>
                      <span className={styles.rowTitle}>{r.label}</span>
                      <span className={styles.rowSub}>
                        → {cat?.name ?? 'categoría borrada'}
                        {sub ? ` · ${sub.name}` : ''}
                        {r.hits > 0 ? ` · ${r.hits} ${r.hits === 1 ? 'gasto' : 'gastos'}` : ''}
                      </span>
                    </div>
                    <div className={styles.subActions}>
                      <IconButton
                        label={`Borrar la regla ${r.label}`}
                        disabled={busyId === r.id}
                        onClick={() => void handleDelete(r)}
                      >
                        <IconClose />
                      </IconButton>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        )}

        <form className={styles.subAdd} onSubmit={handleAdd}>
          <p className={styles.subhead}>Nueva regla</p>
          <Field label="El comercio contiene" htmlFor="rule-label">
            <TextInput
              id="rule-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="p. ej. Mercadona"
              maxLength={80}
            />
          </Field>

          <Field label="Va a">
            <ChipGroup label="Categoría">
              {(cats ?? []).map((c) => (
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
            {subsOfSelected.length > 0 ? (
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

          <Button type="submit" variant="accent" block loading={busy}>
            Añadir regla
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
