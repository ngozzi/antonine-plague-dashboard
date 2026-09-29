/**
 * Internal data model of the dashboard.
 *
 * Everything the UI renders is expressed in these types. A DataSource
 * (see DataSource.ts) is responsible for turning raw files into them, so
 * swapping data formats never touches components.
 *
 * Conventions
 *  - Nodes are addressed by a dense integer `idx` (0..N-1); every per-node
 *    array (arrival times, infector, …) is indexed by it.
 *  - Times are in simulation days. Day 0 = 1 Jan 165 CE (see lib/calendar.ts).
 *  - A value < 0 in an arrival array means "never reached".
 */

export type EdgeClass = 'road' | 'river' | 'sea';

export interface OrbisNode {
  idx: number;
  id: number; // ORBIS id
  name: string; // Roman-era label
  lon: number;
  lat: number;
  pop: number;
  rank: number; // ORBIS site rank
  degree: number;
  province: string;
  region: string;
  key?: string; // present for emphasised places (value = display name)
  junction?: boolean; // unnamed ORBIS junction (named after nearest place)
}

export interface OrbisEdge {
  s: number; // node idx
  t: number; // node idx
  type: string; // raw ORBIS type (road, coastal, overseas, upstream, …)
  cls: EdgeClass;
  km: number;
  days: number;
}

export interface Network {
  nodes: OrbisNode[];
  edges: OrbisEdge[];
  rome_idx: number;
}

/** Columnar table of the simulation runs available for a pathogen. */
export interface RunTable {
  run_id: number[];
  R0: number[];
  mob: number[];
  alpha: number[];
  t_rome: (number | null)[];
  n_invaded: number[];
  t_last: number[];
  collapse_171: (number | null)[];
  collapse_final: (number | null)[];
}

export interface EnsembleSummary {
  coverage: number[]; // fraction of runs reaching each node
  t_med: number[];
  t_p10: number[];
  t_p90: number[];
  tree_parent: number[]; // consensus invasion tree
  tree_p?: (number | null)[]; // support of the consensus edge into each node
}

export type PathogenTag = string;

export interface Scenario {
  tag: PathogenTag;
  label: string; // "Plague", "Smallpox", …
  params: { T_e: number; T_i: number; IFR: number };
  prior_ranges: Record<string, [number, number]>;
  seed_nodes: number[];
  n_runs: number;
  shard_size: number;
  runs: RunTable;
  /** sheet indices of representative runs, by time-to-Rome percentile */
  representative: { p10: number; p50: number; p90: number };
  ensemble: EnsembleSummary;
  /**
   * Most frequent full invasion chains per node across runs:
   * paths[node] = [[count, [seed, …, node]], …] (descending count).
   */
  paths?: [number, number[]][][];
  /** number of runs in which each node is reached */
  n_reached?: number[];
}

export interface ScenarioCatalog {
  calendar: { epoch_year: number; days_per_year: number };
  time_unit: 'day';
  peak_window?: { lo_day: number; hi_day: number };
  pathogens: Scenario[];
}

/** Invasion criterion: which engine channel defines "arrival". */
export type Criterion = 'tA' | 'tB1' | 'tB2';

/** Full data of ONE simulation realisation. */
export interface RunData {
  tag: PathogenTag;
  sheet: number; // position in the RunTable
  infector: Int16Array; // idx of seeding node, -1 = root / never
  arrival: Record<Criterion, Int16Array>;
  /** Optional imperial weekly series (NaN-filled when unavailable). */
  weekly?: { weekDays: number; I: Float32Array; Dcum: Float32Array };
  /**
   * Optional per-node compartments, node_states[idx][t] — not produced by the
   * current bundle, but the UI will use them if a DataSource provides them.
   */
  nodeSeries?: { tDays: Float32Array; I: Float32Array[]; R?: Float32Array[] };
}

/**
 * Inputs of the scenario comparison (ABC model selection): the day of the
 * epidemic peak at Rome for every prior draw that reaches Rome.
 */
export interface ComparisonPathogen {
  tag: PathogenTag;
  label: string;
  n_total: number; // all prior draws (incl. those never reaching Rome)
  peak_days: number[]; // sorted ascending
}

export interface ComparisonData {
  parade_day: number; // 12 Oct 166, reference date for the acceptance window
  window: [number, number]; // default acceptance window [lo, hi] (days)
  pathogens: ComparisonPathogen[];
}
