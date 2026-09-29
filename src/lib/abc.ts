/**
 * ABC rejection model selection between pathogens, as in
 * final_paper/plot1/plot_peak_density.ipynb:
 *
 *  - a prior draw is ACCEPTED if its epidemic peaks at Rome inside the
 *    window [lo, hi];
 *  - evidence of model M  ≈  accepted / all prior draws of M;
 *  - Bayes factor BF(M1:M2) = ratio of evidences, with a 95% Monte Carlo CI
 *    on log BF from binomial error: var(log p) = 1/a − 1/N;
 *  - posterior model probabilities with equal prior odds: evidence / Σ evidence.
 */
import type { ComparisonPathogen } from '../data/types';

/** Count of sorted values v with lo ≤ v ≤ hi. */
export function countIn(sorted: number[], lo: number, hi: number) {
  const lower = (x: number) => {
    let a = 0;
    let b = sorted.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (sorted[m] < x) a = m + 1;
      else b = m;
    }
    return a;
  };
  return lower(hi + 1) - lower(lo);
}

export interface Evidence {
  tag: string;
  accepted: number;
  total: number;
  reached: number;
  z: number; // accepted / total
}

export function evidence(p: ComparisonPathogen, lo: number, hi: number): Evidence {
  const accepted = countIn(p.peak_days, lo, hi);
  return { tag: p.tag, accepted, total: p.n_total, reached: p.peak_days.length, z: accepted / p.n_total };
}

export interface BF {
  a: string;
  b: string;
  bf: number;
  lo: number;
  hi: number;
}

export function bayesFactor(e1: Evidence, e2: Evidence): BF {
  const bf = e1.z / e2.z;
  const se = Math.sqrt(1 / e1.accepted - 1 / e1.total + 1 / e2.accepted - 1 / e2.total);
  return { a: e1.tag, b: e2.tag, bf, lo: bf * Math.exp(-1.96 * se), hi: bf * Math.exp(1.96 * se) };
}

/** Posterior model probabilities with equal prior odds. */
export function posterior(ev: Evidence[]) {
  const tot = ev.reduce((s, e) => s + e.z, 0);
  return ev.map((e) => (tot > 0 ? e.z / tot : 0));
}

/** Jeffreys (1961) scale; symmetric: returns the label and who it favours. */
export const JEFFREYS: [number, string][] = [
  [1, 'anecdotal'],
  [10 ** 0.5, 'substantial'],
  [10, 'strong'],
  [10 ** 1.5, 'very strong'],
  [100, 'decisive'],
];

export function jeffreys(bf: number) {
  const x = bf >= 1 ? bf : 1 / bf;
  let label = JEFFREYS[0][1];
  for (const [th, l] of JEFFREYS) if (x >= th) label = l;
  return label;
}

/**
 * Gaussian KDE (Scott's rule, as scipy.stats.gaussian_kde) evaluated on an
 * integer-day grid [x0, x1]. Data are binned by day first, which is exact for
 * integer peak days.
 */
export function kde(sorted: number[], x0: number, x1: number, step = 2): { xs: number[]; ys: number[] } {
  const n = sorted.length;
  const xs: number[] = [];
  for (let x = x0; x <= x1; x += step) xs.push(x);
  if (n < 5) return { xs, ys: xs.map(() => 0) };
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const bw = sd * n ** -0.2;
  // day histogram
  const d0 = sorted[0];
  const hist = new Float64Array(sorted[n - 1] - d0 + 1);
  for (const v of sorted) hist[v - d0]++;
  const reach = Math.ceil(5 * bw);
  const norm = 1 / (n * bw * Math.sqrt(2 * Math.PI));
  const ys = xs.map((x) => {
    let s = 0;
    const a = Math.max(0, x - reach - d0);
    const b = Math.min(hist.length - 1, x + reach - d0);
    for (let k = a; k <= b; k++) {
      const c = hist[k];
      if (c) s += c * Math.exp(-0.5 * ((k + d0 - x) / bw) ** 2);
    }
    return s * norm;
  });
  return { xs, ys };
}
