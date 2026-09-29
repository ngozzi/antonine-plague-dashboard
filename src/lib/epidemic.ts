/**
 * Pure functions deriving everything the UI needs from (network, run).
 * Heavy work is done once per run in `deriveRun`; per-frame queries
 * (`metricsAt`) are O(log N).
 */
import type { Criterion, Network, RunData } from '../data/types';

export interface RunDerived {
  arrival: Int16Array; // selected criterion
  infector: Int16Array;
  seed: number;
  /** invasion events sorted by time */
  order: Int32Array;
  times: Float64Array; // times[k] = arrival[order[k]]
  cumPop: Float64Array; // population reached after k+1 events
  children: number[][]; // node → invaded nodes it seeded
  totalPop: number;
  nNodes: number;
  nReached: number;
  tStart: number;
  tLast: number; // last invasion
  tEnd: number; // end of timeline
  tRome: number | null;
}

export function deriveRun(net: Network, run: RunData, criterion: Criterion, seedHint?: number): RunDerived {
  const arrival = run.arrival[criterion];
  const infector = run.infector;
  const n = arrival.length;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (arrival[i] >= 0) idx.push(i);
  idx.sort((a, b) => arrival[a] - arrival[b]);
  const order = Int32Array.from(idx);
  const times = Float64Array.from(idx, (i) => arrival[i]);
  const cumPop = new Float64Array(idx.length);
  let acc = 0;
  idx.forEach((i, k) => (cumPop[k] = acc += net.nodes[i].pop));
  const children: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) if (infector[i] >= 0 && arrival[i] >= 0) children[infector[i]].push(i);
  const totalPop = net.nodes.reduce((s, d) => s + d.pop, 0);
  const tStart = times.length ? times[0] : 0;
  const tLast = times.length ? times[times.length - 1] : 0;
  const seed = seedHint ?? (idx.length ? idx[0] : 0);
  const r = arrival[net.rome_idx];
  return {
    arrival,
    infector,
    seed,
    order,
    times,
    cumPop,
    children,
    totalPop,
    nNodes: n,
    nReached: idx.length,
    tStart,
    tLast,
    tEnd: Math.ceil((tLast + 90) / 30) * 30,
    tRome: r >= 0 ? r : null,
  };
}

/** Number of events with time <= t. */
export function countAt(d: RunDerived, t: number) {
  let lo = 0;
  let hi = d.times.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (d.times[m] <= t) lo = m + 1;
    else hi = m;
  }
  return lo;
}

export interface Metrics {
  invaded: number;
  pctNetwork: number;
  popReached: number;
  pctPop: number;
  elapsed: number;
  romeReached: boolean;
  deaths: number | null;
}

export function metricsAt(d: RunDerived, t: number, run?: RunData): Metrics {
  const k = countAt(d, t);
  const popReached = k ? d.cumPop[k - 1] : 0;
  let deaths: number | null = null;
  if (run?.weekly) {
    const w = Math.min(run.weekly.Dcum.length - 1, Math.max(0, Math.floor(t / run.weekly.weekDays)));
    deaths = run.weekly.Dcum[w];
  }
  return {
    invaded: k,
    pctNetwork: k / d.nNodes,
    popReached,
    pctPop: popReached / d.totalPop,
    elapsed: Math.max(0, t - d.tStart),
    romeReached: d.tRome !== null && t >= d.tRome,
    deaths,
  };
}

/** Invasion curve as [t, fraction] step points. */
export function invasionCurve(d: RunDerived): [number, number][] {
  const pts: [number, number][] = [[0, 0]];
  for (let k = 0; k < d.times.length; k++) pts.push([d.times[k], (k + 1) / d.nNodes]);
  pts.push([d.tEnd, d.nReached / d.nNodes]);
  return pts;
}

export function popCurve(d: RunDerived): [number, number][] {
  const pts: [number, number][] = [[0, 0]];
  for (let k = 0; k < d.times.length; k++) pts.push([d.times[k], d.cumPop[k] / d.totalPop]);
  pts.push([d.tEnd, d.nReached ? d.cumPop[d.nReached - 1] / d.totalPop : 0]);
  return pts;
}

// ---------------------------------------------------------------------------
// Static network measures (per seed)
// ---------------------------------------------------------------------------

export function haversineKm(a: { lon: number; lat: number }, b: { lon: number; lat: number }) {
  const R = 6371;
  const toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLon = (b.lon - a.lon) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface SeedDistances {
  km: Float64Array; // great-circle distance from seed
  travelDays: Float64Array; // shortest ORBIS travel time (edge `days`)
  hops: Int32Array; // shortest path length in links
}

export function seedDistances(net: Network, seed: number): SeedDistances {
  const n = net.nodes.length;
  const adj: [number, number][][] = Array.from({ length: n }, () => []);
  for (const e of net.edges) {
    adj[e.s].push([e.t, e.days]);
    adj[e.t].push([e.s, e.days]);
  }
  const km = Float64Array.from(net.nodes, (d) => haversineKm(net.nodes[seed], d));
  // Dijkstra (n is small: simple O(n²) is fine)
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  dist[seed] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    done[u] = 1;
    for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) dist[v] = dist[u] + w;
  }
  const hops = new Int32Array(n).fill(-1);
  hops[seed] = 0;
  const q = [seed];
  for (let h = 0; h < q.length; h++) {
    const u = q[h];
    for (const [v] of adj[u]) if (hops[v] < 0) { hops[v] = hops[u] + 1; q.push(v); }
  }
  return { km, travelDays: dist, hops };
}

/** Spearman rank correlation over pairs where both are finite. */
export function spearman(x: ArrayLike<number>, y: ArrayLike<number>) {
  const idx: number[] = [];
  for (let i = 0; i < x.length; i++) if (Number.isFinite(x[i]) && Number.isFinite(y[i])) idx.push(i);
  const rank = (v: ArrayLike<number>) => {
    const o = [...idx].sort((a, b) => v[a] - v[b]);
    const r = new Map<number, number>();
    let i = 0;
    while (i < o.length) {
      let j = i;
      while (j + 1 < o.length && v[o[j + 1]] === v[o[i]]) j++;
      for (let k = i; k <= j; k++) r.set(o[k], (i + j) / 2);
      i = j + 1;
    }
    return idx.map((k) => r.get(k)!);
  };
  const rx = rank(x);
  const ry = rank(y);
  const m = (rx.length - 1) / 2;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - m) * (ry[i] - m);
    dx += (rx[i] - m) ** 2;
    dy += (ry[i] - m) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

export type NodeState = 'susceptible' | 'new' | 'invaded' | 'never';

export function nodeState(d: RunDerived | null, i: number, t: number, newWindow = 45): NodeState {
  if (!d) return 'susceptible';
  const a = d.arrival[i];
  if (a < 0) return 'never';
  if (t < a) return 'susceptible';
  return t - a < newWindow ? 'new' : 'invaded';
}

export const STATE_LABEL: Record<NodeState, string> = {
  susceptible: 'Not yet invaded',
  new: 'Newly invaded',
  invaded: 'Invaded',
  never: 'Never reached in this run',
};
