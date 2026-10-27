import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useData } from '../../data/RefreshContext';
import { formatEuros, parseInputToCents } from '../../lib/money';
import type { DashboardCategory, Distribution, Subcategory } from '../../lib/types';
import { BottomSheet, Button, Chip, ChipGroup, Money, NumberInput, Spinner } from '../../ui';
import { centsToEuroInput } from '../yo/categoryAssign';
import styles from './RepartoSheet.module.css';

interface RepartoSheetProps {
  open: boolean;
  /** Categoría comodín que se reparte; `null` = hoja cerrada. */
  comodin: DashboardCategory | null;
  /** Todas las categorías del panel (para elegir destinos). */
  categories: DashboardCategory[];
  /** Mes activo (`YYYY-MM`). */
  month: string;
  onClose: () => void;
}

/** Fila editable de un destino: importe en euros y subcategoría opcional. */
interface Row {
  amount: string;
  subId: string;
}

const EMPTY_ROW: Row = { amount: '', subId: '' };

/**
 * Traduce mensajes de error del backend a algo legible. El reparto puede
 * rechazarse si supera lo asignado al comodín o si un destino/subcategoría
 * dejó de ser válido.
 */
function mensajeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.message === 'reparto_exceeds') return 'El reparto supera lo asignado al comodín.';
    if (err.message === 'invalid_destination') return 'Una de las categorías destino ya no existe.';
    if (err.message === 'invalid_subcategory') return 'Una subcategoría elegida ya no es válida.';
    if (err.message === 'not_flexible') return 'Esta categoría ya no es un comodín.';
    return err.message;
  }
  return 'No se pudo guardar el reparto.';
}

/**
 * Hoja "Repartir este mes": reparte el dinero de una categoría comodín entre
 * las demás categorías del mes (con subcategoría opcional como pista). Es una
 * reasignación neutra —no crea ni destruye dinero— y vive por mes.
 */
export function RepartoSheet({ open, comodin, categories, month, onClose }: RepartoSheetProps) {
  const { refresh } = useData();
  const [subs, setSubs] = useState<Subcategory[] | undefined>(undefined);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dinero repartible del comodín: su asignado base (efectivo + repartido − recibido).
  const poolCents = comodin
    ? Math.max(0, comodin.assignedCents + comodin.distributedCents - comodin.receivedCents)
    : 0;

  // Destinos posibles: todas las categorías menos el propio comodín.
  const destinos = useMemo(
    () => (comodin ? categories.filter((c) => c.id !== comodin.id) : []),
    [categories, comodin],
  );

  // Carga perezosa al abrir: reparto actual del mes + subcategorías (para las pistas).
  useEffect(() => {
    if (!open || !comodin) return;
    let alive = true;
    setSubs(undefined);
    setRows({});
    setError(null);
    Promise.all([
      api.get<Distribution[]>(
        `/distributions?month=${month}&categoryId=${comodin.id}`,
      ),
      api.get<Subcategory[]>('/subcategories'),
    ])
      .then(([dists, subList]) => {
        if (!alive) return;
        setSubs(Array.isArray(subList) ? subList : []);
        // Colapsa los tramos por categoría destino (una fila por categoría).
        const next: Record<string, Row> = {};
        const shares = dists[0]?.shares ?? [];
        for (const s of shares) {
          const prev = next[s.toCategoryId] ?? EMPTY_ROW;
          const cents = parseInputToCents(prev.amount) + s.amountCents;
          next[s.toCategoryId] = {
            amount: centsToEuroInput(cents),
            subId: prev.subId || s.toSubcategoryId || '',
          };
        }
        setRows(next);
      })
      .catch((err) => {
        if (!alive) return;
        setSubs([]);
        setError(mensajeError(err));
      });
    return () => {
      alive = false;
    };
  }, [open, comodin, month]);

  const subsByCat = useMemo(() => {
    const map = new Map<string, Subcategory[]>();
    for (const s of subs ?? []) {
      const list = map.get(s.categoryId);
      if (list) list.push(s);
      else map.set(s.categoryId, [s]);
    }
    return map;
  }, [subs]);

  const assignedCents = destinos.reduce(
    (sum, c) => sum + parseInputToCents(rows[c.id]?.amount ?? ''),
    0,
  );
  const remainingCents = poolCents - assignedCents;
  const over = remainingCents < 0;

  if (!comodin) return null;

  function setAmount(catId: string, amount: string) {
    setRows((prev) => ({ ...prev, [catId]: { ...(prev[catId] ?? EMPTY_ROW), amount } }));
  }

  function setSub(catId: string, subId: string) {
    setRows((prev) => ({ ...prev, [catId]: { ...(prev[catId] ?? EMPTY_ROW), subId } }));
  }

  async function handleSave() {
    if (!comodin) return;
    if (over) {
      setError('El reparto supera lo asignado al comodín. Ajústalo antes de guardar.');
      return;
    }
    const shares = destinos
      .map((c) => {
        const row = rows[c.id] ?? EMPTY_ROW;
        const amountCents = parseInputToCents(row.amount);
        if (amountCents <= 0) return null;
        // Solo enviamos la subcategoría si sigue perteneciendo a esta categoría.
        const validSub =
          row.subId && (subsByCat.get(c.id) ?? []).some((s) => s.id === row.subId)
            ? row.subId
            : undefined;
        return {
          toCategoryId: c.id,
          amountCents,
          ...(validSub ? { toSubcategoryId: validSub } : {}),
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    setSaving(true);
    setError(null);
    try {
      await api.put('/distributions', { categoryId: comodin.id, month, shares });
      refresh();
      onClose();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`Repartir · ${comodin.name}`}>
      <div className={styles.form}>
        <p className={styles.intro}>
          Reparte el dinero de <strong>{comodin.name}</strong> entre tus categorías este mes. Solo
          cambia cómo se distribuye tu presupuesto: no crea ni gasta dinero.
        </p>

        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Repartible</span>
            <Money cents={poolCents} className={styles.summaryValue} />
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>{over ? 'Te has pasado' : 'Queda'}</span>
            <span className={styles.summaryValue}>
              <Money cents={Math.abs(remainingCents)} className={over ? styles.over : undefined} />
            </span>
          </div>
        </div>

        {poolCents <= 0 ? (
          <p className={styles.note}>
            Este comodín no tiene dinero asignado este mes. Dale un % en Ajustes → Categorías.
          </p>
        ) : subs === undefined ? (
          <div className={styles.loading}>
            <Spinner label="Cargando reparto…" />
          </div>
        ) : (
          <ul className={styles.list}>
            {destinos.map((c) => {
              const row = rows[c.id] ?? EMPTY_ROW;
              const catSubs = subsByCat.get(c.id) ?? [];
              const amountCents = parseInputToCents(row.amount);
              return (
                <li key={c.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <span
                      className={styles.dot}
                      style={{ background: c.color || 'var(--accent)' }}
                      aria-hidden
                    />
                    <span className={styles.rowName}>
                      <span className={styles.rowNameText}>{c.name}</span>
                      {c.kanji ? <span className={styles.rowKanji}>{c.kanji}</span> : null}
                    </span>
                    <div className={styles.amountWrap}>
                      <NumberInput
                        value={row.amount}
                        onChange={(e) => setAmount(c.id, e.target.value)}
                        placeholder="0,00"
                        aria-label={`Importe a ${c.name} en euros`}
                        className={styles.amountInput}
                      />
                      <span className={styles.euro} aria-hidden>
                        €
                      </span>
                    </div>
                  </div>

                  {catSubs.length > 0 && amountCents > 0 ? (
                    <ChipGroup label={`Subcategoría de ${c.name} (opcional)`} className={styles.subs}>
                      <Chip selected={!row.subId} onClick={() => setSub(c.id, '')}>
                        Sin subcategoría
                      </Chip>
                      {catSubs.map((s) => (
                        <Chip
                          key={s.id}
                          selected={row.subId === s.id}
                          onClick={() => setSub(c.id, s.id)}
                        >
                          {s.name}
                        </Chip>
                      ))}
                    </ChipGroup>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.actions}>
          <span className={styles.actionsHint}>
            {over ? (
              <>Reduce {formatEuros(-remainingCents)}</>
            ) : (
              <>Sin repartir: {formatEuros(remainingCents)}</>
            )}
          </span>
          <Button variant="accent" onClick={handleSave} loading={saving} disabled={over}>
            Guardar reparto
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
