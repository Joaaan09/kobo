import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { useData } from '../../data/RefreshContext';
import { bpToCents, formatBp, TOTAL_BP } from '../../lib/money';
import type { Category } from '../../lib/types';
import { BottomSheet, Button, Field, Money, NumberInput, Segmented, Switch, TextInput } from '../../ui';
import { ColorPicker } from '../cuentas/ColorPicker';
import { assignInputToBp, bpToAssignInput, clampBp, type AssignUnit } from './categoryAssign';
import styles from './index.module.css';

/** Color inicial de una categoría nueva: coincide con el primer swatch de ColorPicker. */
const DEFAULT_CAT_COLOR = '#B4472F';

interface CategoryEditorSheetProps {
  open: boolean;
  /** Categoría a editar; `null` = crear una nueva. */
  category: Category | null;
  /** Nómina en céntimos (0 si no está configurada → sin modo €). */
  nominaCents: number;
  /** Σ percentBp de las **demás** categorías, para el tope del 100 %. */
  othersBp: number;
  /** `order` sugerido al crear (máx. order actual + 1). */
  nextOrder: number;
  onClose: () => void;
}

/** Hoja para crear o editar una categoría: nombre, color, kanji y asignación (% o €). */
export function CategoryEditorSheet({
  open,
  category,
  nominaCents,
  othersBp,
  nextOrder,
  onClose,
}: CategoryEditorSheetProps) {
  const { refresh } = useData();
  const isEdit = category !== null;
  const canEur = nominaCents > 0;
  // Tope efectivo: lo que queda hasta el 100 % una vez asignado el resto.
  const maxBp = Math.max(0, TOTAL_BP - othersBp);

  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_CAT_COLOR);
  const [kanji, setKanji] = useState('');
  const [unit, setUnit] = useState<AssignUnit>('pct');
  const [amount, setAmount] = useState('');
  const [flexible, setFlexible] = useState(false);
  const [savings, setSavings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  // Precarga (o reinicia) el formulario al abrir. La asignación se muestra en %.
  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? '');
    setColor(category?.color ?? DEFAULT_CAT_COLOR);
    setKanji(category?.kanji ?? '');
    setUnit('pct');
    setAmount(category ? bpToAssignInput(category.percentBp, 'pct', nominaCents) : '');
    setFlexible(category?.flexible ?? false);
    setSavings(category?.savings ?? false);
    setSaving(false);
    setDeleting(false);
    setConfirmDelete(false);
    setError(null);
    setNotice('');
  }, [open, category, nominaCents]);

  // Vista previa siempre acotada al máximo disponible (así se ve el % y el € reales).
  const draftBp = clampBp(assignInputToBp(amount, unit, nominaCents), maxBp);
  const draftCents = bpToCents(draftBp, nominaCents);

  function changeUnit(next: AssignUnit) {
    if (next === 'eur' && !canEur) {
      setNotice('Configura tu nómina para repartir por cantidad.');
      return;
    }
    // Reexpresa lo ya escrito en la nueva unidad sin perder el valor.
    const bp = assignInputToBp(amount, unit, nominaCents);
    setAmount(bpToAssignInput(bp, next, nominaCents));
    setUnit(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Ponle un nombre a la categoría.');
      return;
    }
    // Acota al máximo para no superar el 100 %; avisa si hubo que recortar.
    const rawBp = assignInputToBp(amount, unit, nominaCents);
    const bp = clampBp(rawBp, maxBp);
    if (bp !== rawBp) setNotice('Ajustado al máximo disponible.');
    const k = kanji.trim();

    setSaving(true);
    setError(null);
    try {
      if (category) {
        await api.patch(`/categories/${category.id}`, {
          name: trimmed,
          color,
          kanji: k,
          percentBp: bp,
          flexible,
          savings,
        });
      } else {
        await api.post('/categories', {
          name: trimmed,
          color,
          percentBp: bp,
          order: nextOrder,
          flexible,
          savings,
          ...(k ? { kanji: k } : {}),
        });
      }
      refresh();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la categoría.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!category) return;
    setDeleting(true);
    setError(null);
    try {
      await api.del(`/categories/${category.id}`);
      refresh();
      onClose();
    } catch (err) {
      // 409: la categoría tiene gastos → no se puede borrar.
      if (
        err instanceof ApiError &&
        (err.status === 409 || err.message === 'category_has_expenses')
      ) {
        setError('No puedes borrar una categoría con gastos registrados.');
      } else {
        setError(err instanceof ApiError ? err.message : 'No se pudo borrar la categoría.');
      }
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar categoría' : 'Nueva categoría'}
    >
      <form className={styles.sheetForm} onSubmit={handleSubmit}>
        <Field label="Nombre" htmlFor="cat-name">
          <TextInput
            id="cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="p. ej. Comida, Ocio, Ahorro"
            maxLength={60}
            /* Foco inicial (solo al crear): lo da `BottomSheet` al terminar la entrada. */
            data-autofocus={!isEdit || undefined}
          />
        </Field>

        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} label="Color de la categoría" />
        </Field>

        <Field label="Kanji (opcional)" htmlFor="cat-kanji" hint="Un glifo corto para la categoría.">
          <TextInput
            id="cat-kanji"
            value={kanji}
            onChange={(e) => setKanji(e.target.value)}
            placeholder="p. ej. 食"
            maxLength={8}
          />
        </Field>

        <Field label="Asignación" htmlFor="cat-amount">
          <div className={styles.assignField}>
            <Segmented<AssignUnit>
              label="Unidad de asignación"
              value={unit}
              onChange={changeUnit}
              className={styles.unitSeg}
              options={[
                { value: 'pct', label: '%' },
                { value: 'eur', label: '€' },
              ]}
            />
            <div className={styles.assignInputWrap}>
              <NumberInput
                id="cat-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={unit === 'eur' ? '0,00' : '0'}
                aria-label={`Asignación en ${unit === 'eur' ? 'euros' : 'porcentaje'}`}
                className={styles.assignSheetInput}
              />
              <span className={styles.pctSuffix} aria-hidden>
                {unit === 'eur' ? '€' : '%'}
              </span>
            </div>
          </div>
        </Field>

        <p className={styles.assignHint}>
          <span>
            {formatBp(draftBp)}
            {nominaCents > 0 ? (
              <>
                {' · '}
                <Money cents={draftCents} />
              </>
            ) : null}
          </span>
          <span>Máx. {formatBp(maxBp)}</span>
        </p>

        {!canEur ? (
          <p className={styles.note}>Configura tu nómina para repartir por cantidad (€).</p>
        ) : null}

        <div className={styles.comodinRow}>
          <div className={styles.comodinText}>
            <span className={styles.comodinTitle}>
              Comodín{' '}
              <span className={styles.comodinKanji} aria-hidden>
                割
              </span>
            </span>
            <span className={styles.comodinHint}>
              Su dinero no se gasta aquí: cada mes lo repartes entre otras categorías desde el
              Taller.
            </span>
          </div>
          <Switch
            checked={flexible}
            onChange={(next) => {
              setFlexible(next);
              // Comodín y sobre de ahorro son excluyentes: uno reparte su dinero
              // entre otras categorías, el otro lo saca del presupuesto gastable.
              if (next) setSavings(false);
            }}
            label="Marcar como comodín"
          />
        </div>

        <div className={styles.comodinRow}>
          <div className={styles.comodinText}>
            <span className={styles.comodinTitle}>
              Sobre de ahorro{' '}
              <span className={styles.comodinKanji} aria-hidden>
                貯
              </span>
            </span>
            <span className={styles.comodinHint}>
              Su dinero no se gasta: lo mueves a tus cuentas. No cuenta en el ritmo del mes, pero
              sí sale de lo que te queda por gastar.
            </span>
          </div>
          <Switch
            checked={savings}
            onChange={(next) => {
              setSavings(next);
              if (next) setFlexible(false);
            }}
            label="Marcar como sobre de ahorro"
          />
        </div>

        {error ? (
          <p className={styles.sheetError} role="alert">
            {error}
          </p>
        ) : null}
        <p className="visually-hidden" role="status" aria-live="polite">
          {notice}
        </p>

        <Button type="submit" variant="accent" block loading={saving}>
          {isEdit ? 'Guardar cambios' : 'Crear categoría'}
        </Button>

        {isEdit ? (
          <div className={styles.danger}>
            {confirmDelete ? (
              <div className={styles.confirm}>
                <p className={styles.confirmText}>
                  Se borrará <strong>{category?.name}</strong> y sus subcategorías. No se puede
                  deshacer.
                </p>
                <div className={styles.confirmActions}>
                  <Button type="button" variant="quiet" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="accent"
                    loading={deleting}
                    onClick={handleDelete}
                  >
                    Borrar categoría
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
                Borrar categoría
              </Button>
            )}
          </div>
        ) : null}
      </form>
    </BottomSheet>
  );
}
