import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { addMonths, currentMonth, monthName } from '../lib/month';

interface MonthContextValue {
  /** Mes activo en formato `YYYY-MM`. */
  month: string;
  setMonth: (month: string) => void;
  /** Navega al mes siguiente / anterior. */
  next: () => void;
  prev: () => void;
  /** Nombre del mes activo, capitalizado ("Agosto"). */
  name: string;
  /**
   * Sentido del último salto: `1` hacia adelante, `-1` hacia atrás, `0` sin
   * movimiento todavía (primer render). Lo consume la cabecera para que el
   * nombre del mes entre por el lado correcto (DESIGN.md §13): es continuidad
   * espacial, no adorno — dice hacia dónde te has movido en el tiempo.
   */
  dir: number;
}

const MonthContext = createContext<MonthContextValue | null>(null);

export function MonthProvider({ children }: { children: ReactNode }) {
  // Mes y sentido viven en un ÚNICO estado a propósito: el sentido se deriva
  // del mes anterior, y separarlos abriría la puerta a un render con el mes ya
  // nuevo y la dirección todavía vieja (el nombre entraría por el lado
  // contrario justo en el fotograma que se mira).
  const [{ month, dir }, setEstado] = useState(() => ({ month: currentMonth(), dir: 0 }));

  const setMonth = useCallback((m: string) => {
    setEstado((prev) => ({ month: m, dir: m === prev.month ? 0 : m > prev.month ? 1 : -1 }));
  }, []);
  const next = useCallback(() => setEstado((p) => ({ month: addMonths(p.month, 1), dir: 1 })), []);
  const prev = useCallback(() => setEstado((p) => ({ month: addMonths(p.month, -1), dir: -1 })), []);

  const value = useMemo<MonthContextValue>(
    () => ({ month, setMonth, next, prev, name: monthName(month), dir }),
    [month, dir, setMonth, next, prev],
  );

  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>;
}

export function useMonth(): MonthContextValue {
  const ctx = useContext(MonthContext);
  if (!ctx) throw new Error('useMonth debe usarse dentro de <MonthProvider>');
  return ctx;
}
