import { IncomeConfig, type ICycleChange } from '../models/IncomeConfig.js';
import { CALENDAR_CYCLE, monthIndex, parseMonthParam, type CycleConfig } from '../lib/time.js';

/** Tramos guardados → `CycleConfig` ordenado (descarta claves corruptas). */
export function toCycleConfig(changes: ICycleChange[] | undefined): CycleConfig {
  if (!changes?.length) return CALENDAR_CYCLE;
  return {
    changes: changes
      .map((c) => ({ from: parseMonthParam(c.from), startDay: c.startDay }))
      .filter((c): c is { from: { year: number; month: number }; startDay: number } => !!c.from)
      .sort(
        (a, b) => monthIndex(a.from.year, a.from.month) - monthIndex(b.from.year, b.from.month),
      ),
  };
}

/**
 * Ciclo del usuario (inicio del mes de Kobo). Vive junto a la nómina porque es
 * la nómina la que lo define: el mes empieza el día que entra el dinero. Sin
 * configuración, mes natural.
 */
export async function getCycleConfig(userId: string): Promise<CycleConfig> {
  const config = await IncomeConfig.findOne({ userId }, { cycleChanges: 1 }).lean();
  return toCycleConfig(config?.cycleChanges);
}

/**
 * Aplica un nuevo tramo al historial: desde `from` rige `startDay`. Lo que
 * hubiera programado desde `from` en adelante queda sustituido (la decisión
 * nueva manda); lo anterior se conserva, así el pasado no se reescribe.
 */
export function withCycleChange(
  changes: ICycleChange[] | undefined,
  next: ICycleChange,
): ICycleChange[] {
  const kept = (changes ?? []).filter((c) => c.from < next.from);
  // Si el tramo nuevo no cambia nada respecto al vigente, no se guarda (evita ruido).
  const previousDay = kept.length ? kept[kept.length - 1].startDay : 1;
  return previousDay === next.startDay ? kept : [...kept, next];
}
