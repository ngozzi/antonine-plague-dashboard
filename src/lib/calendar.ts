/**
 * Simulation calendar: day 0 = 1 January 165 CE, 365-day years with real
 * month lengths and no leap years (the engine's convention).
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const EPOCH_YEAR = 165;

export function dayToParts(day: number) {
  const d = Math.max(0, Math.floor(day));
  const year = EPOCH_YEAR + Math.floor(d / 365);
  let doy = d % 365;
  let m = 0;
  while (doy >= LENGTHS[m]) doy -= LENGTHS[m++];
  return { year, month: m, monthName: MONTHS[m], day: doy + 1 };
}

/** "14 Aug 166 CE" */
export function formatDate(day: number, era = true) {
  const p = dayToParts(day);
  return `${p.day} ${p.monthName} ${p.year}${era ? ' CE' : ''}`;
}

/** "Aug 166" */
export function formatMonth(day: number) {
  const p = dayToParts(day);
  return `${p.monthName} ${p.year}`;
}

/** Day offset of 1 Jan of a given CE year. */
export const yearStart = (year: number) => (year - EPOCH_YEAR) * 365;

/** "1 y 7 mo" / "213 days" */
export function formatDuration(days: number) {
  if (days < 120) return `${Math.round(days)} days`;
  const y = Math.floor(days / 365);
  const mo = Math.round((days - y * 365) / 30.4);
  if (y === 0) return `${mo} mo`;
  return mo ? `${y} y ${mo} mo` : `${y} y`;
}
