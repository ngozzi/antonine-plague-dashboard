export const fmtInt = (x: number) => Math.round(x).toLocaleString('en-US');

export function fmtPop(x: number) {
  if (x >= 1e6) return `${(x / 1e6).toFixed(x >= 1e7 ? 1 : 2)} M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(x >= 1e5 ? 0 : 1)} k`;
  return fmtInt(x);
}

export const fmtPct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

export function fmtNum(x: number, digits = 2) {
  if (Math.abs(x) < 0.01) return x.toExponential(1);
  return x.toFixed(digits);
}
