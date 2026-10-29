import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { useData } from '../../data/RefreshContext';
import { parseInputToCents } from '../../lib/money';
import { cx } from '../../lib/cx';
import type { Category, Fund, Subcategory } from '../../lib/types';
import {
  BottomSheet,
  Button,
  Field,
  IconButton,
  IconClose,
  Money,
  NumberInput,
  Spinner,
  TextInput,
} from '../../ui';
import { centsToEuroInput } from './categoryAssign';
import styles from './index.module.css';

interface SubcategoriasSheetProps {
  open: boolean;
  /** Categoría cuyas subcategorías se gestionan; `null` = hoja cerrada. */
  category: Category | null;
  /** Lo que la categoría recibe de la nómina cada mes (su % en €). */
  totalCents: number;
  onClose: () => void;
}

/** Borrador editable de una subcategoría (texto de nombre + límite en euros). */
interface Draft {
  name: string;
  limit: string;
}

/**
 * Hoja para gestionar las subcategorías de una categoría: lista con edición y
 * borrado por fila, más un formulario para añadir. Carga perezosa al abrir.
 *
 * Arriba, el **total de la categoría** y lo que **queda por repartir** entre
 * subcategorías, recalculado con cada tecla (incluido el límite que se está
 * escribiendo en "Nueva subcategoría"). Lo que reservan los fondos (積立) de la
 * categoría ya no está disponible para gastar, así que se descuenta antes.
 */
export function SubcategoriasSheet({ open, category, totalCents, onClose }: SubcategoriasSheetProps) {
  const { refresh } = useData();
  // `undefined` = cargando · array = cargado.
  const [subs, setSubs] = useState<Subcategory[] | undefined>(undefined);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newLimit, setNewLimit] = useState('');
  const [adding, setAdding] = useState(false);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  // Carga perezosa: pide las subcategorías de esta categoría al abrir.
  useEffect(() => {
    if (!open || !category) return;
    let alive = true;
    setSubs(undefined);
    setError(null);
    setStatus('');
    setConfirmId(null);
    setNewName('');
    setNewLimit('');
    setFunds([]);
    void api
      .get<Fund[]>(`/funds?categoryId=${category.id}`)
      .then((list) => {
        if (alive) setFunds(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        /* sin fondos: el total se muestra entero */
      });
    api
      .get<Subcategory[]>(`/subcategories?categoryId=${category.id}`)
      .then((list) => {
        if (!alive) return;
        setSubs(list);
        setDrafts(
          Object.fromEntries(
            list.map((s) => [
              s.id,
              { name: s.name, limit: s.limitCents ? centsToEuroInput(s.limitCents) : '' },
            ]),
          ),
        );
      })
      .catch((err) => {
        if (!alive) return;
        setSubs([]);
        setError(
          err instanceof ApiError ? err.message : 'No se pudieron cargar las subcategorías.',
        );
      });
    return () => {
      alive = false;
    };
  }, [open, category]);

  // Reserva mensual de los fondos de la categoría (espejo de `fundProvisionCents`).
  const reservedCents = useMemo(
    () =>
      funds.reduce(
        (sum, f) => sum + (f.everyMonths > 0 ? Math.round(f.targetCents / f.everyMonths) : 0),
        0,
      ),
    [funds],
  );

  // Σ límites con lo TECLEADO (borradores + el nuevo), no con lo guardado: el
  // restante tiene que moverse mientras escribes, que es cuando decides.
  const limitsCents = useMemo(() => {
    const listed = (subs ?? []).reduce(
      (sum, s) => sum + parseInputToCents(drafts[s.id]?.limit ?? ''),
      0,
    );
    return listed + parseInputToCents(newLimit);
  }, [subs, drafts, newLimit]);

  const availableCents = totalCents - reservedCents;
  const remainingCents = availableCents - limitsCents;

  if (!category) return null;

  function isDirty(s: Subcategory): boolean {
    const d = drafts[s.id];
    if (!d) return false;
    return d.name.trim() !== s.name || parseInputToCents(d.limit) !== (s.limitCents ?? 0);
  }

  async function handleSave(s: Subcategory) {
    const d = drafts[s.id];
    if (!d) return;
    const trimmed = d.name.trim();
    if (!trimmed) {
      setError('El nombre de la subcategoría no puede quedar vacío.');
      return;
    }
    const limitCents = parseInputToCents(d.limit); // 0 = sin límite
    setBusyId(s.id);
    setError(null);
    try {
      const updated = await api.patch<Subcategory>(`/subcategories/${s.id}`, {
        name: trimmed,
        limitCents,
      });
      const next = updated ?? { ...s, name: trimmed, limitCents };
      setSubs((prev) => prev?.map((x) => (x.id === s.id ? next : x)));
      setDrafts((prev) => ({
        ...prev,
        [s.id]: { name: next.name, limit: next.limitCents ? centsToEuroInput(next.limitCents) : '' },
      }));
      setStatus('Subcategoría guardada.');
      refresh(); // invalida el desglose cacheado del Taller (límites al día).
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la subcategoría.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(s: Subcategory) {
    setBusyId(s.id);
    setError(null);
    try {
      await api.del(`/subcategories/${s.id}`);
      setSubs((prev) => prev?.filter((x) => x.id !== s.id));
      setStatus('Subcategoría borrada.');
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo borrar la subcategoría.');
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!category) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      setError('Ponle un nombre a la subcategoría.');
      return;
    }
    const limitCents = parseInputToCents(newLimit);
    setAdding(true);
    setError(null);
    try {
      const created = await api.post<Subcategory>('/subcategories', {
        categoryId: category.id,
        name: trimmed,
        ...(limitCents > 0 ? { limitCents } : {}),
      });
      if (created) {
        setSubs((prev) => [...(prev ?? []), created]);
        setDrafts((prev) => ({
          ...prev,
          [created.id]: {
            name: created.name,
            limit: created.limitCents ? centsToEuroInput(created.limitCents) : '',
          },
        }));
      }
      setNewName('');
      setNewLimit('');
      setStatus('Subcategoría añadida.');
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo añadir la subcategoría.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`Subcategorías · ${category.name}`}>
      <div className={styles.sheetForm}>
        <div className={styles.subBudget} aria-live="polite">
          <div className={styles.subBudgetRow}>
            <span>Total de la categoría</span>
            <Money cents={totalCents} className={styles.subBudgetNum} />
          </div>
          {reservedCents > 0 ? (
            <div className={styles.subBudgetRow}>
              <span>Reservado a fondos</span>
              <Money cents={-reservedCents} className={styles.subBudgetNum} />
            </div>
          ) : null}
          <div className={styles.subBudgetRow}>
            <span>Asignado a subcategorías</span>
            <Money cents={-limitsCents} className={styles.subBudgetNum} />
          </div>
          <div className={cx(styles.subBudgetRow, styles.subBudgetTotal)}>
            <span>{remainingCents < 0 ? 'Te pasas en' : 'Queda por repartir'}</span>
            <Money
              cents={Math.abs(remainingCents)}
              className={cx(styles.subBudgetRemaining, remainingCents < 0 && styles.subBudgetOver)}
            />
          </div>
          {remainingCents < 0 ? (
            <p className={styles.subBudgetHint}>
              Los límites suman más de lo que recibe la categoría. Puedes guardarlos igual, pero
              no habrá dinero para todos.
            </p>
          ) : null}
        </div>

        {subs === undefined ? (
          <div className={styles.cardLoading}>
            <Spinner label="Cargando…" />
          </div>
        ) : (
          <ul className={styles.subList}>
            {subs.length === 0 ? (
              <li className={styles.subEmpty}>Aún no hay subcategorías. Añade la primera abajo.</li>
            ) : (
              subs.map((s) => {
                const d = drafts[s.id] ?? { name: s.name, limit: '' };
                return (
                  <li key={s.id} className={styles.subRow}>
                    <div className={styles.subFields}>
                      <TextInput
                        aria-label={`Nombre de ${s.name}`}
                        className={styles.grow}
                        value={d.name}
                        onChange={(e) =>
                          setDrafts((p) => ({ ...p, [s.id]: { ...d, name: e.target.value } }))
                        }
                        maxLength={60}
                      />
                      <div className={styles.assignInputWrap}>
                        <NumberInput
                          aria-label={`Límite de ${s.name} en euros`}
                          className={styles.subLimitInput}
                          value={d.limit}
                          placeholder="Sin límite"
                          onChange={(e) =>
                            setDrafts((p) => ({ ...p, [s.id]: { ...d, limit: e.target.value } }))
                          }
                        />
                        <span className={styles.pctSuffix} aria-hidden>
                          €
                        </span>
                      </div>
                    </div>
                    <div className={styles.subActions}>
                      {isDirty(s) ? (
                        <Button
                          type="button"
                          variant="quiet"
                          loading={busyId === s.id}
                          onClick={() => handleSave(s)}
                        >
                          Guardar
                        </Button>
                      ) : null}
                      {confirmId === s.id ? (
                        <>
                          <Button
                            type="button"
                            variant="accent"
                            loading={busyId === s.id}
                            onClick={() => handleDelete(s)}
                          >
                            Borrar
                          </Button>
                          <Button type="button" variant="quiet" onClick={() => setConfirmId(null)}>
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <IconButton label={`Borrar ${s.name}`} onClick={() => setConfirmId(s.id)}>
                          <IconClose />
                        </IconButton>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        )}

        <form className={styles.subAdd} onSubmit={handleAdd}>
          <p className={styles.subhead}>Nueva subcategoría</p>
          <div className={styles.sheetRow}>
            <Field label="Nombre" htmlFor="sub-name" className={styles.grow}>
              <TextInput
                id="sub-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="p. ej. Súper, Restaurantes"
                maxLength={60}
              />
            </Field>
            <Field label="Límite (opcional)" htmlFor="sub-limit">
              <div className={styles.assignInputWrap}>
                <NumberInput
                  id="sub-limit"
                  className={styles.subLimitInput}
                  value={newLimit}
                  onChange={(e) => setNewLimit(e.target.value)}
                  placeholder="0,00"
                />
                <span className={styles.pctSuffix} aria-hidden>
                  €
                </span>
              </div>
            </Field>
          </div>
          <Button type="submit" variant="accent" block loading={adding}>
            Añadir subcategoría
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
