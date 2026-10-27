import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { formatEuros } from '../../lib/money';
import { useData } from '../../data/RefreshContext';
import type { Account, Valuation } from '../../lib/types';
import { Card, Eyebrow, IconButton, IconClose, Money } from '../../ui';
import styles from './RendimientoCard.module.css';

/** Fecha corta en zona Europe/Madrid: `"6 ago"`. */
const shortDateFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: 'numeric',
  month: 'short',
});
const shortDate = (iso: string) => shortDateFmt.format(new Date(iso)).replace('.', '');

/** Etiqueta del sub-saldo: "Cuenta · Sub-saldo" (o solo la cuenta si tiene uno). */
function bucketLabel(accounts: Account[], accountId: string, bucketId: string): string {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return 'Cuenta eliminada';
  if (account.buckets.length <= 1) return account.name;
  const bucket = account.buckets.find((b) => b._id === bucketId);
  return bucket ? `${account.name} · ${bucket.name}` : account.name;
}

const MAX_ROWS = 6;

/**
 * Rendimiento (評価) reciente: intereses liquidados y revalorizaciones. Es dinero
 * que ha ganado (o perdido) el patrimonio **sin que tú lo aportaras**, así que se
 * muestra aparte de los movimientos y nunca cuenta como ingreso del mes.
 *
 * Se puede deshacer: borrar el registro devuelve el saldo a como estaba.
 */
export function RendimientoCard({ accounts }: { accounts: Account[] }) {
  const { dataVersion, refresh } = useData();
  const [items, setItems] = useState<Valuation[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const data = await api.get<Valuation[]>('/valuations');
        if (!alive) return;
        setItems(Array.isArray(data) ? data : []);
      } catch {
        if (!alive) return;
        setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.del(`/valuations/${id}`);
      refresh();
    } catch (err) {
      setDeletingId(null);
      throw err instanceof ApiError ? err : new Error('No se pudo deshacer el rendimiento.');
    }
  }

  // Aún cargando o sin rendimiento registrado: no ocupamos espacio.
  if (!items || items.length === 0) return null;

  const rows = items.slice(0, MAX_ROWS);
  const hidden = items.length - rows.length;
  const total = items.reduce((sum, v) => sum + v.deltaCents, 0);

  return (
    <Card className={styles.card}>
      <div className={styles.head}>
        <Eyebrow kanji="評価">Rendimiento</Eyebrow>
        <Money cents={total} className={styles.total} />
      </div>

      <ul className={styles.list}>
        {rows.map((v) => (
          <li key={v.id} className={styles.row}>
            <div className={styles.info}>
              <span className={styles.where}>
                {bucketLabel(accounts, v.accountId, v.bucketId)}
              </span>
              <span className={styles.meta}>
                {v.kind === 'interes' ? 'Intereses' : 'Revalorización'} · {shortDate(v.date)}
                {v.kind === 'interes' && v.grossCents
                  ? ` · bruto ${formatEuros(v.grossCents)}`
                  : ''}
              </span>
            </div>
            <Money cents={v.deltaCents} className={styles.amount} />
            <IconButton
              label="Deshacer rendimiento"
              variant="quiet"
              onClick={() => void handleDelete(v.id)}
              disabled={deletingId === v.id}
            >
              <IconClose size={18} />
            </IconButton>
          </li>
        ))}
      </ul>

      {hidden > 0 ? (
        <p className={styles.more}>
          y {hidden} {hidden === 1 ? 'registro más' : 'registros más'}
        </p>
      ) : null}

      <p className={styles.foot}>No cuenta como ingreso: no toca el presupuesto del mes.</p>
    </Card>
  );
}
