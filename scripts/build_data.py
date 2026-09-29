#!/usr/bin/env python3
"""
Build the static data bundle consumed by the dashboard.

    python3 scripts/build_data.py            # from dashboard/

This is the ONLY place that knows about the raw simulation formats. It reads
the engine outputs / post-processing tables and writes compact assets to
`public/data/`:

    network.json               ORBIS nodes + undirected links
    scenarios.json             per-pathogen metadata, run table, ensemble quantiles
    runs/<tag>/shard_<k>.bin   per-run arrays (see RUN_LAYOUT below)
    provinces.geojson          province outlines (basemap decoration)

To plug in new simulations, point the paths in SOURCES at the new files (or
replace the loader functions) and re-run. The web app only depends on the
output schema documented here and in `src/data/types.ts`.

Conventions (from the engine):
  * node arrays are indexed by `idx` = rank of ORBIS id in ascending order
    (authoritative mapping: `nodes` list in meta_<tag>.json);
  * times are absolute days, day 0 = 1 Jan 165 CE, 365-day calendar;
  * -1 = never reached (or root, for `infector`).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
DASH = HERE.parent
REPO = DASH.parent
DATA = DASH / "data"
OUT = DASH / "public" / "data"

# --------------------------------------------------------------------------
# SOURCES — edit these paths to plug in other ORBIS / simulation files.
# --------------------------------------------------------------------------
SOURCES = {
    "nodes_csv": DATA / "share_mappe/dati_postprocessing/nodi_province_regioni.csv",
    "edges_csv": DATA / "share_mappe/dati_postprocessing/gorbit-edges.csv",
    "abc_meta": DATA / "share/data/meta.json",
    # ABC prior draws (100k per pathogen): R0, mob, alpha, peak_day at Rome
    "configs": DATA / "share/data/{tag}_configs.csv.gz",
    "engine_meta": REPO / "final_paper/share_enrichment/dati_preprocessati/meta_{tag}.json",
    "rotte": DATA / "share_mappe/binari/{tag}/rotte.i32",
    "rotte_index": DATA / "share_mappe/binari/{tag}/rotte.i32.index.csv",
    "imperial": REPO / "final_paper/share_enrichment/dati_preprocessati/imperial_{tag}.npz",
    "impact": DATA / "share_impact/data/impact_cache_all.npz",
    "consensus_nodes": DATA / "share_mappe/dati_postprocessing/{tag}_nodi.csv",
    "consensus_edges": DATA / "share_mappe/dati_postprocessing/{tag}_archi.csv",
    "provinces": REPO / "netsci26plot/data/provinces.geojson",
}

PATHOGENS = ["peste", "vaiolo", "morbillo"]
N_NODES = 677
SHARD_SIZE = 100
N_WEEKS = 522  # 10 years of weekly imperial series kept per run

# Per-run binary layout (little endian, contiguous, one record per run):
#   int16  infector[N]   idx of the node that seeded this one, -1 = root/never
#                        (time-consistent, repaired — see repair_infectors)
#   int16  tA[N]         arrival day, criterion A (first E that takes hold)
#   int16  tB1[N]        first local infectious
#   int16  tB2[N]        first endogenous transmission
#   int16  inferred[N]   1 = infector reconstructed by repair_infectors
#   f32    I[N_WEEKS]    imperial prevalence (weekly)
#   f32    Dcum[N_WEEKS] imperial cumulative disease deaths (weekly)
RUN_BYTES = 5 * N_NODES * 2 + 2 * N_WEEKS * 4

EDGE_CLASS = {
    "road": "road",
    "upstream": "river", "downstream": "river", "fastup": "river", "fastdown": "river",
    "coastal": "sea", "overseas": "sea", "slowcoast": "sea", "slowover": "sea", "ferry": "sea",
}

# Places emphasised on the map (labelled at every zoom level).
KEY_PLACES = {
    "Roma": "Rome", "Nisibis": "Nisibis", "Antiochia": "Antioch",
    "Alexandria": "Alexandria", "Carthago": "Carthage", "Constantinopolis": "Byzantium",
    "Aquileia": "Aquileia", "Athenae": "Athens",
    "Lugdunum": "Lugdunum", "Londinium": "Londinium", "Gades": "Gades",
    "Carnuntum": "Carnuntum", "Palmyra": "Palmyra", "Caesarea Maritima": "Caesarea",
}


ROMAN = {"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"}


def province_name(name: str) -> str:
    """Italy is split into the Augustan regions, named only by numeral."""
    return f"Italia · Regio {name}" if name in ROMAN else name


def p(key: str, tag: str | None = None) -> Path:
    return Path(str(SOURCES[key]).format(tag=tag))


def build_network(meta_nodes: list[dict]) -> dict:
    nodes = pd.read_csv(SOURCES["nodes_csv"]).set_index("id")
    id2idx = {n["id"]: n["idx"] for n in meta_nodes}
    assert len(id2idx) == N_NODES

    e = pd.read_csv(SOURCES["edges_csv"])
    links: dict[tuple[int, int, str], dict] = {}
    for r in e.itertuples():
        a, b = id2idx[r.source], id2idx[r.target]
        if a == b:
            continue
        cls = EDGE_CLASS.get(r.type, "road")
        key = (min(a, b), max(a, b), cls)
        cur = links.get(key)
        if cur is None or r.days < cur["days"]:
            links[key] = {"s": key[0], "t": key[1], "type": r.type, "cls": cls,
                          "km": round(float(r.km), 1), "days": round(float(r.days), 2)}
    edges = sorted(links.values(), key=lambda d: (d["s"], d["t"]))

    degree = np.zeros(N_NODES, int)
    nbrs = [set() for _ in range(N_NODES)]
    for d in edges:
        nbrs[d["s"]].add(d["t"]); nbrs[d["t"]].add(d["s"])
    for i in range(N_NODES):
        degree[i] = len(nbrs[i])

    out_nodes = []
    for n in sorted(meta_nodes, key=lambda n: n["idx"]):
        row = nodes.loc[n["id"]]
        label = str(row["label"])
        out_nodes.append({
            "idx": n["idx"], "id": int(n["id"]), "name": label,
            "lon": round(float(row["x"]), 4), "lat": round(float(row["y"]), 4),
            "pop": int(n["pop"]), "rank": int(row["rank"]), "degree": int(degree[n["idx"]]),
            "province": province_name(str(row["province"])), "region": str(row["macro_regione"]),
            **({"key": KEY_PLACES[label]} if label in KEY_PLACES else {}),
        })
    # Unnamed ORBIS junctions ("x"): name them after the nearest named place.
    named = [d for d in out_nodes if d["name"].strip() not in ("", "x")]
    for d in out_nodes:
        if d["name"].strip() in ("", "x"):
            near = min(named, key=lambda m: (m["lon"] - d["lon"]) ** 2 * np.cos(np.radians(d["lat"])) ** 2
                       + (m["lat"] - d["lat"]) ** 2)
            d["name"] = f"Junction near {near['name']}"
            d["junction"] = True
    return {"nodes": out_nodes, "edges": edges}


TOP_PATHS = 3


def repair_infectors(rotte: np.ndarray, adj: list[set[int]]) -> tuple[np.ndarray, np.ndarray]:
    """Make every run's infector channel a proper tree rooted at the seed.

    The engine records, for each place, who imported the exposed case that
    TOOK HOLD (criterion A). When a place was first exposed earlier by someone
    else and only "took hold" after a later re-introduction, the recorded link
    can point forward in time — e.g. Messana (first exposed d471, from
    Alexandria) exports to Regium (d472), and Messana's own A-event is later
    re-seeded from Regium: Messana ↔ Regium becomes a cycle and the chain never
    reaches the source (~60% of runs, ~40 places each).

    Rule: visit places in order of first exposure (t_firstE, then t_A),
    growing the tree from the seed. A recorded link is kept whenever its
    infector is already in the tree and was exposed no later than the place
    (same-day hand-offs included; ≈99% of links). Otherwise the first
    introduction is attributed to a neighbour already in the tree and exposed
    no later — preferring neighbours that had already taken hold by the
    place's first exposure, then the one that most often infects this place
    across the ensemble. The result is a tree: every chain ends at the seed.
    """
    n_run, _, n = rotte.shape
    inf = rotte[:, 0].copy()
    tE, tA = rotte[:, 1], rotte[:, 2]
    # ensemble frequency of recorded infector→place links
    freq = np.zeros((n, n), np.int32)
    rr, ii = np.nonzero((inf >= 0) & (tA >= 0))
    np.add.at(freq, (inf[rr, ii], ii), 1)
    inferred = np.zeros_like(inf, dtype=np.int16)
    n_fixed = 0
    for r in range(n_run):
        e, a, f = tE[r], tA[r], inf[r]
        reached = np.nonzero(a >= 0)[0]
        rooted = np.zeros(n, bool)
        rooted[reached[f[reached] < 0]] = True  # seed(s)
        order = sorted((i for i in reached if not rooted[i]), key=lambda i: (e[i], a[i], i))
        # group by first-exposure day so same-day hand-offs resolve in any order
        k = 0
        while k < len(order):
            day = e[order[k]]
            group = []
            while k < len(order) and e[order[k]] == day:
                group.append(order[k])
                k += 1
            pending = set(group)
            while pending:
                # 1) keep recorded links whose infector is already in the tree
                progress = True
                while progress:
                    progress = False
                    for i in list(pending):
                        if rooted[f[i]] and e[f[i]] <= e[i]:
                            rooted[i] = progress = True
                            pending.discard(i)
                if not pending:
                    break
                # 2) break one same-day cycle: reattribute the place with the
                #    best already-rooted neighbour, then go back to 1)
                best_i, best_j, best_s = -1, -1, None
                for i in pending:
                    for j in adj[i]:
                        if rooted[j] and e[j] <= e[i]:
                            sc = (a[j] <= e[i], freq[j, i], -a[j])
                            if best_s is None or sc > best_s:
                                best_i, best_j, best_s = i, j, sc
                assert best_i >= 0, f"run {r}: no rooted neighbour for {sorted(pending)}"
                f[best_i] = best_j
                inferred[r, best_i] = 1
                rooted[best_i] = True
                pending.discard(best_i)
                n_fixed += 1
        assert rooted[reached].all()
    print(f"            repaired {n_fixed:,} of {len(rr):,} infector links "
          f"({n_fixed / max(1, len(rr)):.2%}) in {int((inferred.sum(1) > 0).sum())}/{n_run} runs")
    return inf, inferred


def frequent_paths(inf_all: np.ndarray, tA_all: np.ndarray, top: int = TOP_PATHS) -> tuple[list, list]:
    """Most frequent full invasion chains (seed → node) across runs.

    Each node's chain in a run is identified by a rolling hash of its parent's
    chain, so full chains are only materialised for the winners.
    Returns (paths, n_reached): paths[node] = [[count, [seed, …, node]], …].
    """
    n_run, n = inf_all.shape
    counts: list[dict[int, int]] = [dict() for _ in range(n)]
    example: list[dict[int, int]] = [dict() for _ in range(n)]
    n_reached = np.zeros(n, int)
    for r in range(n_run):
        inf, tA = inf_all[r], tA_all[r]
        h = np.zeros(n, np.int64)
        ok = np.zeros(n, bool)
        for i0 in np.nonzero(tA >= 0)[0]:
            # resolve the chain hash of i0 (and its unresolved ancestors)
            stack, x = [], int(i0)
            while not ok[x] and inf[x] >= 0 and len(stack) <= n:
                stack.append(x)
                x = int(inf[x])
            if not ok[x]:  # x is the root
                if inf[x] >= 0:
                    raise AssertionError("infector tree not repaired")
                h[x], ok[x] = hash((0, x)), True
                stack.append(x) if x == i0 else None
            for y in reversed(stack):
                if not ok[y]:
                    h[y], ok[y] = hash((int(h[inf[y]]), y)), True
            n_reached[i0] += 1
            key = int(h[i0])
            counts[i0][key] = counts[i0].get(key, 0) + 1
            example[i0].setdefault(key, r)

    def chain(r: int, i: int) -> list[int]:
        out, inf, guard = [int(i)], inf_all[r], 0
        while inf[out[-1]] >= 0 and guard < n:
            out.append(int(inf[out[-1]]))
            guard += 1
        return out[::-1]

    paths = []
    for i in range(n):
        best = sorted(counts[i].items(), key=lambda kv: -kv[1])[:top]
        paths.append([[c, chain(example[i][k], i)] for k, c in best])
    return paths, n_reached.tolist()


def build_pathogen(tag: str, abc_meta: dict, impact: np.lib.npyio.NpzFile) -> dict:
    meta = json.loads(p("engine_meta", tag).read_text())
    idx = pd.read_csv(p("rotte_index", tag))
    rotte = np.fromfile(p("rotte", tag), dtype=np.int32).reshape(-1, 5, N_NODES)
    assert len(idx) == len(rotte), (tag, len(idx), len(rotte))
    n_run = len(rotte)
    roma = meta["roma_idx"]

    # Weekly imperial series, matched by run_id.
    imp = np.load(p("imperial", tag), allow_pickle=True)
    imp_pos = {int(r): i for i, r in enumerate(imp["run_ids"])}
    I = imp["I"][:, :N_WEEKS].astype("<f4")
    D = imp["D_cum"][:, :N_WEEKS].astype("<f4")

    # Yearly demographic collapse (fraction of initial pop), matched by run_id.
    years = impact["_years"].tolist()
    calo_pos = {int(r): i for i, r in enumerate(impact[f"{tag}__run_id"])}
    calo = impact[f"{tag}__calo"]
    y171 = years.index(171)

    # Time-consistent infector trees (see repair_infectors).
    id2idx = {nd["id"]: nd["idx"] for nd in meta["nodes"]}
    adj: list[set[int]] = [set() for _ in range(N_NODES)]
    for e in pd.read_csv(SOURCES["edges_csv"]).itertuples():
        a_, b_ = id2idx[e.source], id2idx[e.target]
        adj[a_].add(b_)
        adj[b_].add(a_)
    inf_fixed, inferred = repair_infectors(rotte, adj)

    # Shards.
    rdir = OUT / "runs" / tag
    rdir.mkdir(parents=True, exist_ok=True)
    missing_imp = 0
    for s0 in range(0, n_run, SHARD_SIZE):
        buf = bytearray()
        for k in range(s0, min(s0 + SHARD_SIZE, n_run)):
            rid = int(idx.run_id[k])
            ch = rotte[k]
            for arr in (inf_fixed[k], ch[2], ch[3], ch[4], inferred[k]):  # infector, tA, tB1, tB2, inferred
                assert arr.max() < 32767
                buf += arr.astype("<i2").tobytes()
            j = imp_pos.get(rid)
            if j is None:
                missing_imp += 1
                buf += np.full(2 * N_WEEKS, np.nan, "<f4").tobytes()
            else:
                buf += I[j].tobytes() + D[j].tobytes()
        assert len(buf) % RUN_BYTES == 0
        (rdir / f"shard_{s0 // SHARD_SIZE}.bin").write_bytes(bytes(buf))

    # Run table (columnar).
    tA = rotte[:, 2]
    t_rome = tA[:, roma].astype(float)
    t_rome[t_rome < 0] = np.nan
    runs = {
        "run_id": idx.run_id.astype(int).tolist(),
        "R0": idx.R0.round(4).tolist(),
        "mob": idx.mob.round(6).tolist(),
        "alpha": idx.alpha.round(4).tolist(),
        "t_rome": [None if np.isnan(v) else int(v) for v in t_rome],
        "n_invaded": (tA >= 0).sum(1).astype(int).tolist(),
        "t_last": tA.max(1).astype(int).tolist(),
        "collapse_171": [round(float(calo[calo_pos[int(r)], y171]), 4) if int(r) in calo_pos else None
                         for r in idx.run_id],
        "collapse_final": [round(float(calo[calo_pos[int(r)], -1]), 4) if int(r) in calo_pos else None
                           for r in idx.run_id],
    }

    # Representative runs by time-to-Rome percentile (sheet index).
    ok = np.where(~np.isnan(t_rome))[0]
    order = ok[np.argsort(t_rome[ok], kind="stable")]
    def pick(q: float) -> int:
        return int(order[min(len(order) - 1, int(round(q * (len(order) - 1))))])
    representative = {"p10": pick(0.10), "p50": pick(0.50), "p90": pick(0.90)}

    cons = pd.read_csv(p("consensus_nodes", tag)).sort_values("idx")
    arcs = pd.read_csv(p("consensus_edges", tag))
    tree_p = [None] * N_NODES
    for a in arcs.itertuples():
        tree_p[int(a.child_idx)] = round(float(a.p), 4)

    paths, n_reached = frequent_paths(inf_fixed, rotte[:, 2])
    top_rome = paths[roma][0] if paths[roma] else None
    ens = {
        "coverage": cons.coverage.round(4).tolist(),
        "t_med": cons.t_med.round(1).tolist(),
        "t_p10": cons.t_p10.round(1).tolist(),
        "t_p90": cons.t_p90.round(1).tolist(),
        "tree_parent": cons.parent_idx.fillna(-1).astype(int).tolist(),
        "tree_p": tree_p,
    }

    print(f"  {tag:9s} runs={n_run:5d} shards={-(-n_run // SHARD_SIZE):3d} "
          f"median t_rome={np.nanmedian(t_rome):.0f}d missing_weekly={missing_imp}")
    if top_rome:
        names = {n["idx"]: n["label"] for n in meta["nodes"]}
        print(f"            top path to Rome ({top_rome[0] / n_reached[roma]:.1%} of runs): "
              + " → ".join(names[i] for i in top_rome[1]))
    return {
        "tag": tag,
        "label": abc_meta["path_en"][tag].capitalize(),
        "params": {"T_e": meta["T_e"], "T_i": meta["T_i"], "IFR": meta["IFR"]},
        "prior_ranges": abc_meta["prior_ranges"][tag],
        "seed_nodes": meta["seed_node_indices"],
        "n_runs": n_run,
        "shard_size": SHARD_SIZE,
        "runs": runs,
        "representative": representative,
        "ensemble": ens,
        "paths": paths,
        "n_reached": n_reached,
    }, meta


def build_comparison(abc_meta: dict) -> dict:
    """Peak-time-at-Rome of every prior draw, for the scenario comparison view
    (KDE, window acceptance, Bayes factors, posterior model probabilities;
    same inputs as final_paper/plot1/plot_peak_density.ipynb)."""
    out = []
    for tag in PATHOGENS:
        cfg = pd.read_csv(p("configs", tag))
        pk = cfg.peak_day.dropna().round().astype(int).sort_values().to_numpy()
        out.append({"tag": tag, "label": abc_meta["path_en"][tag].capitalize(),
                    "n_total": int(len(cfg)), "peak_days": pk.tolist()})
        print(f"  {tag:9s} prior draws={len(cfg):,}  reaching Rome={len(pk):,}")
    return {
        "parade_day": 649,  # 12 Oct 166, triumph of Lucius Verus (roma_calendar.PARADE_DAY)
        "window": [abc_meta["peak_window"]["lo_day"], abc_meta["peak_window"]["hi_day"]],
        "pathogens": out,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    abc_meta = json.loads(SOURCES["abc_meta"].read_text())
    impact = np.load(SOURCES["impact"], allow_pickle=True)

    print("building scenarios …")
    scenarios, metas = [], {}
    for tag in PATHOGENS:
        sc, meta = build_pathogen(tag, abc_meta, impact)
        scenarios.append(sc)
        metas[tag] = meta

    # Node mapping must agree across pathogens.
    ref = metas[PATHOGENS[0]]
    for tag in PATHOGENS[1:]:
        assert [n["id"] for n in metas[tag]["nodes"]] == [n["id"] for n in ref["nodes"]]
    assert ref["roma_idx"] == 323 and ref["seed_node_indices"] == [271]

    network = build_network(ref["nodes"])
    network["rome_idx"] = ref["roma_idx"]
    (OUT / "network.json").write_text(json.dumps(network, separators=(",", ":")))
    print(f"network: {len(network['nodes'])} nodes, {len(network['edges'])} links")

    (OUT / "scenarios.json").write_text(json.dumps({
        "calendar": {"epoch_year": 165, "days_per_year": 365},
        "time_unit": "day",
        "run_layout": {"n_nodes": N_NODES, "n_weeks": N_WEEKS, "week_days": 7,
                       "record_bytes": RUN_BYTES,
                       "fields": ["infector:i16", "tA:i16", "tB1:i16", "tB2:i16", "inferred:i16", "I:f32", "Dcum:f32"]},
        "peak_window": abc_meta["peak_window"],
        "pathogens": scenarios,
    }, separators=(",", ":")))

    print("building comparison …")
    (OUT / "comparison.json").write_text(json.dumps(build_comparison(abc_meta), separators=(",", ":")))

    if p("provinces").exists():
        gj = json.loads(p("provinces").read_text())
        for f in gj["features"]:
            f["properties"]["name"] = province_name(str(f["properties"].get("name", "")))
        (OUT / "provinces.geojson").write_text(json.dumps(gj, separators=(",", ":")))
    print(f"done → {OUT}")


if __name__ == "__main__":
    main()
