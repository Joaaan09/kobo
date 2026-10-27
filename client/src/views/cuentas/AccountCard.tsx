import { useId } from 'react';
import type { Account, Bucket, PendingYield } from '../../lib/types';
import { formatEuros } from '../../lib/money';
import { Card, IconChevronDown, IconPlus, Money } from '../../ui';
import { cx } from '../../lib/cx';
import { accountTotalCents, bucketRinde, BUCKET_KINDS, DEFAULT_ACCOUNT_COLOR } from './helpers';
import styles from './AccountCard.module.css';

interface AccountCardProps {
  account: Account;
  expanded: boolean;
  onToggle: () => void;
  onEditAccount: () => void;
  onAddBucket: () => void;
  onEditBucket: (bucket: Bucket) => void;
  /** Abre la hoja de rendimiento (solo en sub-saldos remunerados o invertidos). */
  onValuateBucket: (bucket: Bucket) => void;
  /** Liquidaciones estimadas y sin registrar (avisan en el sub-saldo remunerado). */
  pending: PendingYield[];
}

/** Kanji del tipo de sub-saldo (現金 / 貯蓄 / 投資). */
function kindKanji(bucket: Bucket): string {
  return BUCKET_KINDS.find((k) => k.value === bucket.kind)?.kanji ?? '';
}

/** Tarjeta de cuenta: cabecera con total y, al expandir, sus sub-saldos. */
export function AccountCard({
  account,
  expanded,
  onToggle,
  onEditAccount,
  onAddBucket,
  onEditBucket,
  onValuateBucket,
  pending,
}: AccountCardProps) {
  const regionId = useId();
  const total = accountTotalCents(account);
  // Sub-saldos de esta cuenta con intereses estimados por registrar (bucketId → neto).
  const due = new Map(
    pending.filter((p) => p.accountId === account.id).map((p) => [p.bucketId, p.netCents]),
  );
  const dot = account.color ?? DEFAULT_ACCOUNT_COLOR;

  return (
    <Card raised className={styles.card}>
      <button
        type="button"
        className={styles.header}
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={onToggle}
      >
        <span className={styles.dot} style={{ background: dot }} aria-hidden />
        <span className={styles.name}>{account.name}</span>
        <Money cents={total} className={styles.total} />
        <span className={cx(styles.chevron, expanded && styles.chevronOpen)} aria-hidden>
          <IconChevronDown size={20} />
        </span>
      </button>

      {expanded ? (
        <div id={regionId} className={styles.region}>
          <ul className={styles.buckets}>
            {account.buckets.map((bucket) => (
              <li key={bucket._id} className={styles.bucketRow}>
                <button
                  type="button"
                  className={styles.bucket}
                  onClick={() => onEditBucket(bucket)}
                  aria-label={`Editar ${bucket.name}`}
                >
                  <span className={styles.bucketName}>
                    {bucket.name}
                    {bucket.kind !== 'cash' ? (
                      <span className={styles.kindTag} aria-hidden>
                        {kindKanji(bucket)}
                      </span>
                    ) : null}
                  </span>
                  <Money cents={bucket.balanceCents} className={styles.bucketBalance} />
                </button>
                {bucketRinde(bucket) ? (
                  <button
                    type="button"
                    className={cx(
                      styles.bucketAction,
                      due.has(bucket._id) && styles.bucketActionDue,
                    )}
                    onClick={() => onValuateBucket(bucket)}
                  >
                    {bucket.kind === 'investment'
                      ? 'Valor'
                      : due.has(bucket._id)
                        ? `~${formatEuros(due.get(bucket._id) ?? 0)}`
                        : 'Intereses'}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          <div className={styles.actions}>
            <button type="button" className={styles.action} onClick={onAddBucket}>
              <IconPlus size={18} />
              Sub-saldo
            </button>
            <button
              type="button"
              className={cx(styles.action, styles.actionQuiet)}
              onClick={onEditAccount}
            >
              Editar cuenta
            </button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
