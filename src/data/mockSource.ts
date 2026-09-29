/**
 * Synthetic data source for development and UI testing (open the app with
 * `?mock=1`). Generates a random Mediterranean-ish network and runs a
 * stochastic shortest-path "epidemic" on it, so every UI feature works
 * without the real bundle.
 */
import type { DataSource } from './DataSource';
import type { Network, OrbisEdge, OrbisNode, RunData, Scenario, ScenarioCatalog } from './types';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = 220;
const TAGS = [
  { tag: 'peste', label: 'Plague', speed: 1.0 },
  { tag: 'vaiolo', label: 'Smallpox', speed: 0.8 },
  { tag: 'morbillo', label: 'Measles', speed: 0.7 },
];
const RUNS = 20;

function makeNetwork(): Network {
  const r = rng(7);
  const nodes: OrbisNode[] = [];
  const anchors: [string, number, number][] = [
    ['Roma', 12.49, 41.89],
    ['Nisibis', 41.22, 37.07],
    ['Antiochia', 36.16, 36.2],
    ['Alexandria', 29.92, 31.2],
    ['Carthago', 10.32, 36.85],
  ];
  anchors.forEach(([name, lon, lat], i) =>
    nodes.push({ idx: i, id: 1 + i, name, lon, lat, pop: 2e5 * (1 - i * 0.15), rank: 10, degree: 0, province: 'Mock', region: 'Mock', key: name }),
  );
  while (nodes.length < N) {
    const lon = -8 + r() * 50;
    const lat = 30 + r() * 22;
    nodes.push({ idx: nodes.length, id: nodes.length + 1, name: `Locus ${nodes.length}`, lon, lat, pop: Math.round(2000 + r() ** 3 * 60000), rank: 1, degree: 0, province: 'Mock', region: 'Mock' });
  }
  const edges: OrbisEdge[] = [];
  const seen = new Set<string>();
  const add = (a: number, b: number, cls: OrbisEdge['cls']) => {
    const k = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (a === b || seen.has(k)) return;
    seen.add(k);
    const km = Math.hypot(nodes[a].lon - nodes[b].lon, nodes[a].lat - nodes[b].lat) * 95;
    edges.push({ s: Math.min(a, b), t: Math.max(a, b), type: cls, cls, km, days: km / (cls === 'sea' ? 120 : 30) });
  };
  nodes.forEach((n, i) => {
    const near = nodes
      .map((m, j) => [j, Math.hypot(m.lon - n.lon, m.lat - n.lat)] as const)
      .sort((a, b) => a[1] - b[1])
      .slice(1, 4);
    near.forEach(([j]) => add(i, j, 'road'));
    if (r() < 0.08) add(i, Math.floor(r() * N), 'sea');
  });
  edges.forEach((e) => {
    nodes[e.s].degree++;
    nodes[e.t].degree++;
  });
  return { nodes, edges, rome_idx: 0 };
}

let net: Network | null = null;
const network = () => (net ??= makeNetwork());

function simulate(tag: string, sheet: number): RunData {
  const { nodes, edges } = network();
  const speed = TAGS.find((t) => t.tag === tag)!.speed;
  const r = rng(sheet * 97 + tag.length);
  const adj: [number, number][][] = nodes.map(() => []);
  edges.forEach((e) => {
    const w = e.days * (0.5 + r() * 3) * 6 / speed;
    adj[e.s].push([e.t, w]);
    adj[e.t].push([e.s, w]);
  });
  const t = new Float64Array(N).fill(Infinity);
  const inf = new Int16Array(N).fill(-1);
  const done = new Uint8Array(N);
  t[1] = 0;
  for (let it = 0; it < N; it++) {
    let u = -1;
    for (let i = 0; i < N; i++) if (!done[i] && (u < 0 || t[i] < t[u])) u = i;
    if (u < 0 || t[u] === Infinity) break;
    done[u] = 1;
    for (const [v, w] of adj[u]) if (t[u] + w < t[v]) { t[v] = t[u] + w; inf[v] = u; }
  }
  const tA = Int16Array.from(t, (x) => (Number.isFinite(x) && x < 2500 ? Math.round(x) : -1));
  for (let i = 0; i < N; i++) if (tA[i] < 0) inf[i] = -1;
  const shift = (d: number) => Int16Array.from(tA, (x) => (x < 0 ? -1 : x + d));
  const weeks = 520;
  const I = new Float32Array(weeks);
  const Dcum = new Float32Array(weeks);
  const tmax = Math.max(...tA);
  for (let w = 0; w < weeks; w++) {
    const d = w * 7;
    I[w] = 2e5 * Math.exp(-(((d - tmax * 0.55) / (tmax * 0.25)) ** 2));
    Dcum[w] = (w ? Dcum[w - 1] : 0) + I[w] * 0.02;
  }
  return { tag, sheet, infector: inf, arrival: { tA, tB1: shift(4), tB2: shift(9) }, weekly: { weekDays: 7, I, Dcum } };
}

function makeCatalog(): ScenarioCatalog {
  const pathogens: Scenario[] = TAGS.map(({ tag, label }) => {
    const sims = Array.from({ length: RUNS }, (_, k) => simulate(tag, k));
    const tRome = sims.map((s) => s.arrival.tA[0]);
    const order = [...tRome.keys()].sort((a, b) => tRome[a] - tRome[b]);
    return {
      tag,
      label,
      params: { T_e: 4, T_i: 10, IFR: 0.3 },
      prior_ranges: { R0: [1, 3], mob: [0.001, 0.01], alpha: [1, 3] },
      seed_nodes: [1],
      n_runs: RUNS,
      shard_size: RUNS,
      runs: {
        run_id: sims.map((_, k) => 1000 + k),
        R0: sims.map((_, k) => 1.5 + k * 0.05),
        mob: sims.map(() => 0.005),
        alpha: sims.map(() => 2),
        t_rome: tRome.map((x) => (x < 0 ? null : x)),
        n_invaded: sims.map((s) => s.arrival.tA.filter((x) => x >= 0).length),
        t_last: sims.map((s) => Math.max(...s.arrival.tA)),
        collapse_171: sims.map(() => 0.1),
        collapse_final: sims.map(() => 0.12),
      },
      representative: { p10: order[2], p50: order[10], p90: order[18] },
      ensemble: {
        coverage: new Array(N).fill(1),
        t_med: Array.from(sims[order[10]].arrival.tA),
        t_p10: Array.from(sims[order[2]].arrival.tA),
        t_p90: Array.from(sims[order[18]].arrival.tA),
        tree_parent: Array.from(sims[order[10]].infector),
      },
    };
  });
  return { calendar: { epoch_year: 165, days_per_year: 365 }, time_unit: 'day', pathogens };
}

export function createMockSource(): DataSource {
  return {
    name: 'Mock (synthetic)',
    loadNetwork: async () => network(),
    loadScenarios: async () => makeCatalog(),
    loadRun: async (tag, sheet) => simulate(tag, sheet),
  };
}
