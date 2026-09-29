import { useMemo } from 'react';
import { scenarioOf, useStore } from '../state/store';
import { formatDate, formatDuration, formatMonth } from '../lib/calendar';
import { STATE_LABEL, nodeState } from '../lib/epidemic';
import { pathSteps, pathSummary, pathTo, samePath, VIA_LABEL, type Via } from '../lib/paths';
import { fmtInt, fmtPct } from '../lib/format';
import styles from './NodeCard.module.css';

/**
 * Side panel for the selected place: how the epidemic got there.
 *  1. the invasion path in the current run (step by step, synced with t);
 *  2. the most frequent paths across all runs (hover to preview on the map);
 *  3. facts about the place.
 */
export function NodeDetails({ idx, onClose }: { idx: number; onClose: () => void }) {
  const network = useStore((s) => s.network)!;
  const derived = useStore((s) => s.derived);
  const distances = useStore((s) => s.distances);
  const t = useStore((s) => s.t);
  const scenario = useStore(scenarioOf);
  const previewPath = useStore((s) => s.previewPath);
  const { setSelected, setPreviewPath, setT, pause } = useStore.getState();
  const n = network.nodes[idx];

  const path = useMemo(() => (derived ? pathTo(derived, idx) : []), [derived, idx]);
  const steps = useMemo(() => (derived ? pathSteps(network, derived, path) : []), [network, derived, path]);
  const summary = pathSummary(steps);

  const state = nodeState(derived, idx, t);
  const isSeed = derived?.seed === idx;
  const ens = scenario?.ensemble;
  const alternatives = scenario?.paths?.[idx] ?? [];
  const nReached = scenario?.n_reached?.[idx] ?? 0;
  const topPath = alternatives[0]?.[1];
  const consParent = ens?.tree_parent[idx] ?? -1;

  const Name = ({ i, className }: { i: number; className?: string }) => (
    <button className={`${styles.link} ${className ?? ''}`} onClick={() => setSelected(i)}>
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
            {n.province} · pop. {fmtInt(n.pop)}
          </div>
        </div>
        <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className={`${styles.state} ${styles[state]}`}>{isSeed ? 'Outbreak source' : STATE_LABEL[state]}</div>

      {/* 1 — path in this run -------------------------------------------- */}
      <section>
        <div className="eyebrow">Invasion path · this run</div>
        {path.length === 0 ? (
          <p className={styles.muted}>Not reached in this run.</p>
        ) : path.length === 1 ? (
          <p className={styles.muted}>This is where the outbreak starts.</p>
        ) : (
          <>
            <p className={`${styles.summary} num`}>
              {summary.hops} hops · {formatDuration(summary.days)} · {fmtInt(summary.km)} km
              {summary.seaShare > 0 && <> · {fmtPct(summary.seaShare)} by sea</>}
            </p>
            <ol className={styles.steps}>
              {steps.map((s, k) => {
                const done = t >= s.t;
                const junction = network.nodes[s.idx].junction;
                return (
                  <li key={s.idx} className={`${styles.step} ${done ? styles.done : ''} ${junction ? styles.junction : ''}`}>
                    {s.via && <Hop via={s.via} km={s.km} dt={s.dt} />}
                    <div className={styles.stepRow}>
                      <span className={`${styles.stepDot} ${k === 0 ? styles.seedDot : ''}`} />
                      <Name i={s.idx} className={styles.stepName} />
                      <button
                        className={`${styles.stepDate} num`}
                        title="Jump to this date"
                        onClick={() => { pause(); setT(s.t); }}
                      >
                        {formatDate(s.t, false)}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>

      {/* 2 — across runs -------------------------------------------------- */}
      {scenario && !isSeed && (
        <section>
          <div className="eyebrow">Across all {scenario.n_runs.toLocaleString()} runs</div>
          <dl className={styles.dl}>
            {ens && (
              <>
                <dt>Reached in</dt>
                <dd className="num">{fmtPct(ens.coverage[idx])} of runs</dd>
                <dt>Median arrival</dt>
                <dd className="num">
                  {Number.isFinite(ens.t_med[idx]) ? formatMonth(ens.t_med[idx]) : '—'}
                  {Number.isFinite(ens.t_p10[idx]) && (
                    <span className={styles.muted}> ({formatMonth(ens.t_p10[idx])} – {formatMonth(ens.t_p90[idx])})</span>
                  )}
                </dd>
              </>
            )}
            {consParent >= 0 && (
              <>
                <dt>Usually from</dt>
                <dd>
                  <Name i={consParent} />
                  {ens?.tree_p?.[idx] != null && <span className={styles.muted}> ({fmtPct(ens.tree_p[idx]!)} of runs)</span>}
                </dd>
              </>
            )}
          </dl>
          {alternatives.length > 0 && (
            <>
              <div className={styles.altHead}>Most frequent full paths</div>
              <ul className={styles.alts} onMouseLeave={() => setPreviewPath(null)}>
                {alternatives.map(([count, chain], k) => {
                  const share = nReached ? count / nReached : 0;
                  const current = samePath(chain, path);
                  return (
                    <li
                      key={k}
                      className={`${styles.alt} ${previewPath && samePath(previewPath, chain) ? styles.altOn : ''}`}
                      onMouseEnter={() => setPreviewPath(chain)}
                    >
                      <div className={styles.altTop}>
                        <span className={styles.altBar}><i style={{ width: `${share * 100}%` }} /></span>
                        <span className="num">{fmtPct(share)}</span>
                        {current && <span className={styles.tag}>this run</span>}
                      </div>
                      <div className={styles.chain}>
                        {chain
                          .filter((i) => !network.nodes[i].junction)
                          .map((i, j) => (
                            <span key={i} className={k > 0 && topPath && !topPath.includes(i) ? styles.diff : ''}>
                              {j > 0 && ' → '}
                              {network.nodes[i].name}
                            </span>
                          ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className={styles.hintSmall}>Hover a path to trace it on the map. Places that differ from the most frequent path are highlighted.</p>
            </>
          )}
        </section>
      )}

      {/* 3 — place ----------------------------------------------------------- */}
      <section>
        <div className="eyebrow">Place</div>
        <dl className={styles.dl}>
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
          {derived && (
            <>
              <dt>Seeded onward</dt>
              <dd className="num">{derived.children[idx].length} places in this run</dd>
            </>
          )}
        </dl>
      </section>
    </aside>
  );
}

const VIA_GLYPH: Record<Via, string> = { road: '—', river: '≈', sea: '∿', indirect: '⋯' };

function Hop({ via, km, dt }: { via: Via; km: number; dt: number }) {
  return (
    <div className={`${styles.hop} num`}>
      <span className={styles.hopGlyph} aria-hidden>{VIA_GLYPH[via]}</span>
      {VIA_LABEL[via]}
      {km > 0 && <> · {fmtInt(km)} km</>} ·{' '}
      {dt >= 0 ? (
        `+${dt} d`
      ) : (
        <span title="The previous place exported exposed travellers before it counted as invaded itself (under the selected criterion).">
          {dt} d*
        </span>
      )}
    </div>
  );
}
