import { PerspectiveCamera, WebGLRenderer } from 'three';
import type { FeatureCollection } from 'geojson';
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MapLibreMap,
  StyleSpecification,
} from 'maplibre-gl';
import {
  createRenderRoot,
  createResourceManager,
  createTextPrimitive,
  dedicatedContextCount,
  GpuPicker,
  LinePrimitive,
  MarkerSet,
  PointIndex,
  readGpuCapabilities,
  Viewport,
  type DataTransform,
  type PrimitiveContext,
  type RenderRoot,
  type ResourceManager,
  type RGBA,
  type TextPrimitive,
  type ViewportHost,
  type ViewportProjector,
} from '@mk7s/holochart-render';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import {
  collectEnv,
  createGpuTimer,
  createSpikePage,
  round,
  runFrames,
  scaled,
  sleep,
  summarize,
  syncGL,
  yieldTask,
  type GpuTimer,
  type SpikePage,
} from './env.ts';

/**
 * Spike G (GEO1): a Holochart layer over MapLibre GL, two ways.
 *
 * - `mode=custom`: Holochart primitives drawn into MapLibre's own WebGL context from a
 *   `CustomLayerInterface` (a three `WebGLRenderer` built on the map's canvas and context).
 * - `mode=overlay`: a normal `RenderRoot` canvas above the map, camera synced from the map.
 * - `mode=both`: both at once on one map (for looking at them side by side).
 * - `mode=map`: MapLibre alone (the baseline); `mode=native`: the same points as a MapLibre
 *   circle layer (what Plotly's `scattermap` does).
 *
 * `test=` picks what runs (comma list, default `contexts,sync,export`): `contexts`, `sync`,
 * `lag`, `perf`, `export`, `pick`, `events`, `loss`, `destroy`, `dashboard`, `diag`.
 * Other parameters: `proj=mercator|globe`, `sync=render|raf` (overlay scheduling), `ownloop=1`
 * (the chart is already animating when the map starts to move),
 * `shared=0|1|auto` (overlay through the shared renderer), `aa=0|1` (map MSAA), `oaa=0|1` (overlay MSAA, default on), `points=` (markers at scale 1,
 * default 100000), `depth=0|1` (depth test
 * on Holochart's materials), `rtc=data|far|view` (the reference markers' float32 origin: their
 * own centre, the centre of the world, or re-encoded at the view centre on every jump),
 * `copies=0|1` (custom layer draws every visible world copy), `text=0|1`, `hide=bulk,lines` (leave
 * a primitive out), `maps=` (dashboard),
 * `cam=` (camera of the capture: `flat`, `pitch`, `steep`), `scale=`.
 *
 * The map style is a local object (background + GeoJSON from world-atlas): no request leaves the
 * page. `window.__spikeCapture()` returns one PNG of map + chart.
 */
export const meta: ExampleMeta = {
  title: 'Spike G: Holochart over MapLibre GL',
  description: 'Custom layer in the map context vs an overlay canvas: sync, cost, export, picking.',
  tags: ['spike', 'no-visual-test'],
};

declare global {
  interface Window {
    __spikeCapture?: () => string;
  }
}

const SPIKE_ID = 'g-maplibre';
type MapLibre = typeof import('maplibre-gl');
type Mode = 'custom' | 'overlay' | 'both' | 'map' | 'native';
type Mat = ArrayLike<number>;

// ---- options ---------------------------------------------------------------------------------

interface Options {
  mode: Mode;
  tests: Set<string>;
  globe: boolean;
  sync: 'render' | 'raf';
  ownLoop: boolean;
  shared: boolean | 'auto';
  aa: boolean;
  overlayAa: boolean;
  points: number;
  depth: boolean;
  rtc: 'data' | 'view' | 'far';
  copies: boolean;
  text: boolean;
  hide: Set<string>;
  maps: number;
  cam: string;
}

function readOptions(): Options {
  const q = new URLSearchParams(window.location.search);
  const mode = (q.get('mode') ?? 'both') as Mode;
  return {
    mode: ['custom', 'overlay', 'both', 'map', 'native'].includes(mode) ? mode : 'both',
    tests: new Set((q.get('test') ?? 'contexts,sync,export').split(',').filter(Boolean)),
    globe: q.get('proj') === 'globe',
    sync: q.get('sync') === 'raf' ? 'raf' : 'render',
    ownLoop: q.get('ownloop') === '1',
    shared: q.get('shared') === 'auto' ? 'auto' : q.get('shared') === '1',
    aa: q.get('aa') === '1',
    overlayAa: q.get('oaa') !== '0',
    points: Math.max(1000, Math.min(2_000_000, Number(q.get('points')) || 100_000)),
    depth: q.get('depth') === '1',
    rtc: q.get('rtc') === 'view' ? 'view' : q.get('rtc') === 'far' ? 'far' : 'data',
    copies: q.get('copies') === '1',
    text: q.get('text') !== '0',
    hide: new Set((q.get('hide') ?? '').split(',').filter(Boolean)),
    maps: Math.max(1, Math.min(16, Number(q.get('maps')) || 6)),
    cam: q.get('cam') ?? 'pitch',
  };
}

// ---- geography -------------------------------------------------------------------------------

const mercX = (lon: number): number => (lon + 180) / 360;
const mercY = (lat: number): number =>
  0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
const lonOf = (mx: number): number => mx * 360 - 180;
const latOf = (my: number): number =>
  (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI;

/** Where the reference grids sit (Paris), and the zooms they are spaced for. */
const SITE = { lon: 2.35, lat: 48.85 };
const GRID_ZOOMS = [1.5, 3, 5.25, 8.6, 12, 16, 19] as const;
/** Screen spacing of a reference grid at its own zoom, CSS px. */
const GRID_PX = 120;
const REF_RADIUS = 9;
const REF_MARKER = 8;

interface Dataset {
  n: number;
  lon: Float64Array;
  lat: Float64Array;
  mx: Float64Array;
  my: Float64Array;
  line: { lon: Float64Array; lat: Float64Array; starts: number[] };
  ref: { lon: Float64Array; lat: Float64Array; grid: Int8Array; center: Uint8Array };
}

const CITIES: readonly (readonly [number, number])[] = [
  [-74, 40.7],
  [-0.1, 51.5],
  [2.35, 48.85],
  [139.7, 35.7],
  [116.4, 39.9],
  [77.2, 28.6],
  [-46.6, -23.5],
  [151.2, -33.9],
  [28.0, -26.2],
  [-118.2, 34.1],
  [37.6, 55.75],
  [103.8, 1.35],
  [31.2, 30.0],
  [-99.1, 19.4],
  [174.8, -36.8],
  [-157.9, 21.3],
];

function buildDataset(n: number): Dataset {
  const random = rng(11);
  const normal = gaussian(random);
  const lon = new Float64Array(n);
  const lat = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (random() < 0.25) {
      lon[i] = random() * 360 - 180;
      lat[i] = random() * 140 - 70;
    } else {
      const city = CITIES[Math.floor(random() * CITIES.length)]!;
      lon[i] = ((city[0] + normal() * 6 + 540) % 360) - 180;
      lat[i] = Math.max(-80, Math.min(80, city[1] + normal() * 4));
    }
  }
  const mx = Float64Array.from(lon, mercX);
  const my = Float64Array.from(lat, mercY);

  // Great circles between city pairs, resampled; a new polyline starts at the antimeridian.
  const lineLon: number[] = [];
  const lineLat: number[] = [];
  const starts: number[] = [];
  const rad = Math.PI / 180;
  for (let r = 0; r < 8; r++) {
    const a = CITIES[r]!;
    const b = CITIES[(r * 5 + 3) % CITIES.length]!;
    const va = sphere(a[0], a[1]);
    const vb = sphere(b[0], b[1]);
    const omega = Math.acos(
      Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2])),
    );
    if (lineLon.length) starts.push(lineLon.length);
    let previous = NaN;
    for (let s = 0; s <= 96; s++) {
      const t = s / 96;
      const ka = Math.sin((1 - t) * omega) / Math.sin(omega);
      const kb = Math.sin(t * omega) / Math.sin(omega);
      const x = ka * va[0] + kb * vb[0];
      const y = ka * va[1] + kb * vb[1];
      const z = ka * va[2] + kb * vb[2];
      const pLon = Math.atan2(x, z) / rad;
      const pLat = Math.asin(y) / rad;
      if (Math.abs(pLon - previous) > 180) starts.push(lineLon.length);
      previous = pLon;
      lineLon.push(pLon);
      lineLat.push(pLat);
    }
  }

  // Reference grids: 3×3 around the site per zoom in GRID_ZOOMS, GRID_PX apart at that zoom.
  const refLon: number[] = [];
  const refLat: number[] = [];
  const grid: number[] = [];
  const center: number[] = [];
  const sx = mercX(SITE.lon);
  const sy = mercY(SITE.lat);
  GRID_ZOOMS.forEach((zoom, g) => {
    const step = GRID_PX / (512 * 2 ** zoom);
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        if (i === 0 && j === 0 && g > 0) continue; // one centre point, in the first grid
        refLon.push(lonOf(sx + i * step));
        refLat.push(latOf(sy + j * step));
        grid.push(g);
        center.push(i === 0 && j === 0 ? 1 : 0);
      }
    }
  });
  return {
    n,
    lon,
    lat,
    mx,
    my,
    line: { lon: Float64Array.from(lineLon), lat: Float64Array.from(lineLat), starts },
    ref: {
      lon: Float64Array.from(refLon),
      lat: Float64Array.from(refLat),
      grid: Int8Array.from(grid),
      center: Uint8Array.from(center),
    },
  };
}

/** MapLibre's unit-sphere convention (`angularCoordinatesRadiansToVector`). */
function sphere(lon: number, lat: number): [number, number, number] {
  const l = (lon * Math.PI) / 180;
  const p = (lat * Math.PI) / 180;
  return [Math.sin(l) * Math.cos(p), Math.sin(p), Math.cos(l) * Math.cos(p)];
}

/** Positions for a primitive: mercator unit square, or the unit sphere under the globe. */
function positions(
  lon: ArrayLike<number>,
  lat: ArrayLike<number>,
  globe: boolean,
): { x: Float64Array; y: Float64Array; z: Float64Array | null } {
  const n = lon.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  if (!globe) {
    for (let i = 0; i < n; i++) {
      x[i] = mercX(lon[i]!);
      y[i] = mercY(lat[i]!);
    }
    return { x, y, z: null };
  }
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const v = sphere(lon[i]!, lat[i]!);
    x[i] = v[0];
    y[i] = v[1];
    z[i] = v[2];
  }
  return { x, y, z };
}

// ---- offline style ---------------------------------------------------------------------------

interface Basemap {
  land: FeatureCollection;
  countries: FeatureCollection;
}

async function loadBasemap(): Promise<Basemap> {
  const [{ feature }, landTopo, countryTopo] = await Promise.all([
    import('topojson-client'),
    import('world-atlas/land-110m.json'),
    import('world-atlas/countries-110m.json'),
  ]);
  type Topology = Parameters<typeof feature>[0];
  const collection = (topology: unknown, name: string): FeatureCollection => {
    const out = feature(topology as Topology, name) as unknown as
      FeatureCollection | { type: 'Feature' };
    return out.type === 'FeatureCollection'
      ? out
      : { type: 'FeatureCollection', features: [out as FeatureCollection['features'][number]] };
  };
  return {
    land: collection(landTopo.default, 'land'),
    countries: collection(countryTopo.default, 'countries'),
  };
}

function pointCollection(lon: ArrayLike<number>, lat: ArrayLike<number>): FeatureCollection {
  const features: FeatureCollection['features'] = [];
  for (let i = 0; i < lon.length; i++) {
    features.push({
      type: 'Feature',
      id: i,
      properties: { i },
      geometry: { type: 'Point', coordinates: [lon[i]!, lat[i]!] },
    });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * A style that needs nothing from the network: greys only, so that pure red (MapLibre's reference
 * circles) and pure blue (Holochart's reference markers) can be measured in a readback.
 */
function offlineStyle(
  basemap: Basemap,
  data: Dataset,
  options: { globe: boolean; native: boolean },
): StyleSpecification {
  const style: StyleSpecification = {
    version: 8,
    sources: {
      land: { type: 'geojson', data: basemap.land, attribution: 'Natural Earth' },
      countries: { type: 'geojson', data: basemap.countries },
      ref: { type: 'geojson', data: pointCollection(data.ref.lon, data.ref.lat) },
    },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': '#e6e6e6' } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#f7f7f7' } },
      {
        id: 'borders',
        type: 'line',
        source: 'countries',
        paint: { 'line-color': '#a0a0a0', 'line-width': 0.6 },
      },
      {
        id: 'ref',
        type: 'circle',
        source: 'ref',
        paint: {
          'circle-radius': REF_RADIUS,
          'circle-color': '#ff0000',
          'circle-pitch-scale': 'viewport',
          'circle-pitch-alignment': 'viewport',
        },
      },
    ],
  };
  if (options.globe) style.projection = { type: 'globe' };
  if (options.native) {
    style.sources['bulk'] = { type: 'geojson', data: pointCollection(data.lon, data.lat) };
    style.layers.splice(3, 0, {
      id: 'bulk',
      type: 'circle',
      source: 'bulk',
      paint: {
        'circle-radius': 2.5,
        'circle-color': 'rgb(26,153,51)',
        'circle-opacity': 0.55,
        'circle-pitch-scale': 'viewport',
      },
    });
  }
  return style;
}

// ---- small helpers ---------------------------------------------------------------------------

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function timeout<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Resolves on the map's next `idle`, or after `ms` whatever the map is still waiting for. */
function waitIdle(map: MapLibreMap, ms: number): Promise<'idle' | 'timeout'> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: 'idle' | 'timeout'): void => {
      if (settled) return;
      settled = true;
      subscription.unsubscribe();
      clearTimeout(timer);
      resolve(result);
    };
    const subscription = map.on('idle', () => finish('idle'));
    const timer = setTimeout(() => finish('timeout'), ms);
    map.triggerRepaint();
  });
}

/** `m · translate(ax, ay, 0)` into a three camera, in float64 (column-major). */
function applyCamera(camera: PerspectiveCamera, m: Mat, ax: number, ay: number): void {
  const e = camera.projectionMatrix.elements;
  for (let i = 0; i < 16; i++) e[i] = m[i]!;
  for (let r = 0; r < 4; r++) e[12 + r] = m[r]! * ax + m[4 + r]! * ay + m[12 + r]!;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

/** Project through a clip matrix to CSS px (top-left origin). Returns false behind the camera. */
function projectTo(
  m: Mat,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  out: { x: number; y: number },
): boolean {
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  if (!(w > 0)) return false;
  out.x = ((m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w / 2 + 0.5) * width;
  out.y = (0.5 - (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w / 2) * height;
  return true;
}

// ---- WebGL context census --------------------------------------------------------------------

interface ContextCensus {
  /** Live (not lost) WebGL contexts created since the census started. */
  live(): { gl: WebGLRenderingContext; canvas: HTMLCanvasElement | OffscreenCanvas }[];
  created(): number;
  stop(): void;
}

/** Counts WebGL contexts by wrapping `getContext` on both canvas kinds. */
function startContextCensus(): ContextCensus {
  const seen = new Map<WebGLRenderingContext, HTMLCanvasElement | OffscreenCanvas>();
  const restore: (() => void)[] = [];
  const wrap = (proto: { getContext: unknown }): void => {
    const original = proto.getContext as (this: unknown, ...args: unknown[]) => unknown;
    proto.getContext = function (this: HTMLCanvasElement | OffscreenCanvas, ...args: unknown[]) {
      const context = original.apply(this, args);
      if (context && typeof args[0] === 'string' && args[0].startsWith('webgl')) {
        seen.set(context as WebGLRenderingContext, this);
      }
      return context;
    };
    restore.push(() => {
      proto.getContext = original;
    });
  };
  wrap(HTMLCanvasElement.prototype as unknown as { getContext: unknown });
  if (typeof OffscreenCanvas !== 'undefined') {
    wrap(OffscreenCanvas.prototype as unknown as { getContext: unknown });
  }
  return {
    live: () =>
      [...seen].filter(([gl]) => !gl.isContextLost()).map(([gl, canvas]) => ({ gl, canvas })),
    created: () => seen.size,
    stop() {
      for (const undo of restore) undo();
    },
  };
}

/** Counts the GL calls made on a context until `stop()` (own-property wrappers, then removed). */
function countGlCalls(gl: WebGL2RenderingContext): { read(): number; stop(): void } {
  const target = gl as unknown as Record<string, unknown>;
  const names: string[] = [];
  let calls = 0;
  for (const key in gl) {
    const value = target[key];
    if (typeof value !== 'function') continue;
    const fn = value as (...args: unknown[]) => unknown;
    target[key] = (...args: unknown[]): unknown => {
      calls++;
      return fn.apply(gl, args);
    };
    names.push(key);
  }
  return {
    read: () => calls,
    stop() {
      for (const key of names) delete target[key];
    },
  };
}

// ---- the Holochart scene, shared by both ways ------------------------------------------------

const BULK_COLOR: RGBA = [0.1, 0.6, 0.2, 0.55];
const LINE_COLOR: RGBA = [0, 0.45, 0.45, 0.9];
const REF_COLOR: RGBA = [0, 0, 1, 1];
const LABELS: readonly (readonly [string, number, number])[] = [
  ['Paris', 2.35, 48.85],
  ['Tokyo', 139.7, 35.7],
  ['New York', -74, 40.7],
];

interface SceneParts {
  bulk: MarkerSet;
  lines: LinePrimitive;
  ref: MarkerSet;
  text: TextPrimitive | null;
  /** Mercator point the camera matrix is translated to; primitives get the opposite offset. */
  setAnchor(ax: number, ay: number): void;
  /** Re-encode the reference markers' float32 positions around a new origin. */
  recenterRef(ax: number, ay: number): void;
  /** Move the screen-space labels (CSS px, bottom-left origin of the map). */
  placeLabels(m: Mat, width: number, height: number): void;
  dispose(): void;
}

function buildParts(
  context: PrimitiveContext,
  main: Viewport,
  top: Viewport,
  labels: Viewport | null,
  data: Dataset,
  options: Options,
): SceneParts {
  const globe = options.globe;
  const p = positions(data.lon, data.lat, globe);
  const bulk = new MarkerSet(
    context,
    { x: p.x, y: p.y, z: p.z, size: 5, color: BULK_COLOR, lineWidth: 0 },
    { depthTest: options.depth },
  );
  const l = positions(data.line.lon, data.line.lat, globe);
  const lines = new LinePrimitive(context, {
    x: l.x,
    y: l.y,
    ...(l.z ? { z: l.z } : {}),
    starts: data.line.starts,
    color: LINE_COLOR,
    width: 1.5,
  });
  const r = positions(data.ref.lon, data.ref.lat, globe);
  const ref = new MarkerSet(
    context,
    {
      x: r.x,
      y: r.y,
      z: r.z,
      size: REF_MARKER,
      color: REF_COLOR,
      lineWidth: 0,
      // `far`: the origin a world-wide trace gets (the centre of its bounds), far from the site.
      ...(options.rtc === 'far' && !globe ? { origin: [0.5, 0.5, 0] as const } : {}),
    },
    { depthTest: options.depth },
  );
  // The line material is the primitives' default: depth test on. The map's 2D layers hold one
  // constant depth each, so chart layers drawn in the map's context must not test against it.
  const lineMaterial = (lines.object as unknown as { material: { depthTest: boolean } }).material;
  lineMaterial.depthTest = options.depth;
  if (!options.hide.has('bulk')) main.add(bulk);
  if (!options.hide.has('lines')) main.add(lines);
  top.add(ref);

  const text =
    labels && options.text
      ? createTextPrimitive(context, {
          labels: LABELS.map(([label]) => ({ text: label, x: -1000, y: -1000 })),
          style: {
            font: { size: 13 },
            color: [0.1, 0.1, 0.1, 1],
            anchorX: 'left',
            anchorY: 'middle',
          },
        })
      : null;
  if (text && labels) labels.add(text);

  const transform: DataTransform = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
  const at = { x: 0, y: 0 };
  return {
    bulk,
    lines,
    ref,
    text,
    setAnchor(ax, ay) {
      if (globe || (transform.offsetX === -ax && transform.offsetY === -ay)) return;
      transform.offsetX = -ax;
      transform.offsetY = -ay;
      const next = { ...transform };
      bulk.setTransform(next);
      lines.setTransform(next);
      ref.setTransform(next);
    },
    recenterRef(ax, ay) {
      if (!globe) ref.update({ origin: [ax, ay, 0] });
    },
    placeLabels(m, width, height) {
      if (!text) return;
      text.update({
        labels: LABELS.map(([label, lon, lat]) => {
          const v = globe ? sphere(lon, lat) : [mercX(lon), mercY(lat), 0];
          const ok = projectTo(m, v[0]!, v[1]!, v[2]!, width, height, at);
          return { text: label, x: ok ? at.x + 8 : -1000, y: ok ? height - at.y : -1000 };
        }),
      });
    },
    dispose() {
      bulk.dispose();
      lines.dispose();
      ref.dispose();
      text?.dispose();
    },
  };
}

/** A projector that makes a 2D viewport draw through the map's clip matrix. */
function mapProjector(map: MapLibreMap, camera: PerspectiveCamera): ViewportProjector {
  return {
    camera,
    layout() {},
    project(x, y) {
      const ll = map.unproject([x, y]);
      return [mercX(ll.lng), mercY(ll.lat)];
    },
    unproject(x, y) {
      const point = map.project([lonOf(x), latOf(y)]);
      return [point.x, point.y];
    },
  };
}

/** What both ways record every time they draw. */
interface DrawLog {
  /** Clip matrix the map rendered its last frame with. */
  mapMatrix: Float64Array;
  /** Clip matrix Holochart last drew with. */
  holoMatrix: Float64Array;
  mapFrames: number;
  holoFrames: number;
  /** Globe only: the horizon plane of the last frame. */
  clippingPlane: number[];
  transition: number;
}

function newDrawLog(): DrawLog {
  return {
    mapMatrix: new Float64Array(16),
    holoMatrix: new Float64Array(16),
    mapFrames: 0,
    holoFrames: 0,
    clippingPlane: [0, 0, 0, 0],
    transition: 0,
  };
}

/**
 * The clip matrix of the camera as it is now. MapLibre 6 has no public accessor for it
 * (`map.transform` is gone): outside a custom layer's `render` it is only reachable through
 * `map._camera`.
 */
function internalMatrix(map: MapLibreMap, globe: boolean): Mat {
  type Internals = {
    _camera: {
      transform: { getProjectionDataForCustomLayer(globe: boolean): { mainMatrix: Mat } };
    };
  };
  return (map as unknown as Internals)._camera.transform.getProjectionDataForCustomLayer(globe)
    .mainMatrix;
}

function anchorOf(map: MapLibreMap, globe: boolean): [number, number] {
  if (globe) return [0, 0];
  const c = map.getCenter();
  return [mercX(c.lng), mercY(c.lat)];
}

// ---- way 1: custom layer in the map's context ------------------------------------------------

interface HostedLayer {
  readonly kind: 'custom';
  renderer: WebGLRenderer | null;
  parts: SceneParts | null;
  main: Viewport | null;
  camera: PerspectiveCamera;
  /** `renderer.resetState()` time and GL calls of the last diagnostic frame. */
  diag: {
    glInit: number;
    glReset: number;
    glDraw: number;
    resetMs: number;
    drawMs: number;
    frames: number;
  };
  /** Run inside the next `prerender` (the one place GL work outside `render` is safe). */
  inPrerender: (() => void) | null;
  onRemoveCalls: number;
  add(): void;
  remove(): void;
}

function createHostedLayer(
  map: MapLibreMap,
  data: Dataset,
  options: Options,
  log: DrawLog,
): HostedLayer {
  const canvas = map.getCanvas();
  const camera = new PerspectiveCamera();
  camera.matrixAutoUpdate = false;
  let resources: ResourceManager | null = null;
  let top: Viewport | null = null;
  let labels: Viewport | null = null;
  let drawing = false;
  let sizedW = 0;
  let sizedH = 0;
  let sizedRatio = 0;
  let counter: ReturnType<typeof countGlCalls> | null = null;

  const host: ViewportHost = {
    // Primitives invalidate when their uniforms change, which happens inside every draw: repaint
    // only for changes made outside it, or the map would render forever.
    invalidate: () => {
      if (!drawing) map.triggerRepaint();
    },
    get canvasWidth() {
      return canvas.width / map.getPixelRatio();
    },
    get canvasHeight() {
      return canvas.height / map.getPixelRatio();
    },
    get pixelRatio() {
      return map.getPixelRatio();
    },
  };

  const layer: HostedLayer = {
    kind: 'custom',
    renderer: null,
    parts: null,
    main: null,
    camera,
    diag: { glInit: 0, glReset: 0, glDraw: 0, resetMs: 0, drawMs: 0, frames: 0 },
    inPrerender: null,
    onRemoveCalls: 0,
    add() {
      map.addLayer(mainLayer, 'ref');
      map.addLayer(refLayer);
    },
    remove() {
      if (map.getLayer('hc-ref')) map.removeLayer('hc-ref');
      if (map.getLayer('hc-main')) map.removeLayer('hc-main');
    },
  };

  /** Create the renderer and keep three's idea of the canvas in step with the map's. */
  const ensure = (gl: WebGL2RenderingContext): void => {
    if (!layer.renderer) {
      const before = options.tests.has('diag') ? countGlCalls(gl) : null;
      const renderer = new WebGLRenderer({ canvas, context: gl });
      layer.diag.glInit = before?.read() ?? 0;
      before?.stop();
      renderer.autoClear = false;
      resources = createResourceManager();
      const context: PrimitiveContext = {
        resources,
        invalidate: host.invalidate,
        capabilities: readGpuCapabilities(renderer),
      };
      const main = new Viewport(host, { kind: '2d', fit: true, name: 'hc-main' });
      top = new Viewport(host, { kind: '2d', fit: true, name: 'hc-ref' });
      labels = new Viewport(host, { kind: '2d', fit: true, name: 'hc-labels' });
      main.projector = top.projector = mapProjector(map, camera);
      layer.renderer = renderer;
      layer.main = main;
      layer.parts = buildParts(context, main, top, labels, data, options);
    }
    const ratio = map.getPixelRatio();
    if (canvas.width !== sizedW || canvas.height !== sizedH || ratio !== sizedRatio) {
      sizedW = canvas.width;
      sizedH = canvas.height;
      sizedRatio = ratio;
      // three floors `size * ratio`; the half pixel keeps the canvas at exactly the map's size.
      layer.renderer.setDrawingBufferSize((sizedW + 0.5) / ratio, (sizedH + 0.5) / ratio, ratio);
      layer.main?.layout();
      top?.layout();
      labels?.layout();
    }
  };

  const draw = (which: 'main' | 'top', args: CustomRenderMethodInput): void => {
    const renderer = layer.renderer;
    const parts = layer.parts;
    if (!renderer || !parts || !layer.main || !top || !labels) return;
    drawing = true;
    const t0 = performance.now();
    const m = args.defaultProjectionData.mainMatrix as Mat;
    const width = host.canvasWidth;
    const height = host.canvasHeight;
    const [ax, ay] = anchorOf(map, options.globe);
    parts.setAnchor(ax, ay);
    const c0 = counter?.read() ?? 0;
    renderer.resetState();
    const c1 = counter?.read() ?? 0;
    const t1 = performance.now();
    renderer.setViewport(0, 0, width, height);
    const scene = which === 'main' ? layer.main.scene : top.scene;
    // Every visible copy of the world is one more pass over the same buffers.
    const copies =
      options.copies && !options.globe && map.getRenderWorldCopies() ? [-1, 0, 1] : [0];
    for (const k of copies) {
      applyCamera(camera, m, ax + k, ay);
      renderer.render(scene, camera);
    }
    if (which === 'top' && parts.text) {
      parts.placeLabels(m, width, height);
      renderer.render(labels.scene, labels.camera);
    }
    const t2 = performance.now();
    const c2 = counter?.read() ?? 0;
    renderer.resetState();
    const t3 = performance.now();
    const c3 = counter?.read() ?? 0;
    layer.diag.resetMs += t1 - t0 + (t3 - t2);
    layer.diag.drawMs += t2 - t1;
    layer.diag.frames += which === 'top' ? 1 : 0;
    if (counter) {
      layer.diag.glReset += c1 - c0 + (c3 - c2);
      layer.diag.glDraw += c2 - c1;
    }
    if (which === 'top') {
      log.holoMatrix.set(m);
      log.holoFrames++;
    }
    drawing = false;
  };

  const mainLayer: CustomLayerInterface = {
    id: 'hc-main',
    type: 'custom',
    renderingMode: '2d',
    // Offscreen pass: MapLibre marks its GL state dirty afterwards and has not drawn the frame
    // yet, so this is where the renderer is created, resized and where picking can draw.
    prerender(gl) {
      ensure(gl);
      const job = layer.inPrerender;
      layer.inPrerender = null;
      if (job && layer.renderer) {
        layer.renderer.resetState();
        job();
        layer.renderer.resetState();
      }
    },
    render(gl, args) {
      const d = args.defaultProjectionData;
      log.mapMatrix.set(d.mainMatrix as Mat);
      log.clippingPlane = [...d.clippingPlane];
      log.transition = d.projectionTransition;
      log.mapFrames++;
      if (options.tests.has('diag') && !counter && layer.diag.frames === 3)
        counter = countGlCalls(gl);
      draw('main', args);
    },
    onRemove() {
      layer.onRemoveCalls++;
    },
  };
  const refLayer: CustomLayerInterface = {
    id: 'hc-ref',
    type: 'custom',
    renderingMode: '2d',
    render(_gl, args) {
      draw('top', args);
      if (counter && layer.diag.frames >= 4) {
        counter.stop();
        counter = null;
      }
    },
    onRemove() {
      layer.onRemoveCalls++;
      // The map owns the context: free what three allocated in it, never the context itself.
      layer.parts?.dispose();
      layer.main?.dispose();
      top?.dispose();
      labels?.dispose();
      resources?.disposeAll();
      layer.renderer?.resetState();
      layer.renderer?.dispose();
      layer.parts = null;
      layer.renderer = null;
      layer.main = top = labels = null;
      sizedW = sizedH = 0;
    },
  };
  return layer;
}

// ---- way 2: overlay canvas -------------------------------------------------------------------

interface OverlayLayer {
  readonly kind: 'overlay';
  root: RenderRoot;
  parts: SceneParts;
  main: Viewport;
  camera: PerspectiveCamera;
  element: HTMLDivElement;
  /** Draw now with the matrix of the map's last frame. */
  draw(): void;
  gpuTimer: GpuTimer | null;
  addProbe(): void;
  destroy(): void;
}

function createOverlayLayer(
  map: MapLibreMap,
  data: Dataset,
  options: Options,
  log: DrawLog,
): OverlayLayer {
  const container = map.getContainer();
  const element = document.createElement('div');
  // Above the map's canvas, below its controls; pointer events fall through to the map.
  element.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  container.insertBefore(element, container.querySelector('.maplibregl-control-container'));
  const root = createRenderRoot(element, {
    background: null,
    overlay: false,
    shared: options.shared,
    antialias: options.overlayAa,
    pixelRatio: map.getPixelRatio(),
  });
  const camera = new PerspectiveCamera();
  camera.matrixAutoUpdate = false;
  const projector = mapProjector(map, camera);
  const main = root.addViewport({ kind: '2d', fit: true, order: 0, name: 'hc-main' });
  const top = root.addViewport({ kind: '2d', fit: true, order: 1, name: 'hc-ref' });
  const labels = root.addViewport({ kind: '2d', fit: true, order: 2, name: 'hc-labels' });
  main.projector = top.projector = projector;
  const parts = buildParts(root.context, main, top, labels, data, options);

  /** The camera as it is now (internal API), not as the map last drew it. */
  const liveMatrix = (): Mat => internalMatrix(map, options.globe);

  /** The matrix the camera is set to; it reaches the log when a frame is drawn with it. */
  const aimed = new Float64Array(16);
  const aim = (m: Mat): void => {
    const [ax, ay] = anchorOf(map, options.globe);
    parts.setAnchor(ax, ay);
    applyCamera(camera, m, ax, ay);
    parts.placeLabels(m, root.size.width, root.size.height);
    aimed.set(m);
  };

  const layer: OverlayLayer = {
    kind: 'overlay',
    root,
    parts,
    main,
    camera,
    element,
    gpuTimer: null,
    draw() {
      aim(log.mapMatrix);
      if (layer.gpuTimer) layer.gpuTimer.wrap(() => root.renderNow());
      else root.renderNow();
      log.holoMatrix.set(aimed);
      log.holoFrames++;
    },
    addProbe() {
      map.addLayer(probe);
    },
    destroy() {
      for (const s of subscriptions) s.unsubscribe();
      if (map.getLayer('hc-probe')) map.removeLayer('hc-probe');
      root.destroy();
      element.remove();
    },
  };

  // The public way to the map's matrices is a custom layer: this one draws nothing.
  const probe: CustomLayerInterface = {
    id: 'hc-probe',
    type: 'custom',
    renderingMode: '2d',
    render(_gl, args) {
      const d = args.defaultProjectionData;
      log.mapMatrix.set(d.mainMatrix as Mat);
      log.clippingPlane = [...d.clippingPlane];
      log.transition = d.projectionTransition;
      log.mapFrames++;
    },
  };
  layer.addProbe();

  const subscriptions =
    options.sync === 'render'
      ? // Same frame: draw inside the map's own animation frame, right after it has drawn.
        [map.on('render', () => layer.draw())]
      : // The naive way: schedule the chart's own frame when the map moves.
        [
          map.on('move', () => {
            aim(liveMatrix());
            root.invalidate();
          }),
          {
            unsubscribe: root.on('afterrender', () => {
              log.holoMatrix.set(aimed);
              log.holoFrames++;
            }),
          },
        ];
  return layer;
}

// ---- one map with its chart layer(s) ---------------------------------------------------------

interface Instance {
  map: MapLibreMap;
  gl: WebGL2RenderingContext;
  log: DrawLog;
  hosted: HostedLayer | null;
  overlay: OverlayLayer | null;
  container: HTMLDivElement;
  /** One synchronous frame of the map and whatever draws with it. */
  drawSync(): void;
  /** Wait for the GPU on every context involved. */
  syncGpu(): void;
  destroy(): void;
}

interface InstanceOptions {
  preserveDrawingBuffer?: boolean;
  center?: [number, number];
  zoom?: number;
}

async function createInstance(
  maplibre: MapLibre,
  basemap: Basemap,
  parent: HTMLElement,
  data: Dataset,
  options: Options,
  mode: Mode,
  extra: InstanceOptions = {},
): Promise<Instance> {
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;inset:0';
  parent.appendChild(container);
  const map = new maplibre.Map({
    container,
    style: offlineStyle(basemap, data, { globe: options.globe, native: mode === 'native' }),
    center: extra.center ?? [SITE.lon, SITE.lat],
    zoom: extra.zoom ?? 1.5,
    maxPitch: 85,
    fadeDuration: 0,
    renderWorldCopies: true,
    attributionControl: { compact: false, customAttribution: 'Basemap: Natural Earth' },
    canvasContextAttributes: {
      antialias: options.aa,
      preserveDrawingBuffer: extra.preserveDrawingBuffer ?? false,
    },
  });
  stage = 'map load';
  const loaded = await Promise.race([map.once('load').then(() => true), timeout(15000, false)]);
  if (!loaded) throw new Error('MapLibre did not fire `load` within 15 s (worker not started?)');
  const gl = map.getCanvas().getContext('webgl2');
  if (!gl) throw new Error('The map canvas has no WebGL2 context');

  const log = newDrawLog();
  const hosted =
    mode === 'custom' || mode === 'both' ? createHostedLayer(map, data, options, log) : null;
  hosted?.add();
  const overlay =
    mode === 'overlay' || mode === 'both' ? createOverlayLayer(map, data, options, log) : null;
  const overlayGl = (): WebGL2RenderingContext | null =>
    overlay ? (overlay.root.renderer.getContext() as WebGL2RenderingContext) : null;

  const instance: Instance = {
    map,
    gl,
    log,
    hosted,
    overlay,
    container,
    drawSync() {
      map.redraw();
      if (overlay && options.sync === 'raf') overlay.draw();
    },
    syncGpu() {
      syncGL(gl);
      const other = overlayGl();
      if (other) syncGL(other);
    },
    destroy() {
      overlay?.destroy();
      hosted?.remove();
      map.remove();
      container.remove();
    },
  };
  stage = 'first idle';
  await waitIdle(map, 5000);
  stage = 'text ready';
  const texts = [overlay?.parts.text, hosted?.parts?.text].filter((t) => !!t);
  await Promise.race([Promise.all(texts.map((t) => t.ready)), timeout(5000, null)]);
  stage = 'first frame';
  instance.drawSync();
  return instance;
}

// ---- readback and the red/blue reference measurement -----------------------------------------

interface Pixels {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  /** Rows run bottom-up (WebGL readback). */
  bottomUp: boolean;
  /** RGB is not premultiplied (2D canvas readback). */
  straight: boolean;
}

const readBuffers = new WeakMap<object, Uint8Array>();

function readGl(gl: WebGL2RenderingContext): Pixels {
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  let data = readBuffers.get(gl);
  if (!data || data.length !== width * height * 4) {
    data = new Uint8Array(width * height * 4);
    readBuffers.set(gl, data);
  }
  const bound = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  if (bound) gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
  if (bound) gl.bindFramebuffer(gl.FRAMEBUFFER, bound);
  return { data, width, height, bottomUp: true, straight: false };
}

function readOverlay(overlay: OverlayLayer): Pixels {
  const root = overlay.root;
  if (!root.shared) return readGl(root.renderer.getContext() as WebGL2RenderingContext);
  const context = root.canvas.getContext('2d')!;
  const image = context.getImageData(0, 0, root.canvas.width, root.canvas.height);
  return {
    data: image.data,
    width: image.width,
    height: image.height,
    bottomUp: false,
    straight: true,
  };
}

interface Blob {
  x: number;
  y: number;
  /** Covered area in CSS px². */
  area: number;
}

/**
 * Coverage-weighted centroid of a colour around a CSS position. `red` is R − G, `blue` is B − G:
 * on a grey ground each is exactly the coverage of that colour, also where blue covers red.
 */
function blob(
  p: Pixels,
  cx: number,
  cy: number,
  half: number,
  ratio: number,
  channel: 'red' | 'blue' | 'either',
): Blob | null {
  const x0 = Math.floor((cx - half) * ratio);
  const x1 = Math.ceil((cx + half) * ratio);
  const y0 = Math.floor((cy - half) * ratio);
  const y1 = Math.ceil((cy + half) * ratio);
  if (x0 < 0 || y0 < 0 || x1 > p.width || y1 > p.height) return null;
  let sum = 0;
  let sx = 0;
  let sy = 0;
  for (let y = y0; y < y1; y++) {
    const row = (p.bottomUp ? p.height - 1 - y : y) * p.width * 4;
    for (let x = x0; x < x1; x++) {
      const i = row + x * 4;
      const g = p.data[i + 1]!;
      const alpha = p.straight ? p.data[i + 3]! / 255 : 1;
      const red = Math.max(0, p.data[i]! - g) * alpha;
      const blue = Math.max(0, p.data[i + 2]! - g) * alpha;
      const w = channel === 'red' ? red : channel === 'blue' ? blue : red + blue;
      sum += w;
      sx += w * (x + 0.5);
      sy += w * (y + 0.5);
    }
  }
  if (sum <= 0) return { x: NaN, y: NaN, area: 0 };
  return { x: sx / sum / ratio, y: sy / sum / ratio, area: sum / 255 / (ratio * ratio) };
}

const RED_AREA = Math.PI * REF_RADIUS ** 2;
const BLUE_AREA = Math.PI * (REF_MARKER / 2) ** 2;

interface RefMeasure {
  /** Reference points whose window is on the canvas. */
  inView: number;
  /** Skipped: another reference point is too close on screen to measure this one alone. */
  crowded: number;
  /** Of those, how many MapLibre drew (at least half a circle of red). */
  mapDrew: number;
  /** Per way: how many Holochart drew, and its distance to MapLibre's circle in px. */
  ways: Record<string, { drew: number; drift: number[]; area: number[] }>;
  /** MapLibre's circle vs `map.project` (the measurement's own noise floor). */
  mapVsProject: number[];
}

/** Call right after `drawSync()`, in the same task (the drawing buffers are still intact). */
function measureRefs(instance: Instance, data: Dataset, grid: number): RefMeasure {
  const { map, hosted, overlay } = instance;
  const ratio = map.getPixelRatio();
  const mapPixels = readGl(instance.gl);
  const overlayPixels = overlay ? readOverlay(overlay) : null;
  const overlayRatio = overlay ? overlay.root.pixelRatio : 1;
  const out: RefMeasure = { inView: 0, crowded: 0, mapDrew: 0, ways: {}, mapVsProject: [] };
  if (hosted) out.ways['custom'] = { drew: 0, drift: [], area: [] };
  if (overlay) out.ways['overlay'] = { drew: 0, drift: [], area: [] };
  const half = REF_RADIUS + 6;
  const count = data.ref.lon.length;
  const screen: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) screen.push(map.project([data.ref.lon[i]!, data.ref.lat[i]!]));
  for (let i = 0; i < count; i++) {
    if (data.ref.grid[i] !== grid || data.ref.center[i]) continue;
    const at = screen[i]!;
    // Steep pitch squeezes the grid: a neighbour's disc inside this window would bias the centroid.
    const reach = half + REF_RADIUS + 1;
    if (
      screen.some((o, j) => j !== i && Math.abs(o.x - at.x) < reach && Math.abs(o.y - at.y) < reach)
    ) {
      out.crowded++;
      continue;
    }
    // The disc MapLibre drew: red, plus the blue a custom layer put on top of it.
    const disc = blob(mapPixels, at.x, at.y, half, ratio, 'either');
    if (!disc) continue;
    out.inView++;
    const drawn = disc.area > RED_AREA / 2;
    if (drawn) {
      out.mapDrew++;
      out.mapVsProject.push(Math.hypot(disc.x - at.x, disc.y - at.y));
    }
    const sources: [string, Pixels | null, number][] = [
      ['custom', hosted ? mapPixels : null, ratio],
      ['overlay', overlayPixels, overlayRatio],
    ];
    for (const [way, pixels, r] of sources) {
      if (!pixels) continue;
      const mark = blob(pixels, at.x, at.y, half, r, 'blue');
      if (!mark || mark.area < BLUE_AREA / 2) continue;
      out.ways[way]!.drew++;
      out.ways[way]!.area.push(mark.area);
      if (drawn) out.ways[way]!.drift.push(Math.hypot(mark.x - disc.x, mark.y - disc.y));
    }
  }
  return out;
}

// ---- tests -----------------------------------------------------------------------------------

interface CameraState {
  name: string;
  group: string;
  zoom: number;
  bearing: number;
  pitch: number;
  /** Index into GRID_ZOOMS of the reference grid that fits this view. */
  grid: number;
  /** Override the centre (default: near the site, off the pixel grid). */
  center?: [number, number];
}

const MERCATOR_STATES: CameraState[] = [
  { name: 'z1.5', group: 'pan and zoom', zoom: 1.5, bearing: 0, pitch: 0, grid: 0 },
  { name: 'z3', group: 'pan and zoom', zoom: 3, bearing: 0, pitch: 0, grid: 1 },
  { name: 'z5.25', group: 'pan and zoom', zoom: 5.25, bearing: 0, pitch: 0, grid: 2 },
  { name: 'z8.6', group: 'pan and zoom', zoom: 8.6, bearing: 0, pitch: 0, grid: 3 },
  { name: 'z3 b30', group: 'bearing', zoom: 3, bearing: 30, pitch: 0, grid: 1 },
  { name: 'z3 b137', group: 'bearing', zoom: 3, bearing: 137, pitch: 0, grid: 1 },
  { name: 'z5.25 b-75', group: 'bearing', zoom: 5.25, bearing: -75, pitch: 0, grid: 2 },
  { name: 'z3 p30 b20', group: 'pitch to 60', zoom: 3, bearing: 20, pitch: 30, grid: 1 },
  { name: 'z3 p45 b-40', group: 'pitch to 60', zoom: 3, bearing: -40, pitch: 45, grid: 1 },
  { name: 'z5.25 p60 b20', group: 'pitch to 60', zoom: 5.25, bearing: 20, pitch: 60, grid: 2 },
  { name: 'z3 p70', group: 'pitch above 60', zoom: 3, bearing: 0, pitch: 70, grid: 1 },
  { name: 'z5.25 p80 b30', group: 'pitch above 60', zoom: 5.25, bearing: 30, pitch: 80, grid: 2 },
  { name: 'z4.5 p85', group: 'pitch above 60', zoom: 4.5, bearing: 0, pitch: 85, grid: 1 },
  { name: 'z12', group: 'high zoom', zoom: 12, bearing: 0, pitch: 0, grid: 4 },
  { name: 'z16', group: 'high zoom', zoom: 16, bearing: 0, pitch: 0, grid: 5 },
  { name: 'z16 p50 b30', group: 'high zoom', zoom: 16, bearing: 30, pitch: 50, grid: 5 },
  { name: 'z19', group: 'high zoom', zoom: 19, bearing: 0, pitch: 0, grid: 6 },
];

const GLOBE_STATES: CameraState[] = [
  { name: 'z1.5', group: 'globe', zoom: 1.5, bearing: 0, pitch: 0, grid: 0 },
  { name: 'z3', group: 'globe', zoom: 3, bearing: 0, pitch: 0, grid: 1 },
  { name: 'z3 p40 b25', group: 'globe', zoom: 3, bearing: 25, pitch: 40, grid: 1 },
  { name: 'z5.25', group: 'globe', zoom: 5.25, bearing: 0, pitch: 0, grid: 2 },
  { name: 'z8.6', group: 'globe to mercator', zoom: 8.6, bearing: 0, pitch: 0, grid: 3 },
  { name: 'z12', group: 'globe to mercator', zoom: 12, bearing: 0, pitch: 0, grid: 4 },
  { name: 'z16', group: 'globe to mercator', zoom: 16, bearing: 0, pitch: 0, grid: 5 },
];

function centerFor(state: CameraState): [number, number] {
  if (state.center) return state.center;
  const step = GRID_PX / (512 * 2 ** GRID_ZOOMS[state.grid]!);
  return [lonOf(mercX(SITE.lon) + 0.31 * step), latOf(mercY(SITE.lat) - 0.17 * step)];
}

function jump(instance: Instance, state: CameraState, options: Options): void {
  instance.map.jumpTo({
    center: centerFor(state),
    zoom: state.zoom,
    bearing: state.bearing,
    pitch: state.pitch,
  });
  if (options.rtc === 'view') {
    const [ax, ay] = anchorOf(instance.map, options.globe);
    instance.hosted?.parts?.recenterRef(ax, ay);
    instance.overlay?.parts.recenterRef(ax, ay);
  }
}

function driftStats(values: number[]): { n: number; median: number; max: number } {
  const s = summarize(values);
  return { n: s.n, median: round(s.median, 3), max: round(s.max, 3) };
}

/** Jump through camera states; at each, compare where both renderers put the reference points. */
async function syncTest(
  instance: Instance,
  data: Dataset,
  options: Options,
  page: SpikePage,
): Promise<void> {
  const states = options.globe ? GLOBE_STATES : MERCATOR_STATES;
  const rows: Record<string, unknown>[] = [];
  const byGroup = new Map<string, Map<string, number[]>>();
  for (const state of states) {
    jump(instance, state, options);
    const idle = await waitIdle(instance.map, 4000);
    instance.drawSync();
    const m = measureRefs(instance, data, state.grid);
    const row: Record<string, unknown> = {
      state: state.name,
      group: state.group,
      idle,
      inView: m.inView,
      crowded: m.crowded,
      mapDrew: m.mapDrew,
      mapVsProject: driftStats(m.mapVsProject),
      transition: round(instance.log.transition, 3),
    };
    for (const [way, w] of Object.entries(m.ways)) {
      // A marker of REF_MARKER px should cover the same area at every pitch.
      row[way] = {
        drew: w.drew,
        ...driftStats(w.drift),
        markerAreaPx2: round(summarize(w.area).mean, 1),
      };
      const group = byGroup.get(state.group) ?? new Map<string, number[]>();
      byGroup.set(state.group, group);
      group.set(way, [...(group.get(way) ?? []), ...w.drift]);
    }
    rows.push(row);
    page.log(
      `sync ${state.name}: map drew ${m.mapDrew}/${m.inView}` +
        Object.entries(m.ways)
          .map(([way, w]) => {
            const d = driftStats(w.drift);
            return ` · ${way} drew ${w.drew}, drift median ${d.median} max ${d.max} px`;
          })
          .join(''),
    );
  }
  const groups: Record<string, Record<string, unknown>> = {};
  for (const [group, ways] of byGroup) {
    groups[group] = {};
    for (const [way, values] of ways) groups[group][way] = driftStats(values);
  }
  page.set('sync', { rtc: options.rtc, states: rows, groups });

  if (!options.globe) page.set('worldCopies', await worldCopiesTest(instance, data));
  else page.set('globeFarSide', await farSideTest(instance, data));
}

/** Zoom 0.6 around the antimeridian: MapLibre repeats the world, a single draw does not. */
async function worldCopiesTest(instance: Instance, data: Dataset): Promise<unknown> {
  const { map } = instance;
  map.jumpTo({ center: [175, 20], zoom: 0.6, bearing: 0, pitch: 0 });
  await waitIdle(map, 4000);
  instance.drawSync();
  const ratio = map.getPixelRatio();
  const mapPixels = readGl(instance.gl);
  const overlayPixels = instance.overlay ? readOverlay(instance.overlay) : null;
  const width = map.getCanvas().width / ratio;
  const height = map.getCanvas().height / ratio;
  const at = { x: 0, y: 0 };
  const counts = { copiesInView: 0, mapDrew: 0, custom: 0, overlay: 0 };
  for (let i = 0; i < data.ref.lon.length; i++) {
    if (data.ref.grid[i] !== 0 || data.ref.center[i]) continue;
    for (const k of [-1, 0, 1]) {
      const x = mercX(data.ref.lon[i]!) + k;
      if (!projectTo(instance.log.mapMatrix, x, mercY(data.ref.lat[i]!), 0, width, height, at))
        continue;
      const disc = blob(mapPixels, at.x, at.y, REF_RADIUS + 6, ratio, 'either');
      if (!disc) continue;
      counts.copiesInView++;
      if (disc.area > RED_AREA / 2) counts.mapDrew++;
      const own = instance.hosted
        ? blob(mapPixels, at.x, at.y, REF_RADIUS + 6, ratio, 'blue')
        : null;
      if (own && own.area > BLUE_AREA / 2) counts.custom++;
      const over = overlayPixels
        ? blob(overlayPixels, at.x, at.y, REF_RADIUS + 6, instance.overlay!.root.pixelRatio, 'blue')
        : null;
      if (over && over.area > BLUE_AREA / 2) counts.overlay++;
    }
  }
  return { camera: 'z0.6 centre 175°E', renderWorldCopies: map.getRenderWorldCopies(), ...counts };
}

/** Globe: reference points behind the horizon, which MapLibre hides. Does Holochart draw them? */
async function farSideTest(instance: Instance, data: Dataset): Promise<unknown> {
  const { map, log } = instance;
  map.jumpTo({ center: [-150, 10], zoom: 1.5, bearing: 0, pitch: 0 });
  await waitIdle(map, 4000);
  instance.drawSync();
  const ratio = map.getPixelRatio();
  const mapPixels = readGl(instance.gl);
  const overlayPixels = instance.overlay ? readOverlay(instance.overlay) : null;
  const width = map.getCanvas().width / ratio;
  const height = map.getCanvas().height / ratio;
  const at = { x: 0, y: 0 };
  const plane = log.clippingPlane;
  const counts = { farSide: 0, mapDrew: 0, custom: 0, overlay: 0 };
  for (let i = 0; i < data.ref.lon.length; i++) {
    if (data.ref.grid[i]! > 1) continue;
    const v = sphere(data.ref.lon[i]!, data.ref.lat[i]!);
    const side = v[0] * plane[0]! + v[1] * plane[1]! + v[2] * plane[2]! + plane[3]!;
    if (side >= 0) continue;
    if (!projectTo(log.mapMatrix, v[0], v[1], v[2], width, height, at)) continue;
    const disc = blob(mapPixels, at.x, at.y, REF_RADIUS + 6, ratio, 'red');
    if (!disc) continue;
    counts.farSide++;
    if (disc.area > RED_AREA / 2) counts.mapDrew++;
    const own = instance.hosted ? blob(mapPixels, at.x, at.y, REF_RADIUS + 6, ratio, 'blue') : null;
    if (own && own.area > BLUE_AREA / 2) counts.custom++;
    const over = overlayPixels
      ? blob(overlayPixels, at.x, at.y, REF_RADIUS + 6, instance.overlay!.root.pixelRatio, 'blue')
      : null;
    if (over && over.area > BLUE_AREA / 2) counts.overlay++;
  }
  return { camera: 'z1.5 centre 150°W (the site is behind the globe)', ...counts };
}

/**
 * A real `easeTo` under `requestAnimationFrame`. After every frame's callbacks have run, compare
 * the matrix the map drew with to the one Holochart drew with: the px between them is what the
 * compositor shows as the chart trailing the map.
 */
async function lagTest(instance: Instance, data: Dataset, options: Options): Promise<unknown> {
  const { map, log } = instance;
  map.jumpTo({ center: [SITE.lon, SITE.lat], zoom: 3, bearing: 0, pitch: 0 });
  await waitIdle(map, 4000);
  await nextFrame();
  const ratio = map.getPixelRatio();
  const width = map.getCanvas().width / ratio;
  const height = map.getCanvas().height / ratio;
  const refs: [number, number][] = [];
  for (let i = 0; i < data.ref.lon.length; i++) {
    if (data.ref.grid[i] === 1) refs.push([mercX(data.ref.lon[i]!), mercY(data.ref.lat[i]!)]);
  }
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 0 };
  const offsets: number[] = [];
  const intervals: number[] = [];
  let behind = 0;
  let frames = 0;
  let last = 0;
  // A chart that is already animating has its frame callback queued ahead of the map's.
  const release = options.ownLoop ? instance.overlay?.root.requestAnimation() : undefined;
  if (release) {
    await nextFrame();
    await nextFrame();
  }
  map.easeTo({
    center: [SITE.lon + 25, SITE.lat - 12],
    zoom: 4.2,
    bearing: 70,
    pitch: 55,
    duration: 1500,
    easing: (t) => t,
  });
  const started = performance.now();
  while (performance.now() - started < 4000) {
    const now = await nextFrame();
    if (last) intervals.push(now - last);
    last = now;
    await yieldTask(); // every rAF callback of this frame has run; nothing has been presented yet
    const moving = map.isMoving();
    let worst = 0;
    for (const [x, y] of refs) {
      if (!projectTo(log.mapMatrix, x, y, 0, width, height, a)) continue;
      if (!projectTo(log.holoMatrix, x, y, 0, width, height, b)) continue;
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y));
    }
    if (moving || worst > 0) {
      frames++;
      offsets.push(worst);
      if (worst > 0.5) behind++;
    }
    if (!moving && frames > 0 && worst === 0) break;
  }
  release?.();
  await waitIdle(map, 3000);
  return {
    sync: instance.overlay ? options.sync : 'custom layer',
    chartAlreadyAnimating: options.ownLoop,
    frames,
    framesBehind: behind,
    offsetPx: summarize(offsets),
    rafInterval: summarize(intervals),
  };
}

/** Camera path of the animated sequence: centre, zoom, bearing and pitch all move. */
function animate(map: MapLibreMap, seconds: number): void {
  map.jumpTo({
    center: [SITE.lon + 40 * Math.sin(seconds * 0.8), 30 + 20 * Math.cos(seconds * 0.6)],
    zoom: 2.5 + Math.sin(seconds * 0.5),
    bearing: 40 * Math.sin(seconds * 0.7),
    pitch: 25 + 25 * Math.sin(seconds * 0.9),
  });
}

async function perfTest(instance: Instance, page: SpikePage): Promise<void> {
  const { map, gl, overlay, hosted } = instance;
  // Warm up: shader programs, and the tiles of the zooms the sequence visits.
  // Each frame waits for the GPU: under software rendering unsynced frames queue up, and the
  // first measured frame would wait for all of them.
  for (let i = 0; i < 24; i++) {
    animate(map, i * 0.33);
    instance.drawSync();
    instance.syncGpu();
    await yieldTask();
  }
  await waitIdle(map, 3000);
  if (hosted) hosted.diag.resetMs = hosted.diag.drawMs = hosted.diag.frames = 0;
  const overlayGl = overlay && !overlay.root.shared ? overlay.root.renderer.getContext() : null;
  if (overlay && overlayGl) overlay.gpuTimer = createGpuTimer(overlayGl as WebGL2RenderingContext);
  const run = await runFrames(
    4000,
    (ms) => animate(map, ms / 1000),
    () => instance.drawSync(),
    { gl, sync: () => instance.syncGpu() },
  );
  const overlayGpu = overlay?.gpuTimer ? await overlay.gpuTimer.collect() : null;
  if (overlay) overlay.gpuTimer = null;
  const result = {
    frames: run.frames,
    fps: run.fps,
    frame: run.frame,
    cpu: run.cpu,
    gpuMapContext: run.gpu,
    gpuOverlayContext: overlayGpu?.length ? summarize(overlayGpu) : null,
    customLayer: hosted
      ? {
          resetStateMsPerFrame: round(hosted.diag.resetMs / Math.max(1, hosted.diag.frames), 4),
          drawMsPerFrame: round(hosted.diag.drawMs / Math.max(1, hosted.diag.frames), 4),
        }
      : null,
    drawCalls: overlay
      ? overlay.root.renderer.info.render.calls
      : (hosted?.renderer?.info.render.calls ?? 0),
  };
  page.set('perf', result);
  page.log(
    `perf: frame median ${run.frame.median} ms, p95 ${run.frame.p95} ms (${run.fps} fps) · CPU ` +
      `${run.cpu.median} ms · GPU map ${run.gpu?.median ?? 'n/a'} ms` +
      (result.gpuOverlayContext ? ` + overlay ${result.gpuOverlayContext.median} ms` : ''),
  );
}

// ---- export ----------------------------------------------------------------------------------

interface ImageCheck {
  width: number;
  height: number;
  land: number;
  sea: number;
  bulk: number;
  line: number;
  red: number;
  blue: number;
  /** The image has the map (land and sea) and the chart (markers and reference marks). */
  hasMap: boolean;
  hasChart: boolean;
}

async function checkImage(url: string): Promise<ImageCheck> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const c = { land: 0, sea: 0, bulk: 0, line: 0, red: 0, blue: 0 };
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (data[i + 3]! < 250) continue;
    if (r === g && g === b) {
      if (r === 247) c.land++;
      else if (r === 230) c.sea++;
    } else if (b - Math.max(r, g) > 120) c.blue++;
    else if (r - Math.max(g, b) > 120) c.red++;
    else if (g - Math.max(r, b) > 30) c.bulk++;
    else if (g > r + 30 && b > r + 30) c.line++;
  }
  return {
    width: canvas.width,
    height: canvas.height,
    ...c,
    hasMap: c.land > 500 && c.sea > 500 && c.red > 20,
    hasChart: c.bulk > 50 && c.blue > 20,
  };
}

/** One PNG of the map, the chart and the attribution, from a 2D canvas (works for both ways). */
function composite(instance: Instance, attribution = true): string {
  instance.drawSync();
  const source = instance.map.getCanvas();
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const context = out.getContext('2d')!;
  context.drawImage(source, 0, 0);
  if (instance.overlay)
    context.drawImage(instance.overlay.root.canvas, 0, 0, out.width, out.height);
  if (attribution) {
    // The attribution control is DOM: neither canvas has it, so the export writes it.
    const text =
      instance.container.querySelector('.maplibregl-ctrl-attrib-inner')?.textContent ?? '';
    const scale = out.width / instance.container.clientWidth;
    context.font = `${11 * scale}px sans-serif`;
    const width = context.measureText(text).width + 10 * scale;
    context.fillStyle = 'rgba(255,255,255,0.7)';
    context.fillRect(out.width - width, out.height - 18 * scale, width, 18 * scale);
    context.fillStyle = '#333';
    context.textBaseline = 'middle';
    context.fillText(text, out.width - width + 5 * scale, out.height - 9 * scale);
  }
  return out.toDataURL('image/png');
}

async function exportTest(instance: Instance, maplibre: MapLibre, page: SpikePage): Promise<void> {
  const { map } = instance;
  map.jumpTo({ center: [SITE.lon, SITE.lat], zoom: 3, bearing: 15, pitch: 35 });
  await waitIdle(map, 4000);
  const result: Record<string, unknown> = {
    attribution: instance.container.querySelector('.maplibregl-ctrl-attrib-inner')?.textContent,
  };

  // (a) The map canvas alone, read in the task that drew it (no preserveDrawingBuffer).
  let t0 = performance.now();
  map.redraw();
  const direct = map.getCanvas().toDataURL('image/png');
  result['mapCanvasAfterRedraw'] = {
    ms: round(performance.now() - t0),
    ...(await checkImage(direct)),
  };

  // (b) The same canvas a frame later: the drawing buffer has been presented and cleared.
  await nextFrame();
  await nextFrame();
  result['mapCanvasLater'] = await checkImage(map.getCanvas().toDataURL('image/png'));

  // (c) Captured inside the map's `render` event.
  const inEvent = await new Promise<string>((resolve) => {
    void map.once('render').then(() => resolve(map.getCanvas().toDataURL('image/png')));
    map.triggerRepaint();
  });
  result['mapCanvasInRenderEvent'] = await checkImage(inEvent);

  // (d) Redraw both, then composite on a 2D canvas, with the attribution.
  t0 = performance.now();
  const both = composite(instance);
  result['composite'] = { ms: round(performance.now() - t0), ...(await checkImage(both)) };

  // (e) At twice the resolution: the map has to be resized, redrawn and put back.
  const ratio = map.getPixelRatio();
  t0 = performance.now();
  map.setPixelRatio(ratio * 2);
  instance.overlay?.root.setPixelRatio(ratio * 2);
  const idleAt2x = await waitIdle(map, 3000);
  const big = composite(instance);
  map.setPixelRatio(ratio);
  instance.overlay?.root.setPixelRatio(ratio);
  result['compositeAt2x'] = {
    ms: round(performance.now() - t0),
    idle: idleAt2x,
    ...(await checkImage(big)),
  };
  await waitIdle(map, 3000);

  // (f) A tile source that never answers: `idle` never fires, the export must not wait for it.
  maplibre.addProtocol('never', () => new Promise(() => {}));
  map.addSource('stuck', { type: 'raster', tiles: ['never://{z}/{x}/{y}'], tileSize: 256 });
  map.addLayer({ id: 'stuck', type: 'raster', source: 'stuck' }, 'land');
  t0 = performance.now();
  const outcome = await waitIdle(map, 1500);
  const stuck = composite(instance);
  result['withStuckTiles'] = {
    idle: outcome,
    waitedMs: round(performance.now() - t0),
    tilesLoaded: map.areTilesLoaded(),
    ...(await checkImage(stuck)),
  };
  map.removeLayer('stuck');
  map.removeSource('stuck');
  maplibre.removeProtocol('never');
  page.set('export', result);
  const c = result['composite'] as ImageCheck;
  page.log(`export: composite ${c.width}×${c.height}, map ${c.hasMap}, chart ${c.hasChart}`);
}

// ---- picking ---------------------------------------------------------------------------------

async function pickTest(
  instance: Instance,
  data: Dataset,
  options: Options,
  page: SpikePage,
): Promise<void> {
  const { map, log } = instance;
  const result: Record<string, unknown> = {};
  const t0 = performance.now();
  const index = new PointIndex(data.mx, data.my);
  void index.size;
  result['indexBuildMs'] = round(performance.now() - t0);
  const radius = 8;
  const at = { x: 0, y: 0 };
  const random = rng(3);
  const views: [string, CameraState][] = [
    ['flat z3', { name: '', group: '', zoom: 3, bearing: 0, pitch: 0, grid: 1 }],
    ['pitch 60 z3', { name: '', group: '', zoom: 3, bearing: 30, pitch: 60, grid: 1 }],
    ['pitch 80 z5', { name: '', group: '', zoom: 5.25, bearing: 30, pitch: 80, grid: 2 }],
  ];
  for (const [name, state] of views) {
    jump(instance, state, options);
    await waitIdle(map, 3000);
    instance.drawSync();
    const ratio = map.getPixelRatio();
    const width = map.getCanvas().width / ratio;
    const height = map.getCanvas().height / ratio;
    // Without a chart layer (map, native) nothing has recorded the frame's matrix.
    const m = Float64Array.from(log.mapFrames ? log.mapMatrix : internalMatrix(map, options.globe));
    const pointers = Array.from(
      { length: 2000 },
      () => [random() * width, random() * height] as const,
    );

    /** Every point through the matrix: the answer the others are checked against. */
    const brute = (x: number, y: number): number => {
      let best = -1;
      let bestD = radius * radius;
      for (let i = 0; i < data.n; i++) {
        if (!projectTo(m, data.mx[i]!, data.my[i]!, 0, width, height, at)) continue;
        const d = (at.x - x) ** 2 + (at.y - y) ** 2;
        if (d <= bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };
    /** The index in mercator space, searched over the pointer's box on the ground. */
    let candidates = 0;
    const indexed = (x: number, y: number): number => {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        const ll = map.unproject([x + dx * radius, y + dy * radius]);
        const px = mercX(ll.lng);
        const py = mercY(ll.lat);
        x0 = Math.min(x0, px);
        x1 = Math.max(x1, px);
        y0 = Math.min(y0, py);
        y1 = Math.max(y1, py);
      }
      const found = index.withinRect(x0, y0, x1, y1);
      candidates += found.length;
      let best = -1;
      let bestD = radius * radius;
      for (const i of found) {
        if (!projectTo(m, data.mx[i]!, data.my[i]!, 0, width, height, at)) continue;
        const d = (at.x - x) ** 2 + (at.y - y) ** 2;
        if (d <= bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };
    /** ADR-010 as it is for a flat axis: one radius in data units, no projection. */
    const flat = (x: number, y: number): number => {
      const ll = map.unproject([x, y]);
      return index.nearest(mercX(ll.lng), mercY(ll.lat), radius / (512 * 2 ** map.getZoom()));
    };

    // `performance.now()` ticks in 0.1 ms here: time the whole batch, not each query.
    const answers: number[] = [];
    const i0 = performance.now();
    for (const [x, y] of pointers) answers.push(indexed(x, y));
    const indexedMs = (performance.now() - i0) / pointers.length;
    const s = performance.now();
    const flatAnswers = pointers.map(([x, y]) => flat(x, y));
    const flatMs = (performance.now() - s) / pointers.length;
    let wrongIndexed = 0;
    let wrongFlat = 0;
    let hits = 0;
    const b0 = performance.now();
    const checked = 200;
    for (let i = 0; i < checked; i++) {
      const truth = brute(pointers[i]![0], pointers[i]![1]);
      if (truth >= 0) hits++;
      if (truth !== answers[i]) wrongIndexed++;
      if (truth !== flatAnswers[i]) wrongFlat++;
    }
    const bruteMs = (performance.now() - b0) / checked;
    const q0 = performance.now();
    let features = 0;
    for (let i = 0; i < 200; i++) {
      const [x, y] = pointers[i]!;
      features += map.queryRenderedFeatures(
        [
          [x - radius, y - radius],
          [x + radius, y + radius],
        ],
        { layers: [map.getLayer('bulk') ? 'bulk' : 'ref'] },
      ).length;
    }
    const queryMs = (performance.now() - q0) / 200;

    result[name] = {
      indexedMs: round(indexedMs, 4),
      candidatesPerQuery: round(candidates / pointers.length, 1),
      bruteForceMs: round(bruteMs, 3),
      flatIndexMs: round(flatMs, 4),
      checked,
      withHit: hits,
      indexedWrong: wrongIndexed,
      flatIndexWrong: wrongFlat,
      queryRenderedFeaturesMs: round(queryMs, 4),
      queryRenderedFeaturesLayer: map.getLayer('bulk') ? 'bulk (all points)' : 'ref (57 points)',
      queryRenderedFeaturesHits: features,
      gpu: await gpuPick(instance, pointers, brute),
    };
    page.log(`pick ${name}: ${JSON.stringify(result[name])}`);
  }
  page.set('pick', result);
}

/** A signature of the map's frame, to tell whether drawing outside it disturbed MapLibre. */
function frameHash(instance: Instance): number {
  instance.map.redraw();
  const { data } = readGl(instance.gl);
  let h = 2166136261;
  for (let i = 0; i < data.length; i += 97) h = Math.imul(h ^ data[i]!, 16777619);
  return h >>> 0;
}

async function gpuPick(
  instance: Instance,
  pointers: (readonly [number, number])[],
  brute: (x: number, y: number) => number,
): Promise<unknown> {
  const { hosted, overlay, map } = instance;
  const count = 40;
  const radius = 8;
  if (overlay) {
    const picker = new GpuPicker(overlay.root.renderer, overlay.main, overlay.root);
    picker.register(overlay.parts.bulk);
    const times: number[] = [];
    let same = 0;
    for (let i = 0; i < count; i++) {
      const [x, y] = pointers[i]!;
      const s = performance.now();
      const hits = await picker.pick({ x, y, radius });
      times.push(performance.now() - s);
      if ((hits[0]?.pointIndex ?? -1) === brute(x, y)) same++;
    }
    picker.dispose();
    return { way: 'overlay context', ms: summarize(times), sameAsBruteForce: `${same}/${count}` };
  }
  if (hosted?.renderer && hosted.main && hosted.parts) {
    const renderer = hosted.renderer;
    const ratio = map.getPixelRatio();
    const size = {
      width: map.getCanvas().width / ratio,
      height: map.getCanvas().height / ratio,
      pixelRatio: ratio,
    };
    const picker = new GpuPicker(renderer, hosted.main, { size });
    picker.register(hosted.parts.bulk);
    // (1) Inside the map's frame (prerender), where MapLibre resets its state afterwards.
    const before = frameHash(instance);
    const times: number[] = [];
    let same = 0;
    for (let i = 0; i < count; i++) {
      const [x, y] = pointers[i]!;
      const s = performance.now();
      const hits = await new Promise<Awaited<ReturnType<GpuPicker['pick']>>>((resolve) => {
        hosted.inPrerender = () => void picker.pick({ x, y, radius }).then(resolve);
        map.triggerRepaint();
      });
      times.push(performance.now() - s);
      if ((hits[0]?.pointIndex ?? -1) === brute(x, y)) same++;
    }
    const afterInside = frameHash(instance);
    // (2) Outside any frame, three's state reset before and after.
    renderer.resetState();
    const [x, y] = pointers[0]!;
    const s = performance.now();
    await picker.pick({ x, y, radius });
    const outsideMs = performance.now() - s;
    renderer.resetState();
    const afterOutside = frameHash(instance);
    const afterOutsideSecond = frameHash(instance);
    picker.dispose();
    return {
      way: 'map context',
      insidePrerenderMs: summarize(times),
      sameAsBruteForce: `${same}/${count}`,
      mapFrameUnchangedAfterPrerenderPicks: before === afterInside,
      outsideFrameMs: round(outsideMs),
      mapFrameUnchangedAfterOutsidePick: before === afterOutside,
      mapFrameUnchangedOneFrameLater: before === afterOutsideSecond,
    };
  }
  return null;
}

// ---- contexts, events, loss, destroy, dashboard ----------------------------------------------

function describeContexts(census: ContextCensus, instances: Instance[]): Record<string, number> {
  const out: Record<string, number> = {
    total: 0,
    maplibre: 0,
    holochartOwn: 0,
    holochartShared: 0,
    other: 0,
  };
  const maps = new Set<unknown>(instances.map((i) => i.map.getCanvas()));
  const own = new Set<unknown>();
  const shared = new Set<unknown>();
  for (const i of instances) {
    if (!i.overlay) continue;
    (i.overlay.root.shared ? shared : own).add(i.overlay.root.renderer.domElement);
  }
  for (const { canvas } of census.live()) {
    out['total']!++;
    if (maps.has(canvas)) out['maplibre']!++;
    else if (own.has(canvas)) out['holochartOwn']!++;
    else if (shared.has(canvas)) out['holochartShared']!++;
    else out['other']!++;
  }
  return out;
}

async function eventsTest(instance: Instance, data: Dataset, page: SpikePage): Promise<void> {
  const { map, container } = instance;
  map.jumpTo({ center: [SITE.lon, SITE.lat], zoom: 3, bearing: 0, pitch: 0 });
  await waitIdle(map, 3000);
  const rect = container.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const target = document.elementFromPoint(cx, cy);
  let moves = 0;
  const relayouts: Record<string, unknown>[] = [];
  const sequence: string[] = [];
  const subscriptions = [
    map.on('move', () => void moves++),
    ...(['movestart', 'dragstart', 'dragend', 'zoomstart', 'zoomend', 'moveend'] as const).map(
      (type) => map.on(type, () => void sequence.push(type)),
    ),
    // What a Plotly-style `relayout` would carry: one event per finished gesture.
    map.on('moveend', () => {
      const c = map.getCenter();
      relayouts.push({
        'map.center': { lon: round(c.lng, 4), lat: round(c.lat, 4) },
        'map.zoom': round(map.getZoom(), 3),
        'map.bearing': round(map.getBearing(), 2),
        'map.pitch': round(map.getPitch(), 2),
      });
    }),
  ];
  const mouse = (type: string, x: number, y: number, on: EventTarget): void => {
    on.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: type === 'mouseup' ? 0 : 1,
      }),
    );
  };
  const before = map.getCenter();
  if (target) {
    mouse('mousedown', cx, cy, target);
    for (let i = 1; i <= 8; i++) {
      mouse('mousemove', cx + i * 12, cy + i * 5, document);
      await nextFrame();
    }
    // MapLibre 6 ends a drag on `mouseup` at the map (or on a later move with no button down).
    mouse('mouseup', cx + 96, cy + 40, target);
    await Promise.race([map.once('moveend'), timeout(2500, null)]);
    await nextFrame();
  }
  const afterDrag = map.getCenter();
  const movesInDrag = moves;
  const zoomBefore = map.getZoom();
  target?.dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: cx,
      clientY: cy,
      deltaY: -300,
    }),
  );
  await Promise.race([map.once('zoomend'), timeout(2500, null)]);
  await waitIdle(map, 2000);
  const wheelZoomedBy = round(map.getZoom() - zoomBefore, 3);
  for (const s of subscriptions) s.unsubscribe();

  // Resize the container: both canvases must end at the same device size and still line up.
  const host = container.parentElement!;
  const old = { width: host.style.width, height: host.style.height };
  host.style.width = '777.5px';
  host.style.height = '431.5px';
  await nextFrame();
  await nextFrame();
  await waitIdle(map, 3000);
  map.jumpTo({ center: centerFor(MERCATOR_STATES[1]!), zoom: 3, bearing: 30, pitch: 40 });
  await waitIdle(map, 3000);
  instance.drawSync();
  const measured = measureRefs(instance, data, 1);
  const sizes = {
    container: `${host.clientWidth}×${host.clientHeight}`,
    mapCanvas: `${map.getCanvas().width}×${map.getCanvas().height}`,
    overlayCanvas: instance.overlay
      ? `${instance.overlay.root.canvas.width}×${instance.overlay.root.canvas.height}`
      : null,
    drift: Object.fromEntries(
      Object.entries(measured.ways).map(([k, w]) => [k, driftStats(w.drift)]),
    ),
  };
  host.style.width = old.width;
  host.style.height = old.height;
  await nextFrame();
  await waitIdle(map, 3000);

  page.set('events', {
    elementUnderPointer: target ? `${target.tagName.toLowerCase()}.${target.className}` : null,
    pointerReachesMap: target === map.getCanvas(),
    dragMovedCenterBy: {
      lon: round(afterDrag.lng - before.lng, 3),
      lat: round(afterDrag.lat - before.lat, 3),
    },
    moveEventsDuringDrag: movesInDrag,
    wheelZoomedBy,
    mapEvents: sequence.join(' '),
    relayouts,
    resize: sizes,
  });
  page.log(
    `events: pointer reaches map ${target === map.getCanvas()}, ${relayouts.length} relayouts`,
  );
}

async function lossTest(instance: Instance, data: Dataset, page: SpikePage): Promise<void> {
  const { map, hosted, overlay } = instance;
  const result: Record<string, unknown> = {};
  const state = MERCATOR_STATES[1]!;
  const seen = async (): Promise<Record<string, number>> => {
    map.jumpTo({ center: centerFor(state), zoom: state.zoom, bearing: 0, pitch: 0 });
    await waitIdle(map, 3000);
    instance.drawSync();
    const m = measureRefs(instance, data, state.grid);
    return {
      mapDrew: m.mapDrew,
      ...Object.fromEntries(Object.entries(m.ways).map(([k, w]) => [k, w.drew])),
    };
  };
  result['before'] = await seen();

  // The map's context goes and comes back.
  const extension = instance.gl.getExtension('WEBGL_lose_context');
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) =>
    void warnings.push(args.map(String).join(' ').slice(0, 160));
  const lost = Promise.race([map.once('webglcontextlost').then(() => true), timeout(2000, false)]);
  extension?.loseContext();
  const lostFired = await lost;
  // Restoring is only allowed once the lost event has been dispatched to every listener.
  await timeout(50, null);
  const overlayAliveWhileMapLost = overlay ? !overlay.root.contextLost : null;
  const restored = Promise.race([
    map.once('webglcontextrestored').then(() => true),
    timeout(3000, false),
  ]);
  extension?.restoreContext();
  const restoredFired = await restored;
  await Promise.race([map.once('load'), timeout(1500, null)]);
  await waitIdle(map, 4000);
  console.warn = warn;
  const layers = {
    'hc-main': !!map.getLayer('hc-main'),
    'hc-ref': !!map.getLayer('hc-ref'),
    'hc-probe': !!map.getLayer('hc-probe'),
  };
  const afterRestore = await seen();
  // Custom layers are not part of the style MapLibre restores: put them back.
  if (hosted && !layers['hc-main']) hosted.add();
  if (overlay && !layers['hc-probe']) overlay.addProbe();
  await waitIdle(map, 3000);
  result['mapContext'] = {
    lostFired,
    restoredFired,
    overlayAliveWhileMapLost,
    layersAfterRestore: layers,
    onRemoveCalledByLoss: hosted?.onRemoveCalls ?? null,
    drawnAfterRestore: afterRestore,
    drawnAfterReadding: await seen(),
    warnings: warnings.slice(0, 4),
  };

  // The overlay's own context goes and comes back: the map must not notice.
  if (overlay && !overlay.root.shared) {
    const root = overlay.root;
    const ext = root.renderer.getContext().getExtension('WEBGL_lose_context');
    const wasLost = new Promise<boolean>((resolve) => {
      const off = root.on('contextlost', () => {
        off();
        resolve(true);
      });
      setTimeout(() => resolve(false), 2000);
    });
    ext?.loseContext();
    const lostEvent = await wasLost;
    await timeout(50, null);
    const during = await seen();
    const back = new Promise<boolean>((resolve) => {
      const off = root.on('contextrestored', () => {
        off();
        resolve(true);
      });
      setTimeout(() => resolve(false), 3000);
    });
    ext?.restoreContext();
    const restoredEvent = await back;
    await nextFrame();
    await nextFrame();
    result['overlayContext'] = {
      lostEvent,
      restoredEvent,
      drawnWhileLost: during,
      drawnAfterRestore: await seen(),
    };
  }
  page.set('loss', result);
  page.log(`loss: ${JSON.stringify(result)}`);
}

async function destroyTest(
  maplibre: MapLibre,
  basemap: Basemap,
  page: SpikePage,
  options: Options,
  census: ContextCensus,
): Promise<void> {
  const small = buildDataset(2000);
  const holder = document.createElement('div');
  holder.style.cssText = 'position:relative;width:320px;height:200px';
  page.host.parentElement!.appendChild(holder);
  const liveBefore = census.live().length;
  const createdBefore = census.created();
  const times: number[] = [];
  let memory: unknown = null;
  let memoryMapFirst: unknown = null;
  let onRemove = 0;
  for (let i = 0; i < 4; i++) {
    const instance = await createInstance(maplibre, basemap, holder, small, options, options.mode);
    const renderer = instance.hosted?.renderer ?? null;
    const t0 = performance.now();
    if (i === 3 && instance.hosted) {
      // Last round: remove the map without removing the layers first.
      const hosted = instance.hosted;
      instance.overlay?.destroy();
      instance.map.remove();
      instance.container.remove();
      onRemove = hosted.onRemoveCalls;
    } else {
      instance.destroy();
    }
    times.push(performance.now() - t0);
    if (renderer) {
      const left = { ...renderer.info.memory, programs: renderer.info.programs?.length ?? 0 };
      if (i === 3) memoryMapFirst = left;
      else memory = left;
    }
    await nextFrame();
  }
  holder.remove();
  page.set('destroy', {
    rounds: 4,
    destroyMs: summarize(times),
    contextsCreated: census.created() - createdBefore,
    liveContextsLeft: census.live().length - liveBefore,
    threeMemoryAfterLayerRemoval: memory,
    threeMemoryWhenMapRemovedFirst: memoryMapFirst,
    onRemoveCallsWhenMapRemovedFirst: onRemove,
    holochartDedicatedContexts: dedicatedContextCount(),
  });
  page.log(`destroy: ${census.live().length - liveBefore} contexts left after 4 rounds`);
}

async function dashboardTest(
  maplibre: MapLibre,
  basemap: Basemap,
  page: SpikePage,
  options: Options,
  census: ContextCensus,
  first: Instance,
): Promise<void> {
  const small = buildDataset(scaled(20_000, 500));
  const createdBefore = census.created();
  const liveBefore = census.live().length;
  const holder = document.createElement('div');
  holder.style.cssText = 'display:grid;grid-template-columns:repeat(4,256px);gap:4px';
  page.host.parentElement!.appendChild(holder);
  const instances: Instance[] = [];
  const lost: number[] = [];
  for (let i = 0; i < options.maps; i++) {
    const cell = document.createElement('div');
    cell.style.cssText = 'position:relative;width:256px;height:160px';
    holder.appendChild(cell);
    // 'auto' is what a figure gets by default: a context of its own until four are taken.
    const instance = await createInstance(maplibre, basemap, cell, small, options, options.mode, {
      center: [CITIES[i % CITIES.length]![0], CITIES[i % CITIES.length]![1]],
      zoom: 2,
    });
    instances.push(instance);
    instance.map.on('webglcontextlost', () => void lost.push(i));
  }
  await nextFrame();
  const frame: number[] = [];
  for (let f = 0; f < 30; f++) {
    const t0 = performance.now();
    for (const instance of instances) {
      instance.map.jumpTo({ bearing: f * 3, pitch: 30 });
      instance.drawSync();
    }
    for (const instance of instances) instance.syncGpu();
    frame.push(performance.now() - t0);
    await yieldTask();
  }
  // The page's first map counts too: the browser's limit is per page.
  const contexts = describeContexts(census, [first, ...instances]);
  const made = census.created() - createdBefore;
  const lostContexts = made - (census.live().length - liveBefore);
  page.set('dashboard', {
    contexts,
    maps: options.maps + 1,
    contextsLostToTheBrowserLimit: lostContexts,
    dashboardMapsThatLostTheirContext: lost,
    firstMapLostItsContext: first.gl.isContextLost(),
    allMapsFrameMs: summarize(frame),
    workers: maplibre.getWorkerCount(),
  });
  page.log(
    `dashboard: ${options.maps + 1} maps, contexts ${JSON.stringify(contexts)}, lost ${lostContexts}`,
  );
  for (const instance of instances) instance.destroy();
  holder.remove();
}

/** One-off facts about sharing the context (custom layer) and about CPU projection. */
async function diagTest(instance: Instance, data: Dataset, page: SpikePage): Promise<void> {
  const { map, gl, hosted } = instance;
  const result: Record<string, unknown> = {};
  map.jumpTo({ center: [SITE.lon, SITE.lat], zoom: 3, bearing: 0, pitch: 0 });
  await waitIdle(map, 3000);
  for (let i = 0; i < 6; i++) instance.drawSync();
  if (hosted) {
    result['glCallsThreeInit'] = hosted.diag.glInit;
    result['glCallsResetStatePerFrame'] = hosted.diag.glReset;
    result['glCallsDrawPerFrame'] = hosted.diag.glDraw;
    const counter = countGlCalls(gl);
    map.redraw();
    result['glCallsWholeFrame'] = counter.read();
    counter.stop();
    hosted.remove();
    const alone = countGlCalls(gl);
    map.redraw();
    result['glCallsMapAloneFrame'] = alone.read();
    alone.stop();
    hosted.add();
    map.redraw();
    // Does assigning the canvas its own size clear the map's frame?
    const pixel = new Uint8Array(4);
    map.redraw();
    gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const before = pixel[0];
    const canvas = map.getCanvas();
    const w = canvas.width;
    canvas.width = w;
    gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    result['sameSizeAssignmentClearsFrame'] = pixel[0] !== before;
    map.redraw();
    const attributes = gl.getContextAttributes();
    result['mapContextAttributes'] = attributes;
    result['mapSamples'] = gl.getParameter(gl.SAMPLES) as number;
  }
  if (instance.overlay && !instance.overlay.root.shared) {
    const other = instance.overlay.root.renderer.getContext();
    result['overlayContextAttributes'] = other.getContextAttributes();
    result['overlaySamples'] = other.getParameter(other.SAMPLES) as number;
  }
  // Per-frame CPU projection, the alternative to handing the GPU a matrix.
  const n = data.n;
  let t0 = performance.now();
  let sum = 0;
  for (let i = 0; i < n; i++) sum += map.project([data.lon[i]!, data.lat[i]!]).x;
  result['mapProjectMsPerPoints'] = { points: n, ms: round(performance.now() - t0) };
  const at = { x: 0, y: 0 };
  const m = instance.log.mapMatrix;
  t0 = performance.now();
  for (let i = 0; i < n; i++) {
    projectTo(m, data.mx[i]!, data.my[i]!, 0, 1024, 640, at);
    sum += at.x;
  }
  result['matrixProjectMsPerPoints'] = {
    points: n,
    ms: round(performance.now() - t0),
    checksum: round(sum, 0),
  };
  const parts = hosted?.parts ?? instance.overlay?.parts;
  if (parts) {
    t0 = performance.now();
    parts.bulk.update({ origin: [mercX(SITE.lon), mercY(SITE.lat), 0] });
    instance.drawSync();
    instance.syncGpu();
    result['recenterOriginMs'] = { points: n, ms: round(performance.now() - t0) };
  }
  page.set('diag', result);
  page.log(`diag: ${JSON.stringify(result)}`);
}

// ---- page ------------------------------------------------------------------------------------

const CAPTURE_CAMERAS: Record<string, CameraState> = {
  flat: { name: 'flat', group: '', zoom: 1.5, bearing: 0, pitch: 0, grid: 0 },
  pitch: { name: 'pitch', group: '', zoom: 3, bearing: 20, pitch: 50, grid: 1 },
  steep: { name: 'steep', group: '', zoom: 5.25, bearing: 30, pitch: 80, grid: 2 },
  wrap: { name: 'wrap', group: '', zoom: 0.6, bearing: 0, pitch: 0, grid: 0, center: [175, 20] },
  far: { name: 'far', group: '', zoom: 1.5, bearing: 0, pitch: 0, grid: 0, center: [-150, 10] },
};

/** Where `main` is, for the watchdog's message. */
let stage = 'start';

async function main(page: SpikePage, disposers: (() => void)[]): Promise<void> {
  const options = readOptions();
  stage = 'import maplibre-gl';
  const census = startContextCensus();
  disposers.push(() => census.stop());

  // MapLibre is loaded the way an optional peer dependency would be: on demand.
  const t0 = performance.now();
  const [maplibre, worker, css] = await Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
    import('maplibre-gl/dist/maplibre-gl.css?inline'),
  ]);
  // Vite pre-bundles the main file, so the worker is no longer next to `import.meta.url`.
  const defaultWorkerUrl = maplibre.getWorkerUrl();
  // `worker=default` leaves MapLibre to find its worker next to `import.meta.url`.
  if (new URLSearchParams(window.location.search).get('worker') !== 'default') {
    maplibre.setWorkerUrl(worker.default);
  }
  const style = document.createElement('style');
  style.textContent = css.default;
  document.head.appendChild(style);
  disposers.push(() => style.remove());
  stage = 'basemap';
  const basemap = await loadBasemap();
  const data = buildDataset(scaled(options.points, 500));
  page.set('setup', {
    mode: options.mode,
    projection: options.globe ? 'globe' : 'mercator',
    points: data.n,
    lineVertices: data.line.lon.length,
    referencePoints: data.ref.lon.length,
    maplibre: maplibre.getVersion(),
    importMs: round(performance.now() - t0),
    defaultWorkerUrl,
    workerUrl: worker.default,
    workers: maplibre.getWorkerCount(),
    options: { ...options, tests: [...options.tests] },
  });

  const created = performance.now();
  stage = 'create map';
  const instance = await createInstance(maplibre, basemap, page.host, data, options, options.mode, {
    preserveDrawingBuffer: false,
  });
  disposers.push(() => instance.destroy());
  page.set('createMs', round(performance.now() - created));
  page.record.env = await collectEnv(instance.gl, instance.map.getCanvas());
  page.log(
    `${options.mode} · ${options.globe ? 'globe' : 'mercator'} · ${data.n} markers · MapLibre ` +
      `${maplibre.getVersion()} · DPR ${instance.map.getPixelRatio()}`,
  );

  window.__spikeCapture = () => {
    jump(instance, CAPTURE_CAMERAS[options.cam] ?? CAPTURE_CAMERAS['pitch']!, options);
    return composite(instance);
  };
  disposers.push(() => delete window.__spikeCapture);

  const tests = options.tests;
  const step = async (name: string, body: () => Promise<void>): Promise<void> => {
    if (!tests.has(name)) return;
    stage = `test ${name}`;
    await body();
  };
  await step('contexts', async () => {
    await sleep(200);
    const contexts = describeContexts(census, [instance]);
    page.set('contexts', { ...contexts, holochartDedicated: dedicatedContextCount() });
    page.log(`contexts: ${JSON.stringify(contexts)}`);
  });
  await step('diag', () => diagTest(instance, data, page));
  await step('sync', () => syncTest(instance, data, options, page));
  await step('lag', async () => {
    const lag = await lagTest(instance, data, options);
    page.set('lag', lag);
    page.log(`lag: ${JSON.stringify(lag)}`);
  });
  await step('perf', () => perfTest(instance, page));
  await step('pick', () => pickTest(instance, data, options, page));
  await step('export', () => exportTest(instance, maplibre, page));
  await step('events', () => eventsTest(instance, data, page));
  await step('loss', () => lossTest(instance, data, page));
  await step('destroy', () => destroyTest(maplibre, basemap, page, options, census));
  await step('dashboard', () => dashboardTest(maplibre, basemap, page, options, census, instance));

  stage = 'final frame';
  // Leave the page on the capture camera, waiting for tiles only so long.
  jump(instance, CAPTURE_CAMERAS[options.cam] ?? CAPTURE_CAMERAS['pitch']!, options);
  await waitIdle(instance.map, 3000);
  instance.drawSync();
}

export function run(el: HTMLElement): ExampleHandle {
  const page = createSpikePage(el, SPIKE_ID);
  const disposers: (() => void)[] = [];
  let disposed = false;
  // A step that never settles must end the run with its name, not with the runner's timeout.
  const limit = Number(new URLSearchParams(window.location.search).get('watchdog')) || 150;
  const watchdog = setTimeout(() => {
    if (page.record.status === 'running')
      page.fail(`watchdog: no result after ${limit} s, at "${stage}"`);
  }, limit * 1000);
  main(page, disposers).then(
    () => {
      clearTimeout(watchdog);
      if (!disposed && page.record.status === 'running') page.done();
    },
    (error: unknown) => {
      clearTimeout(watchdog);
      page.fail(error);
    },
  );
  return {
    ready: Promise.resolve(),
    dispose() {
      disposed = true;
      for (const d of disposers.reverse()) {
        try {
          d();
        } catch (error) {
          console.warn('[spike g] dispose failed:', error);
        }
      }
      page.dispose();
    },
  };
}
