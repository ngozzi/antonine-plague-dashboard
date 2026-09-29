import { useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { area, line, curveMonotoneX } from 'd3-shape';
import type { ComparisonPathogen } from '../../data/types';
import { kde, type Evidence } from '../../lib/abc';
import { formatDate, yearStart } from '../../lib/calendar';
import { fmtInt, fmtPct } from '../../lib/format';
import { useSize } from '../charts/useSize';
import { colorOf } from './palette';
import styles from './Compare.module.css';

const X0 = yearStart(165);
const X1 = yearStart(168) - 1; // 31 Dec 167
const M = { top: 26, right: 170, bottom: 26, left: 96 };
const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export type DensityMode = 'all' | 'reached';

/**
 * Ridgeline of the peak time at Rome, one row per pathogen. The acceptance
 * window is a draggable band: drag its edges to resize, its body to move,
 * or elsewhere to draw a new one. Filled areas are the accepted draws.
 */
export function PeakDensity({
  pathogens,
  evidence,
  window: win,
  parade,
  mode,
  onWindow,
}: {
  pathogens: ComparisonPathogen[];
  evidence: Record<string, Evidence>;
  window: [number, number];
  parade: number;
  mode: DensityMode;
  onWindow: (w: [number, number]) => void;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const drag = useRef<{ kind: 'lo' | 'hi' | 'move' | 'new'; start: number; win: [number, number] } | null>(null);

  const w = Math.max(0, width - M.left - M.right);
  const h = Math.max(0, height - M.top - M.bottom);
  const rowH = h / Math.max(1, pathogens.length);
  const x = useMemo(() => scaleLinear().domain([X0, X1]).range([0, w]).clamp(true), [w]);

  // KDEs are independent of the window: compute once.
  const dens = useMemo(
    () =>
      pathogens.map((p) => {
        const { xs, ys } = kde(p.peak_days, X0, X1);
        return { p, xs, ys, frac: p.peak_days.length / p.n_total };
      }),
    [pathogens],
  );
  const scaled = dens.map((d) => ({ ...d, ys: mode === 'all' ? d.ys.map((v) => v * d.frac) : d.ys }));
  const yMax = Math.max(1e-12, ...scaled.flatMap((d) => d.ys));

  const toDay = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    return Math.round(x.invert(clientX - r.left - M.left));
  };

  const onDown = (e: React.PointerEvent<SVGRectElement>) => {
    const d = toDay(e.clientX, e.currentTarget);
    const tol = x.invert(7) - x.invert(0);
    const kind = Math.abs(d - win[0]) <= tol ? 'lo' : Math.abs(d - win[1]) <= tol ? 'hi' : d > win[0] && d < win[1] ? 'move' : 'new';
    drag.current = { kind, start: d, win: [...win] as [number, number] };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (kind === 'new') onWindow([d, d + 1]);
  };
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const d = toDay(e.clientX, e.currentTarget);
    setHover(d);
    const g = drag.current;
    if (!g) return;
    const [lo, hi] = g.win;
    if (g.kind === 'lo') onWindow([Math.min(d, hi - 1), hi]);
    else if (g.kind === 'hi') onWindow([lo, Math.max(d, lo + 1)]);
    else if (g.kind === 'move') onWindow([lo + d - g.start, hi + d - g.start]);
    else onWindow([Math.min(g.start, d), Math.max(g.start, d + 1)]);
  };
  const onUp = () => (drag.current = null);

  const years = [165, 166, 167];
  const months: number[] = [];
  for (const y of years) for (const m of MONTH_STARTS) months.push(yearStart(y) + m);
  const unit = mode === 'all' ? 'of all draws' : 'of draws reaching Rome';

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>Peak infection time at Rome</h3>
        <span className={styles.note}>drag on the chart to move or resize the acceptance window</span>
      </div>
      <div ref={ref} className={styles.plot}>
        {width > 0 && (
          <svg width={width} height={height}>
            <g transform={`translate(${M.left},${M.top})`}>
              {/* month grid + year labels */}
              {months.map((d) => (
                <line key={d} x1={x(d)} x2={x(d)} y2={h} stroke="var(--rule)" strokeWidth={d % 365 === 0 ? 1 : 0.5} opacity={d % 365 === 0 ? 1 : 0.6} />
              ))}
              {years.map((y) => (
                <text key={y} x={x(yearStart(y)) + 4} y={h + 17} className={styles.axis}>{y} CE</text>
              ))}

              {/* acceptance window band */}
              <rect x={x(win[0])} width={Math.max(1, x(win[1]) - x(win[0]))} y={-6} height={h + 6} fill="var(--ink)" opacity={0.05} />
              {[win[0], win[1]].map((d, k) => (
                <g key={k} transform={`translate(${x(d)},0)`}>
                  <line y1={-6} y2={h} stroke="var(--ink)" strokeWidth={1.2} />
                  <rect x={-3} y={-10} width={6} height={10} rx={2} fill="var(--ink)" />
                </g>
              ))}
              <text x={(x(win[0]) + x(win[1])) / 2} y={-14} textAnchor="middle" className={styles.winLabel}>
                {formatDate(win[0], false)} – {formatDate(win[1], false)}
              </text>

              {/* parade reference */}
              <line x1={x(parade)} x2={x(parade)} y1={-2} y2={h} stroke="var(--ink-2)" strokeDasharray="2 3" />
              <text x={x(parade) - 4} y={-2} textAnchor="end" className={styles.axis}>parade · {formatDate(parade, false)}</text>

              {/* ridges */}
              {scaled.map((d, i) => {
                const base = (i + 1) * rowH;
                const y = (v: number) => base - (v / yMax) * rowH * 0.92;
                const pts = d.xs.map((xv, k) => [xv, d.ys[k]] as [number, number]);
                const inWin = pts.filter(([xv]) => xv >= win[0] && xv <= win[1]);
                const a = area<[number, number]>().x((p) => x(p[0])).y0(base).y1((p) => y(p[1])).curve(curveMonotoneX);
                const l = line<[number, number]>().x((p) => x(p[0])).y((p) => y(p[1])).curve(curveMonotoneX);
                const col = colorOf(d.p.tag);
                const ev = evidence[d.p.tag];
                return (
                  <g key={d.p.tag}>
                    <line x1={0} x2={w} y1={base} y2={base} stroke="var(--rule-strong)" />
                    <path d={a(pts) ?? ''} fill={col} opacity={0.1} />
                    <path d={a(inWin) ?? ''} fill={col} opacity={0.5} />
                    <path d={l(pts) ?? ''} fill="none" stroke={col} strokeWidth={2} />
                    <g transform={`translate(-12,${base - rowH / 2})`}>
                      <rect x={-70} y={-7} width={10} height={10} rx={2} fill={col} />
                      <text x={-56} y={2} className={styles.rowLabel}>{d.p.label}</text>
                    </g>
                    <g transform={`translate(${w + 14},${base - rowH / 2})`} className={styles.rowStat}>
                      <text y={-6}><tspan className={styles.rowBig}>{fmtInt(ev.accepted)}</tspan> accepted</text>
                      <text y={12}>{fmtPct(ev.z, 2)} of {fmtInt(ev.total)} draws</text>
                      <text y={28} className={styles.muted}>{fmtPct(d.frac, 1)} reach Rome</text>
                    </g>
                  </g>
                );
              })}

              {hover !== null && hover >= X0 && hover <= X1 && (
                <line x1={x(hover)} x2={x(hover)} y2={h} stroke="var(--ink-3)" />
              )}
              <rect
                width={w}
                height={h}
                fill="transparent"
                style={{ cursor: drag.current ? 'grabbing' : 'crosshair', touchAction: 'none' }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerLeave={() => setHover(null)}
              />
            </g>
          </svg>
        )}
        {hover !== null && hover >= X0 && hover <= X1 && (
          <div className={styles.tip} style={{ left: Math.min(width - 230, M.left + x(hover) + 12), top: M.top }}>
            <div className={styles.tipTitle}>Week of {formatDate(hover, false)}</div>
            {scaled.map((d) => {
              const k = Math.min(d.ys.length - 1, Math.max(0, Math.round((hover - X0) / (d.xs[1] - d.xs[0]))));
              return (
                <div key={d.p.tag} className={styles.tipRow}>
                  <i style={{ background: colorOf(d.p.tag) }} />
                  <span>{d.p.label}</span>
                  <b className="num">{fmtPct(d.ys[k] * 7, 2)}</b>
                </div>
              );
            })}
            <div className={styles.tipFoot}>share of peaks per week, {unit}</div>
          </div>
        )}
      </div>
    </div>
  );
}
