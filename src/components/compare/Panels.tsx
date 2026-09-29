import { useMemo } from 'react';
import { scaleLog } from 'd3-scale';
import type { ComparisonPathogen } from '../../data/types';
import { bayesFactor, jeffreys, JEFFREYS, posterior, type Evidence } from '../../lib/abc';
import { fmtPct } from '../../lib/format';
import { useSize } from '../charts/useSize';
import { BF_PAIRS, colorOf } from './palette';
import styles from './Compare.module.css';

const Swatch = ({ tag }: { tag: string }) => <i className={styles.swatch} style={{ background: colorOf(tag) }} />;

/** Posterior model probabilities, equal prior odds. */
export function Posterior({ pathogens, evidence: ev }: { pathogens: ComparisonPathogen[]; evidence: Record<string, Evidence> }) {
  const probs = posterior(pathogens.map((p) => ev[p.tag]));
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>Posterior probability</h3>
        <span className={styles.note}>equal prior odds</span>
      </div>
      <div className={styles.probs}>
        {pathogens.map((p, i) => (
          <div key={p.tag} className={styles.probRow}>
            <span className={styles.probName}><Swatch tag={p.tag} />{p.label}</span>
            <span className={styles.probBar}>
              <i style={{ width: `${probs[i] * 100}%`, background: colorOf(p.tag) }} />
            </span>
            <b className={`${styles.probVal} num`}>{fmtPct(probs[i], 1)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

const M = { left: 128, right: 16, top: 30, bottom: 40 };

/** Pairwise Bayes factors with 95% Monte Carlo CI on the Jeffreys scale. */
export function BayesFactors({ pathogens, evidence: ev }: { pathogens: ComparisonPathogen[]; evidence: Record<string, Evidence> }) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const label = (t: string) => pathogens.find((p) => p.tag === t)?.label ?? t;
  const rows = BF_PAIRS.filter(([a, b]) => ev[a] && ev[b]).map(([a, b]) =>
    ev[a].accepted && ev[b].accepted ? bayesFactor(ev[a], ev[b]) : null,
  );
  const w = Math.max(0, width - M.left - M.right);
  const h = Math.max(0, height - M.top - M.bottom);
  const x = useMemo(() => scaleLog().domain([1 / 300, 300]).range([0, w]).clamp(true), [w]);
  const rowY = (i: number) => (h / BF_PAIRS.length) * (i + 0.5);
  const bands: [number, number, number][] = JEFFREYS.map(([th], k) => [th, JEFFREYS[k + 1]?.[0] ?? 1e9, k]);
  const shade = ['transparent', '#f1ede5', '#e9e4d9', '#e1dbce', '#d9d2c3'];

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>Bayes factors</h3>
        <span className={styles.note}>95% Monte Carlo CI</span>
      </div>
      <div ref={ref} className={styles.plot}>
        {width > 0 && (
          <svg width={width} height={height}>
            <g transform={`translate(${M.left},${M.top})`}>
              {bands.map(([a, b, k]) => (
                <g key={k}>
                  <rect x={x(a)} width={x(Math.min(b, 300)) - x(a)} height={h} fill={shade[k]} />
                  <rect x={x(1 / Math.min(b, 300))} width={x(1 / a) - x(1 / Math.min(b, 300))} height={h} fill={shade[k]} />
                </g>
              ))}
              <text x={x(1) - 6} y={h + 32} textAnchor="end" className={styles.dirLabel}>← favours the second</text>
              <text x={x(1) + 6} y={h + 32} className={styles.dirLabel}>favours the first →</text>
              {[['anecdotal', 1.8], ['subst.', 5.5], ['strong', 17], ['very str.', 55], ['decisive', 170]].map(([l, v]) => (
                <g key={l as string}>
                  <text x={x(v as number)} y={-6} textAnchor="middle" className={styles.bandLabel}>{l}</text>
                </g>
              ))}
              <line x1={x(1)} x2={x(1)} y2={h} stroke="var(--ink-2)" />
              {[1 / 100, 1 / 10, 1, 10, 100].map((v) => (
                <text key={v} x={x(v)} y={h + 16} textAnchor="middle" className={styles.axis}>
                  {v < 1 ? `1/${Math.round(1 / v)}` : v}
                </text>
              ))}
              {rows.map((r, i) => {
                const [a, b] = BF_PAIRS[i];
                return (
                  <g key={i} transform={`translate(0,${rowY(i)})`}>
                    <text x={-12} y={-3} textAnchor="end" className={styles.pairTop}>{label(a)}</text>
                    <text x={-12} y={12} textAnchor="end" className={styles.pairBottom}>vs {label(b)}</text>
                    <rect x={-M.left + 4} y={-12} width={4} height={10} fill={colorOf(a)} rx={1} />
                    <rect x={-M.left + 4} y={3} width={4} height={10} fill={colorOf(b)} rx={1} />
                    {r ? (
                      <>
                        <line x1={x(r.lo)} x2={x(r.hi)} stroke="var(--ink)" strokeWidth={2} />
                        <circle cx={x(r.bf)} r={5} fill="var(--ink)" stroke="var(--surface)" strokeWidth={2} />
                        <text x={x(r.hi) + 8} y={4} className={`${styles.bfVal} num`}>{r.bf >= 10 ? r.bf.toFixed(1) : r.bf.toFixed(2)}</text>
                      </>
                    ) : (
                      <text x={x(1)} y={4} textAnchor="middle" className={styles.muted}>no accepted draws</text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
      <ul className={styles.bfList}>
        {rows.map((r, i) =>
          r ? (
            <li key={i} className="num">
              BF {label(BF_PAIRS[i][0]).toLowerCase()}:{label(BF_PAIRS[i][1]).toLowerCase()} = <b>{r.bf.toFixed(2)}</b>{' '}
              <span className={styles.muted}>({r.lo.toFixed(2)}–{r.hi.toFixed(2)})</span> · {jeffreys(r.bf)} for{' '}
              {label(r.bf >= 1 ? r.a : r.b).toLowerCase()}
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}

export const UPPER_BOUNDS: [number, string][] = [
  [729, '31 Dec 166'],
  [760, '31 Jan 167'],
  [788, '28 Feb 167'],
];
