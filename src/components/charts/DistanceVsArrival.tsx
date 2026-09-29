import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { scaleLinear } from 'd3-scale';
import { useStore } from '../../state/store';
import { spearman } from '../../lib/epidemic';
import { formatDate, yearStart } from '../../lib/calendar';
import { useSize } from './useSize';
import styles from './Chart.module.css';

type Mode = 'km' | 'travelDays';
const MODES: Record<Mode, { label: string; axis: string }> = {
  km: { label: 'Geographic', axis: 'great-circle km from source' },
  travelDays: { label: 'Network', axis: 'ORBIS travel days from source' },
};
const M = { top: 8, right: 14, bottom: 22, left: 40 };

/**
 * Arrival day vs distance from the source. Switching the x-axis from
 * geographic distance to ORBIS travel time shows that network distance —
 * not geography — orders the invasion (Spearman ρ displayed for both).
 */
export function DistanceVsArrival({ switcher }: { switcher?: ReactNode }) {
  const derived = useStore((s) => s.derived);
  const distances = useStore((s) => s.distances);
  const network = useStore((s) => s.network)!;
  const t = useStore((s) => s.t);
  const hovered = useStore((s) => s.hovered);
  const { setHovered, setSelected } = useStore.getState();
  const [mode, setMode] = useState<Mode>('travelDays');
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);

  const w = Math.max(0, width - M.left - M.right);
  const h = Math.max(0, height - M.top - M.bottom);

  const rho = useMemo(() => {
    if (!derived || !distances) return null;
    const a = Float64Array.from(derived.arrival, (v, i) => (v > 0 && i !== derived.seed ? v : NaN));
    return { km: spearman(distances.km, a), travelDays: spearman(distances.travelDays, a) };
  }, [derived, distances]);

  const xs = distances?.[mode];
  const x = useMemo(() => {
    let mx = 1;
    if (xs) for (const v of xs) if (Number.isFinite(v) && v > mx) mx = v;
    return scaleLinear().domain([0, mx]).range([0, w]).nice(4);
  }, [xs, w]);
  const y = useMemo(() => scaleLinear().domain([0, derived?.tEnd ?? 1]).range([h, 0]), [derived, h]);

  // Dots on canvas (677 points, redrawn per frame).
  useEffect(() => {
    const c = canvas.current;
    if (!c || !derived || !xs || w <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = height * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, M.left * dpr, M.top * dpr);
    g.clearRect(-M.left, -M.top, width, height);
    const arr = derived.arrival;
    // not yet invaded (future): faint; invaded: red
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        if (a < 0 || !Number.isFinite(xs[i])) continue;
        const done = t >= a;
        if ((pass === 0) === done) continue;
        g.beginPath();
        g.arc(x(xs[i]), y(a), done ? 2.6 : 2, 0, Math.PI * 2);
        g.fillStyle = done ? (t - a < 45 ? 'rgba(178,34,34,0.95)' : 'rgba(128,22,26,0.7)') : 'rgba(104,120,140,0.25)';
        g.fill();
      }
    }
    if (hovered !== null && arr[hovered] >= 0) {
      g.beginPath();
      g.arc(x(xs[hovered]), y(arr[hovered]), 5.5, 0, Math.PI * 2);
      g.strokeStyle = '#1a1a1a';
      g.lineWidth = 1.5;
      g.stroke();
    }
  }, [derived, xs, x, y, t, width, height, w, hovered]);

  const nearest = (e: React.MouseEvent) => {
    if (!derived || !xs) return null;
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left - M.left;
    const py = e.clientY - r.top - M.top;
    let best: number | null = null;
    let bd = 64;
    derived.arrival.forEach((a, i) => {
      if (a < 0 || !Number.isFinite(xs[i])) return;
      const d = (x(xs[i]) - px) ** 2 + (y(a) - py) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };

  const years: number[] = [];
  if (derived) for (let yr = 165; yearStart(yr) <= derived.tEnd; yr++) years.push(yr);
  const hv = hovered !== null && derived && derived.arrival[hovered] >= 0 && xs ? hovered : null;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        {switcher ?? <h3 className={styles.title}>Arrival vs distance</h3>}
        <div className={styles.toggle} role="radiogroup">
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? styles.on : ''} onClick={() => setMode(m)}>
              {MODES[m].label}
              {rho && <span className="num"> ρ {rho[m].toFixed(2)}</span>}
            </button>
          ))}
        </div>
      </div>
      <div ref={ref} className={styles.plot}>
        {width > 0 && derived && (
          <>
            <svg width={width} height={height} className={styles.under}>
              <g transform={`translate(${M.left},${M.top})`}>
                {years.map((yr) => (
                  <g key={yr} transform={`translate(0,${y(yearStart(yr))})`}>
                    <line x2={w} stroke="var(--rule)" strokeDasharray={yr === 165 ? undefined : '2 3'} />
                    <text x={-8} dy="0.32em" textAnchor="end" className={styles.axis}>{yr}</text>
                  </g>
                ))}
                {x.ticks(4).map((v) => (
                  <text key={v} x={x(v)} y={h + 16} textAnchor="middle" className={styles.axis}>
                    {v.toLocaleString()}
                  </text>
                ))}
                <text x={w} y={h - 5} textAnchor="end" className={styles.axisTitle}>{MODES[mode].axis} →</text>
                <line x2={w} y1={y(t)} y2={y(t)} stroke="var(--red)" strokeWidth={1.2} opacity={0.7} />
              </g>
            </svg>
            <canvas
              ref={canvas}
              style={{ width, height }}
              className={styles.canvas}
              onMouseMove={(e) => setHovered(nearest(e))}
              onMouseLeave={() => setHovered(null)}
              onClick={(e) => setSelected(nearest(e))}
            />
          </>
        )}
        {hv !== null && derived && xs && (
          <div className={styles.tip} style={{ left: Math.min(width - 170, M.left + x(xs[hv]) + 10), top: M.top }}>
            <div className={styles.tipDate}>{network.nodes[hv].name}</div>
            <div className={styles.tipRow}><span>Arrival</span><b className="num">{formatDate(derived.arrival[hv])}</b></div>
            <div className={styles.tipRow}>
              <span>{mode === 'km' ? 'Distance' : 'Travel time'}</span>
              <b className="num">{Math.round(xs[hv]).toLocaleString()} {mode === 'km' ? 'km' : 'days'}</b>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
