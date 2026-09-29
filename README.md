# Antonine Plague Simulator: dashboard

An interactive explorer for simulations of the Antonine Plague (smallpox, measles and plague hypotheses) spreading over the ORBIS Roman transport network.

```bash
npm install
npm run data     # python3 scripts/build_data.py → public/data/
npm run dev      # http://localhost:5173   (add ?mock=1 for synthetic data)
npm run build    # static site in dist/ (works offline, no tile server)
```

> The generated bundle in `public/data/` is committed, so the app runs straight after cloning. `npm run data` rebuilds it from the raw inputs in `dashboard/data/` and `../final_paper/…`, which are not in this repo.

Keyboard shortcuts: **Space** plays or pauses, **← / →** step 30 days, and **Home** restarts.

## Architecture

```
scripts/build_data.py      raw simulation files  →  compact static bundle (public/data/)
src/data/                  ★ data layer: types, DataSource interface, adapters
  types.ts                   internal model (OrbisNode, OrbisEdge, Scenario, RunData)
  staticSource.ts            reads public/data/* (real data)
  mockSource.ts              synthetic network + epidemic (?mock=1)
  index.ts                   picks the adapter
src/state/store.ts         selection + playback (zustand)
src/lib/                   calendar, colours, derived epidemic metrics (pure functions)
src/hooks/usePlayback.ts   requestAnimationFrame loop + keyboard
src/components/
  MapView/                 deck.gl map; layers.ts is the whole visual grammar
  ControlPanel/            pathogen / realization / criterion selection
  TimelineBar, SummaryBar, NodeTooltip, NodeDetails, Header
  charts/                  invasion curve, population impact, arrival-vs-distance
```

The components only ever see the types in `src/data/types.ts`. File formats are handled in `scripts/build_data.py` and, if the bundle schema changes, in `src/data/staticSource.ts`.

## Where to plug in data

All raw paths are listed in the `SOURCES` dict at the top of `scripts/build_data.py`. Edit that dict and re-run `npm run data`.

| What | Source used now | Bundle output | Read by |
|---|---|---|---|
| **ORBIS nodes** (name, lon/lat, population, province) | `data/share_mappe/dati_postprocessing/nodi_province_regioni.csv`, ordered by the `nodes` list in `meta_<tag>.json` | `public/data/network.json` → `nodes` | `staticSource.loadNetwork` |
| **ORBIS edges** (type, km, days) | `data/share_mappe/dati_postprocessing/gorbit-edges.csv` (directed pairs merged into undirected links, classed as road / river / sea by `EDGE_CLASS`) | `network.json` → `edges` | `staticSource.loadNetwork` |
| **Invasion times per run** | `data/share_mappe/binari/<tag>/rotte.i32` `[n_run, 5, 677]` + `.index.csv` | `public/data/runs/<tag>/shard_<k>.bin` (layout in `RUN_LAYOUT`) | `staticSource.loadRun` |
| **Weekly imperial I / deaths** | `final_paper/share_enrichment/dati_preprocessati/imperial_<tag>.npz` | same shards | `staticSource.loadRun` |
| **Pathogen / scenario metadata** (labels, T_e, T_i, IFR, priors, seed, run parameters, representative runs) | `meta_<tag>.json`, `data/share/data/meta.json`, `rotte.i32.index.csv`, `impact_cache_all.npz`, `<tag>_nodi.csv` | `public/data/scenarios.json` | `staticSource.loadScenarios` |

Notes:

- **Node indexing.** Every per-node array is indexed by `idx`, which is the rank of the ORBIS id in ascending order. This matches the engine binaries. Never rely on CSV row order.
- **Time.** Times are absolute days, with day 0 = 1 Jan 165 CE on a 365-day calendar (`src/lib/calendar.ts`). A value of `-1` means the node is never reached.
- **Adding a pathogen or a new batch of runs.** Add its tag to `PATHOGENS` in the build script. The UI picks it up automatically.
- **Several starting locations.** `Scenario.seed_nodes` is already part of the model. Add a selector in `ControlPanel` and key the runs by seed.
- **Per-node compartments over time** (S/I/R per node). The optional `RunData.nodeSeries` field is reserved for this. Fill it in an adapter and extend `nodeFill` in `src/lib/colors.ts`, for example to show active prevalence versus post-wave.
- **A completely different format.** Implement the `DataSource` interface (`src/data/DataSource.ts`) and register it in `src/data/index.ts`.

## Visual encoding

| Element | Meaning |
|---|---|
| Blue-grey dot | Not yet invaded. Size grows with √population, within a narrow range. |
| Red dot and expanding ring | Newly invaded. The dot then settles to deep red. |
| Gold | Outbreak source (Nisibis). |
| Ink halo | Rome. |
| Red line from infector to node | The transmission that seeded this node (`infector` channel). It draws on invasion, then fades to a faint trace. |
| Soft red ring around a node | Hub activity: the node seeded at least 2 places in the last 60 days. |
| Solid / dashed / blue links | Road / sea / river. Links darken once both ends are invaded. |

### Invasion paths

Select a place: click it on the map or in the tree, search it under *Trace a place*, or use the quick chips. The dashboard then shows how the epidemic got there.

- **On the map.**
  - The chain of transmissions from the source is drawn in solid red for hops already taken at the current time, and dashed ink for hops still ahead.
  - Everything else steps back, so the route reads first.
- **In the side panel.** The same chain, step by step: date, whether each hop went by road, river or sea, distance and delay. Clicking a date jumps the timeline to it.
  - Below it are the three most frequent full paths across all runs, with the share of runs that followed each (computed in `build_data.py::frequent_paths`). Hover one to trace it on the map in gold.
  - The consensus-tree parent and its support are shown too.
- **In the Invasion tree chart** (bottom right, where it shares a tab with Arrival vs distance). It shows the run's whole transmission tree over time, one row per place, with the selected path in ink.

In about 2% of hops, the infector's own criterion-A arrival comes a few days *after* the place it seeded, because it exported exposed travellers before it counted as invaded itself. These hops are marked `−N d*`.

The **Arrival vs distance** panel plots arrival day against geographic distance or against ORBIS travel time from the source, and shows the Spearman ρ for each. Network travel time predicts arrival much better than geographic distance, which is the key point that spread follows connectivity.

The **invasion criterion** (A / B1 / B2) switches between the engine's arrival definitions:
- A: the first imported exposed case that takes hold. This is the default and the one used for the paper's trees.
- B1: the first local infectious case.
- B2: the first endogenous transmission.
