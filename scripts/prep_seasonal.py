#!/usr/bin/env python3
"""
Build the intermediate inputs of build_data.py from the main simulations:
seasonal sea mobility (seasonal_mode = 3), measles T_i = 8, accepted runs of the
full window 26 Oct 166 - 28 Feb 167 (base + ext167), as in the paper figures.

    python3 scripts/prep_seasonal.py        # writes data/seasonal/ (git-ignored)

Reads results_100k_seas, results_rotte_v12{,_ext167}_seas, waves30_100k{,_ext}_seas.
"""
from __future__ import annotations

import json
import shutil
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

DASH = Path(__file__).resolve().parent.parent
BASE = DASH.parent
OUT = DASH / "data" / "seasonal"
sys.path.insert(0, str(BASE / "src"))

import roma_common as RC  # noqa: E402
from blocco1_aggregazione import aggregate, load_rotte, normalize  # noqa: E402
from blocco2_edmonds import build_consensus_tree  # noqa: E402
from export_tabelle import export, load_coords_labels  # noqa: E402

TAGS = ["peste", "vaiolo", "morbillo"]
T_I = {"peste": 10, "vaiolo": 9.5, "morbillo": 8}
N_NODES, N_SERIES, N_WEEKS = 677, 4, 1565
I_, DDIS, ALIVE = 0, 1, 2
KEEP_WEEKS = 522                       # as N_WEEKS in build_data.py
YEARS = list(range(166, 196))          # as FIXED_YEARS in compute_impact_cache.py
YEAR_WEEKS = [min((y - 165) * 365 // 7, N_WEEKS - 1) for y in YEARS]
WINDOW = {"lo_day": 663, "hi_day": 788, "lo_date": "26 Oct 166", "hi_date": "28 Feb 167"}
ROTTE_DIRS = ["results_rotte_v12_seas", "results_rotte_v12_ext167_seas"]
WAVES_DIRS = ["waves30_100k_seas", "waves30_100k_ext_seas"]


def build_rotte(tag: str, d: Path) -> None:
    idx, bins = [], []
    for r in ROTTE_DIRS:
        idx.append(pd.read_csv(BASE / r / tag / "rotte.i32.index.csv"))
        bins.append(np.fromfile(BASE / r / tag / "rotte.i32", dtype=np.int32))
    idx = pd.concat(idx, ignore_index=True)
    arr = np.concatenate(bins)
    assert arr.size == len(idx) * 5 * N_NODES and idx.run_id.is_unique
    acc = pd.concat(pd.read_csv(BASE / "results_100k_seas" / tag / f"{tag}_accepted_peak{s}.csv")
                    for s in ("", "_ext167"))
    assert set(acc.run_id) == set(idx.run_id), f"{tag}: trees and accepted runs differ"
    arr.tofile(d / "rotte.i32")
    idx.to_csv(d / "rotte.i32.index.csv", index=False)
    print(f"  {tag}: {len(idx)} trees", flush=True)


def _rows(args):
    path, n, lo, hi = args
    mm = np.memmap(path, dtype=np.float32, mode="r", shape=(n, N_NODES, N_SERIES, N_WEEKS))
    I, D, calo = [], [], []
    for i in range(lo, hi):
        r = np.asarray(mm[i])
        I.append(r[:, I_, :KEEP_WEEKS].sum(axis=0, dtype=np.float64))
        D.append(r[:, DDIS, :KEEP_WEEKS].sum(axis=0, dtype=np.float64))
        al = r[:, ALIVE, :].sum(axis=0, dtype=np.float64)
        calo.append((al[0] - al[YEAR_WEEKS]) / al[0])
    return lo, np.array(I, np.float32), np.array(D, np.float32), np.array(calo)


def build_series(tag: str, d: Path) -> None:
    ids, I, D, calo = [], [], [], []
    for w in WAVES_DIRS:
        f = BASE / w / tag / "waves30.f32"
        ix = pd.read_csv(f"{f}.index.csv")
        n = len(ix)
        step = max(1, n // 48)
        with Pool(12) as pool:
            parts = sorted(pool.map(_rows, [(str(f), n, a, min(a + step, n)) for a in range(0, n, step)]),
                           key=lambda t: t[0])
        ids.append(ix.run_id.to_numpy())
        I.append(np.concatenate([p[1] for p in parts]))
        D.append(np.concatenate([p[2] for p in parts]))
        calo.append(np.concatenate([p[3] for p in parts]))
    np.savez(d / "imperial.npz", run_ids=np.concatenate(ids), I=np.concatenate(I), D_cum=np.concatenate(D))
    np.savez(d / "impact.npz", _years=np.array(YEARS), run_id=np.concatenate(ids), calo=np.concatenate(calo))
    meta = json.loads((BASE / WAVES_DIRS[0] / tag / "meta.json").read_text())
    assert meta["T_i"] == T_I[tag], (tag, meta["T_i"])
    (d / "meta.json").write_text(json.dumps(meta))
    print(f"  {tag}: series for {sum(map(len, ids))} runs", flush=True)


def build_consensus(tag: str, d: Path) -> None:
    agg = aggregate(load_rotte(str(d / "rotte.i32")))
    tree = build_consensus_tree(normalize(agg))
    info = load_coords_labels(str(BASE / "data" / "all_nodes_with_population_and_density.csv"))
    export(tree, agg, info, str(d / "tree_nodi.csv"), str(d / "tree_archi.csv"))


def build_configs(tag: str, d: Path) -> None:
    df = RC.load_pathogen(BASE / "results_100k_seas", tag)
    df[["run_id", "R0", "mob", "alpha", "peak_day"]].to_csv(d / "configs.csv.gz", index=False)


def main() -> None:
    meta = json.loads((BASE / "share" / "data" / "meta.json").read_text())
    meta["peak_window"] = WINDOW
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "abc_meta.json").write_text(json.dumps(meta))
    for tag in TAGS:
        d = OUT / tag
        d.mkdir(exist_ok=True)
        build_rotte(tag, d)
        build_consensus(tag, d)
        build_configs(tag, d)
        build_series(tag, d)
    for name in ("nodi_province_regioni.csv", "gorbit-edges.csv"):
        shutil.copy(BASE / "data" / name, OUT / name)
    print("prep done", flush=True)


if __name__ == "__main__":
    main()
