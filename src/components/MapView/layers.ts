/**
 * deck.gl layer factory. Pure function of (static data, run, t, zoom), so the
 * whole map is re-described every frame and deck.gl diffs attributes.
 *
 * Visual grammar (network-driven spread):
 *   – transmission lines grow from infector to target, then fade to a trace:
 *     the eye follows ROUTES, not a radial front;
 *   – nodes that are exporting infection get an activity ring, so hubs
 *     reveal themselves by what they do, not by marker size.
 */
import { GeoJsonLayer, LineLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { PathStyleExtension } from '@deck.gl/extensions';
import type { Layer } from '@deck.gl/core';
import type { FeatureCollection } from 'geojson';
import type { Network, OrbisEdge, OrbisNode } from '../../data/types';
import { countAt, type RunDerived } from '../../lib/epidemic';
import { pathTo } from '../../lib/paths';
import { C, T, easeOut, mix, nodeFill, type RGBA } from '../../lib/colors';

export interface LayerCtx {
  network: Network;
  land: FeatureCollection | null;
  provinces: FeatureCollection | null;
  derived: RunDerived | null;
  t: number;
  zoom: number;
  hovered: number | null;
  selected: number | null;
  showProvinces: boolean;
  previewPath: number[] | null;
}

const dashExt = new PathStyleExtension({ dash: true });

// Stable per-network edge subsets (new arrays each frame would force deck.gl
// to recompute every attribute).
const edgeCache = new WeakMap<Network, { land: OrbisEdge[]; sea: OrbisEdge[]; labelsKey: Map<string, OrbisNode[]> }>();
function edgeSets(net: Network) {
  let c = edgeCache.get(net);
  if (!c) {
    c = { land: net.edges.filter((e) => e.cls !== 'sea'), sea: net.edges.filter((e) => e.cls === 'sea'), labelsKey: new Map() };
    edgeCache.set(net, c);
  }
  return c;
}

const radiusOf = (n: OrbisNode) => 1.6 + Math.min(4.2, Math.sqrt(n.pop) / 150);

export function buildLayers(ctx: LayerCtx): Layer[] {
  const { network, derived, t, zoom } = ctx;
  const { nodes } = network;
  const pos = (i: number): [number, number] => [nodes[i].lon, nodes[i].lat];
  const arr = derived?.arrival;
  const dtOf = (i: number) => (arr && arr[i] >= 0 && t >= arr[i] ? t - arr[i] : -1);
  const zScale = Math.max(0.85, Math.min(2.2, 1 + (zoom - 4.2) * 0.35));
  const tq = Math.floor(t); // quantised for cheap layers
  const layers: Layer[] = [];

  // --- basemap --------------------------------------------------------------
  if (ctx.land)
    layers.push(
      new GeoJsonLayer({
        id: 'land',
        data: ctx.land,
        filled: true,
        stroked: true,
        getFillColor: [...C.land, 255],
        getLineColor: [196, 190, 176, 255],
        lineWidthMinPixels: 0.6,
      }),
    );
  if (ctx.provinces && ctx.showProvinces)
    layers.push(
      new GeoJsonLayer({
        id: 'provinces',
        data: ctx.provinces,
        // Empire as a faint warm tint (outside land stays plain) + thin
        // solid internal borders; no dashes, so coasts don't look doubled.
        filled: true,
        getFillColor: [...C.province, 26],
        stroked: true,
        getLineColor: [...C.province, 120],
        getLineWidth: 0.8,
        lineWidthUnits: 'pixels',
      }),
    );
  // Province names once zoomed in enough to read them.
  if (ctx.provinces && ctx.showProvinces && zoom >= 4.8)
    layers.push(
      new TextLayer<ProvinceLabel>({
        id: 'province-labels',
        data: provinceLabels(ctx.provinces),
        getPosition: (d) => d.pos,
        getText: (d) => d.name.replace('Italia · ', '').toUpperCase(),
        getSize: 10.5,
        getColor: [...C.province, 255],
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: 600,
        fontSettings: { sdf: true, fontSize: 64, buffer: 6 },
        outlineWidth: 3,
        outlineColor: [247, 244, 238, 200],
        characterSet: 'auto',
      }),
    );

  // --- ORBIS links ----------------------------------------------------------
  const edgeColor = (e: OrbisEdge): RGBA => {
    const base = e.cls === 'sea' ? C.linkSea : e.cls === 'river' ? C.linkRiver : C.link;
    const a0 = e.cls === 'sea' ? 60 : 80;
    if (arr) {
      const both = arr[e.s] >= 0 && arr[e.t] >= 0 && tq >= arr[e.s] && tq >= arr[e.t];
      if (both) {
        const c = mix(base, C.deepRed, 0.45);
        return [c[0], c[1], c[2], a0 + 20];
      }
    }
    return [...base, a0];
  };
  layers.push(
    new LineLayer<OrbisEdge>({
      id: 'links-land',
      data: edgeSets(network).land,
      getSourcePosition: (e) => pos(e.s),
      getTargetPosition: (e) => pos(e.t),
      getColor: edgeColor,
      getWidth: (e) => (e.cls === 'river' ? 1.1 : 0.9),
      widthUnits: 'pixels',
      updateTriggers: { getColor: [tq, derived] },
    }),
    new PathLayer<OrbisEdge, { getDashArray?: unknown; dashJustified?: boolean }>({
      id: 'links-sea',
      data: edgeSets(network).sea,
      getPath: (e) => [pos(e.s), pos(e.t)],
      getColor: edgeColor,
      getWidth: 0.9,
      widthUnits: 'pixels',
      getDashArray: [4, 3],
      dashJustified: true,
      extensions: [dashExt],
      updateTriggers: { getColor: [tq, derived] },
    }),
  );

  if (!derived) return withNodes(layers, ctx, dtOf, zScale);

  // Selected place → its invasion path; everything else steps back.
  const path = ctx.selected !== null ? pathTo(derived, ctx.selected) : [];
  const focus = path.length > 1 || (ctx.previewPath?.length ?? 0) > 1;
  const dim = focus ? 0.35 : 1;

  // --- transmission lines (infector → target) -------------------------------
  const k = countAt(derived, t);
  const invaded = Array.from(derived.order.subarray(0, k));
  const transmissions = invaded.filter((i) => derived.infector[i] >= 0);
  layers.push(
    new LineLayer<number>({
      id: 'transmissions',
      data: transmissions,
      getSourcePosition: (i) => pos(derived.infector[i]),
      getTargetPosition: (i) => {
        const g = easeOut((t - derived.arrival[i]) / T.arcGrow);
        const a = pos(derived.infector[i]);
        const b = pos(i);
        return [a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g];
      },
      getColor: (i) => {
        const dt = t - derived.arrival[i];
        const fresh = 1 - Math.min(1, Math.max(0, (dt - T.arcGrow) / T.arcFade));
        return [...C.red, (36 + 200 * fresh) * dim];
      },
      getWidth: (i) => {
        const dt = t - derived.arrival[i];
        return 0.8 + 1.6 * (1 - Math.min(1, dt / (T.arcGrow + T.arcFade)));
      },
      widthUnits: 'pixels',
      updateTriggers: { getTargetPosition: t, getColor: [t, dim], getWidth: t },
    }),
  );

  // --- hub activity: recent exports ----------------------------------------
  const recentExports = new Map<number, number>();
  for (let j = k - 1; j >= 0 && t - derived.times[j] < T.hubWindow; j--) {
    const src = derived.infector[derived.order[j]];
    if (src >= 0) recentExports.set(src, (recentExports.get(src) ?? 0) + 1);
  }
  // Only nodes seeding ≥2 places in the window: keeps the map calm.
  const hubs = [...recentExports.entries()].filter(([, c]) => c >= 2);
  layers.push(
    new ScatterplotLayer<[number, number]>({
      id: 'hub-activity',
      data: hubs,
      getPosition: ([i]) => pos(i),
      getRadius: ([i, c]) => (radiusOf(nodes[i]) + 3 + 2 * Math.sqrt(c)) * zScale,
      radiusUnits: 'pixels',
      filled: true,
      stroked: true,
      getFillColor: ([, c]) => [...C.red, Math.min(40, 6 + c * 5) * dim],
      getLineColor: ([, c]) => [...C.deepRed, Math.min(170, 50 + c * 22) * dim],
      getLineWidth: ([, c]) => Math.min(2.2, 0.8 + c * 0.3),
      lineWidthUnits: 'pixels',
      updateTriggers: { getRadius: [t, zScale], getFillColor: [t, dim], getLineColor: [t, dim], getLineWidth: t },
    }),
  );

  // --- invasion pulse -------------------------------------------------------
  const pulsing: number[] = [];
  for (let j = k - 1; j >= 0 && t - derived.times[j] < T.pulse; j--) pulsing.push(derived.order[j]);
  layers.push(
    new ScatterplotLayer<number>({
      id: 'pulse',
      data: pulsing,
      getPosition: pos,
      getRadius: (i) => (radiusOf(nodes[i]) + 2 + 14 * easeOut((t - derived.arrival[i]) / T.pulse)) * zScale,
      radiusUnits: 'pixels',
      filled: false,
      stroked: true,
      getLineColor: (i) => [...C.red, 220 * (1 - (t - derived.arrival[i]) / T.pulse) * dim],
      getLineWidth: 1.4,
      lineWidthUnits: 'pixels',
      updateTriggers: { getRadius: [t, zScale], getLineColor: [t, dim] },
    }),
  );

  layers.push(...pathLayers(ctx, derived, path, pos));
  return withNodes(layers, ctx, dtOf, zScale, path);
}

interface Hop {
  a: number;
  b: number;
  done: boolean;
}

/**
 * The selected place's invasion path: hops already taken at time t are solid
 * deep red (on a light casing), hops still to come are dashed ink, so during
 * playback the route fills in hop by hop. An optional preview path (hovered
 * in the side panel) is drawn in dashed gold.
 */
function pathLayers(ctx: LayerCtx, derived: RunDerived, path: number[], pos: (i: number) => [number, number]): Layer[] {
  const { t } = ctx;
  const out: Layer[] = [];
  const preview = ctx.previewPath;
  if (preview && preview.length > 1)
    out.push(
      new PathLayer<number[], { getDashArray?: unknown; dashJustified?: boolean }>({
        id: 'preview-path',
        data: [preview],
        getPath: (p) => p.map(pos),
        getColor: [...C.gold, 240],
        getWidth: 3,
        widthUnits: 'pixels',
        getDashArray: [5, 3],
        dashJustified: true,
        extensions: [dashExt],
        jointRounded: true,
      }),
    );
  if (path.length < 2) return out;
  const hops: Hop[] = [];
  for (let k = 1; k < path.length; k++) hops.push({ a: path[k - 1], b: path[k], done: t >= derived.arrival[path[k]] });
  const done = hops.filter((h) => h.done);
  const todo = hops.filter((h) => !h.done);
  out.push(
    new LineLayer<Hop>({
      id: 'path-casing',
      data: done,
      getSourcePosition: (h) => pos(h.a),
      getTargetPosition: (h) => pos(h.b),
      getColor: [251, 249, 245, 230],
      getWidth: 6,
      widthUnits: 'pixels',
    }),
    new LineLayer<Hop>({
      id: 'path-done',
      data: done,
      getSourcePosition: (h) => pos(h.a),
      getTargetPosition: (h) => pos(h.b),
      getColor: [...C.deepRed, 255],
      getWidth: 3,
      widthUnits: 'pixels',
    }),
    new PathLayer<Hop, { getDashArray?: unknown; dashJustified?: boolean }>({
      id: 'path-todo',
      data: todo,
      getPath: (h) => [pos(h.a), pos(h.b)],
      getColor: [...C.ink, 200],
      getWidth: 1.8,
      widthUnits: 'pixels',
      getDashArray: [3, 3],
      dashJustified: true,
      extensions: [dashExt],
    }),
  );
  return out;
}

function withNodes(layers: Layer[], ctx: LayerCtx, dtOf: (i: number) => number, zScale: number, path: number[] = []): Layer[] {
  const { network, derived, t } = ctx;
  const { nodes } = network;
  const seed = derived?.seed ?? -1;
  const rome = network.rome_idx;

  layers.push(
    new ScatterplotLayer<OrbisNode>({
      id: 'nodes',
      data: nodes,
      getPosition: (n) => [n.lon, n.lat],
      getRadius: (n) => radiusOf(n) * zScale,
      radiusUnits: 'pixels',
      getFillColor: (n) => (n.idx === seed ? [...C.gold, 255] : nodeFill(dtOf(n.idx))),
      stroked: true,
      getLineColor: (n) => (dtOf(n.idx) >= 0 ? [255, 255, 255, 170] : [247, 244, 238, 200]),
      getLineWidth: 0.6,
      lineWidthUnits: 'pixels',
      pickable: true,
      updateTriggers: { getFillColor: [t, derived], getLineColor: [t, derived], getRadius: zScale },
    }),
  );

  // Emphasis rings: source (gold), Rome (ink halo), hovered / selected.
  const rings: { i: number; color: RGBA; r: number; w: number }[] = [];
  if (seed >= 0) rings.push({ i: seed, color: [...C.gold, 230], r: 7, w: 1.5 });
  rings.push({ i: rome, color: [...C.ink, 170], r: 7, w: 1 });
  for (const i of path.slice(1, -1)) rings.push({ i, color: [...C.deepRed, 230], r: 2.5, w: 1.4 });
  if (ctx.selected !== null) rings.push({ i: ctx.selected, color: [...C.ink, 255], r: 6, w: 1.8 });
  if (ctx.hovered !== null && ctx.hovered !== ctx.selected) rings.push({ i: ctx.hovered, color: [...C.ink, 140], r: 5, w: 1.2 });
  layers.push(
    new ScatterplotLayer<(typeof rings)[number]>({
      id: 'rings',
      data: rings,
      getPosition: (d) => [nodes[d.i].lon, nodes[d.i].lat],
      getRadius: (d) => (radiusOf(nodes[d.i]) + d.r) * zScale,
      radiusUnits: 'pixels',
      filled: false,
      stroked: true,
      getLineColor: (d) => d.color,
      getLineWidth: (d) => d.w,
      lineWidthUnits: 'pixels',
      updateTriggers: { getRadius: zScale },
    }),
  );

  // Names along the selected path (junctions and already-labelled places skipped).
  const pathNamed = declutter(
    path.filter((i) => !nodes[i].key && !nodes[i].junction),
    nodes.filter((n) => n.key),
    nodes,
    ctx.zoom,
  );
  if (pathNamed.length)
    layers.push(
      new TextLayer<number>({
        id: 'path-labels',
        data: pathNamed,
        getPosition: (i) => [nodes[i].lon, nodes[i].lat],
        getText: (i) => nodes[i].name,
        getSize: 12,
        getColor: [...C.deepRed, 255],
        getPixelOffset: (i) => [radiusOf(nodes[i]) * zScale + 6, 0],
        getTextAnchor: 'start',
        getAlignmentBaseline: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: 600,
        fontSettings: { sdf: true, fontSize: 64, buffer: 6 },
        outlineWidth: 4,
        outlineColor: [247, 244, 238, 240],
        characterSet: 'auto',
        updateTriggers: { getPixelOffset: zScale },
      }),
    );

  // Labels: key places always, larger towns as the user zooms in.
  const minPop = ctx.zoom > 6 ? 8000 : ctx.zoom > 5.2 ? 30000 : Infinity;
  const cache = edgeSets(network).labelsKey;
  const lk = String(minPop);
  if (!cache.has(lk)) cache.set(lk, nodes.filter((n) => n.key || n.pop >= minPop));
  const labelled = cache.get(lk)!;
  layers.push(
    new TextLayer<OrbisNode>({
      id: 'labels',
      data: labelled,
      getPosition: (n) => [n.lon, n.lat],
      getText: (n) => n.key ?? n.name,
      getSize: (n) => (n.key ? 13 : 11.5),
      getColor: (n) => (n.key ? [...C.ink, 235] : [70, 70, 70, 210]),
      getPixelOffset: (n) => [radiusOf(n) * zScale + 6, 0],
      getTextAnchor: 'start',
      getAlignmentBaseline: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: 500,
      fontSettings: { sdf: true, fontSize: 64, buffer: 6 },
      outlineWidth: 4,
      outlineColor: [247, 244, 238, 230],
      characterSet: 'auto',
      updateTriggers: { getPixelOffset: zScale },
    }),
  );
  return layers;
}

/** Web-Mercator pixel position at a zoom level (for label de-overlap). */
function px(n: OrbisNode, zoom: number): [number, number] {
  const scale = (512 * 2 ** zoom) / (2 * Math.PI);
  const lat = (n.lat * Math.PI) / 180;
  return [scale * ((n.lon * Math.PI) / 180), -scale * Math.log(Math.tan(Math.PI / 4 + lat / 2))];
}

/**
 * Greedy label de-overlap: keep a candidate only if its label box does not
 * collide with an already-placed one (key-place labels are placed first).
 */
function declutter(candidates: number[], fixed: OrbisNode[], nodes: OrbisNode[], zoom: number): number[] {
  const W = 90;
  const H = 15;
  const placed = fixed.map((n) => px(n, zoom));
  const out: number[] = [];
  for (const i of candidates) {
    const [x, y] = px(nodes[i], zoom);
    if (placed.every(([a, b]) => Math.abs(a - x) > W || Math.abs(b - y) > H)) {
      placed.push([x, y]);
      out.push(i);
    }
  }
  return out;
}

interface ProvinceLabel {
  name: string;
  pos: [number, number];
}

const provinceLabelCache = new WeakMap<FeatureCollection, ProvinceLabel[]>();

/** One label per province, at the vertex centroid of its largest polygon. */
function provinceLabels(fc: FeatureCollection): ProvinceLabel[] {
  let out = provinceLabelCache.get(fc);
  if (out) return out;
  out = [];
  for (const f of fc.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    let best: number[][] | null = null;
    let bestArea = -1;
    for (const p of polys) {
      const ring = p[0];
      const xs = ring.map((c) => c[0]);
      const ys = ring.map((c) => c[1]);
      const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      if (area > bestArea) { bestArea = area; best = ring; }
    }
    const name = String(f.properties?.name ?? '');
    if (!best || !name) continue;
    const n = best.length;
    out.push({ name, pos: [best.reduce((s, c) => s + c[0], 0) / n, best.reduce((s, c) => s + c[1], 0) / n] });
  }
  provinceLabelCache.set(fc, out);
  return out;
}
