import { useMemo, useState, type ReactNode } from 'react';
import { scaleLinear } from 'd3-scale';
import { line, curveStepAfter, curveMonotoneX } from 'd3-shape';
import { yearStart, formatDate } from '../../lib/calendar';
import { useSize } from './useSize';
import styles from './Chart.module.css';

export interface Series {
  id: string;
  label: string;
  color: string;
  points: [number, number][]; // [day, value], sorted by day
  step?: boolean;
}

const M = { top: 8, right: 14, bottom: 22, left: 40 };

function valueAt(pts: [number, number][], t: number) {
  let lo = 0;
  let hi = pts.length - 1;
  if (!pts.length || t < pts[0][0]) return null;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (pts[m][0] <= t) lo = m;
    else hi = m - 1;
  }
  return pts[lo][1];
}

/**
 * Time-series chart sharing the timeline's x-domain [0, tEnd].
 * The part after the current time is drawn faint, so the curve "reveals"
 * itself during playback; a crosshair tooltip shows values on hover.
 */
export function TimeChart({
  title,
  series,
  tEnd,
  t,
  yMax,
  yFormat,
  markers = [],
  extra,
}: {
  title: string;
  series: Series[];
  tEnd: number;
  t: number;
  yMax: number;
  yFormat: (v: number) => string;
  markers?: { day: number; label: string }[];
  extra?: ReactNode;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const w = Math.max(0, width - M.left - M.right);
  const h = Math.max(0, height - M.top - M.bottom);
  const x = useMemo(() => scaleLinear().domain([0, tEnd]).range([0, w]), [tEnd, w]);
  const y = useMemo(() => scaleLinear().domain([0, yMax]).range([h, 0]).nice(4), [yMax, h]);

  const paths = useMemo(
    () =>
      series.map((s) => {
        const gen = line<[number, number]>()
          .x((d) => x(d[0]))
          .y((d) => y(d[1]))
          .curve(s.step ? curveStepAfter : curveMonotoneX);
        return { ...s, d: gen(s.points) ?? '' };
      }),
    [series, x, y],
  );

  const years: number[] = [];
  for (let yr = 165; yearStart(yr) <= tEnd; yr++) years.push(yr);
  const xt = x(Math.min(t, tEnd));
  const clipId = `clip-${title.replace(/\W/g, '')}`;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <h3 className={styles.title}>{title}</h3>
        {series.length > 1 && (
          <div className={styles.legend}>
            {series.map((s) => (
              <span key={s.id}>
                <i style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        )}
        {extra}
      </div>
      <div ref={ref} className={styles.plot}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const px = e.clientX - r.left - M.left;
              setHover(px >= 0 && px <= w ? x.invert(px) : null);
            }}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <clipPath id={clipId}>
                <rect x={-2} y={-4} width={xt + 2} height={h + 8} />
              </clipPath>
            </defs>
            <g transform={`translate(${M.left},${M.top})`}>
              {y.ticks(4).map((v) => (
                <g key={v} transform={`translate(0,${y(v)})`}>
                  <line x2={w} stroke="var(--rule)" strokeDasharray={v === 0 ? undefined : '2 3'} />
                  <text x={-8} dy="0.32em" textAnchor="end" className={styles.axis}>
                    {yFormat(v)}
                  </text>
                </g>
              ))}
              {years.map((yr) => (
                <text key={yr} x={x(yearStart(yr))} y={h + 16} textAnchor="middle" className={styles.axis}>
                  {yr}
                </text>
              ))}
              {markers.map((m) => (
                <g key={m.label} transform={`translate(${x(m.day)},0)`}>
                  <line y2={h} stroke="var(--ink)" strokeWidth={1} strokeDasharray="1 2" opacity={0.6} />
                  <text y={-1} x={4} dy="0.8em" className={styles.marker}>
                    {m.label}
                  </text>
                </g>
              ))}
              {paths.map((p) => (
                <path key={p.id + 'f'} d={p.d} fill="none" stroke={p.color} strokeWidth={1.5} opacity={0.2} />
              ))}
              <g clipPath={`url(#${clipId})`}>
                {paths.map((p) => (
                  <path key={p.id} d={p.d} fill="none" stroke={p.color} strokeWidth={2} strokeLinejoin="round" />
                ))}
              </g>
              <line x1={xt} x2={xt} y2={h} stroke="var(--red)" strokeWidth={1.5} />
              {series.map((s) => {
                const v = valueAt(s.points, t);
                return v == null ? null : <circle key={s.id} cx={xt} cy={y(v)} r={3.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />;
              })}
              {hover != null && (
                <line x1={x(hover)} x2={x(hover)} y2={h} stroke="var(--ink-3)" strokeWidth={1} />
              )}
            </g>
          </svg>
        )}
        {hover != null && (
          <div
            className={styles.tip}
            style={{ left: Math.min(width - 170, M.left + x(hover) + 10), top: M.top }}
          >
            <div className={styles.tipDate}>{formatDate(hover)}</div>
            {series.map((s) => {
              const v = valueAt(s.points, hover);
              return (
                <div key={s.id} className={styles.tipRow}>
                  <i style={{ background: s.color }} />
                  <span>{s.label}</span>
                  <b className="num">{v == null ? '—' : yFormat(v)}</b>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
