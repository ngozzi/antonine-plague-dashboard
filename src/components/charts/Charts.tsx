import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { invasionCurve, popCurve } from '../../lib/epidemic';
import { TimeChart, type Series } from './TimeChart';
import { DistanceVsArrival } from './DistanceVsArrival';
import { InvasionTree } from './InvasionTree';
import styles from './Chart.module.css';

const RED = '#9e1b1b';
const BLUE = '#2f6db0';
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function Charts() {
  const derived = useStore((s) => s.derived);
  const run = useStore((s) => s.run);
  const t = useStore((s) => s.t);

  const invasion = useMemo<Series[]>(
    () => (derived ? [{ id: 'inv', label: 'Places invaded', color: RED, points: invasionCurve(derived), step: true }] : []),
    [derived],
  );

  const impact = useMemo<Series[]>(() => {
    if (!derived) return [];
    const s: Series[] = [{ id: 'pop', label: 'Population reached', color: BLUE, points: popCurve(derived), step: true }];
    if (run?.weekly) {
      const { Dcum, weekDays } = run.weekly;
      const pts: [number, number][] = [];
      for (let w = 0; w < Dcum.length && w * weekDays <= derived.tEnd; w++) pts.push([w * weekDays, Dcum[w] / derived.totalPop]);
      s.push({ id: 'dead', label: 'Cumulative disease deaths', color: RED, points: pts });
    }
    return s;
  }, [derived, run]);

  if (!derived) return <div className={styles.row} />;
  const markers = derived.tRome != null ? [{ day: derived.tRome, label: 'Rome' }] : [];

  return (
    <div className={styles.row}>
      <TimeChart title="Network invasion" series={invasion} tEnd={derived.tEnd} t={t} yMax={1} yFormat={pct} markers={markers} />
      <TimeChart
        title="Population impact · share of empire"
        series={impact}
        tEnd={derived.tEnd}
        t={t}
        yMax={1}
        yFormat={pct}
        markers={markers}
      />
      <SwitchPanel />
    </div>
  );
}

type Third = 'tree' | 'distance';
const THIRD: { id: Third; label: string }[] = [
  { id: 'tree', label: 'Invasion tree' },
  { id: 'distance', label: 'Arrival vs distance' },
];

/** Third chart slot: invasion tree ↔ arrival-vs-distance, chosen by title tabs. */
function SwitchPanel() {
  const [mode, setMode] = useState<Third>('tree');
  const switcher = (
    <div className={styles.titleTabs} role="tablist">
      {THIRD.map((o) => (
        <button key={o.id} role="tab" aria-selected={mode === o.id} className={mode === o.id ? styles.titleOn : ''} onClick={() => setMode(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
  return mode === 'tree' ? <InvasionTree switcher={switcher} /> : <DistanceVsArrival switcher={switcher} />;
}
