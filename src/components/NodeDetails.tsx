import { useMemo } from 'react';
import { scenarioOf, useStore } from '../state/store';
import { formatDate, formatDuration, formatMonth } from '../lib/calendar';
import { STATE_LABEL, nodeState } from '../lib/epidemic';
import { fmtInt, fmtPct } from '../lib/format';
import styles from './NodeCard.module.css';

/** Compact details card shown when a node is clicked. */
export function NodeDetails({ idx, onClose }: { idx: number; onClose: () => void }) {
  const network = useStore((s) => s.network)!;
  const derived = useStore((s) => s.derived);
  const distances = useStore((s) => s.distances);
  const t = useStore((s) => s.t);
  const scenario = useStore(scenarioOf);
  const setSelected = useStore((s) => s.setSelected);
  const n = network.nodes[idx];

  const linkTo = useMemo(() => {
    const src = derived?.infector[idx] ?? -1;
    if (src < 0) return null;
    const e = network.edges.find((e) => (e.s === src && e.t === idx) || (e.t === src && e.s === idx));
    return { src, via: e ? e.cls : 'multi-hop' };
  }, [derived, idx, network]);

  const state = nodeState(derived, idx, t);
  const a = derived?.arrival[idx] ?? -1;
  const kids = derived?.children[idx] ?? [];
  const ens = scenario?.ensemble;
  const isSeed = derived?.seed === idx;

  const Link = ({ i }: { i: number }) => (
    <button className={styles.link} onClick={() => setSelected(i)}>
      {network.nodes[i].name}
    </button>
  );

  return (
    <aside className={styles.details}>
      <header className={styles.detailsHead}>
        <div>
          <div className={styles.nameLg}>{n.name}</div>
          <div className={styles.sub}>
            {n.key && n.key !== n.name ? `${n.key} · ` : ''}
            {n.province}
          </div>
        </div>
        <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
      </header>

      <div className={`${styles.state} ${styles[state]}`}>{isSeed ? 'Outbreak source' : STATE_LABEL[state]}</div>

      <section>
        <div className="eyebrow">This run</div>
        <dl className={styles.dl}>
          <dt>Invasion</dt>
          <dd className="num">{a >= 0 ? `${formatDate(a)} (+${formatDuration(a - (derived?.tStart ?? 0))})` : '—'}</dd>
          {linkTo && (
            <>
              <dt>Seeded by</dt>
              <dd>
                <Link i={linkTo.src} /> <span className={styles.muted}>via {linkTo.via}</span>
              </dd>
            </>
          )}
          <dt>Seeded onward</dt>
          <dd>
            {kids.length === 0
              ? '—'
              : kids.slice(0, 5).map((k, j) => (
                  <span key={k}>
                    {j > 0 && ', '}
                    <Link i={k} />
                  </span>
                ))}
            {kids.length > 5 && <span className={styles.muted}> +{kids.length - 5}</span>}
          </dd>
        </dl>
      </section>

      <section>
        <div className="eyebrow">Place</div>
        <dl className={styles.dl}>
          <dt>Population</dt>
          <dd className="num">{fmtInt(n.pop)}</dd>
          <dt>Connectivity</dt>
          <dd className="num">{n.degree} links</dd>
          {distances && (
            <>
              <dt>From source</dt>
              <dd className="num">
                {fmtInt(distances.km[idx])} km · {distances.hops[idx]} hops · {Math.round(distances.travelDays[idx])} travel days
              </dd>
            </>
          )}
        </dl>
      </section>

      {ens && (
        <section>
          <div className="eyebrow">Across all {scenario!.n_runs.toLocaleString()} runs</div>
          <dl className={styles.dl}>
            <dt>Reached in</dt>
            <dd className="num">{fmtPct(ens.coverage[idx])} of runs</dd>
            <dt>Median arrival</dt>
            <dd className="num">
              {Number.isFinite(ens.t_med[idx]) ? formatMonth(ens.t_med[idx]) : '—'}
              {Number.isFinite(ens.t_p10[idx]) && (
                <span className={styles.muted}>
                  {' '}
                  ({formatMonth(ens.t_p10[idx])} – {formatMonth(ens.t_p90[idx])})
                </span>
              )}
            </dd>
          </dl>
        </section>
      )}
    </aside>
  );
}
