import { useMemo } from 'react';
import { bin } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import type { Scenario } from '../../data/types';
import { formatMonth } from '../../lib/calendar';
import styles from './ControlPanel.module.css';

const W = 268;
const H = 44;

/**
 * Distribution of time-to-Rome across all runs, with the selected run marked.
 * Click to pick the run closest to that arrival time.
 */
export function RunStrip({ scenario, sheet, onPick }: { scenario: Scenario; sheet: number; onPick: (s: number) => void }) {
  const tr = scenario.runs.t_rome;
  const { x, bins, y } = useMemo(() => {
    const vals = tr.filter((v): v is number => v != null);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const x = scaleLinear().domain([lo, hi]).range([1, W - 1]).nice();
    const bins = bin().domain(x.domain() as [number, number]).thresholds(36)(vals);
    const y = scaleLinear().domain([0, Math.max(...bins.map((b) => b.length))]).range([0, H - 14]);
    return { x, bins, y };
  }, [tr]);

  const cur = tr[sheet];
  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const target = x.invert(((e.clientX - r.left) / r.width) * W);
    let best = 0;
    let bd = Infinity;
    tr.forEach((v, k) => {
      if (v != null && Math.abs(v - target) < bd) { bd = Math.abs(v - target); best = k; }
    });
    onPick(best);
  };
  const [d0, d1] = x.domain();

  return (
    <div className={styles.strip}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" onClick={pick} role="img" aria-label="Distribution of arrival time in Rome">
        {bins.map((b, i) => (
          <rect
            key={i}
            x={x(b.x0!) + 0.5}
            width={Math.max(0.5, x(b.x1!) - x(b.x0!) - 1)}
            y={H - 12 - y(b.length)}
            height={y(b.length)}
            fill="var(--neutral)"
            opacity={cur != null && cur >= b.x0! && cur < b.x1! ? 0.9 : 0.35}
          />
        ))}
        {cur != null && (
          <g transform={`translate(${x(cur)},0)`}>
            <line y1={0} y2={H - 12} stroke="var(--red)" strokeWidth={1.5} />
            <circle cy={2} r={2.5} fill="var(--red)" />
          </g>
        )}
        <line x1={0} x2={W} y1={H - 11.5} y2={H - 11.5} stroke="var(--rule-strong)" />
        <text x={1} y={H - 1} fontSize={9.5} fill="var(--ink-3)">{formatMonth(d0)}</text>
        <text x={W - 1} y={H - 1} fontSize={9.5} fill="var(--ink-3)" textAnchor="end">{formatMonth(d1)}</text>
        <text x={W / 2} y={H - 1} fontSize={9.5} fill="var(--ink-3)" textAnchor="middle">arrival in Rome</text>
      </svg>
    </div>
  );
}
