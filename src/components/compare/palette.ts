/**
 * Pathogen identity colors for the comparison view: the Okabe–Ito hues used
 * in the paper figures (final_paper/plot1/stile.py), validated for CVD
 * separation on the dashboard surface.
 */
export const PATHOGEN_COLOR: Record<string, string> = {
  vaiolo: '#D55E00', // smallpox — vermillion
  morbillo: '#0072B2', // measles — blue
  peste: '#CC79A7', // plague — reddish purple
};
export const colorOf = (tag: string) => PATHOGEN_COLOR[tag] ?? '#68788c';

/** Display order and Bayes-factor pairs, as in the paper. */
export const ORDER = ['vaiolo', 'morbillo', 'peste'];
export const BF_PAIRS: [string, string][] = [
  ['vaiolo', 'morbillo'],
  ['vaiolo', 'peste'],
  ['peste', 'morbillo'],
];
