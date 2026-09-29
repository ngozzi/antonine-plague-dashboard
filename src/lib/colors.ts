/**
 * Palette (mirrors styles/tokens.css) and the node-state visual encoding.
 * Colors are RGB tuples for deck.gl.
 */
export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export const C = {
  bg: [247, 244, 238] as RGB,
  sea: [228, 233, 235] as RGB,
  land: [247, 244, 238] as RGB,
  province: [214, 206, 190] as RGB,
  ink: [26, 26, 26] as RGB,
  neutral: [104, 120, 140] as RGB, // susceptible node: desaturated blue-gray
  link: [120, 134, 150] as RGB,
  linkSea: [104, 136, 168] as RGB,
  linkRiver: [96, 142, 160] as RGB,
  red: [178, 34, 34] as RGB, // newly invaded
  deepRed: [128, 22, 26] as RGB, // established
  gold: [212, 145, 30] as RGB, // source
};

export const css = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;

/**
 * Timing constants of the animation, in SIMULATED days. At 1× playback runs
 * at PLAYBACK_DAYS_PER_SECOND, so e.g. 30 days ≈ 0.5 s on screen.
 */
export const T = {
  colorIn: 20, // neutral → red
  pulse: 45, // expanding ring after invasion
  settle: 240, // red → deep red (time since arrival)
  arcGrow: 18, // transmission line draws from infector to target
  arcFade: 160, // …then decays to a faint trace
  hubWindow: 60, // exports counted for hub activity ring
};

export const PLAYBACK_DAYS_PER_SECOND = 60;

/** Fill color of a node `dt` days after its invasion (dt < 0: not invaded). */
export function nodeFill(dt: number): RGBA {
  if (dt < 0) return [...C.neutral, 150];
  if (dt < T.colorIn) {
    const k = easeOut(dt / T.colorIn);
    const c = mix(C.neutral, C.red, k);
    return [c[0], c[1], c[2], 150 + 105 * k];
  }
  const k = clamp01((dt - T.colorIn) / T.settle);
  const c = mix(C.red, C.deepRed, k);
  return [c[0], c[1], c[2], 255 - 40 * k];
}
