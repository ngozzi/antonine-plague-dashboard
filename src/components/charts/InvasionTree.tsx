import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { scaleLinear } from 'd3-scale';
import { useStore } from '../../state/store';
import type { RunDerived } from '../../lib/epidemic';
import { pathTo } from '../../lib/paths';
import { formatDate, yearStart } from '../../lib/calendar';
import { useSize } from './useSize';
import styles from './Chart.module.css';

const M = { top: 8, right: 14, bottom: 22, left: 40 };

/**
 * One row per place in depth-first order of the run's transmission tree
 * (children sorted by arrival), so every subtree is a contiguous block.
 */
function treeRows(d: RunDerived) {
  const row = new Int32Array(d.nNodes).fill(-1);
  let r = 0;
  const stack = [d.seed];
  while (stack.length) {
    const u = stack.pop()!;
    if (row[u] >= 0) continue;
    row[u] = r++;
    const kids = [...d.children[u]].sort((a, b) => d.arrival[b] - d.arrival[a]); // reversed for stack
    stack.push(...kids);
  }
  return { row, n: r };
}

/**
 * Transmission tree of the current run over time: x = arrival day, each
 * link drawn as an elbow from the infector's row down to the infected place.
 * The selected place's path is traced in ink.
 */
export function InvasionTree({ switcher }: { switcher?: ReactNode }) {
  const derived = useStore((s) => s.derived);
  const network = useStore((s) => s.network)!;
  const t = useStore((s) => s.t);
  const selected = useStore((s) => s.selected);
  const hovered = useStore((s) => s.hovered);
  const { setHovered, setSelected } = useStore.getState();
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tip, setTip] = useState<number | null>(null);

  const w = Math.max(0, width - M.left - M.right);
  const h = Math.max(0, height - M.top - M.bottom);
  const rows = useMemo(() => (derived ? treeRows(derived) : null), [derived]);
  const x = useMemo(() => scaleLinear().domain([0, derived?.tEnd ?? 1]).range([0, w]), [derived, w]);
  const y = useMemo(() => scaleLinear().domain([0, Math.max(1, (rows?.n ?? 1) - 1)]).range([0, h]), [rows, h]);
  const path = useMemo(() => (derived && selected !== null ? pathTo(derived, selected) : []), [derived, selected]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !derived || !rows || w <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = height * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, M.left * dpr, M.top * dpr);
    g.clearRect(-M.left, -M.top, width, height);
    const { arrival, infector } = derived;
    const elbow = (i: number) => {
      const p = infector[i];
      const x0 = x(arrival[p]);
      g.moveTo(x0, y(rows.row[p]));
      g.lineTo(x0, y(rows.row[i]));
      g.lineTo(x(arrival[i]), y(rows.row[i]));
    };
    // future links (faint), then realised links (red)
    for (const done of [false, true]) {
      g.beginPath();
      for (let i = 0; i < arrival.length; i++) {
        if (arrival[i] < 0 || infector[i] < 0 || rows.row[i] < 0) continue;
        if ((t >= arrival[i]) !== done) continue;
        elbow(i);
      }
      g.strokeStyle = done ? 'rgba(158,27,27,0.55)' : 'rgba(104,120,140,0.22)';
      g.lineWidth = 0.8;
      g.stroke();
    }
    // selected path
    if (path.length > 1) {
      g.beginPath();
      for (const i of path.slice(1)) elbow(i);
      g.strokeStyle = 'rgba(250,248,244,0.9)';
      g.lineWidth = 4;
      g.stroke();
      g.strokeStyle = '#1a1a1a';
      g.lineWidth = 1.8;
      g.stroke();
      for (const i of path) {
        g.beginPath();
        g.arc(x(arrival[i]), y(rows.row[i]), 2.6, 0, Math.PI * 2);
        g.fillStyle = t >= arrival[i] ? '#80161a' : '#fbf9f5';
        g.fill();
        g.strokeStyle = '#1a1a1a';
        g.lineWidth = 1;
        g.stroke();
      }
    }
    if (hovered !== null && arrival[hovered] >= 0 && rows.row[hovered] >= 0) {
      g.beginPath();
      g.arc(x(arrival[hovered]), y(rows.row[hovered]), 5, 0, Math.PI * 2);
      g.strokeStyle = '#1a1a1a';
      g.lineWidth = 1.2;
      g.stroke();
    }
    // now line
    g.beginPath();
    g.moveTo(x(t), 0);
    g.lineTo(x(t), h);
    g.strokeStyle = '#b22222';
    g.lineWidth = 1.5;
    g.stroke();
  }, [derived, rows, x, y, t, width, height, w, h, path, hovered]);

  const nearest = (e: React.MouseEvent) => {
    if (!derived || !rows) return null;
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left - M.left;
    const py = e.clientY - r.top - M.top;
    let best: number | null = null;
    let bd = 100;
    derived.arrival.forEach((a, i) => {
      if (a < 0 || rows.row[i] < 0) return;
      const d = (x(a) - px) ** 2 + ((y(rows.row[i]) - py) * 1.5) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };

  const years: number[] = [];
  if (derived) for (let yr = 165; yearStart(yr) <= derived.tEnd; yr++) years.push(yr);

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        {switcher ?? <h3 className={styles.title}>Invasion tree</h3>}
      </div>
      <div ref={ref} className={styles.plot}>
        {width > 0 && derived && (
          <>
            <svg width={width} height={height} className={styles.under}>
              <g transform={`translate(${M.left},${M.top})`}>
                {years.map((yr) => (
                  <g key={yr} transform={`translate(${x(yearStart(yr))},0)`}>
                    <line y2={h} stroke="var(--rule)" strokeDasharray="2 3" />
                    <text y={h + 16} textAnchor="middle" className={styles.axis}>{yr}</text>
                  </g>
                ))}
                <text x={-8} y={4} textAnchor="end" className={styles.axis}>src</text>
              </g>
            </svg>
            <canvas
              ref={canvas}
              style={{ width, height }}
              className={styles.canvas}
              onMouseMove={(e) => { const i = nearest(e); setTip(i); setHovered(i); }}
              onMouseLeave={() => { setTip(null); setHovered(null); }}
              onClick={(e) => setSelected(nearest(e))}
            />
          </>
        )}
        {tip !== null && derived && rows && (
          <div
            className={styles.tip}
            style={{ left: Math.min(width - 170, M.left + x(derived.arrival[tip]) + 10), top: Math.min(height - 60, M.top + y(rows.row[tip])) }}
          >
            <div className={styles.tipDate}>{network.nodes[tip].name}</div>
            <div className={styles.tipRow}><span>Invaded</span><b className="num">{formatDate(derived.arrival[tip])}</b></div>
            {derived.infector[tip] >= 0 && (
              <div className={styles.tipRow}><span>From</span><b>{network.nodes[derived.infector[tip]].name}</b></div>
            )}
          </div>
        )}
        {selected === null && width > 0 && <div className={styles.overlayHint}>Click a place to trace its path</div>}
      </div>
    </div>
  );
}
