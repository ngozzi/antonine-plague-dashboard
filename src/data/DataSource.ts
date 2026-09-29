import type { Network, RunData, ScenarioCatalog } from './types';

/**
 * The single boundary between the app and the data.
 *
 * Implementations:
 *  - staticSource.ts : real ORBIS + simulation bundle in public/data/
 *  - mockSource.ts   : synthetic network for development (?mock=1)
 *
 * To connect a new format, implement this interface and register it in
 * ./index.ts — no component needs to change.
 */
export interface DataSource {
  name: string;
  loadNetwork(): Promise<Network>;
  loadScenarios(): Promise<ScenarioCatalog>;
  /** `sheet` is the row in the pathogen's RunTable. */
  loadRun(tag: string, sheet: number): Promise<RunData>;
}
