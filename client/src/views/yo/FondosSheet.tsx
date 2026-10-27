import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { useData } from '../../data/RefreshContext';
import { formatEuros, parseInputToCents } from '../../lib/money';
import type { Fund, Subcategory } from '../../lib/types';
import {
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  Field,
  IconButton,
  IconClose,
  NumberInput,
  Spinner,
  TextInput,
} from '../../ui';
import { centsToEuroInput } from './categoryAssign';
import styles from './index.module.css';

interface FondosSheetProps {
  open: boolean;
  /**
   * Categoría cuyos fondos se gestionan; `null` = hoja cerrada. Se pide lo mínimo
   * (id + nombre) para poder abrirla también desde el panel del Taller.
   */
  category: { id: string; name: string } | null;
  onClose: () => void;
}

/** Borrador editable de un fondo (nombre + objetivo en € + cada cuántos meses + ancla). */
interface Draft {
  name: string;
  target: string;
  every: string;
  /** Subcategoría a la que se ancla; `null` = ninguna. */
  subId: string | null;
}

/** Provisión mensual (céntimos): espejo de `fundProvisionCents` del backend. */
function provisionCents(targetCents: number, everyMonths: number): number {
  return everyMonths > 0 ? Math.round(targetCents / everyMonths) : 0;
}

/** Entero de meses tecleado (≥ 1 si hay algo válido, 0 si vacío/no numérico). */
function parseMonths(text: string): number {
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function fundError(err: unknown): string {
  if (err instanceof ApiError && err.message === 'fund_has_expenses') {
    return 'No se puede borrar: el fondo tiene pagos registrados. Bórralos primero en Gastos.';
  }
  return err instanceof ApiError ? err.message : 'No se pudo completar la acción.';
}

/**
 * Hoja para gestionar los fondos de previsión (積立) de una categoría: gastos NO
 * mensuales que se suavizan. Cada fondo reserva `objetivo / cada-N-meses` cada mes
 * del presupuesto de la categoría y acumula (rollover). Carga perezosa al abrir.
 */
export function FondosSheet({ open, category, onClose }: FondosSheetProps) {
  const { refresh } = useData();
  // `undefined` = cargando · array = cargado.
  const [funds, setFunds] = useState<Fund[] | undefined>(undefined);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newEvery, setNewEvery] = useState('');
  const [newSubId, setNewSubId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!open || !category) return;
    let alive = true;
    setFunds(undefined);
    setError(null);
    setStatus('');
    setConfirmId(null);
    setNewName('');
    setNewTarget('');
    setNewEvery('');
    setNewSubId(null);
    // Las subcategorías se piden a la vez: son las anclas que se pueden elegir.
    Promise.all([
      api.get<Fund[]>(`/funds?categoryId=${category.id}`),
      api.get<Subcategory[]>(`/subcategories?categoryId=${category.id}`),
    ])
      .then(([list, subList]) => {
        if (!alive) return;
        setFunds(list);
        setSubs(subList);
        setDrafts(
          Object.fromEntries(
            list.map((f) => [
              f.id,
              {
                name: f.name,
                target: centsToEuroInput(f.targetCents),
                every: String(f.everyMonths),
                subId: f.subcategoryId ?? null,
              },
            ]),
          ),
        );
      })
      .catch((err) => {
        if (!alive) return;
        setFunds([]);
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los fondos.');
      });
    return () => {
      alive = false;
    };
  }, [open, category]);

  if (!category) return null;

  function isDirty(f: Fund): boolean {
    const d = drafts[f.id];
    if (!d) return false;
    return (
      d.name.trim() !== f.name ||
      parseInputToCents(d.target) !== f.targetCents ||
      parseMonths(d.every) !== f.everyMonths ||
      d.subId !== (f.subcategoryId ?? null)
    );
  }

  async function handleSave(f: Fund) {
    const d = drafts[f.id];
    if (!d) return;
    const trimmed = d.name.trim();
    const targetCents = parseInputToCents(d.target);
    const everyMonths = parseMonths(d.every);
    if (!trimmed) {
      setError('El nombre del fondo no puede quedar vacío.');
      return;
    }
    if (targetCents <= 0) {
      setError('El objetivo del fondo debe ser mayor que 0.');
      return;
    }
    if (everyMonths <= 0) {
      setError('Indica cada cuántos meses se paga (mínimo 1).');
      return;
    }
    setBusyId(f.id);
    setError(null);
    try {
      const updated = await api.patch<Fund>(`/funds/${f.id}`, {
        name: trimmed,
        targetCents,
        everyMonths,
        // `null` desancla: el backend borra el campo en vez de guardarlo vacío.
        subcategoryId: d.subId,
      });
      const next = updated ?? {
        ...f,
        name: trimmed,
        targetCents,
        everyMonths,
        subcategoryId: d.subId ?? undefined,
      };
      setFunds((prev) => prev?.map((x) => (x.id === f.id ? next : x)));
      setDrafts((prev) => ({
        ...prev,
        [f.id]: {
          name: next.name,
          target: centsToEuroInput(next.targetCents),
          every: String(next.everyMonths),
          subId: next.subcategoryId ?? null,
        },
      }));
      setStatus('Fondo guardado.');
      refresh();
    } catch (err) {
      setError(fundError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(f: Fund) {
    setBusyId(f.id);
    setError(null);
    try {
      await api.del(`/funds/${f.id}`);
      setFunds((prev) => prev?.filter((x) => x.id !== f.id));
      setStatus('Fondo borrado.');
      refresh();
    } catch (err) {
      setError(fundError(err));
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!category) return;
    const trimmed = newName.trim();
    const targetCents = parseInputToCents(newTarget);
    const everyMonths = parseMonths(newEvery);
    if (!trimmed) {
      setError('Ponle un nombre al fondo.');
      return;
    }
    if (targetCents <= 0) {
      setError('El objetivo del fondo debe ser mayor que 0.');
      return;
    }
    if (everyMonths <= 0) {
      setError('Indica cada cuántos meses se paga (mínimo 1).');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const created = await api.post<Fund>('/funds', {
        categoryId: category.id,
        name: trimmed,
        targetCents,
        everyMonths,
        ...(newSubId ? { subcategoryId: newSubId } : {}),
      });
      if (created) {
        setFunds((prev) => [...(prev ?? []), created]);
        setDrafts((prev) => ({
          ...prev,
          [created.id]: {
            name: created.name,
            target: centsToEuroInput(created.targetCents),
            every: String(created.everyMonths),
            subId: created.subcategoryId ?? null,
          },
        }));
      }
      setNewName('');
      setNewTarget('');
      setNewEvery('');
      setNewSubId(null);
      setStatus('Fondo añadido.');
      refresh();
    } catch (err) {
      setError(fundError(err));
    } finally {
      setAdding(false);
    }
  }

  const newProvision = provisionCents(parseInputToCents(newTarget), parseMonths(newEvery));

  return (
    <BottomSheet open={open} onClose={onClose} title={`Fondos · ${category.name}`}>
      <div className={styles.sheetForm}>
        <p className={styles.note}>
          Un fondo suaviza un gasto NO mensual (p. ej. un pase de 150 € que pagas cada 4 meses):
          reserva su equivalente al mes de esta categoría y acumula hasta el pago real. Si lo anclas
          a una subcategoría, el pago se clasificará ahí (el dinero sigue saliendo del sobre de la
          categoría).
        </p>

        {funds === undefined ? (
          <div className={styles.cardLoading}>
            <Spinner label="Cargando…" />
          </div>
        ) : (
          <ul className={styles.subList}>
            {funds.length === 0 ? (
              <li className={styles.subEmpty}>Aún no hay fondos. Añade el primero abajo.</li>
            ) : (
              funds.map((f) => {
                const d = drafts[f.id] ?? { name: f.name, target: '', every: '' };
                const prov = provisionCents(parseInputToCents(d.target), parseMonths(d.every));
                return (
                  <li key={f.id} className={styles.subRow}>
                    <div className={styles.fundFields}>
                      <TextInput
                        aria-label={`Nombre de ${f.name}`}
                        className={styles.grow}
                        value={d.name}
                        onChange={(e) =>
                          setDrafts((p) => ({ ...p, [f.id]: { ...d, name: e.target.value } }))
                        }
                        maxLength={60}
                      />
                      <div className={styles.fundNums}>
                        <div className={styles.assignInputWrap}>
                          <NumberInput
                            aria-label={`Objetivo de ${f.name} en euros`}
                            className={styles.subLimitInput}
                            value={d.target}
                            placeholder="0,00"
                            onChange={(e) =>
                              setDrafts((p) => ({ ...p, [f.id]: { ...d, target: e.target.value } }))
                            }
                          />
                          <span className={styles.pctSuffix} aria-hidden>
                            €
                          </span>
                        </div>
                        <div className={styles.assignInputWrap}>
                          <NumberInput
                            aria-label={`Cada cuántos meses se paga ${f.name}`}
                            className={styles.subLimitInput}
                            value={d.every}
                            placeholder="4"
                            onChange={(e) =>
                              setDrafts((p) => ({ ...p, [f.id]: { ...d, every: e.target.value } }))
                            }
                          />
                          <span className={styles.monthSuffix} aria-hidden>
                            meses
                          </span>
                        </div>
                      </div>
                      {subs.length > 0 ? (
                        <div className={styles.fundSubs}>
                          <span className={styles.fundSubsLabel}>Subcategoría</span>
                          <ChipGroup label={`Subcategoría de ${f.name}`}>
                            {subs.map((s) => (
                              <Chip
                                key={s.id}
                                selected={d.subId === s.id}
                                onClick={() =>
                                  setDrafts((p) => ({
                                    ...p,
                                    [f.id]: { ...d, subId: d.subId === s.id ? null : s.id },
                                  }))
                                }
                              >
                                {s.name}
                              </Chip>
                            ))}
                          </ChipGroup>
                        </div>
                      ) : null}
                      {prov > 0 ? (
                        <span className={styles.fundHint}>≈ {formatEuros(prov)}/mes reservado</span>
                      ) : null}
                    </div>
                    <div className={styles.subActions}>
                      {isDirty(f) ? (
                        <Button
                          type="button"
                          variant="quiet"
                          loading={busyId === f.id}
                          onClick={() => handleSave(f)}
                        >
                          Guardar
                        </Button>
                      ) : null}
                      {confirmId === f.id ? (
                        <>
                          <Button
                            type="button"
                            variant="accent"
                            loading={busyId === f.id}
                            onClick={() => handleDelete(f)}
                          >
                            Borrar
                          </Button>
                          <Button type="button" variant="quiet" onClick={() => setConfirmId(null)}>
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <IconButton label={`Borrar ${f.name}`} onClick={() => setConfirmId(f.id)}>
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
          <p className={styles.subhead}>Nuevo fondo</p>
          <Field label="Nombre" htmlFor="fund-name">
            <TextInput
              id="fund-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="p. ej. Gimnasio (pase)"
              maxLength={60}
            />
          </Field>
          <div className={styles.sheetRow}>
            <Field label="Objetivo (pago de golpe)" htmlFor="fund-target" className={styles.grow}>
              <div className={styles.assignInputWrap}>
                <NumberInput
                  id="fund-target"
                  className={styles.subLimitInput}
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder="150"
                />
                <span className={styles.pctSuffix} aria-hidden>
                  €
                </span>
              </div>
            </Field>
            <Field label="Cada" htmlFor="fund-every">
              <div className={styles.assignInputWrap}>
                <NumberInput
                  id="fund-every"
                  className={styles.subLimitInput}
                  value={newEvery}
                  onChange={(e) => setNewEvery(e.target.value)}
                  placeholder="4"
                />
                <span className={styles.monthSuffix} aria-hidden>
                  meses
                </span>
              </div>
            </Field>
          </div>
          {subs.length > 0 ? (
            <Field label="Subcategoría (opcional)">
              <ChipGroup label="Subcategoría del nuevo fondo">
                {subs.map((s) => (
                  <Chip
                    key={s.id}
                    selected={newSubId === s.id}
                    onClick={() => setNewSubId((id) => (id === s.id ? null : s.id))}
                  >
                    {s.name}
                  </Chip>
                ))}
              </ChipGroup>
            </Field>
          ) : null}
          {newProvision > 0 ? (
            <p className={styles.fundHint}>
              Reservarás ≈ {formatEuros(newProvision)} al mes de «{category.name}»
              {newSubId ? `, para ${subs.find((s) => s.id === newSubId)?.name ?? ''}` : ''}.
            </p>
          ) : null}
          <Button type="submit" variant="accent" block loading={adding}>
            Añadir fondo
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
