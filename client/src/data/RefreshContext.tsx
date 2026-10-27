import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface RefreshContextValue {
  /** Cambia cada vez que se crea/edita algo; úsalo como dependencia para re-fetch. */
  dataVersion: number;
  /** Fuerza a las vistas suscritas a recargar sus datos. */
  refresh: () => void;
}

const RefreshContext = createContext<RefreshContextValue | null>(null);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [dataVersion, setDataVersion] = useState(0);
  const refresh = useCallback(() => setDataVersion((v) => v + 1), []);

  return (
    <RefreshContext.Provider value={{ dataVersion, refresh }}>{children}</RefreshContext.Provider>
  );
}

export function useData(): RefreshContextValue {
  const ctx = useContext(RefreshContext);
  if (!ctx) throw new Error('useData debe usarse dentro de <RefreshProvider>');
  return ctx;
}
