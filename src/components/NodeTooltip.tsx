import { useStore } from '../state/store';
import { formatDate, formatDuration } from '../lib/calendar';
import { STATE_LABEL, nodeState } from '../lib/epidemic';
import { fmtInt } from '../lib/format';
import styles from './NodeCard.module.css';

export function NodeTooltip({ idx, x, y }: { idx: number; x: number; y: number }) {
  const n = useStore((s) => s.network!.nodes[idx]);
  const derived = useStore((s) => s.derived);
  const t = useStore((s) => s.t);
  const state = nodeState(derived, idx, t);
  const a = derived?.arrival[idx] ?? -1;

  return (
    <div className={styles.tooltip} style={{ left: x + 14, top: y + 14 }}>
      <div className={styles.name}>{n.key && n.key !== n.name ? `${n.name} · ${n.key}` : n.name}</div>
      <div className={`${styles.state} ${styles[state]}`}>{STATE_LABEL[state]}</div>
      <dl className={styles.dl}>
        {a >= 0 && (
          <>
            <dt>Invasion</dt>
            <dd className="num">
              {formatDate(a)} <span className={styles.muted}>(+{formatDuration(a - (derived?.tStart ?? 0))})</span>
            </dd>
          </>
        )}
        <dt>Population</dt>
        <dd className="num">{fmtInt(n.pop)}</dd>
        <dt>Degree</dt>
        <dd className="num">{n.degree} links</dd>
        <dt>Province</dt>
        <dd>{n.province}</dd>
      </dl>
    </div>
  );
}
