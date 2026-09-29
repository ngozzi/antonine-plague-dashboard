/**
 * Global app state: loaded data, current selection, playback.
 *
 * Invariant: `derived` always corresponds to (pathogen, sheet, criterion).
 * Any change of selection resets the timeline to the outbreak start and pauses.
 */
import { create } from 'zustand';
import { dataSource } from '../data';
import type { Criterion, Network, RunData, Scenario, ScenarioCatalog } from '../data/types';
import { deriveRun, seedDistances, type RunDerived, type SeedDistances } from '../lib/epidemic';

export type Tab = 'spread' | 'impact' | 'arrival' | 'centrality' | 'compare';

interface State {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  network: Network | null;
  catalog: ScenarioCatalog | null;
  distances: SeedDistances | null;

  pathogen: string;
  sheet: number;
  criterion: Criterion;
  run: RunData | null;
  derived: RunDerived | null;
  runLoading: boolean;

  t: number;
  playing: boolean;
  speed: number;

  hovered: number | null;
  selected: number | null;
  panelOpen: boolean;
  tab: Tab;

  init(): Promise<void>;
  selectPathogen(tag: string): Promise<void>;
  selectRun(sheet: number): Promise<void>;
  setCriterion(c: Criterion): void;
  setT(t: number): void;
  play(): void;
  pause(): void;
  toggle(): void;
  restart(): void;
  setSpeed(s: number): void;
  setHovered(i: number | null): void;
  setSelected(i: number | null): void;
  togglePanel(): void;
  setTab(t: Tab): void;
}

export const scenarioOf = (s: Pick<State, 'catalog' | 'pathogen'>): Scenario | undefined =>
  s.catalog?.pathogens.find((p) => p.tag === s.pathogen);

let runToken = 0;

export const useStore = create<State>((set, get) => ({
  status: 'loading',
  network: null,
  catalog: null,
  distances: null,
  pathogen: '',
  sheet: 0,
  criterion: 'tA',
  run: null,
  derived: null,
  runLoading: false,
  t: 0,
  playing: false,
  speed: 1,
  hovered: null,
  selected: null,
  panelOpen: true,
  tab: 'spread',

  async init() {
    try {
      const [network, catalog] = await Promise.all([dataSource.loadNetwork(), dataSource.loadScenarios()]);
      const first = catalog.pathogens[0];
      const seed = first.seed_nodes[0] ?? 0;
      set({ network, catalog, distances: seedDistances(network, seed), status: 'ready' });
      await get().selectPathogen(first.tag);
    } catch (e) {
      set({ status: 'error', error: String((e as Error).message ?? e) });
    }
  },

  async selectPathogen(tag) {
    const sc = get().catalog?.pathogens.find((p) => p.tag === tag);
    if (!sc) return;
    set({ pathogen: tag });
    await get().selectRun(sc.representative.p50);
  },

  async selectRun(sheet) {
    const { network, pathogen, criterion } = get();
    if (!network) return;
    const token = ++runToken;
    set({ sheet, runLoading: true, playing: false });
    const run = await dataSource.loadRun(pathogen, sheet);
    if (token !== runToken) return; // a newer selection won
    const sc = scenarioOf(get());
    const derived = deriveRun(network, run, criterion, sc?.seed_nodes[0]);
    set({ run, derived, runLoading: false, t: derived.tStart, playing: false });
  },

  setCriterion(criterion) {
    const { network, run } = get();
    set({ criterion });
    if (network && run) {
      const derived = deriveRun(network, run, criterion, scenarioOf(get())?.seed_nodes[0]);
      set({ derived, t: derived.tStart, playing: false });
    }
  },

  setT: (t) => {
    const d = get().derived;
    if (!d) return;
    set({ t: Math.max(0, Math.min(d.tEnd, t)) });
  },
  play() {
    const { derived, t } = get();
    if (derived && t >= derived.tEnd) set({ t: derived.tStart });
    set({ playing: true });
  },
  pause: () => set({ playing: false }),
  toggle: () => (get().playing ? get().pause() : get().play()),
  restart: () => set({ t: get().derived?.tStart ?? 0, playing: false }),
  setSpeed: (speed) => set({ speed }),
  setHovered: (hovered) => set({ hovered }),
  setSelected: (selected) => set({ selected }),
  togglePanel: () => set({ panelOpen: !get().panelOpen }),
  setTab: (tab) => set({ tab }),
}));

// Handy for debugging / scripted screenshots in dev.
if (import.meta.env.DEV) (window as unknown as { __store: typeof useStore }).__store = useStore;
