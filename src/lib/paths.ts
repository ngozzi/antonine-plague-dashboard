/**
 * Invasion paths: the chain of transmissions from the outbreak source to a
 * place, reconstructed from the `infector` channel of a run.
 */
import type { EdgeClass, Network, OrbisEdge } from '../data/types';
import type { RunDerived } from './epidemic';

/** Chain of node indices [seed, …, idx] in the given run; [] if never reached. */
export function pathTo(d: RunDerived, idx: number): number[] {
  if (d.arrival[idx] < 0) return [];
  const out = [idx];
  const seen = new Set(out);
  let cur = idx;
  while (d.infector[cur] >= 0) {
    cur = d.infector[cur];
    if (seen.has(cur)) break; // defensive: malformed record
    seen.add(cur);
    out.push(cur);
  }
  return out.reverse();
}

const cache = new WeakMap<Network, Map<string, OrbisEdge>>();
const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Undirected lookup of the ORBIS link between two nodes (cached per network). */
export function edgeBetween(net: Network, a: number, b: number): OrbisEdge | undefined {
  let m = cache.get(net);
  if (!m) {
    m = new Map();
    for (const e of net.edges) {
      const k = key(e.s, e.t);
      const cur = m.get(k);
      if (!cur || e.days < cur.days) m.set(k, e); // prefer the fastest parallel link
    }
    cache.set(net, m);
  }
  return m.get(key(a, b));
}

export type Via = EdgeClass | 'indirect';

export interface PathStep {
  idx: number;
  t: number; // arrival day
  dt: number; // days since previous hop
  via: Via | null; // null for the source
  km: number;
}

export function pathSteps(net: Network, d: RunDerived, path: number[]): PathStep[] {
  return path.map((idx, k) => {
    if (k === 0) return { idx, t: d.arrival[idx], dt: 0, via: null, km: 0 };
    const prev = path[k - 1];
    const e = edgeBetween(net, prev, idx);
    return { idx, t: d.arrival[idx], dt: d.arrival[idx] - d.arrival[prev], via: e ? e.cls : 'indirect', km: e?.km ?? 0 };
  });
}

export function pathSummary(steps: PathStep[]) {
  const km: Record<Via, number> = { road: 0, river: 0, sea: 0, indirect: 0 };
  for (const s of steps) if (s.via) km[s.via] += s.km;
  const total = km.road + km.river + km.sea;
  return {
    hops: Math.max(0, steps.length - 1),
    days: steps.length ? steps[steps.length - 1].t - steps[0].t : 0,
    km: total,
    seaShare: total ? km.sea / total : 0,
  };
}

/** Human label for how a hop travelled. */
export const VIA_LABEL: Record<Via, string> = {
  road: 'road',
  river: 'river',
  sea: 'sea',
  indirect: 'not directly linked',
};

/** Same sequence of nodes? */
export const samePath = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
