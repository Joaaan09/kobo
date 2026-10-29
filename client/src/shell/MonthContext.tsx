import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../lib/api';
import {
  addMonths,
  currentMonth,
  cycleRangeLabel,
  monthName,
  setCycleChanges,
  subscribeCycle,
} from '../lib/month';
import type { IncomeConfig } from '../lib/types';

interface MonthContextValue {
  /** Mes activo en formato `YYYY-MM`. */
  month: string;
  setMonth: (month: string) => void;
  /** Navega al mes siguiente / anterior. */
  next: () => void;
  prev: () => void;
  /** Nombre del mes activo, capitalizado ("Agosto"). */
  name: string;
  /** Tramo del ciclo ("25 oct – 24 nov"); vacío si es el mes natural. */
  range: string;
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
  //
  // `following`: mientras el usuario no navegue, el mes activo SIGUE al ciclo en
  // curso. Hace falta porque el inicio de mes llega del servidor después del
  // primer render: si cambia (o se configura), "hoy" puede caer en otro ciclo.
  const [{ month, dir }, setEstado] = useState(() => ({
    month: currentMonth(),
    dir: 0,
    following: true,
  }));
  // Se re-renderiza cuando cambia el ciclo (el rango del mismo mes puede cambiar).
  const [cycleVersion, setCycleVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeCycle(() => {
      setCycleVersion((v) => v + 1);
      setEstado((p) => (p.following ? { ...p, month: currentMonth(), dir: 0 } : p));
    });
    // El inicio de mes vive en la config de nómina.
    void api
      .get<IncomeConfig | null>('/income-config')
      .then((config) => setCycleChanges(config?.cycleChanges))
      .catch(() => {
        /* sin red: se queda el ciclo cacheado */
      });
    return unsubscribe;
  }, []);

  const setMonth = useCallback((m: string) => {
    setEstado((prev) => ({
      month: m,
      dir: m === prev.month ? 0 : m > prev.month ? 1 : -1,
      following: m === currentMonth(),
    }));
  }, []);
  const next = useCallback(
    () =>
      setEstado((p) => {
        const m = addMonths(p.month, 1);
        return { month: m, dir: 1, following: m === currentMonth() };
      }),
    [],
  );
  const prev = useCallback(
    () =>
      setEstado((p) => {
        const m = addMonths(p.month, -1);
        return { month: m, dir: -1, following: m === currentMonth() };
      }),
    [],
  );

  const value = useMemo<MonthContextValue>(
    () => ({ month, setMonth, next, prev, name: monthName(month), range: cycleRangeLabel(month), dir }),
    // `cycleVersion`: el rango depende del ciclo, que vive fuera de React.
    [month, dir, setMonth, next, prev, cycleVersion],
  );

  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>;
}

export function useMonth(): MonthContextValue {
  const ctx = useContext(MonthContext);
  if (!ctx) throw new Error('useMonth debe usarse dentro de <MonthProvider>');
  return ctx;
}
