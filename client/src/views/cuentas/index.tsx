import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useData } from '../../data/RefreshContext';
import type { Account, Bucket, PendingYield } from '../../lib/types';
import { Button, Card, Eyebrow, IconPlus, Money, Spinner } from '../../ui';
import { patrimonioTotalCents } from './helpers';
import { AccountCard } from './AccountCard';
import { MovimientosCard } from './MovimientosCard';
import { RendimientoCard } from './RendimientoCard';
import { AddAccountSheet } from './AddAccountSheet';
import { EditAccountSheet } from './EditAccountSheet';
import { BucketSheet } from './BucketSheet';
import { ValuationSheet } from './ValuationSheet';
import styles from './index.module.css';

/** Objetivo del editor de sub-saldo: la cuenta y el bucket (o `null` = nuevo). */
interface BucketTarget {
  account: Account;
  bucket: Bucket | null;
}

/** Vista Cuentas (資産) — patrimonio total y cuentas con sus sub-saldos. */
export function CuentasView() {
  const { dataVersion } = useData();

  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [pending, setPending] = useState<PendingYield[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [addOpen, setAddOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [bucketTarget, setBucketTarget] = useState<BucketTarget | null>(null);
  const [valuationTarget, setValuationTarget] = useState<BucketTarget | null>(null);

  // Carga (y recarga en cada mutación) las cuentas del usuario.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const data = await api.get<Account[]>('/accounts');
        if (!alive) return;
        setAccounts(Array.isArray(data) ? data : []);
        setError(null);
        // Liquidaciones estimadas y aún sin registrar: una sola llamada para toda
        // la vista. Es un aviso, no dinero: el saldo no se mueve hasta confirmar.
        const due = await api.get<PendingYield[]>('/valuations/pending').catch(() => []);
        if (!alive) return;
        setPending(Array.isArray(due) ? due : []);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las cuentas.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const list = accounts ?? [];
  const total = patrimonioTotalCents(list);

  return (
    <section className={styles.view} aria-labelledby="cuentas-title">
      <Eyebrow id="cuentas-title" className={styles.eyebrow}>
        Cuentas
      </Eyebrow>

      {accounts === null ? (
        error ? (
          <Card className={styles.stateCard}>
            <p className={styles.stateText} role="alert">
              {error}
            </p>
          </Card>
        ) : (
          <div className={styles.loading}>
            <Spinner />
          </div>
        )
      ) : (
        <>
          {/* Costado (escritorio): el patrimonio total, que es el titular de la
              vista y se queda a la vista mientras recorres las cuentas. En móvil
              el envoltorio es `display: contents` y no existe (DESIGN.md §19.4).
              El orden del DOM es el de móvil y NO se toca: por eso el botón de
              añadir vive en `stack`, justo tras la lista, y no bajo el hero. */}
          <div className={styles.side}>
            <Card raised className={styles.hero}>
              <Eyebrow kanji="資産">Patrimonio total</Eyebrow>
              <Money cents={total} className={styles.heroAmount} aria-live="polite" />
              <p className={styles.heroMeta}>
                {list.length === 0
                  ? 'Sin cuentas todavía'
                  : `${list.length} ${list.length === 1 ? 'cuenta' : 'cuentas'}`}
              </p>
            </Card>
          </div>

          <div className={styles.stack}>
            {list.length === 0 ? (
              <Card className={styles.stateCard}>
                <p className={styles.stateText}>
                  Añade tu primera cuenta para ver tu patrimonio.
                </p>
              </Card>
            ) : (
              <div className={styles.accounts}>
                {list.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    expanded={expanded.has(account.id)}
                    onToggle={() => toggle(account.id)}
                    onEditAccount={() => setEditAccount(account)}
                    onAddBucket={() => setBucketTarget({ account, bucket: null })}
                    onEditBucket={(bucket) => setBucketTarget({ account, bucket })}
                    onValuateBucket={(bucket) => setValuationTarget({ account, bucket })}
                    pending={pending}
                  />
                ))}
              </div>
            )}

            <Button
              variant="accent"
              block
              className={styles.add}
              onClick={() => setAddOpen(true)}
            >
              <IconPlus size={20} />
              Añadir cuenta
            </Button>
          </div>

          {/* Fuera de las columnas: caen en la fila siguiente de la rejilla, uno
              bajo el hero (Rendimiento, que es una cifra) y otro bajo las cuentas
              (Movimientos, que es una lista y agradece el ancho). */}
          {list.length > 0 ? <RendimientoCard accounts={list} /> : null}
          {list.length > 0 ? <MovimientosCard accounts={list} /> : null}
        </>
      )}

      <AddAccountSheet open={addOpen} onClose={() => setAddOpen(false)} />
      <EditAccountSheet
        open={editAccount !== null}
        account={editAccount}
        onClose={() => setEditAccount(null)}
      />
      <BucketSheet
        open={bucketTarget !== null}
        account={bucketTarget?.account ?? null}
        bucket={bucketTarget?.bucket ?? null}
        onClose={() => setBucketTarget(null)}
      />
      <ValuationSheet
        open={valuationTarget !== null}
        account={valuationTarget?.account ?? null}
        bucket={valuationTarget?.bucket ?? null}
        onClose={() => setValuationTarget(null)}
      />
    </section>
  );
}
