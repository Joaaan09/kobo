import { Fragment, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { cx } from '../../lib/cx';
import { useData } from '../../data/RefreshContext';
import { bpToCents, formatBp, TOTAL_BP } from '../../lib/money';
import type { Category, IncomeConfig } from '../../lib/types';
import {
  Button,
  Eyebrow,
  IconButton,
  IconChevronDown,
  IconPlus,
  Money,
  NumberInput,
  Segmented,
  Spinner,
  Switch,
} from '../../ui';
import { Group, Hairline, Row } from './SettingsGroup';
import { readModules, writeModule } from './modulesStore';
import { assignInputToBp, bpToAssignInput, clampBp, type AssignUnit } from './categoryAssign';
import { CategoryEditorSheet } from './CategoryEditorSheet';
import { SubcategoriasSheet } from './SubcategoriasSheet';
import { FondosSheet } from './FondosSheet';
import styles from './index.module.css';

/** 分類 · Categorías — reparto por % o €, con crear/editar/borrar y subcategorías. */
export function CategoriasCard() {
  const { dataVersion, refresh } = useData();
  const [cats, setCats] = useState<Category[] | undefined>(undefined);
  const [nominaCents, setNominaCents] = useState(0);
  const [unit, setUnit] = useState<AssignUnit>('pct');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState('');
  const [avisoLimite, setAvisoLimite] = useState(() => readModules().avisoLimite);

  // Objetivo del editor: `undefined` = cerrado · `null` = crear · Category = editar.
  const [editorTarget, setEditorTarget] = useState<Category | null | undefined>(undefined);
  const [subsCategory, setSubsCategory] = useState<Category | null>(null);
  const [fundsCategory, setFundsCategory] = useState<Category | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get<Category[]>('/categories'),
      api.get<IncomeConfig | null>('/income-config').catch(() => null),
    ])
      .then(([list, cfg]) => {
        if (!alive) return;
        const nomina = cfg?.amountCents ?? 0;
        setCats(list);
        setNominaCents(nomina);
        // Sin nómina no hay modo €: forzamos %.
        const u: AssignUnit = nomina > 0 ? unit : 'pct';
        setUnit(u);
        setEdits(Object.fromEntries(list.map((c) => [c.id, bpToAssignInput(c.percentBp, u, nomina)])));
      })
      .catch((err) => {
        if (!alive) return;
        setCats([]);
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las categorías.');
      });
    return () => {
      alive = false;
    };
    // `unit` se reexpresa en `changeUnit`; aquí solo recargamos al mutar datos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  const list = cats ?? [];

  /** Basis points en curso de una categoría (según lo tecleado y la unidad). */
  function draftBp(id: string): number {
    return assignInputToBp(edits[id] ?? '', unit, nominaCents);
  }

  const totalBp = useMemo(
    () => list.reduce((sum, c) => sum + assignInputToBp(edits[c.id] ?? '', unit, nominaCents), 0),
    [list, edits, unit, nominaCents],
  );
  const diffBp = TOTAL_BP - totalBp;
  const over = diffBp < 0;
  const sinAsignarCents = Math.round((nominaCents * Math.max(0, diffBp)) / TOTAL_BP);
  const hasChanges = list.some((c) => draftBp(c.id) !== c.percentBp);

  // Datos para la hoja de edición: reparto ya asignado por las demás y siguiente order.
  const totalSavedBp = list.reduce((s, c) => s + c.percentBp, 0);
  const nextOrder = list.reduce((m, c) => Math.max(m, c.order), -1) + 1;
  const editorOthersBp = editorTarget ? totalSavedBp - editorTarget.percentBp : totalSavedBp;

  function changeUnit(next: AssignUnit) {
    if (next === unit) return;
    if (next === 'eur' && nominaCents <= 0) {
      setNotice('Configura tu nómina para repartir por cantidad.');
      return;
    }
    // Reexpresa todos los campos en la nueva unidad conservando su valor en bp.
    setEdits((prev) => {
      const out: Record<string, string> = {};
      for (const c of list) {
        const bp = assignInputToBp(prev[c.id] ?? '', unit, nominaCents);
        out[c.id] = bpToAssignInput(bp, next, nominaCents);
      }
      return out;
    });
    setUnit(next);
  }

  /** Al salir del campo: acota al máximo disponible para no superar el 100 %. */
  function handleBlur(id: string) {
    const raw = draftBp(id);
    const othersBp = totalBp - raw;
    const max = TOTAL_BP - othersBp;
    const clamped = clampBp(raw, max);
    if (clamped !== raw) {
      setNotice('Ajustado al máximo disponible.');
      setEdits((prev) => ({ ...prev, [id]: bpToAssignInput(clamped, unit, nominaCents) }));
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!cats) return;
    if (totalBp > TOTAL_BP) {
      setError('El reparto supera el 100 %. Ajústalo antes de guardar.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const changed = cats.filter((c) => draftBp(c.id) !== c.percentBp);
      await Promise.all(
        changed.map((c) => api.patch(`/categories/${c.id}`, { percentBp: draftBp(c.id) })),
      );
      setStatus('Reparto guardado.');
      if (changed.length > 0) refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el reparto.');
    } finally {
      setSaving(false);
    }
  }

  function toggleAviso(value: boolean) {
    writeModule('avisoLimite', value);
    setAvisoLimite(value);
  }

  const suffix = unit === 'eur' ? '€' : '%';

  return (
    <section className={styles.section} aria-labelledby="yo-categorias">
      <Eyebrow kanji="分類" id="yo-categorias" className={styles.eyebrowIndent}>
        Categorías
      </Eyebrow>

      {cats === undefined ? (
        <Group>
          <div className={styles.cardLoading}>
            <Spinner label="Cargando…" />
          </div>
        </Group>
      ) : list.length === 0 ? (
        <Group>
          <div className={styles.emptyState}>
            <p className={styles.note}>
              Aún no has creado categorías. Añade la primera para repartir tu nómina.
            </p>
            <Button
              variant="accent"
              block
              className={styles.createBtn}
              onClick={() => setEditorTarget(null)}
            >
              <IconPlus size={20} />
              Nueva categoría
            </Button>
          </div>
        </Group>
      ) : (
        <Group>
          <Row title="Editar en">
            <div className={styles.unitSeg}>
              <Segmented<AssignUnit>
                label="Unidad de edición del reparto"
                value={unit}
                onChange={changeUnit}
                options={[
                  { value: 'pct', label: '%' },
                  { value: 'eur', label: '€' },
                ]}
              />
            </div>
          </Row>

          {list.map((c) => {
            const bp = draftBp(c.id);
            const isOpen = expanded.has(c.id);
            const regionId = `cat-region-${c.id}`;
            return (
              <Fragment key={c.id}>
                <Hairline />
                <div className={styles.catItem}>
                  <div className={styles.catMain}>
                    <span className={styles.dot} style={{ background: c.color }} aria-hidden />
                    <div className={styles.catText}>
                      <span className={styles.catNameLine}>
                        {c.kanji ? <span className={styles.catKanji}>{c.kanji}</span> : null}
                        {c.name}
                      </span>
                      <span className={styles.catSub}>
                        {formatBp(bp)}
                        {nominaCents > 0 ? (
                          <>
                            {' · '}
                            <Money cents={bpToCents(bp, nominaCents)} />
                          </>
                        ) : null}
                      </span>
                    </div>
                    <div className={styles.assignControl}>
                      <NumberInput
                        value={edits[c.id] ?? ''}
                        onChange={(e) => setEdits((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        onBlur={() => handleBlur(c.id)}
                        aria-label={`Asignación de ${c.name} en ${unit === 'eur' ? 'euros' : 'porcentaje'}`}
                        className={styles.assignInput}
                      />
                      <span className={styles.pctSuffix} aria-hidden>
                        {suffix}
                      </span>
                    </div>
                    <IconButton
                      label={`${isOpen ? 'Ocultar' : 'Mostrar'} opciones de ${c.name}`}
                      aria-expanded={isOpen}
                      aria-controls={regionId}
                      onClick={() => toggleExpand(c.id)}
                    >
                      <span className={cx(styles.chevron, isOpen && styles.chevronOpen)}>
                        <IconChevronDown size={20} />
                      </span>
                    </IconButton>
                  </div>

                  {isOpen ? (
                    <div id={regionId} className={styles.catActions}>
                      <button
                        type="button"
                        className={styles.catAction}
                        onClick={() => setEditorTarget(c)}
                      >
                        Editar categoría
                      </button>
                      <button
                        type="button"
                        className={cx(styles.catAction, styles.catActionQuiet)}
                        onClick={() => setSubsCategory(c)}
                      >
                        Subcategorías
                      </button>
                      <button
                        type="button"
                        className={cx(styles.catAction, styles.catActionQuiet)}
                        onClick={() => setFundsCategory(c)}
                      >
                        Fondos 積立
                      </button>
                    </div>
                  ) : null}
                </div>
              </Fragment>
            );
          })}

          <Hairline />
          <div className={styles.summary}>
            <span className={cx(styles.summaryTotal, over && styles.summaryTotalOver)}>
              {over ? `Te has pasado: ${formatBp(totalBp)}` : `${formatBp(totalBp)} repartido`}
            </span>
            {diffBp > 0 ? (
              <span className={styles.chipSinAsignar}>
                Sin asignar {formatBp(diffBp)}
                {nominaCents > 0 ? (
                  <>
                    {' · '}
                    <Money cents={sinAsignarCents} />
                  </>
                ) : null}
              </span>
            ) : null}
          </div>
          <p className={styles.notice} role="status" aria-live="polite">
            {notice}
          </p>

          <Hairline />
          <Row title="Aviso al superar el límite">
            <Switch
              checked={avisoLimite}
              onChange={toggleAviso}
              label="Aviso al superar el límite"
            />
          </Row>

          <div className={styles.footer}>
            <p className={styles.note}>El reparto debería sumar 100 %.</p>
            <Button onClick={handleSave} loading={saving} disabled={!hasChanges}>
              Guardar reparto
            </Button>
          </div>

          <div className={styles.createWrap}>
            <Button variant="ghost" block onClick={() => setEditorTarget(null)}>
              <IconPlus size={20} />
              Nueva categoría
            </Button>
          </div>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <p className="visually-hidden" role="status" aria-live="polite">
            {status}
          </p>
        </Group>
      )}

      <CategoryEditorSheet
        open={editorTarget !== undefined}
        category={editorTarget ?? null}
        nominaCents={nominaCents}
        othersBp={editorOthersBp}
        nextOrder={nextOrder}
        onClose={() => setEditorTarget(undefined)}
      />
      <SubcategoriasSheet
        open={subsCategory !== null}
        category={subsCategory}
        // El total con el reparto que se ve en pantalla (aunque aún no esté guardado).
        totalCents={subsCategory ? bpToCents(draftBp(subsCategory.id), nominaCents) : 0}
        onClose={() => setSubsCategory(null)}
      />
      <FondosSheet
        open={fundsCategory !== null}
        category={fundsCategory}
        onClose={() => setFundsCategory(null)}
      />
    </section>
  );
}
