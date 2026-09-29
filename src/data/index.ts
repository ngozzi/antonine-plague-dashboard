import type { DataSource } from './DataSource';
import { createMockSource } from './mockSource';
import { createStaticSource } from './staticSource';

/**
 * Data source selection. `?mock=1` in the URL or VITE_DATA_SOURCE=mock forces
 * the synthetic source; otherwise the real bundle in public/data/ is used.
 * Register new adapters here.
 */
export function pickDataSource(): DataSource {
  const q = new URLSearchParams(window.location.search);
  if (q.get('mock') === '1' || import.meta.env.VITE_DATA_SOURCE === 'mock') return createMockSource();
  return createStaticSource();
}

export const dataSource = pickDataSource();
export type { DataSource };
