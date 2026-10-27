import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useData } from '../../data/RefreshContext';
import type { Account, Category, Transfer } from '../../lib/types';
import { Card, Eyebrow, IconButton, IconClose, Money } from '../../ui';
import styles from './MovimientosCard.module.css';

/** Fecha corta en zona Europe/Madrid: `"6 ago"`. */
const shortDateFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: 'numeric',
  month: 'short',
});
function shortDate(iso: string): string {
  return shortDateFmt.format(new Date(iso)).replace('.', '');
}

/** Etiqueta de un extremo: "Cuenta" o "Cuenta · Sub-saldo" si tiene varios. */
function endpointLabel(accounts: Account[], accountId: string, bucketId: string): string {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return 'Cuenta eliminada';
  if (account.buckets.length <= 1) return account.name;
  const bucket = account.buckets.find((b) => b._id === bucketId);
  return bucket ? `${account.name} · ${bucket.name}` : account.name;
}

const MAX_ROWS = 8;

/**
 * Movimientos (振替) recientes del patrimonio. Traspasos entre sub-saldos: ni
 * gasto ni ingreso, solo dinero cambiando de sitio. Se pueden deshacer (borrar
 * devuelve el saldo al origen). No se muestra la tarjeta si no hay movimientos.
 */
export function MovimientosCard({ accounts }: { accounts: Account[] }) {
  const { dataVersion, refresh } = useData();
  const [transfers, setTransfers] = useState<Transfer[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // Las categorías solo sirven para etiquetar la fila: si fallan, la lista se
      // muestra igual (sin sobre), no la tumbamos por un catálogo accesorio.
      const [data, cats] = await Promise.all([
        api.get<Transfer[]>('/transfers').catch(() => [] as Transfer[]),
        api.get<Category[]>('/categories').catch(() => [] as Category[]),
      ]);
      if (!alive) return;
      setTransfers(Array.isArray(data) ? data : []);
      setCategories(Array.isArray(cats) ? cats : []);
    })();
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.del(`/transfers/${id}`);
      refresh();
    } catch (err) {
      // Si falla, revertimos el estado de borrado para no dejar el botón colgado.
      setDeletingId(null);
      throw err instanceof ApiError ? err : new Error('No se pudo deshacer el movimiento.');
    }
  }

  // Aún cargando o sin movimientos: no ocupamos espacio en la vista.
  if (!transfers || transfers.length === 0) return null;

  const rows = transfers.slice(0, MAX_ROWS);
  const hidden = transfers.length - rows.length;

  return (
    <Card className={styles.card}>
      <Eyebrow kanji="振替">Movimientos</Eyebrow>
      <ul className={styles.list}>
        {rows.map((t) => {
          const cat = t.categoryId ? categoryById.get(t.categoryId) : undefined;
          return (
            <li key={t.id} className={styles.row}>
              <div className={styles.info}>
                <span className={styles.route}>
                  {endpointLabel(accounts, t.fromAccountId, t.fromBucketId)}
                  <span className={styles.arrow} aria-hidden>
                    →
                  </span>
                  {endpointLabel(accounts, t.toAccountId, t.toBucketId)}
                </span>
                <span className={styles.meta}>
                  {/* Sobre de ahorro que consumió el movimiento, si lo hubo. */}
                  {cat ? (
                    <span className={styles.cat}>
                      <span className={styles.dot} style={{ background: cat.color }} aria-hidden />
                      {cat.name}
                    </span>
                  ) : null}
                  <span>
                    {shortDate(t.date)}
                    {t.note ? ` · ${t.note}` : ''}
                  </span>
                </span>
              </div>
              <Money cents={t.amountCents} className={styles.amount} />
              <IconButton
                label="Deshacer movimiento"
                variant="quiet"
                onClick={() => void handleDelete(t.id)}
                disabled={deletingId === t.id}
              >
                <IconClose size={18} />
              </IconButton>
            </li>
          );
        })}
      </ul>
      {hidden > 0 ? (
        <p className={styles.more}>
          y {hidden} {hidden === 1 ? 'movimiento más' : 'movimientos más'}
        </p>
      ) : null}
    </Card>
  );
}
