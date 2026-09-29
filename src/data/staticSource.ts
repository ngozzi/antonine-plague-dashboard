/**
 * ★ REAL DATA ADAPTER ★
 *
 * Reads the bundle produced by `scripts/build_data.py` from public/data/:
 *   network.json               → ORBIS nodes / links
 *   scenarios.json             → pathogens, parameters, run table, ensemble
 *   runs/<tag>/shard_<k>.bin   → per-run arrays (layout in scenarios.run_layout)
 *
 * If you change the raw inputs, prefer editing build_data.py; edit this file
 * only if the bundle schema itself changes.
 */
import type { DataSource } from './DataSource';
import type { ComparisonData, Network, ScenarioCatalog } from './types';

const BASE = `${import.meta.env.BASE_URL}data/`;

interface RunLayout {
  n_nodes: number;
  n_weeks: number;
  week_days: number;
  record_bytes: number;
}

type Catalog = ScenarioCatalog & { run_layout: RunLayout };

async function json<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`Failed to load ${path} (${r.status}). Did you run \`npm run data\`?`);
  return r.json();
}

export function createStaticSource(): DataSource {
  let catalog: Promise<Catalog> | null = null;
  const shards = new Map<string, Promise<ArrayBuffer>>();

  const getCatalog = () => (catalog ??= json<Catalog>('scenarios.json'));

  const getShard = (tag: string, k: number) => {
    const key = `${tag}/${k}`;
    if (!shards.has(key)) {
      shards.set(
        key,
        fetch(`${BASE}runs/${tag}/shard_${k}.bin`).then((r) => {
          if (!r.ok) throw new Error(`Missing shard ${key}`);
          return r.arrayBuffer();
        }),
      );
    }
    return shards.get(key)!;
  };

  return {
    name: 'ORBIS simulation bundle',
    loadNetwork: () => json<Network>('network.json'),
    loadScenarios: getCatalog,
    loadComparison: () => json<ComparisonData>('comparison.json'),
    async loadRun(tag, sheet) {
      const cat = await getCatalog();
      const sc = cat.pathogens.find((p) => p.tag === tag);
      if (!sc) throw new Error(`Unknown pathogen ${tag}`);
      const L = cat.run_layout;
      const k = Math.floor(sheet / sc.shard_size);
      const buf = await getShard(tag, k);
      let off = (sheet - k * sc.shard_size) * L.record_bytes;
      const i16 = () => {
        const a = new Int16Array(buf.slice(off, off + L.n_nodes * 2));
        off += L.n_nodes * 2;
        return a;
      };
      const f32 = () => {
        const a = new Float32Array(buf.slice(off, off + L.n_weeks * 4));
        off += L.n_weeks * 4;
        return a;
      };
      const infector = i16();
      const tA = i16();
      const tB1 = i16();
      const tB2 = i16();
      const I = f32();
      const Dcum = f32();
      return {
        tag,
        sheet,
        infector,
        arrival: { tA, tB1, tB2 },
        weekly: Number.isNaN(I[0]) ? undefined : { weekDays: L.week_days, I, Dcum },
      };
    },
  };
}
