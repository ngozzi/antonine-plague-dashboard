import { useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { MapView as DeckMapView, WebMercatorViewport, type MapViewState } from '@deck.gl/core';
import { feature } from 'topojson-client';
import type { FeatureCollection } from 'geojson';
import type { Topology } from 'topojson-specification';
import landTopo from 'world-atlas/land-50m.json';
import { useStore } from '../../state/store';
import { buildLayers } from './layers';
import { NodeTooltip } from '../NodeTooltip';
import { NodeDetails } from '../NodeDetails';
import { MapLegend } from './MapLegend';
import styles from './MapView.module.css';

const BOUNDS: [[number, number], [number, number]] = [
  [-9.5, 29],
  [44, 55.5],
];

const view = new DeckMapView({ repeat: false });

function fit(width: number, height: number): MapViewState {
  const vp = new WebMercatorViewport({ width, height }).fitBounds(BOUNDS, { padding: 24 });
  return { longitude: vp.longitude, latitude: vp.latitude, zoom: vp.zoom, pitch: 0, bearing: 0 };
}

export function MapView() {
  const network = useStore((s) => s.network)!;
  const derived = useStore((s) => s.derived);
  const t = useStore((s) => s.t);
  const hovered = useStore((s) => s.hovered);
  const selected = useStore((s) => s.selected);
  const previewPath = useStore((s) => s.previewPath);
  const setHovered = useStore((s) => s.setHovered);
  const setSelected = useStore((s) => s.setSelected);

  const ref = useRef<HTMLDivElement>(null);
  const [viewState, setViewState] = useState<MapViewState | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [provinces, setProvinces] = useState<FeatureCollection | null>(null);
  const [showProvinces, setShowProvinces] = useState(true);

  const land = useMemo(() => {
    const topo = landTopo as unknown as Topology;
    return feature(topo, topo.objects.land) as unknown as FeatureCollection;
  }, []);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/provinces.geojson`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setProvinces)
      .catch(() => setProvinces(null));
  }, []);

  // Fit to the Mediterranean once the container has a size.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setViewState((v) => v ?? fit(width, height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const resetView = () => {
    const el = ref.current;
    if (el) setViewState({ ...fit(el.clientWidth, el.clientHeight), transitionDuration: 500 } as MapViewState);
  };

  const layers = buildLayers({
    network,
    land,
    provinces,
    derived,
    t,
    zoom: viewState?.zoom ?? 4.2,
    hovered,
    selected,
    showProvinces,
    previewPath,
  });

  return (
    <div ref={ref} className={styles.map} onMouseLeave={() => { setHovered(null); setPointer(null); }}>
      {viewState && (
        <DeckGL
          views={view}
          viewState={viewState}
          onViewStateChange={({ viewState: v }) => setViewState(v as MapViewState)}
          controller={{ doubleClickZoom: true, inertia: 250 }}
          layers={layers}
          pickingRadius={6}
          getCursor={({ isHovering, isDragging }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'default')}
          onHover={(info) => {
            const i = info.layer?.id === 'nodes' && info.object ? (info.object as { idx: number }).idx : null;
            if (i !== useStore.getState().hovered) setHovered(i);
            setPointer(i !== null ? { x: info.x, y: info.y } : null);
          }}
          onClick={(info) => {
            const i = info.layer?.id === 'nodes' && info.object ? (info.object as { idx: number }).idx : null;
            setSelected(i);
          }}
        />
      )}
      <div className={styles.mapTools}>
        <button className={styles.tool} onClick={resetView} title="Reset view">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
          </svg>
        </button>
        <button
          className={`${styles.tool} ${showProvinces ? styles.on : ''}`}
          onClick={() => setShowProvinces((v) => !v)}
          title="Toggle province borders"
        >
          Provinces
        </button>
      </div>
      <MapLegend />
      {hovered !== null && pointer && <NodeTooltip idx={hovered} x={pointer.x} y={pointer.y} />}
      {selected !== null && <NodeDetails idx={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
