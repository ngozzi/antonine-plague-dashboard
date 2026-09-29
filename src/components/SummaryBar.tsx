import { useStore } from '../state/store';
import { metricsAt } from '../lib/epidemic';
import { formatDate, formatDuration } from '../lib/calendar';
import { fmtPct, fmtPop } from '../lib/format';
import styles from './SummaryBar.module.css';

/** Headline metrics for the current animation time. */
export function SummaryBar() {
  const derived = useStore((s) => s.derived);
  const run = useStore((s) => s.run);
  const t = useStore((s) => s.t);
  if (!derived) return <div className={styles.bar} />;
  const m = metricsAt(derived, t, run ?? undefined);

  const stats: { label: string; value: string; sub?: string; accent?: boolean }[] = [
    { label: 'Places invaded', value: `${m.invaded}`, sub: `of ${derived.nNodes}` },
    { label: 'Network invaded', value: fmtPct(m.pctNetwork), accent: m.invaded > 1 },
    { label: 'Population reached', value: fmtPop(m.popReached), sub: fmtPct(m.pctPop) + ' of empire' },
  ];
  if (m.deaths != null) stats.push({ label: 'Disease deaths', value: fmtPop(m.deaths), sub: fmtPct(m.deaths / derived.totalPop, 1) + ' of pop.' });
  stats.push(
    derived.tRome == null
      ? { label: 'Time to Rome', value: '—', sub: 'not reached' }
      : m.romeReached
        ? { label: 'Time to Rome', value: formatDuration(derived.tRome - derived.tStart), sub: formatDate(derived.tRome) }
        : { label: 'Time to Rome', value: '…', sub: 'not yet reached' },
  );

  return (
    <div className={styles.bar}>
      {stats.map((s) => (
        <div key={s.label} className={styles.stat}>
          <div className={styles.label}>{s.label}</div>
          <div className={`${styles.value} ${s.accent ? styles.accent : ''} num`}>{s.value}</div>
          {s.sub && <div className={`${styles.sub} num`}>{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}
