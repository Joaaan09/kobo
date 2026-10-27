import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { AddTransactionSheet } from './AddTransactionSheet';

type Kind = 'gasto' | 'ingreso' | 'movimiento';

interface AddTransactionContextValue {
  /** Abre la hoja de nuevo movimiento (opcionalmente prefijando Gasto/Ingreso). */
  open: (kind?: Kind) => void;
}

const AddTransactionContext = createContext<AddTransactionContextValue | null>(null);

/** Provee `useAddTransaction()` y monta la hoja de nuevo movimiento. */
export function AddTransactionProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialKind, setInitialKind] = useState<Kind>('gasto');

  const value = useMemo<AddTransactionContextValue>(
    () => ({
      open: (kind: Kind = 'gasto') => {
        setInitialKind(kind);
        setIsOpen(true);
      },
    }),
    [],
  );

  return (
    <AddTransactionContext.Provider value={value}>
      {children}
      <AddTransactionSheet open={isOpen} initialKind={initialKind} onClose={() => setIsOpen(false)} />
    </AddTransactionContext.Provider>
  );
}

export function useAddTransaction(): AddTransactionContextValue {
  const ctx = useContext(AddTransactionContext);
  if (!ctx) throw new Error('useAddTransaction debe usarse dentro de <AddTransactionProvider>');
  return ctx;
}
