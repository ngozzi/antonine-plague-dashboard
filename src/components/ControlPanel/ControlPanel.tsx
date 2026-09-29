import { useMemo, useState } from 'react';
import { scenarioOf, useStore } from '../../state/store';
import type { Criterion } from '../../data/types';
import { formatDate } from '../../lib/calendar';
import { fmtNum, fmtPct } from '../../lib/format';
import { Segmented } from './Segmented';
import { RunStrip } from './RunStrip';
import styles from './ControlPanel.module.css';

const CRITERIA: { id: Criterion; label: string; hint: string }[] = [
  { id: 'tA', label: 'A', hint: 'First imported exposed case that takes hold' },
  { id: 'tB1', label: 'B1', hint: 'First locally infectious case' },
  { id: 'tB2', label: 'B2', hint: 'First endogenous transmission' },
];

export function ControlPanel() {
  const catalog = useStore((s) => s.catalog)!;
  const network = useStore((s) => s.network)!;
  const pathogen = useStore((s) => s.pathogen);
  const sheet = useStore((s) => s.sheet);
  const criterion = useStore((s) => s.criterion);
  const derived = useStore((s) => s.derived);
  const runLoading = useStore((s) => s.runLoading);
  const open = useStore((s) => s.panelOpen);
  const { selectPathogen, selectRun, setCriterion, togglePanel } = useStore.getState();
  const sc = useStore(scenarioOf);
  const [idQuery, setIdQuery] = useState('');
  const [placeQuery, setPlaceQuery] = useState('');
  const selected = useStore((s) => s.selected);
  const setSelected = useStore((s) => s.setSelected);
  const byName = useMemo(() => new Map(network.nodes.map((n) => [n.name.toLowerCase(), n.idx])), [network]);
  const quick = useMemo(
    () => ['Roma', 'Alexandria', 'Carthago', 'Londinium'].map((nm) => byName.get(nm.toLowerCase())).filter((i): i is number => i !== undefined),
    [byName],
  );

  // Runs ordered by time to Rome, for the stepper.
  const order = useMemo(() => {
    if (!sc) return [];
    const idx = [...sc.runs.run_id.keys()];
    const tr = sc.runs.t_rome;
    return idx.sort((a, b) => (tr[a] ?? 1e9) - (tr[b] ?? 1e9));
  }, [sc]);

  if (!open)
    return (
      <aside className={`${styles.panel} ${styles.collapsed}`}>
        <button className={styles.collapse} onClick={togglePanel} title="Show controls" aria-label="Show controls">
          ›
        </button>
      </aside>
    );
  if (!sc) return <aside className={styles.panel} />;

  const r = sc.runs;
  const pos = order.indexOf(sheet);
  const step = (d: number) => selectRun(order[Math.max(0, Math.min(order.length - 1, pos + d))]);
  const presets = [
    { id: 'p10', label: 'Fast', title: '10th percentile of time to Rome', sheet: sc.representative.p10 },
    { id: 'p50', label: 'Median', title: 'Median time to Rome', sheet: sc.representative.p50 },
    { id: 'p90', label: 'Slow', title: '90th percentile of time to Rome', sheet: sc.representative.p90 },
  ];
  const seedName = network.nodes[sc.seed_nodes[0]]?.name ?? '—';

  const findById = (e: React.FormEvent) => {
    e.preventDefault();
    const k = r.run_id.indexOf(Number(idQuery));
    if (k >= 0) selectRun(k);
    setIdQuery('');
  };

  return (
    <aside className={styles.panel}>
      <div className={styles.head}>
        <span className="eyebrow">Simulation</span>
        <button className={styles.collapse} onClick={togglePanel} title="Hide controls" aria-label="Hide controls">
          ‹
        </button>
      </div>

      <section className={styles.section}>
        <label className={styles.label}>Pathogen</label>
        <Segmented
          value={pathogen}
          options={catalog.pathogens.map((p) => ({ id: p.tag, label: p.label }))}
          onChange={selectPathogen}
          large
        />
        <div className={styles.meta}>
          <span>Latent {sc.params.T_e} d</span>
          <span>Infectious {sc.params.T_i} d</span>
          <span>IFR {fmtPct(sc.params.IFR)}</span>
        </div>
      </section>

      <section className={styles.section}>
        <label className={styles.label}>Starting location</label>
        <div className={styles.static}>
          <span className={styles.seedDot} /> {seedName}
          <span className={styles.muted}>· 1 Jan 165 CE</span>
        </div>
      </section>

      <section className={styles.section}>
        <label className={styles.label} htmlFor="trace">Trace a place</label>
        <form
          className={styles.find}
          onSubmit={(e) => {
            e.preventDefault();
            const i = byName.get(placeQuery.trim().toLowerCase());
            if (i !== undefined) { setSelected(i); setPlaceQuery(''); }
          }}
        >
          <input
            id="trace"
            list="places"
            value={placeQuery}
            onChange={(e) => {
              setPlaceQuery(e.target.value);
              const i = byName.get(e.target.value.trim().toLowerCase());
              if (i !== undefined) { setSelected(i); setPlaceQuery(''); }
            }}
            placeholder="Search a place…"
          />
          <datalist id="places">
            {network.nodes.filter((n) => !n.junction).map((n) => <option key={n.idx} value={n.name} />)}
          </datalist>
        </form>
        <div className={styles.chips}>
          {quick.map((i) => (
            <button key={i} className={selected === i ? styles.chipOn : ''} onClick={() => setSelected(selected === i ? null : i)}>
              {network.nodes[i].key ?? network.nodes[i].name}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.labelRow}>
          <label className={styles.label}>Realization</label>
          <span className={`${styles.muted} num`}>{sc.n_runs.toLocaleString()} accepted runs</span>
        </div>
        <Segmented
          value={presets.find((p) => p.sheet === sheet)?.id ?? ''}
          options={[...presets.map((p) => ({ id: p.id, label: p.label, title: p.title })), { id: 'rnd', label: 'Random', title: 'Random accepted run' }]}
          onChange={(id) => {
            if (id === 'rnd') selectRun(Math.floor(Math.random() * sc.n_runs));
            else selectRun(presets.find((p) => p.id === id)!.sheet);
          }}
        />
        <RunStrip scenario={sc} sheet={sheet} onPick={selectRun} />
        <div className={styles.stepper}>
          <button onClick={() => step(-1)} disabled={pos <= 0} aria-label="Faster run">‹</button>
          <span className="num">
            Run <strong>{r.run_id[sheet]}</strong>
            <span className={styles.muted}> · rank {pos + 1}/{order.length}</span>
          </span>
          <button onClick={() => step(1)} disabled={pos >= order.length - 1} aria-label="Slower run">›</button>
        </div>
        <form onSubmit={findById} className={styles.find}>
          <input value={idQuery} onChange={(e) => setIdQuery(e.target.value)} placeholder="Go to run id…" inputMode="numeric" />
        </form>

        <dl className={`${styles.params} ${runLoading ? styles.loading : ''}`}>
          <dt>R₀</dt>
          <dd className="num">{fmtNum(r.R0[sheet])}</dd>
          <dt>Mobility η</dt>
          <dd className="num">{r.mob[sheet].toFixed(4)}</dd>
          <dt>Friction α</dt>
          <dd className="num">{fmtNum(r.alpha[sheet])}</dd>
          <dt>Reaches Rome</dt>
          <dd className="num">{r.t_rome[sheet] != null ? formatDate(r.t_rome[sheet]!) : 'never'}</dd>
          <dt>Nodes reached</dt>
          <dd className="num">
            {r.n_invaded[sheet]} / {network.nodes.length}
          </dd>
          {r.collapse_171[sheet] != null && (
            <>
              <dt>Pop. decline by 171</dt>
              <dd className="num">{fmtPct(r.collapse_171[sheet]!, 1)}</dd>
            </>
          )}
        </dl>
      </section>

      <section className={styles.section}>
        <label className={styles.label}>Invasion criterion</label>
        <Segmented
          value={criterion}
          options={CRITERIA.map((c) => ({ id: c.id, label: c.label, title: c.hint }))}
          onChange={(c) => setCriterion(c as Criterion)}
        />
        <p className={styles.hint}>{CRITERIA.find((c) => c.id === criterion)?.hint}.</p>
      </section>

      {derived && derived.nReached < network.nodes.length && (
        <p className={`${styles.hint} ${styles.foot}`}>
          {network.nodes.length - derived.nReached} places are never reached in this run.
        </p>
      )}
    </aside>
  );
}
