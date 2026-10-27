import { splitMonth } from '../../lib/month';

/** Numerales kanji 1–12 (一 … 十二), para el sello vertical del hero. */
const KANJI_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

/**
 * Sello decorativo del presupuesto del mes, p. ej. `八月の予算` ("presupuesto de agosto").
 * Sustituye el numeral del mockup por el mes vigente.
 */
export function monthBudgetKanji(month: string): string {
  const { month: m } = splitMonth(month);
  const num = KANJI_NUM[m - 1] ?? String(m);
  return `${num}月の予算`;
}
