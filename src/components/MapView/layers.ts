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
        filled: false,
        stroked: true,
        getLineColor: [...C.province, 150],
        lineWidthMinPixels: 0.5,
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
        return [...C.red, 36 + 200 * fresh];
      },
      getWidth: (i) => {
        const dt = t - derived.arrival[i];
        return 0.8 + 1.6 * (1 - Math.min(1, dt / (T.arcGrow + T.arcFade)));
      },
      widthUnits: 'pixels',
      updateTriggers: { getTargetPosition: t, getColor: t, getWidth: t },
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
      getFillColor: ([, c]) => [...C.red, Math.min(40, 6 + c * 5)],
      getLineColor: ([, c]) => [...C.deepRed, Math.min(170, 50 + c * 22)],
      getLineWidth: ([, c]) => Math.min(2.2, 0.8 + c * 0.3),
      lineWidthUnits: 'pixels',
      updateTriggers: { getRadius: [t, zScale], getFillColor: t, getLineColor: t, getLineWidth: t },
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
      getLineColor: (i) => [...C.red, 220 * (1 - (t - derived.arrival[i]) / T.pulse)],
      getLineWidth: 1.4,
      lineWidthUnits: 'pixels',
      updateTriggers: { getRadius: [t, zScale], getLineColor: t },
    }),
  );

  return withNodes(layers, ctx, dtOf, zScale);
}

function withNodes(layers: Layer[], ctx: LayerCtx, dtOf: (i: number) => number, zScale: number): Layer[] {
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
