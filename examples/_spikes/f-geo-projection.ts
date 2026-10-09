import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  Sphere,
  Vector3,
  type IUniform,
  type ShaderMaterial,
} from 'three';
import {
  geoAlbersUsa,
  geoEquirectangular,
  geoGraticule10,
  geoMercator,
  geoNaturalEarth1,
  geoOrthographic,
  type GeoProjection,
  type GeoStream,
} from 'd3-geo';
import { geoProject } from 'd3-geo-projection';
import { feature, mesh } from 'topojson-client';
import type {
  FeatureCollection,
  Geometry,
  MultiLineString,
  MultiPolygon,
  Polygon,
  Position,
} from 'geojson';
import {
  createLazyFillPrimitive,
  createPrimitiveMaterial,
  createRenderRoot,
  LinePrimitive,
  triangulateFills,
  type DataTransform,
  type LazyFillPrimitive,
  type RenderRoot,
  type RGBA,
  type Viewport,
} from '@mk7s/holochart-render';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import {
  collectEnv,
  createGpuTimer,
  createSpikePage,
  heapMB,
  round,
  scaled,
  settleHeap,
  sleep,
  summarize,
  syncGL,
  yieldTask,
  type SpikePage,
} from './env.ts';

/**
 * Spike F (backlog GEO1): can a 50m Natural Earth world (land, countries, coastlines, graticule)
 * be reprojected on every frame of a drag, on the CPU through `d3-geo`, at 60 fps? See
 * `docs/spikes/f-geo-projection.md`.
 *
 * One page load measures one configuration, or a named sweep of them. Query parameters:
 *
 * - `mode=drag` (default) or `mode=first` (first-draw cost and memory, one resolution per load).
 * - `proj=orthographic|equirectangular|mercator|naturalEarth1|albersUsa`.
 * - `motion=rotate` (the projection's rotation changes every frame) or `motion=pan` (geometry is
 *   projected once, then only the data transform changes). Albers USA is always `pan`.
 * - `res=110m|50m`, `layers=all|lines|fills`, `frames=240` (multiplied by `scale`).
 * - `pipe=`
 *   - `geojson`: `geoProject` (d3-geo-projection) builds projected GeoJSON, which is flattened
 *     into the primitives' arrays. The obvious implementation.
 *   - `stream`: the projection's stream writes into preallocated typed arrays. `precision=0`
 *     turns d3's adaptive resampling off; `cull=1` skips features behind the horizon.
 *   - `smart`: features wholly inside the clip region skip d3's clipping and keep a
 *     triangulation made once; only clipped features go through d3 and earcut. `fast=own`
 *     projects those vertices with closed-form math, `fast=d3` through a d3 stream without
 *     clipping or resampling. `verify=0` skips the check for flipped triangles.
 *   - `shader`: longitude and latitude are uploaded once and projected in the vertex shader.
 *     `wrap=0` shows the antimeridian problem untreated, `maxEdge` (degrees) is the mesh
 *     subdivision.
 *   `smart` and `shader` skip d3's adaptive resampling, so their sources get long edges split
 *   once, to at most `dens` degrees of arc (default 2.5; 0 shows what happens without).
 * - `sweep=cpu|cheap|shader|pan` runs a fixed list of configurations (see `sweepConfigs`).
 * - `release=1` (with `res=110m`): also time the swap to 50m at the end of a drag.
 * - `check=0` skips the pixel comparison against the `stream` pipeline.
 * - `caplon`, `caplat`: view centre of the frame `window.__spikeCapture()` returns.
 */
export const meta: ExampleMeta = {
  title: 'Spike F: geo projection, CPU or GPU',
  description:
    'Per-frame cost of reprojecting a Natural Earth world through d3-geo, cheaper CPU strategies and a vertex-shader projection.',
  tags: ['spike', 'no-visual-test'],
};

declare global {
  interface Window {
    __spikeCapture?: () => string;
  }
}

const SPIKE_ID = 'f-geo-projection';
const TAU = 2 * Math.PI;
const HALF_PI = Math.PI / 2;
const RAD = Math.PI / 180;
const BUDGET_MS = 1000 / 60;
/** Polygons with a bounding cap wider than this never keep a cached triangulation. */
const MAX_CACHE_CAP = 70 * RAD;
/** Points per line chunk in the `smart` pipeline and for horizon culling. */
const LINE_CHUNK = 64;

const PROJECTIONS = [
  'orthographic',
  'equirectangular',
  'mercator',
  'naturalEarth1',
  'albersUsa',
] as const;
type ProjName = (typeof PROJECTIONS)[number];
const PIPES = ['geojson', 'stream', 'smart', 'shader'] as const;
type Pipe = (typeof PIPES)[number];
const LAYERS = ['all', 'lines', 'fills'] as const;
type Layers = (typeof LAYERS)[number];
const RESOLUTIONS = ['110m', '50m'] as const;
type Res = (typeof RESOLUTIONS)[number];

interface Config {
  proj: ProjName;
  pipe: Pipe;
  res: Res;
  layers: Layers;
  motion: 'rotate' | 'pan';
  /** d3 adaptive resampling precision in px (0 = off). */
  precision: number;
  cull: boolean;
  fast: 'own' | 'd3';
  wrap: boolean;
  maxEdge: number;
  /** Longest edge (degrees of arc) of the sources of the pipelines that skip d3's resampling. */
  dens: number;
  /** `smart`: check the cached triangulation for flipped triangles, re-triangulate on a flip. */
  verify: boolean;
}

interface Size {
  width: number;
  height: number;
}

const OCEAN: RGBA = [0.86, 0.92, 0.97, 1];
const LAND: RGBA = [0.87, 0.85, 0.78, 1];
const BORDER: RGBA = [1, 1, 1, 1];
const COAST: RGBA = [0.2, 0.25, 0.3, 1];
const GRATICULE: RGBA = [0, 0, 0, 0.25];
const LINE_WIDTH = { borders: 0.75, coast: 1, graticule: 0.5 };

function now(): number {
  return performance.now();
}

// ---- source data ---------------------------------------------------------------------------

/** Bounding caps and unit vectors of a layer's chunks (polygons, or pieces of a line). */
interface Fast {
  xyz: Float64Array;
  /** Longitude in radians. */
  lam: Float64Array;
  chunkCount: number;
  v0: Uint32Array;
  v1: Uint32Array;
  capX: Float64Array;
  capY: Float64Array;
  capZ: Float64Array;
  capR: Float64Array;
  lonMin: Float64Array;
  lonMax: Float64Array;
  latMin: Float64Array;
  latMax: Float64Array;
}

interface FillSource {
  geojson: FeatureCollection<Polygon | MultiPolygon>;
  n: number;
  /** Degrees; rings carry no closing duplicate. */
  lon: Float64Array;
  lat: Float64Array;
  /** Start vertex of each ring, plus `n`. */
  ringStart: Uint32Array;
  ringCount: number;
  /** First ring of each polygon, plus `ringCount`. */
  polyRing: Uint32Array;
  polyFeature: Uint32Array;
  polyCount: number;
  featureCount: number;
  fast: Fast | null;
  tri: TriCache | null;
}

interface LineSource {
  geojson: MultiLineString;
  n: number;
  lon: Float64Array;
  lat: Float64Array;
  /** Start vertex of each line, plus `n`. */
  lineStart: Uint32Array;
  lineCount: number;
  /** Pieces of at most {@link LINE_CHUNK} points; neighbours share their end vertex. */
  chunkV0: Uint32Array;
  chunkV1: Uint32Array;
  chunkLine: Uint32Array;
  fast: Fast | null;
}

/** A triangulation of every polygon, made once in a gnomonic frame around its cap centre. */
interface TriCache {
  ok: Uint8Array;
  indices: Uint32Array;
  indexStarts: Uint32Array;
}

interface World {
  res: Res;
  land: FillSource;
  countries: FillSource;
  borders: LineSource;
  coast: LineSource;
  graticule: LineSource;
  timings: { fetchMs: number; parseMs: number; decodeMs: number; flattenMs: number };
  jsonChars: number;
  bytes: number;
  /** Copies with long edges split (see {@link denseWorld}), by maximum edge in degrees. */
  dense: Map<number, World>;
}

type Topology = Parameters<typeof feature>[0];
type TopoObject = NonNullable<Parameters<typeof mesh>[1]>;

const ATLAS: Record<Res, string> = {
  '110m': new URL('../node_modules/world-atlas/countries-110m.json', import.meta.url).href,
  '50m': new URL('../node_modules/world-atlas/countries-50m.json', import.meta.url).href,
};

function fillSource(fc: FeatureCollection<Polygon | MultiPolygon>): FillSource {
  const lon: number[] = [];
  const lat: number[] = [];
  const ringStart: number[] = [];
  const polyRing: number[] = [];
  const polyFeature: number[] = [];
  fc.features.forEach((f, fi) => {
    const g = f.geometry as Polygon | MultiPolygon | null;
    if (!g) return;
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const polygon of polygons) {
      const first = ringStart.length;
      for (let r = 0; r < polygon.length; r++) {
        const ring = polygon[r]!;
        let n = ring.length;
        const a = ring[0];
        const b = ring[n - 1];
        if (n > 1 && a && b && a[0] === b[0] && a[1] === b[1]) n--;
        if (n < 3) {
          if (r === 0) break;
          continue;
        }
        ringStart.push(lon.length);
        for (let i = 0; i < n; i++) {
          lon.push(ring[i]![0]!);
          lat.push(ring[i]![1]!);
        }
      }
      if (ringStart.length > first) {
        polyRing.push(first);
        polyFeature.push(fi);
      }
    }
  });
  const ringCount = ringStart.length;
  ringStart.push(lon.length);
  const polyCount = polyRing.length;
  polyRing.push(ringCount);
  return {
    geojson: fc,
    n: lon.length,
    lon: Float64Array.from(lon),
    lat: Float64Array.from(lat),
    ringStart: Uint32Array.from(ringStart),
    ringCount,
    polyRing: Uint32Array.from(polyRing),
    polyFeature: Uint32Array.from(polyFeature),
    polyCount,
    featureCount: fc.features.length,
    fast: null,
    tri: null,
  };
}

function lineSource(geometry: MultiLineString): LineSource {
  const lon: number[] = [];
  const lat: number[] = [];
  const lineStart: number[] = [];
  const chunkV0: number[] = [];
  const chunkV1: number[] = [];
  const chunkLine: number[] = [];
  for (const line of geometry.coordinates) {
    if (line.length < 2) continue;
    const start = lon.length;
    const index = lineStart.length;
    lineStart.push(start);
    for (const p of line) {
      lon.push(p[0]!);
      lat.push(p[1]!);
    }
    const end = lon.length;
    for (let v = start; v < end - 1; v += LINE_CHUNK - 1) {
      chunkV0.push(v);
      chunkV1.push(Math.min(end, v + LINE_CHUNK));
      chunkLine.push(index);
    }
  }
  const lineCount = lineStart.length;
  lineStart.push(lon.length);
  return {
    geojson: geometry,
    n: lon.length,
    lon: Float64Array.from(lon),
    lat: Float64Array.from(lat),
    lineStart: Uint32Array.from(lineStart),
    lineCount,
    chunkV0: Uint32Array.from(chunkV0),
    chunkV1: Uint32Array.from(chunkV1),
    chunkLine: Uint32Array.from(chunkLine),
    fast: null,
  };
}

function sourceBytes(s: FillSource | LineSource): number {
  let bytes = 0;
  for (const value of Object.values(s)) {
    if (ArrayBuffer.isView(value)) bytes += value.byteLength;
  }
  for (const part of [s.fast, 'tri' in s ? s.tri : null]) {
    if (!part) continue;
    for (const value of Object.values(part)) {
      if (ArrayBuffer.isView(value)) bytes += value.byteLength;
    }
  }
  return bytes;
}

async function loadWorld(res: Res): Promise<World> {
  const t0 = now();
  const text = await (await fetch(ATLAS[res])).text();
  const t1 = now();
  const topology = JSON.parse(text) as Topology;
  const t2 = now();
  const landObject = topology.objects['land'] as TopoObject;
  const countriesObject = topology.objects['countries'] as TopoObject;
  const landGeo = feature(topology, landObject) as unknown as FeatureCollection<
    Polygon | MultiPolygon
  >;
  const countriesGeo = feature(topology, countriesObject) as unknown as FeatureCollection<
    Polygon | MultiPolygon
  >;
  const bordersGeo = mesh(topology, countriesObject, (a, b) => a !== b);
  const coastGeo = mesh(topology, landObject);
  const t3 = now();
  const world: World = {
    res,
    land: fillSource(landGeo),
    countries: fillSource(countriesGeo),
    borders: lineSource(bordersGeo),
    coast: lineSource(coastGeo),
    graticule: lineSource(geoGraticule10()),
    timings: { fetchMs: 0, parseMs: 0, decodeMs: 0, flattenMs: 0 },
    jsonChars: text.length,
    bytes: 0,
    dense: new Map(),
  };
  const t4 = now();
  world.timings = {
    fetchMs: round(t1 - t0),
    parseMs: round(t2 - t1),
    decodeMs: round(t3 - t2),
    flattenMs: round(t4 - t3),
  };
  world.bytes = worldBytes(world);
  return world;
}

function worldBytes(world: World): number {
  return [world.land, world.countries, world.borders, world.coast, world.graticule].reduce(
    (sum, s) => sum + sourceBytes(s),
    0,
  );
}

function prepareFast(lon: Float64Array, lat: Float64Array, v0: Uint32Array, v1: Uint32Array): Fast {
  const n = lon.length;
  const xyz = new Float64Array(n * 3);
  const lam = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const l = lon[i]! * RAD;
    const p = lat[i]! * RAD;
    const c = Math.cos(p);
    lam[i] = l;
    xyz[3 * i] = c * Math.cos(l);
    xyz[3 * i + 1] = c * Math.sin(l);
    xyz[3 * i + 2] = Math.sin(p);
  }
  const count = v0.length;
  const fast: Fast = {
    xyz,
    lam,
    chunkCount: count,
    v0,
    v1,
    capX: new Float64Array(count),
    capY: new Float64Array(count),
    capZ: new Float64Array(count),
    capR: new Float64Array(count),
    lonMin: new Float64Array(count),
    lonMax: new Float64Array(count),
    latMin: new Float64Array(count),
    latMax: new Float64Array(count),
  };
  for (let c = 0; c < count; c++) {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let lo = Infinity;
    let hi = -Infinity;
    let la = Infinity;
    let lb = -Infinity;
    for (let i = v0[c]!; i < v1[c]!; i++) {
      sx += xyz[3 * i]!;
      sy += xyz[3 * i + 1]!;
      sz += xyz[3 * i + 2]!;
      lo = Math.min(lo, lon[i]!);
      hi = Math.max(hi, lon[i]!);
      la = Math.min(la, lat[i]!);
      lb = Math.max(lb, lat[i]!);
    }
    let len = Math.hypot(sx, sy, sz);
    if (len < 1e-9) {
      const i = v0[c]!;
      sx = xyz[3 * i]!;
      sy = xyz[3 * i + 1]!;
      sz = xyz[3 * i + 2]!;
      len = 1;
    }
    sx /= len;
    sy /= len;
    sz /= len;
    let minDot = 1;
    for (let i = v0[c]!; i < v1[c]!; i++) {
      minDot = Math.min(minDot, sx * xyz[3 * i]! + sy * xyz[3 * i + 1]! + sz * xyz[3 * i + 2]!);
    }
    fast.capX[c] = sx;
    fast.capY[c] = sy;
    fast.capZ[c] = sz;
    fast.capR[c] = Math.acos(Math.max(-1, Math.min(1, minDot)));
    fast.lonMin[c] = lo;
    fast.lonMax[c] = hi;
    fast.latMin[c] = la;
    fast.latMax[c] = lb;
  }
  return fast;
}

function fillFast(src: FillSource): Fast {
  if (!src.fast) {
    const v0 = new Uint32Array(src.polyCount);
    const v1 = new Uint32Array(src.polyCount);
    for (let p = 0; p < src.polyCount; p++) {
      v0[p] = src.ringStart[src.polyRing[p]!]!;
      v1[p] = src.ringStart[src.polyRing[p + 1]!]!;
    }
    src.fast = prepareFast(src.lon, src.lat, v0, v1);
  }
  return src.fast;
}

function lineFast(src: LineSource): Fast {
  src.fast ??= prepareFast(src.lon, src.lat, src.chunkV0, src.chunkV1);
  return src.fast;
}

/**
 * Triangulate every polygon once, in gnomonic coordinates around its cap centre (great circles are
 * straight there, so the triangles are valid on the sphere). Polygons wider than
 * {@link MAX_CACHE_CAP} are left out.
 */
function triCache(src: FillSource): TriCache {
  if (src.tri) return src.tri;
  const fast = fillFast(src);
  const u = new Float64Array(src.n);
  const w = new Float64Array(src.n);
  const ok = new Uint8Array(src.polyCount);
  for (let p = 0; p < src.polyCount; p++) {
    const a = fast.v0[p]!;
    const b = fast.v1[p]!;
    if (fast.capR[p]! >= MAX_CACHE_CAP) {
      u.set(src.lon.subarray(a, b), a);
      w.set(src.lat.subarray(a, b), a);
      continue;
    }
    ok[p] = 1;
    const cx = fast.capX[p]!;
    const cy = fast.capY[p]!;
    const cz = fast.capZ[p]!;
    // An orthonormal basis of the tangent plane at the cap centre.
    let ex = Math.abs(cz) < 0.9 ? -cy : 0;
    let ey = Math.abs(cz) < 0.9 ? cx : -cz;
    let ez = Math.abs(cz) < 0.9 ? 0 : cy;
    const el = Math.hypot(ex, ey, ez);
    ex /= el;
    ey /= el;
    ez /= el;
    const fx = cy * ez - cz * ey;
    const fy = cz * ex - cx * ez;
    const fz = cx * ey - cy * ex;
    for (let i = a; i < b; i++) {
      const x = fast.xyz[3 * i]!;
      const y = fast.xyz[3 * i + 1]!;
      const z = fast.xyz[3 * i + 2]!;
      const d = x * cx + y * cy + z * cz;
      u[i] = (x * ex + y * ey + z * ez) / d;
      w[i] = (x * fx + y * fy + z * fz) / d;
    }
  }
  const tri = triangulateFills({
    x: u,
    y: w,
    rings: src.ringStart.subarray(0, src.ringCount),
    polygons: src.polyRing.subarray(0, src.polyCount),
  });
  // The cache addresses source vertices, so the triangulation must not have dropped any.
  if (tri.vertexCount !== src.n) ok.fill(0);
  src.tri = { ok, indices: tri.indices, indexStarts: tri.indexStarts };
  return src.tri;
}

// ---- projections ---------------------------------------------------------------------------

function makeProjection(name: ProjName, size: Size, world: World): GeoProjection {
  const extent: [[number, number], [number, number]] = [
    [12, 12],
    [size.width - 12, size.height - 12],
  ];
  const sphere = { type: 'Sphere' } as const;
  switch (name) {
    case 'orthographic':
      return geoOrthographic().fitExtent(extent, sphere);
    case 'equirectangular':
      return geoEquirectangular().fitExtent(extent, sphere);
    case 'mercator':
      return geoMercator().fitExtent(extent, sphere);
    case 'naturalEarth1':
      return geoNaturalEarth1().fitExtent(extent, sphere);
    case 'albersUsa': {
      const usa = world.countries.geojson.features.find((f) => f.id === '840');
      return geoAlbersUsa().fitExtent(extent, usa ?? sphere);
    }
  }
}

/** Rotation of frame `i` of the scripted drag: 1.5° of longitude per frame at 240 frames. */
function rotationAt(cfg: Config, i: number, frames: number): [number, number] {
  const u = i / frames;
  return cfg.proj === 'orthographic' ? [-360 * u, -20 + 15 * Math.sin(TAU * u)] : [-360 * u, 0];
}

/** Pan and zoom as a transform of d3's pixel output: `X = k·x + ox`, `Y = −k·y + oy` (y up). */
interface PanView {
  k: number;
  ox: number;
  oy: number;
}

function panAt(u: number, size: Size): PanView {
  const k = 1 + 3 * (0.5 - 0.5 * Math.cos(TAU * u));
  const cx = size.width / 2;
  const cy = size.height / 2;
  const px = 80 * Math.sin(TAU * u);
  const py = 50 * Math.sin(2 * TAU * u);
  return { k, ox: cx - k * cx + px, oy: size.height - cy + k * cy - py };
}

function panTransform(view: PanView): DataTransform {
  return { scaleX: view.k, scaleY: -view.k, offsetX: view.ox, offsetY: view.oy };
}

// ---- stream sinks --------------------------------------------------------------------------

function growF64(a: Float64Array, need: number): Float64Array<ArrayBuffer> {
  const next = new Float64Array(Math.max(need, a.length * 2));
  next.set(a);
  return next;
}

function growU32(a: Uint32Array, need: number): Uint32Array<ArrayBuffer> {
  const next = new Uint32Array(Math.max(need, a.length * 2));
  next.set(a);
  return next;
}

/** Rings below this area (px²) are dropped when a clipped polygon is regrouped. */
const RING_EPS = 1e-9;

function pointInRing(
  x: Float64Array,
  y: Float64Array,
  a: number,
  b: number,
  px: number,
  py: number,
): boolean {
  let inside = false;
  for (let i = a, j = b - 1; i < b; j = i++) {
    const yi = y[i]!;
    const yj = y[j]!;
    if (yi > py !== yj > py && px < ((x[j]! - x[i]!) * (py - yi)) / (yj - yi) + x[i]!) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * d3 stream sink for polygons: projected vertices go straight into typed arrays in the fill
 * primitive's layout (`x`, `y`, `rings`, `polygons`). d3 emits the rings of a clipped polygon in
 * any order and several of them can be outer rings, so `polygonEnd` regroups them by the sign of
 * their area: outer rings are positive here, holes negative (what `geoProject` does with GeoJSON
 * arrays).
 */
class FillSink implements GeoStream {
  x = new Float64Array(1 << 16);
  y = new Float64Array(1 << 16);
  n = 0;
  rings = new Uint32Array(1 << 12);
  ringCount = 0;
  polys = new Uint32Array(1 << 12);
  polyFeature = new Uint32Array(1 << 12);
  polyCount = 0;
  /** Feature of the polygon being streamed (set by the caller). */
  feature = 0;
  #ring0 = 0;
  #areas = new Float64Array(64);

  reset(): void {
    this.n = 0;
    this.ringCount = 0;
    this.polyCount = 0;
  }

  get bytes(): number {
    return (
      this.x.byteLength +
      this.y.byteLength +
      this.rings.byteLength +
      this.polys.byteLength +
      this.polyFeature.byteLength
    );
  }

  point(px: number, py: number): void {
    const n = this.n;
    if (n === this.x.length) {
      this.x = growF64(this.x, n + 1);
      this.y = growF64(this.y, n + 1);
    }
    this.x[n] = px;
    this.y[n] = py;
    this.n = n + 1;
  }

  lineStart(): void {
    if (this.ringCount === this.rings.length) this.rings = growU32(this.rings, this.ringCount + 1);
    this.rings[this.ringCount++] = this.n;
  }

  lineEnd(): void {
    const start = this.rings[this.ringCount - 1]!;
    if (this.n - start < 3) {
      this.n = start;
      this.ringCount--;
    }
  }

  polygonStart(): void {
    this.#ring0 = this.ringCount;
  }

  polygonEnd(): void {
    const r0 = this.#ring0;
    const count = this.ringCount - r0;
    if (count <= 0) return;
    if (count === 1) {
      this.#pushPolygon(r0);
      return;
    }
    if (this.#areas.length < count) this.#areas = new Float64Array(count * 2);
    const areas = this.#areas;
    let outers = 0;
    let degenerate = false;
    for (let k = 0; k < count; k++) {
      const a = this.#area(r0 + k);
      areas[k] = a;
      if (Math.abs(a) < RING_EPS) degenerate = true;
      else if (a > 0) outers++;
    }
    // Already grouped when the one outer ring comes first and holds every hole.
    let grouped = outers === 1 && areas[0]! > 0 && !degenerate;
    for (let k = 1; grouped && k < count; k++) {
      const s = this.rings[r0 + k]!;
      grouped = pointInRing(
        this.x,
        this.y,
        this.rings[r0]!,
        this.rings[r0 + 1]!,
        this.x[s]!,
        this.y[s]!,
      );
    }
    if (grouped) this.#pushPolygon(r0);
    else this.#regroup(r0, count);
  }

  /** Close a polygon whose rings are already ordered outer ring first (projected GeoJSON). */
  polygonEndGrouped(): void {
    if (this.ringCount > this.#ring0) this.#pushPolygon(this.#ring0);
  }

  sphere(): void {}

  #ringEnd(r: number): number {
    return r + 1 < this.ringCount ? this.rings[r + 1]! : this.n;
  }

  #area(r: number): number {
    const a = this.rings[r]!;
    const b = this.#ringEnd(r);
    const { x, y } = this;
    let s = 0;
    for (let i = a, j = b - 1; i < b; j = i++) s += x[j]! * y[i]! - x[i]! * y[j]!;
    return s / 2;
  }

  #pushPolygon(ring: number): void {
    if (this.polyCount === this.polys.length) {
      this.polys = growU32(this.polys, this.polyCount + 1);
      this.polyFeature = growU32(this.polyFeature, this.polyCount + 1);
    }
    this.polys[this.polyCount] = ring;
    this.polyFeature[this.polyCount++] = this.feature;
  }

  /** Several outer rings, or holes ahead of their outer ring: rewrite the polygon grouped. */
  #regroup(r0: number, count: number): void {
    const base = this.rings[r0]!;
    const tx = this.x.slice(base, this.n);
    const ty = this.y.slice(base, this.n);
    const starts: number[] = [];
    const ends: number[] = [];
    const outer: boolean[] = [];
    const used = new Uint8Array(count);
    for (let k = 0; k < count; k++) {
      starts.push(this.rings[r0 + k]! - base);
      ends.push(this.#ringEnd(r0 + k) - base);
      outer.push(this.#areas[k]! > 0);
      // Clipping can leave a ring with no area (a sliver on the clip edge): it draws nothing.
      if (Math.abs(this.#areas[k]!) < RING_EPS) used[k] = 1;
    }
    this.n = base;
    this.ringCount = r0;
    const copy = (k: number): void => {
      this.lineStart();
      for (let i = starts[k]!; i < ends[k]!; i++) this.point(tx[i]!, ty[i]!);
    };
    for (let k = 0; k < count; k++) {
      if (!outer[k] || used[k]) continue;
      this.#pushPolygon(this.ringCount);
      copy(k);
      for (let h = 0; h < count; h++) {
        if (outer[h] || used[h]) continue;
        const s = starts[h]!;
        if (pointInRing(tx, ty, starts[k]!, ends[k]!, tx[s]!, ty[s]!)) {
          copy(h);
          used[h] = 1;
        }
      }
    }
    for (let h = 0; h < count; h++) {
      if (outer[h] || used[h]) continue;
      this.#pushPolygon(this.ringCount);
      copy(h);
    }
  }
}

/** d3 stream sink for lines, in the line primitive's layout (`x`, `y`, `starts`). */
class LineSink implements GeoStream {
  x = new Float64Array(1 << 16);
  y = new Float64Array(1 << 16);
  n = 0;
  starts = new Uint32Array(1 << 12);
  startCount = 0;
  #current = 0;

  reset(): void {
    this.n = 0;
    this.startCount = 0;
  }

  get bytes(): number {
    return this.x.byteLength + this.y.byteLength + this.starts.byteLength;
  }

  /** Room for `extra` more vertices written directly into `x` / `y`. */
  reserve(extra: number): void {
    if (this.n + extra > this.x.length) {
      this.x = growF64(this.x, this.n + extra);
      this.y = growF64(this.y, this.n + extra);
    }
  }

  point(px: number, py: number): void {
    const n = this.n;
    if (n === this.x.length) this.reserve(1);
    this.x[n] = px;
    this.y[n] = py;
    this.n = n + 1;
  }

  lineStart(): void {
    this.#current = this.n;
  }

  lineEnd(): void {
    const start = this.#current;
    if (this.n - start < 2) {
      this.n = start;
      return;
    }
    if (start === 0) return;
    if (this.startCount === this.starts.length) {
      this.starts = growU32(this.starts, this.startCount + 1);
    }
    this.starts[this.startCount++] = start;
  }

  polygonStart(): void {}
  polygonEnd(): void {}
  sphere(): void {}
}

function streamFills(
  src: FillSource,
  stream: GeoStream,
  sink: FillSink,
  skip: ((p: number) => boolean) | null,
): void {
  const { lon, lat, ringStart, polyRing, polyFeature } = src;
  for (let p = 0; p < src.polyCount; p++) {
    if (skip?.(p)) continue;
    sink.feature = polyFeature[p]!;
    stream.polygonStart();
    for (let r = polyRing[p]!, r1 = polyRing[p + 1]!; r < r1; r++) {
      stream.lineStart();
      for (let i = ringStart[r]!, e = ringStart[r + 1]!; i < e; i++) stream.point(lon[i]!, lat[i]!);
      stream.lineEnd();
    }
    stream.polygonEnd();
  }
}

/** Stream every line; with `skip`, chunks it rejects are left out and the line breaks there. */
function streamLines(
  src: LineSource,
  stream: GeoStream,
  skip: ((chunk: number) => boolean) | null,
): void {
  const { lon, lat } = src;
  if (!skip) {
    for (let l = 0; l < src.lineCount; l++) {
      stream.lineStart();
      for (let i = src.lineStart[l]!, e = src.lineStart[l + 1]!; i < e; i++) {
        stream.point(lon[i]!, lat[i]!);
      }
      stream.lineEnd();
    }
    return;
  }
  let open = -1;
  for (let c = 0; c < src.chunkV0.length; c++) {
    const line = src.chunkLine[c]!;
    if (open >= 0 && (open !== line || skip(c))) {
      stream.lineEnd();
      open = -1;
    }
    if (skip(c)) continue;
    let i = src.chunkV0[c]!;
    if (open < 0) {
      stream.lineStart();
      open = line;
    } else i++;
    for (const e = src.chunkV1[c]!; i < e; i++) stream.point(lon[i]!, lat[i]!);
  }
  if (open >= 0) stream.lineEnd();
}

function flattenProjectedFills(fc: FeatureCollection<Geometry | null>, sink: FillSink): void {
  fc.features.forEach((f, fi) => {
    const g = f.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return;
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    sink.feature = fi;
    for (const polygon of polygons) {
      sink.polygonStart();
      for (const ring of polygon) {
        sink.lineStart();
        // geoProject closes its rings; the fill primitive does not need the duplicate.
        for (let i = 0; i < ring.length - 1; i++) sink.point(ring[i]![0]!, ring[i]![1]!);
        sink.lineEnd();
      }
      sink.polygonEndGrouped();
    }
  });
}

function flattenProjectedLines(g: Geometry | null, sink: LineSink): void {
  if (!g || (g.type !== 'LineString' && g.type !== 'MultiLineString')) return;
  const lines: Position[][] = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
  for (const line of lines) {
    sink.lineStart();
    for (const p of line) sink.point(p[0]!, p[1]!);
    sink.lineEnd();
  }
}

// ---- pipelines -----------------------------------------------------------------------------

/** Time spent in one frame's CPU stages, in ms. */
interface FrameAcc {
  /** d3-geo projection, clipping, resampling, and writing the result. */
  proj: number;
  /** Fill build: triangulation (earcut) and attribute encoding. */
  tri: number;
  /** Line build: the line primitive's vertex stream. */
  line: number;
}

interface Pipeline {
  ready: Promise<void>;
  /** Reproject for a rotation `[lon, lat]` in degrees. */
  frame(rotation: readonly [number, number], acc: FrameAcc): void;
  /** Change only the data transform. */
  pan(view: PanView): void;
  setVisible(visible: boolean): void;
  stats(): Record<string, number>;
  dispose(): void;
}

function geometryBytes(geometry: BufferGeometry): number {
  const seen = new Set<ArrayBufferLike>();
  let bytes = 0;
  const add = (arr: ArrayBufferView | undefined): void => {
    if (!arr || seen.has(arr.buffer)) return;
    seen.add(arr.buffer);
    bytes += arr.byteLength;
  };
  for (const attribute of Object.values(geometry.attributes)) {
    const a = attribute as { array?: ArrayBufferView; data?: { array: ArrayBufferView } };
    add(a.data ? a.data.array : a.array);
  }
  add(geometry.index?.array as ArrayBufferView | undefined);
  return bytes;
}

/** One color per feature, as floats and as packed RGBA8 (little endian). */
function palette(count: number): { rgba: Float32Array; packed: Uint32Array } {
  const rgba = new Float32Array(count * 4);
  const packed = new Uint32Array(count);
  for (let f = 0; f < count; f++) {
    const t = ((f * 0.618034) % 1) * 0.85 + 0.1;
    const r = Math.round(255 * (0.27 + 0.6 * t * t));
    const g = Math.round(255 * (0.05 + 0.85 * t));
    const b = Math.round(255 * (0.33 + 0.35 * Math.sin(Math.PI * t)));
    rgba.set([r / 255, g / 255, b / 255, 1], f * 4);
    packed[f] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  return { rgba, packed };
}

function packColor(c: RGBA): number {
  const q = (v: number): number => Math.round(255 * v);
  return ((q(c[3]) << 24) | (q(c[2]) << 16) | (q(c[1]) << 8) | q(c[0])) >>> 0;
}

const EMPTY = new Float64Array(0);
const UNIT_SPHERE = new Sphere(new Vector3(0, 0, 0), 1);
const Y_FLIP = (size: Size): PanView => ({ k: 1, ox: 0, oy: size.height });

interface LineLayer {
  key: 'borders' | 'coast' | 'graticule';
  color: RGBA;
}
const LINE_LAYERS: LineLayer[] = [
  { key: 'borders', color: BORDER },
  { key: 'coast', color: COAST },
  { key: 'graticule', color: GRATICULE },
];

/**
 * Insert points along the great arc so that no edge of `path` is longer than `maxDeg`. d3's
 * adaptive resampling does this on every frame; a pipeline that skips it has to do it once, up
 * front. A `cut` path is already split at ±180°, so inserted longitudes stay on the edge's side.
 */
function densePath(path: readonly Position[], maxDeg: number, cut: boolean): Position[] {
  const out: Position[] = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[i]!;
    out.push(a);
    const b = path[i + 1];
    if (!b || !(maxDeg > 0)) continue;
    const l0 = a[0]! * RAD;
    const p0 = a[1]! * RAD;
    const l1 = b[0]! * RAD;
    const p1 = b[1]! * RAD;
    const x0 = Math.cos(p0) * Math.cos(l0);
    const y0 = Math.cos(p0) * Math.sin(l0);
    const z0 = Math.sin(p0);
    const x1 = Math.cos(p1) * Math.cos(l1);
    const y1 = Math.cos(p1) * Math.sin(l1);
    const z1 = Math.sin(p1);
    const omega = Math.acos(Math.max(-1, Math.min(1, x0 * x1 + y0 * y1 + z0 * z1)));
    const steps = Math.ceil(omega / RAD / maxDeg);
    if (steps < 2 || omega > Math.PI - 1e-6) continue;
    const so = Math.sin(omega);
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const wa = Math.sin((1 - t) * omega) / so;
      const wb = Math.sin(t * omega) / so;
      const x = wa * x0 + wb * x1;
      const y = wa * y0 + wb * y1;
      const z = wa * z0 + wb * z1;
      const linear = a[0]! + t * (b[0]! - a[0]!);
      const raw = Math.hypot(x, y) < 1e-12 ? linear : Math.atan2(y, x) / RAD;
      out.push([
        cut ? linear + wrap180(raw - linear) : raw,
        Math.asin(Math.max(-1, Math.min(1, z))) / RAD,
      ]);
    }
  }
  return out;
}

/** `world` with every edge split to at most `maxDeg` degrees of arc (cached on the world). */
function denseWorld(world: World, maxDeg: number): World {
  if (!(maxDeg > 0)) return world;
  let dense = world.dense.get(maxDeg);
  if (!dense) {
    const rings = (polygon: Position[][]): Position[][] =>
      polygon.map((ring) => densePath(ring, maxDeg, false));
    const fill = (src: FillSource): FillSource =>
      fillSource({
        type: 'FeatureCollection',
        features: src.geojson.features.map((f) => {
          const g = f.geometry as Polygon | MultiPolygon | null;
          if (!g) return f;
          const geometry: Polygon | MultiPolygon =
            g.type === 'Polygon'
              ? { type: 'Polygon', coordinates: rings(g.coordinates) }
              : { type: 'MultiPolygon', coordinates: g.coordinates.map(rings) };
          return { ...f, geometry };
        }),
      });
    const line = (src: LineSource): LineSource =>
      lineSource({
        type: 'MultiLineString',
        coordinates: src.geojson.coordinates.map((l) => densePath(l, maxDeg, false)),
      });
    dense = {
      ...world,
      land: fill(world.land),
      countries: fill(world.countries),
      borders: line(world.borders),
      coast: line(world.coast),
      graticule: line(world.graticule),
      dense: new Map(),
    };
    dense.bytes = worldBytes(dense);
    world.dense.set(maxDeg, dense);
  }
  return dense;
}

/** d3's antimeridian cut as plain degrees: `x` = longitude, `y` = −latitude. */
const CUT = geoEquirectangular()
  .scale(180 / Math.PI)
  .translate([0, 0])
  .precision(0);

/** Rotation matrix rows (depth, x, y) for d3's `rotate([lon, lat])`, row major. */
function rotationMatrix(lonDeg: number, latDeg: number, out: Float64Array): void {
  const cl = Math.cos(lonDeg * RAD);
  const sl = Math.sin(lonDeg * RAD);
  const cp = Math.cos(latDeg * RAD);
  const sp = Math.sin(latDeg * RAD);
  out.set([cl * cp, -sl * cp, -sp, sl, cl, 0, cl * sp, -sl * sp, cp]);
}

function wrap180(deg: number): number {
  return deg - 360 * Math.floor((deg + 180) / 360);
}

/** What changes with the rotation, for classifying chunks and projecting without d3. */
interface OwnState {
  proj: ProjName;
  m: Float64Array;
  k: number;
  tx: number;
  ty: number;
  dLon: number;
  /** Set by {@link classify}: the longitude shift (radians) of a chunk of a flat projection. */
  shift: number;
}

const HIDDEN = 0;
const INSIDE = 1;
const CLIPPED = 2;
const CAP_EPS = 0.02 * RAD;

/** Is chunk `c` wholly outside, wholly inside, or cut by the projection's clip edge? */
function classify(own: OwnState, fast: Fast, c: number): number {
  if (own.proj === 'orthographic') {
    const m = own.m;
    const d = m[0]! * fast.capX[c]! + m[1]! * fast.capY[c]! + m[2]! * fast.capZ[c]!;
    const angle = Math.acos(Math.max(-1, Math.min(1, d)));
    const r = fast.capR[c]!;
    if (angle + r < HALF_PI - CAP_EPS) return INSIDE;
    return angle - r > HALF_PI + CAP_EPS ? HIDDEN : CLIPPED;
  }
  const lo = fast.lonMin[c]!;
  const width = fast.lonMax[c]! - lo;
  // Wider than a hemisphere: the polygon wraps around the antimeridian or a pole.
  if (width > 180) return CLIPPED;
  // d3's Mercator clips at ±85.05° through its clip extent.
  if (own.proj === 'mercator' && (fast.latMax[c]! > 85 || fast.latMin[c]! < -85)) return CLIPPED;
  const a = wrap180(lo + own.dLon);
  if (a < -180 + 1e-6 || a + width > 180 - 1e-6) return CLIPPED;
  own.shift = (a - lo) * RAD;
  return INSIDE;
}

/** Per-vertex terms of a flat projection that do not change with `rotation.lon`. */
interface FlatTerms {
  /** `x = λ · xf`. */
  xf: Float64Array;
  /** `y`. */
  yc: Float64Array;
}

function flatTerms(proj: ProjName, lat: Float64Array): FlatTerms {
  const n = lat.length;
  const xf = new Float64Array(n);
  const yc = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const phi = lat[i]! * RAD;
    if (proj === 'naturalEarth1') {
      const p2 = phi * phi;
      const p4 = p2 * p2;
      xf[i] = 0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4));
      yc[i] = phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
    } else {
      xf[i] = 1;
      yc[i] = proj === 'mercator' ? Math.log(Math.tan(Math.PI / 4 + phi / 2)) : phi;
    }
  }
  return { xf, yc };
}

type Floats = Float32Array | Float64Array;

/** Project vertices `[v0, v1)` of an unclipped chunk with closed-form math (no d3). */
function projectOwn(
  own: OwnState,
  fast: Fast,
  flat: FlatTerms | null,
  v0: number,
  v1: number,
  ax: Floats,
  ao: number,
  ay: Floats,
  bo: number,
  stride: number,
): void {
  const { k, tx, ty } = own;
  if (!flat) {
    const xyz = fast.xyz;
    const m = own.m;
    const m3 = m[3]!;
    const m4 = m[4]!;
    const m5 = m[5]!;
    const m6 = m[6]!;
    const m7 = m[7]!;
    const m8 = m[8]!;
    for (let i = v0, j = 0; i < v1; i++, j += stride) {
      const x = xyz[3 * i]!;
      const y = xyz[3 * i + 1]!;
      const z = xyz[3 * i + 2]!;
      ax[ao + j] = tx + k * (m3 * x + m4 * y + m5 * z);
      ay[bo + j] = ty - k * (m6 * x + m7 * y + m8 * z);
    }
    return;
  }
  const { xf, yc } = flat;
  const lam = fast.lam;
  const shift = own.shift;
  for (let i = v0, j = 0; i < v1; i++, j += stride) {
    ax[ao + j] = tx + k * (lam[i]! + shift) * xf[i]!;
    ay[bo + j] = ty - k * yc[i]!;
  }
}

/** A sink that writes projected points at a stride (for {@link projectD3}). */
interface PointWriter extends GeoStream {
  ax: Floats;
  ay: Floats;
  ao: number;
  bo: number;
  stride: number;
}

function pointWriter(): PointWriter {
  return {
    ax: EMPTY,
    ay: EMPTY,
    ao: 0,
    bo: 0,
    stride: 1,
    point(x: number, y: number) {
      this.ax[this.ao] = x;
      this.ay[this.bo] = y;
      this.ao += this.stride;
      this.bo += this.stride;
    },
    lineStart() {},
    lineEnd() {},
    polygonStart() {},
    polygonEnd() {},
  };
}

/** A plain mesh for prebuilt triangles: the fill primitive cannot take them (`smart` pipeline). */
interface RawFill {
  mesh: Mesh<BufferGeometry, ShaderMaterial>;
  pos: Float32Array;
  col: Uint32Array;
  idx: Uint32Array;
  /** Make room; replaces `pos` / `col` / `idx` (contents kept) when it has to grow. */
  reserve(vertices: number, indices: number): void;
  commit(vertices: number, indices: number): void;
  pan(view: PanView): void;
  bytes(): number;
  dispose(): void;
}

const RAW_FILL_VERTEX = /* glsl */ `
in vec4 aColor;
uniform vec2 uScale;
uniform vec2 uOffset;
out vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy * uScale + uOffset, 0.0, 1.0);
}
`;

const RAW_FILL_FRAGMENT = /* glsl */ `
in vec4 vColor;
out highp vec4 fragColor;
void main() {
  fragColor = vColor;
}
`;

function createRawFill(vertexCapacity: number, indexCapacity: number, order: number): RawFill {
  const uniforms = { uScale: { value: [1, 1] }, uOffset: { value: [0, 0] } };
  const material = createPrimitiveMaterial({
    vertexShader: RAW_FILL_VERTEX,
    fragmentShader: RAW_FILL_FRAGMENT,
    uniforms,
  });
  material.side = DoubleSide;
  const mesh = new Mesh(new BufferGeometry(), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  let position: BufferAttribute;
  let color: BufferAttribute;
  let index: BufferAttribute;
  const raw: RawFill = {
    mesh,
    pos: new Float32Array(0),
    col: new Uint32Array(0),
    idx: new Uint32Array(0),
    reserve(vertices, indices) {
      if (vertices * 2 <= raw.pos.length && indices <= raw.idx.length) return;
      allocate(Math.ceil(vertices * 1.5), Math.ceil(indices * 1.5));
    },
    commit(vertices, indices) {
      for (const [attribute, count] of [
        [position, vertices * 2],
        [color, vertices * 4],
        [index, indices],
      ] as const) {
        attribute.clearUpdateRanges();
        if (count > 0) attribute.addUpdateRange(0, count);
        attribute.needsUpdate = true;
      }
      mesh.geometry.setDrawRange(0, indices);
    },
    pan(view) {
      uniforms.uScale.value = [view.k, -view.k];
      uniforms.uOffset.value = [view.ox, view.oy];
    },
    bytes: () => geometryBytes(mesh.geometry),
    dispose() {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
    },
  };
  function allocate(vertices: number, indices: number): void {
    const pos = new Float32Array(Math.max(4, vertices) * 2);
    const colBytes = new Uint8Array(Math.max(4, vertices) * 4);
    const col = new Uint32Array(colBytes.buffer);
    const idx = new Uint32Array(Math.max(6, indices));
    pos.set(raw.pos.subarray(0, Math.min(raw.pos.length, pos.length)));
    col.set(raw.col.subarray(0, Math.min(raw.col.length, col.length)));
    idx.set(raw.idx.subarray(0, Math.min(raw.idx.length, idx.length)));
    raw.pos = pos;
    raw.col = col;
    raw.idx = idx;
    const geometry = new BufferGeometry();
    position = new BufferAttribute(pos, 2);
    color = new BufferAttribute(colBytes, 4, true);
    index = new BufferAttribute(idx, 1);
    for (const attribute of [position, color, index]) attribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', position);
    geometry.setAttribute('aColor', color);
    geometry.setIndex(index);
    geometry.setDrawRange(0, 0);
    geometry.boundingSphere = UNIT_SPHERE; // three sorts by it; positions are 2D here
    mesh.geometry.dispose();
    mesh.geometry = geometry;
  }
  allocate(vertexCapacity, indexCapacity);
  return raw;
}

interface CpuPipeline extends Pipeline {
  /** Swap the source data (the 110m → 50m swap on release). */
  setWorld(world: World): void;
}

/** Pipelines `geojson` and `stream`: everything through d3-geo, into the real primitives. */
function createCpuPipeline(
  root: RenderRoot,
  vp: Viewport,
  initial: World,
  cfg: Config,
  size: Size,
): CpuPipeline {
  let world = initial;
  const projection = makeProjection(cfg.proj, size, world).precision(cfg.precision);
  const fills = cfg.layers !== 'lines';
  const lines = cfg.layers !== 'fills';
  const fillSink = new FillSink();
  const lineSink = new LineSink();
  let colors = palette(world.countries.featureCount);
  let colorScratch = new Float32Array(1024);
  const base = panTransform(Y_FLIP(size));

  const fillPrimitives: LazyFillPrimitive[] = [];
  if (fills) {
    for (const order of [0, 1]) {
      const fill = createLazyFillPrimitive(root.context, { x: EMPTY, y: EMPTY, color: LAND });
      fill.object.renderOrder = order;
      fill.setTransform(base);
      vp.add(fill);
      fillPrimitives.push(fill);
    }
  }
  const linePrimitives: LinePrimitive[] = [];
  if (lines) {
    LINE_LAYERS.forEach((layer, k) => {
      const line = new LinePrimitive(root.context, {
        x: EMPTY,
        y: EMPTY,
        color: layer.color,
        width: LINE_WIDTH[layer.key],
        join: 'round',
      });
      line.object.renderOrder = 2 + k;
      line.setTransform(base);
      vp.add(line);
      linePrimitives.push(line);
    });
  }

  // Horizon culling (`cull=1`, orthographic only).
  const culling = cfg.cull && cfg.proj === 'orthographic';
  const own: OwnState = {
    proj: cfg.proj,
    m: new Float64Array(9),
    k: 0,
    tx: 0,
    ty: 0,
    dLon: 0,
    shift: 0,
  };
  let fastNow: Fast | null = null;
  const hidden = (c: number): boolean => classify(own, fastNow!, c) === HIDDEN;
  const last = { fillVerts: 0, lineVerts: 0, culled: 0 };

  function fillLayer(src: FillSource, k: number, acc: FrameAcc): void {
    const t0 = now();
    fillSink.reset();
    if (cfg.pipe === 'geojson') {
      flattenProjectedFills(geoProject(src.geojson, projection), fillSink);
    } else {
      fastNow = culling ? fillFast(src) : null;
      streamFills(src, projection.stream(fillSink), fillSink, culling ? hidden : null);
    }
    const t1 = now();
    let color: RGBA | Float32Array = LAND;
    if (k === 1) {
      const count = fillSink.polyCount;
      if (colorScratch.length < count * 4) colorScratch = new Float32Array(count * 8);
      for (let p = 0; p < count; p++) {
        const f = fillSink.polyFeature[p]! * 4;
        colorScratch[4 * p] = colors.rgba[f]!;
        colorScratch[4 * p + 1] = colors.rgba[f + 1]!;
        colorScratch[4 * p + 2] = colors.rgba[f + 2]!;
        colorScratch[4 * p + 3] = 1;
      }
      color = colorScratch.subarray(0, count * 4);
    }
    fillPrimitives[k]!.update({
      x: fillSink.x.subarray(0, fillSink.n),
      y: fillSink.y.subarray(0, fillSink.n),
      rings: fillSink.rings.subarray(0, fillSink.ringCount),
      polygons: fillSink.polys.subarray(0, fillSink.polyCount),
      color,
    });
    last.fillVerts += fillSink.n;
    acc.proj += t1 - t0;
    acc.tri += now() - t1;
  }

  function lineLayer(src: LineSource, k: number, acc: FrameAcc): void {
    const t0 = now();
    lineSink.reset();
    if (cfg.pipe === 'geojson') {
      flattenProjectedLines(geoProject(src.geojson, projection), lineSink);
    } else {
      fastNow = culling ? lineFast(src) : null;
      streamLines(src, projection.stream(lineSink), culling ? hidden : null);
    }
    const t1 = now();
    linePrimitives[k]!.update({
      x: lineSink.x.subarray(0, lineSink.n),
      y: lineSink.y.subarray(0, lineSink.n),
      starts: lineSink.starts.subarray(0, lineSink.startCount),
    });
    last.lineVerts += lineSink.n;
    acc.proj += t1 - t0;
    acc.line += now() - t1;
  }

  return {
    ready: Promise.all(fillPrimitives.map((f) => f.ready)).then(() => undefined),
    setWorld(next) {
      world = next;
      colors = palette(world.countries.featureCount);
    },
    frame(rotation, acc) {
      if (cfg.proj !== 'albersUsa') projection.rotate([rotation[0], rotation[1]]);
      if (culling) rotationMatrix(rotation[0], rotation[1], own.m);
      last.fillVerts = 0;
      last.lineVerts = 0;
      if (fills) {
        fillLayer(world.land, 0, acc);
        fillLayer(world.countries, 1, acc);
      }
      if (lines) LINE_LAYERS.forEach((layer, k) => lineLayer(world[layer.key], k, acc));
    },
    pan(view) {
      const t = panTransform(view);
      for (const p of fillPrimitives) p.setTransform(t);
      for (const p of linePrimitives) p.setTransform(t);
    },
    setVisible(visible) {
      for (const p of fillPrimitives) p.object.visible = visible && p.fill !== null;
      for (const p of linePrimitives) p.object.visible = visible;
    },
    stats() {
      let triangles = 0;
      let bytes = 0;
      for (const p of fillPrimitives) {
        triangles += (p.fill?.triangulation.indices.length ?? 0) / 3;
        bytes += geometryBytes((p.object as Mesh).geometry);
      }
      for (const p of linePrimitives) bytes += geometryBytes(p.object.geometry);
      return {
        fillVerts: last.fillVerts,
        lineVerts: last.lineVerts,
        triangles,
        drawCalls: fillPrimitives.length + linePrimitives.length,
        geometryBytes: bytes,
        scratchBytes: fillSink.bytes + lineSink.bytes + colorScratch.byteLength,
      };
    },
    dispose() {
      for (const p of fillPrimitives) vp.remove(p, { dispose: true });
      for (const p of linePrimitives) vp.remove(p, { dispose: true });
    },
  };
}

/** A flipped triangle thinner than this (px) cannot be seen, even under a translucent fill. */
const FLIP_TOLERANCE = 0.25;

/**
 * Does the cached triangulation `[i0, i1)` fold over at the projected positions `pos`? True when a
 * triangle wound against the polygon's majority is thicker than {@link FLIP_TOLERANCE}.
 */
function hasFlip(
  pos: Float32Array,
  indices: Uint32Array,
  i0: number,
  i1: number,
  shift: number,
): boolean {
  let plus = 0;
  let minus = 0;
  for (let i = i0; i < i1; i += 3) {
    const a = (indices[i]! + shift) * 2;
    const b = (indices[i + 1]! + shift) * 2;
    const c = (indices[i + 2]! + shift) * 2;
    const twice =
      (pos[b]! - pos[a]!) * (pos[c + 1]! - pos[a + 1]!) -
      (pos[c]! - pos[a]!) * (pos[b + 1]! - pos[a + 1]!);
    if (twice > 0) plus += twice;
    else minus -= twice;
  }
  if (plus === 0 || minus === 0) return false;
  // Rare: look at the triangles of the minority winding. Thickness = 2·area / longest edge.
  const minority = plus < minus ? 1 : -1;
  for (let i = i0; i < i1; i += 3) {
    const a = (indices[i]! + shift) * 2;
    const b = (indices[i + 1]! + shift) * 2;
    const c = (indices[i + 2]! + shift) * 2;
    const abx = pos[b]! - pos[a]!;
    const aby = pos[b + 1]! - pos[a + 1]!;
    const acx = pos[c]! - pos[a]!;
    const acy = pos[c + 1]! - pos[a + 1]!;
    const twice = abx * acy - acx * aby;
    if (twice * minority <= 0) continue;
    const bcx = acx - abx;
    const bcy = acy - aby;
    const longest = Math.max(abx * abx + aby * aby, acx * acx + acy * acy, bcx * bcx + bcy * bcy);
    if (twice * twice > FLIP_TOLERANCE * FLIP_TOLERANCE * longest) return true;
  }
  return false;
}

interface SmartPipeline extends Pipeline {
  /** Triangles of unclipped polygons that the cached triangulation draws flipped, last frame. */
  flipped(): { triangles: number; areaPx: number };
}

/**
 * Pipeline `smart`: chunks behind the horizon are skipped, chunks wholly inside the clip region
 * are projected point by point (no clipping, no resampling) and keep a triangulation made once;
 * only chunks cut by the clip edge go through d3's stream and earcut.
 */
function createSmartPipeline(
  root: RenderRoot,
  vp: Viewport,
  world: World,
  cfg: Config,
  size: Size,
): SmartPipeline {
  const t0 = now();
  const dense = denseWorld(world, cfg.dens);
  const projection = makeProjection(cfg.proj, size, world).precision(cfg.precision);
  // For `fast=d3`: the same projection without clipping to the horizon and without resampling.
  const unclipped = makeProjection(cfg.proj, size, world).precision(0);
  if (cfg.proj === 'orthographic') unclipped.clipAngle(null);
  const fills = cfg.layers !== 'lines';
  const lines = cfg.layers !== 'fills';
  const flat = cfg.proj !== 'orthographic';
  const [tx, ty] = projection.translate();
  const own: OwnState = {
    proj: cfg.proj,
    m: new Float64Array(9),
    k: projection.scale(),
    tx,
    ty,
    dLon: 0,
    shift: 0,
  };
  const writer = pointWriter();
  const fillSink = new FillSink();
  const lineSink = new LineSink();
  const colors = palette(world.countries.featureCount);
  const landColor = packColor(LAND);
  const fillSources = fills ? [dense.land, dense.countries] : [];
  const fillLayers = fillSources.map((src, k) => ({
    src,
    fast: fillFast(src),
    tri: triCache(src),
    terms: flat ? flatTerms(cfg.proj, src.lat) : null,
    raw: createRawFill(src.n * 2 + 4096, src.n * 6 + 4096, k),
    /** Index ranges of the unclipped polygons of the last frame (for {@link flipped}). */
    inside: [] as number[],
  }));
  for (const layer of fillLayers) {
    layer.raw.pan(Y_FLIP(size));
    vp.scene.add(layer.raw.mesh);
  }
  const lineLayers = (lines ? LINE_LAYERS : []).map((layer, k) => {
    const src = dense[layer.key];
    const primitive = new LinePrimitive(root.context, {
      x: EMPTY,
      y: EMPTY,
      color: layer.color,
      width: LINE_WIDTH[layer.key],
      join: 'round',
    });
    primitive.object.renderOrder = 2 + k;
    primitive.setTransform(panTransform(Y_FLIP(size)));
    vp.add(primitive);
    return {
      src,
      fast: lineFast(src),
      terms: flat ? flatTerms(cfg.proj, src.lat) : null,
      primitive,
    };
  });
  const prepMs = now() - t0;
  const clipped: number[] = [];
  const last = {
    fastVerts: 0,
    d3Verts: 0,
    hidden: 0,
    clippedChunks: 0,
    reTriangulated: 0,
    triangles: 0,
    lineVerts: 0,
  };
  let unclippedStream: GeoStream = writer;

  function projectRange(
    fast: Fast,
    terms: FlatTerms | null,
    src: { lon: Float64Array; lat: Float64Array },
    v0: number,
    v1: number,
    ax: Floats,
    ao: number,
    ay: Floats,
    bo: number,
    stride: number,
  ): void {
    if (cfg.fast === 'own') {
      projectOwn(own, fast, terms, v0, v1, ax, ao, ay, bo, stride);
      return;
    }
    writer.ax = ax;
    writer.ay = ay;
    writer.ao = ao;
    writer.bo = bo;
    writer.stride = stride;
    for (let i = v0; i < v1; i++) unclippedStream.point(src.lon[i]!, src.lat[i]!);
  }

  function fillLayer(layer: (typeof fillLayers)[number], k: number, acc: FrameAcc): void {
    const { src, fast, tri, terms, raw } = layer;
    const t1 = now();
    let v = 0;
    let ix = 0;
    clipped.length = 0;
    layer.inside.length = 0;
    const { pos, col, idx } = raw;
    for (let p = 0; p < src.polyCount; p++) {
      const state = classify(own, fast, p);
      if (state === HIDDEN) {
        last.hidden++;
        continue;
      }
      if (state === CLIPPED || !tri.ok[p]) {
        clipped.push(p);
        continue;
      }
      const v0 = fast.v0[p]!;
      const v1 = fast.v1[p]!;
      projectRange(fast, terms, src, v0, v1, pos, 2 * v, pos, 2 * v + 1, 2);
      col.fill(k === 1 ? colors.packed[src.polyFeature[p]!]! : landColor, v, v + v1 - v0);
      const i0 = tri.indexStarts[p]!;
      const i1 = tri.indexStarts[p + 1]!;
      const shift = v - v0;
      if (cfg.verify && hasFlip(pos, tri.indices, i0, i1, shift)) {
        last.reTriangulated++;
        clipped.push(p);
        continue;
      }
      layer.inside.push(ix, ix + i1 - i0);
      for (let i = i0; i < i1; i++) idx[ix++] = tri.indices[i]! + shift;
      v += v1 - v0;
    }
    last.fastVerts += v;
    // The polygons the clip edge cuts: d3's stream, then earcut.
    fillSink.reset();
    const stream = projection.stream(fillSink);
    const { lon, lat, ringStart, polyRing } = src;
    for (const p of clipped) {
      fillSink.feature = src.polyFeature[p]!;
      stream.polygonStart();
      for (let r = polyRing[p]!, r1 = polyRing[p + 1]!; r < r1; r++) {
        stream.lineStart();
        for (let i = ringStart[r]!, e = ringStart[r + 1]!; i < e; i++) {
          stream.point(lon[i]!, lat[i]!);
        }
        stream.lineEnd();
      }
      stream.polygonEnd();
    }
    const t2 = now();
    if (fillSink.n > 0) {
      const cut = triangulateFills({
        x: fillSink.x.subarray(0, fillSink.n),
        y: fillSink.y.subarray(0, fillSink.n),
        rings: fillSink.rings.subarray(0, fillSink.ringCount),
        polygons: fillSink.polys.subarray(0, fillSink.polyCount),
      });
      raw.reserve(v + cut.vertexCount, ix + cut.indices.length);
      const position = raw.pos;
      for (let i = 0; i < cut.vertexCount; i++) {
        position[2 * (v + i)] = cut.positions[3 * i]!;
        position[2 * (v + i) + 1] = cut.positions[3 * i + 1]!;
      }
      for (let p = 0; p < cut.polygonCount; p++) {
        raw.col.fill(
          k === 1 ? colors.packed[fillSink.polyFeature[p]!]! : landColor,
          v + cut.vertexStarts[p]!,
          v + cut.vertexStarts[p + 1]!,
        );
      }
      const index = raw.idx;
      for (let i = 0; i < cut.indices.length; i++) index[ix + i] = cut.indices[i]! + v;
      v += cut.vertexCount;
      ix += cut.indices.length;
    }
    raw.commit(v, ix);
    last.d3Verts += fillSink.n;
    last.clippedChunks += clipped.length;
    last.triangles += ix / 3;
    acc.proj += t2 - t1;
    acc.tri += now() - t2;
  }

  function lineLayer(layer: (typeof lineLayers)[number], acc: FrameAcc): void {
    const { src, fast, terms, primitive } = layer;
    const t1 = now();
    lineSink.reset();
    const stream = projection.stream(lineSink);
    const { lon, lat } = src;
    let open = -1;
    for (let c = 0; c < fast.chunkCount; c++) {
      const state = classify(own, fast, c);
      const line = src.chunkLine[c]!;
      if (open >= 0 && (state !== INSIDE || line !== open)) {
        lineSink.lineEnd();
        open = -1;
      }
      if (state === HIDDEN) {
        last.hidden++;
        continue;
      }
      let v0 = fast.v0[c]!;
      const v1 = fast.v1[c]!;
      if (state === INSIDE) {
        if (open < 0) {
          lineSink.lineStart();
          open = line;
        } else v0++;
        lineSink.reserve(v1 - v0);
        projectRange(fast, terms, src, v0, v1, lineSink.x, lineSink.n, lineSink.y, lineSink.n, 1);
        lineSink.n += v1 - v0;
        last.fastVerts += v1 - v0;
      } else {
        const before = lineSink.n;
        stream.lineStart();
        for (let i = v0; i < v1; i++) stream.point(lon[i]!, lat[i]!);
        stream.lineEnd();
        last.d3Verts += lineSink.n - before;
        last.clippedChunks++;
      }
    }
    if (open >= 0) lineSink.lineEnd();
    const t2 = now();
    primitive.update({
      x: lineSink.x.subarray(0, lineSink.n),
      y: lineSink.y.subarray(0, lineSink.n),
      starts: lineSink.starts.subarray(0, lineSink.startCount),
    });
    last.lineVerts += lineSink.n;
    acc.proj += t2 - t1;
    acc.line += now() - t2;
  }

  return {
    ready: Promise.resolve(),
    frame(rotation, acc) {
      projection.rotate([rotation[0], rotation[1]]);
      unclipped.rotate([rotation[0], rotation[1]]);
      unclippedStream = unclipped.stream(writer);
      rotationMatrix(rotation[0], rotation[1], own.m);
      own.dLon = rotation[0];
      Object.assign(last, {
        fastVerts: 0,
        d3Verts: 0,
        hidden: 0,
        clippedChunks: 0,
        reTriangulated: 0,
        triangles: 0,
        lineVerts: 0,
      });
      fillLayers.forEach((layer, k) => fillLayer(layer, k, acc));
      for (const layer of lineLayers) lineLayer(layer, acc);
    },
    pan(view) {
      for (const layer of fillLayers) layer.raw.pan(view);
      for (const layer of lineLayers) layer.primitive.setTransform(panTransform(view));
    },
    setVisible(visible) {
      for (const layer of fillLayers) layer.raw.mesh.visible = visible;
      for (const layer of lineLayers) layer.primitive.object.visible = visible;
    },
    flipped() {
      let triangles = 0;
      let areaPx = 0;
      for (const { raw, inside } of fillLayers) {
        const { pos, idx } = raw;
        for (let r = 0; r < inside.length; r += 2) {
          let positive = 0;
          let negative = 0;
          let positiveArea = 0;
          let negativeArea = 0;
          for (let i = inside[r]!; i < inside[r + 1]!; i += 3) {
            const a = idx[i]! * 2;
            const b = idx[i + 1]! * 2;
            const c = idx[i + 2]! * 2;
            const area =
              ((pos[b]! - pos[a]!) * (pos[c + 1]! - pos[a + 1]!) -
                (pos[c]! - pos[a]!) * (pos[b + 1]! - pos[a + 1]!)) /
              2;
            if (area > 0) {
              positive++;
              positiveArea += area;
            } else if (area < 0) {
              negative++;
              negativeArea -= area;
            }
          }
          triangles += Math.min(positive, negative);
          areaPx += positive < negative ? positiveArea : negativeArea;
        }
      }
      return { triangles, areaPx: round(areaPx, 3) };
    },
    stats() {
      let bytes = 0;
      for (const layer of fillLayers) bytes += layer.raw.bytes();
      for (const layer of lineLayers) bytes += geometryBytes(layer.primitive.object.geometry);
      return {
        ...last,
        prepMs: round(prepMs),
        drawCalls: fillLayers.length + lineLayers.length,
        geometryBytes: bytes,
        scratchBytes: fillSink.bytes + lineSink.bytes,
      };
    },
    dispose() {
      for (const layer of fillLayers) layer.raw.dispose();
      for (const layer of lineLayers) vp.remove(layer.primitive, { dispose: true });
    },
  };
}

// ---- shader pipeline -----------------------------------------------------------------------

const PROJ_CODE: Record<ProjName, number> = {
  orthographic: 0,
  equirectangular: 1,
  mercator: 2,
  naturalEarth1: 3,
  albersUsa: -1,
};

/** Rotation and the four raw projections as GLSL. `position.xy` etc. are radians. */
const GEO_GLSL = /* glsl */ `
uniform int uProj;      // 0 orthographic, 1 equirectangular, 2 Mercator, 3 Natural Earth
uniform float uDLam;    // rotation.lon in radians
uniform vec4 uRotPG;    // cos, sin of rotation.lat and of the roll
uniform float uLonOnly; // 1 when rotation.lat and the roll are 0
uniform float uK;       // projection scale, px per radian
uniform vec2 uT;        // projection translate in world px (y up)
const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

// Orthographic: the rotated unit vector (depth, x, y). Others: (longitude, latitude, 1).
vec3 geoRotate(vec2 ll) {
  float lam = ll.x + uDLam;
  if (uLonOnly > 0.5 && uProj != 0) return vec3(mod(lam + PI, TAU) - PI, ll.y, 1.0);
  float cphi = cos(ll.y);
  float x = cos(lam) * cphi;
  float y = sin(lam) * cphi;
  float z = sin(ll.y);
  float k = z * uRotPG.x + x * uRotPG.y;
  vec3 r = vec3(x * uRotPG.x - z * uRotPG.y, y * uRotPG.z - k * uRotPG.w, k * uRotPG.z + y * uRotPG.w);
  if (uProj == 0) return r;
  return vec3(atan(r.y, r.x), asin(clamp(r.z, -1.0, 1.0)), 1.0);
}

vec2 geoRaw(vec3 r) {
  if (uProj == 0) return r.yz;
  if (uProj == 1) return r.xy;
  if (uProj == 2) {
    float phi = clamp(r.y, -1.4844222, 1.4844222);
    return vec2(r.x, log(tan(0.7853981634 + 0.5 * phi)));
  }
  float p2 = r.y * r.y;
  float p4 = p2 * p2;
  return vec2(
    r.x * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
    r.y * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))
  );
}
`;

/**
 * Fill vertex shader. With `uWrap`, three instances handle the antimeridian: instance 0 draws
 * every triangle at its principal longitude and drops the ones that straddle the seam; instances
 * 1 and 2 draw only those, shifted to continue past the right and the left edge.
 */
const GEO_FILL_VERTEX = /* glsl */ `
${GEO_GLSL}
in vec4 aColor;
uniform float uWrap;
out vec4 vColor;
out float vDepth;
out float vLam;
out float vNeg;
out float vFar;
flat out int vInst;

void main() {
  vColor = aColor;
  vec3 r = geoRotate(position.xy);
  vDepth = uProj == 0 ? r.x : 1.0;
  vInst = gl_InstanceID;
  float lam = r.x;
  vNeg = lam < 0.0 ? 1.0 : 0.0;
  vFar = abs(lam) > 0.5 * PI ? 1.0 : 0.0;
  vLam = lam;
  if (uProj != 0 && gl_InstanceID > 0) {
    if (vFar < 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    if (gl_InstanceID == 1 && lam < 0.0) lam += TAU;
    if (gl_InstanceID == 2 && lam > 0.0) lam -= TAU;
    r.x = lam;
    vLam = lam;
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(uT + uK * geoRaw(r), 0.0, 1.0);
}
`;

const GEO_FILL_FRAGMENT = /* glsl */ `
uniform int uProj;
uniform float uWrap;
in vec4 vColor;
in float vDepth;
in float vLam;
in float vNeg;
in float vFar;
flat in int vInst;
out highp vec4 fragColor;
const float PI = 3.141592653589793;

void main() {
  if (uProj == 0) {
    if (vDepth < 0.0) discard;
  } else if (uWrap > 0.5) {
    bool seam = vFar > 0.999 && vNeg > 1e-4 && vNeg < 0.9999;
    if (vInst == 0 ? seam : (!seam || abs(vLam) > PI)) discard;
  }
  fragColor = vColor;
}
`;

/**
 * Line vertex shader: one instance per segment, both ends projected here, the quad expanded in
 * world px. No joins. With `uWrap`, pass 0 draws a seam-crossing segment continuing from its
 * start and pass 1 draws it again continuing from its end; the fragment shader cuts both at the
 * map edge.
 */
const GEO_LINE_VERTEX = /* glsl */ `
${GEO_GLSL}
in vec2 aA;
in vec2 aB;
uniform float uHalfWidth;
uniform float uAA;
uniform float uPass;
uniform float uWrap;
out float vDepth;
out float vLam;
out float vSide;

void cull() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}

void main() {
  if (aA.y > 9.0 || aB.y > 9.0) { cull(); return; }
  vec3 ra = geoRotate(aA);
  vec3 rb = geoRotate(aB);
  float t = position.x;
  vDepth = 1.0;
  vLam = 0.0;
  if (uProj == 0) {
    if (ra.x < 0.0 && rb.x < 0.0) { cull(); return; }
    vDepth = mix(ra.x, rb.x, t);
  } else {
    float d = rb.x - ra.x;
    bool straddle = abs(d) > PI;
    if (uPass > 0.5) {
      if (!straddle || uWrap < 0.5) { cull(); return; }
      ra.x += d > 0.0 ? TAU : -TAU;
    } else if (straddle && uWrap > 0.5) {
      rb.x += d > 0.0 ? -TAU : TAU;
    }
    vLam = mix(ra.x, rb.x, t);
  }
  vec2 a = uT + uK * geoRaw(ra);
  vec2 b = uT + uK * geoRaw(rb);
  vec2 dir = b - a;
  float len = length(dir);
  dir = len > 1e-6 ? dir / len : vec2(1.0, 0.0);
  vSide = position.y * (uHalfWidth + uAA);
  vec2 p = mix(a, b, t) + vec2(-dir.y, dir.x) * vSide;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
}
`;

const GEO_LINE_FRAGMENT = /* glsl */ `
uniform int uProj;
uniform float uHalfWidth;
uniform float uAA;
uniform float uWrap;
uniform vec4 uColor;
in float vDepth;
in float vLam;
in float vSide;
out highp vec4 fragColor;
const float PI = 3.141592653589793;

void main() {
  if (vDepth < 0.0) discard;
  if (uProj != 0 && uWrap > 0.5 && abs(vLam) > PI) discard;
  float a = clamp((uHalfWidth + 0.5 * uAA - abs(vSide)) / uAA, 0.0, 1.0);
  if (a <= 0.0) discard;
  fragColor = vec4(uColor.rgb, uColor.a * a);
}
`;

/**
 * Longest-edge bisection until no triangle edge is longer than `maxEdge` degrees (in plain
 * longitude / latitude). A shared edge is always split at the same midpoint, so the result has no
 * T-junctions.
 */
function subdivide(
  lon: number[],
  lat: number[],
  feature: number[],
  triangles: Uint32Array,
  maxEdge: number,
): number[] {
  if (!(maxEdge > 0)) return Array.from(triangles);
  const max2 = maxEdge * maxEdge;
  const midpoints = new Map<number, number>();
  const stack = Array.from(triangles);
  const out: number[] = [];
  const d2 = (i: number, j: number): number => (lon[i]! - lon[j]!) ** 2 + (lat[i]! - lat[j]!) ** 2;
  let guard = 0;
  while (stack.length > 0 && guard++ < 2e7) {
    const c = stack.pop()!;
    const b = stack.pop()!;
    const a = stack.pop()!;
    const ab = d2(a, b);
    const bc = d2(b, c);
    const ca = d2(c, a);
    const longest = Math.max(ab, bc, ca);
    if (longest <= max2) {
      out.push(a, b, c);
      continue;
    }
    const [p, q, r] = ab === longest ? [a, b, c] : bc === longest ? [b, c, a] : [c, a, b];
    const key = p < q ? p * 4194304 + q : q * 4194304 + p;
    let m = midpoints.get(key);
    if (m === undefined) {
      m = lon.length;
      lon.push((lon[p]! + lon[q]!) / 2);
      lat.push((lat[p]! + lat[q]!) / 2);
      feature.push(feature[p]!);
      midpoints.set(key, m);
    }
    stack.push(p, m, r, m, q, r);
  }
  return out;
}

/**
 * Pipeline `shader`: longitude / latitude uploaded once, triangulated once in plain longitude /
 * latitude, projected in the vertex shader. A frame only sets uniforms.
 */
function createShaderPipeline(
  root: RenderRoot,
  vp: Viewport,
  world: World,
  cfg: Config,
  size: Size,
): Pipeline {
  const t0 = now();
  const dense = denseWorld(world, cfg.dens);
  const projection = makeProjection(cfg.proj, size, world);
  const [tx, ty] = projection.translate();
  const scale = projection.scale();
  const flat = cfg.proj !== 'orthographic';
  const wrap = cfg.wrap && flat;
  const shared: Record<string, IUniform> = {
    uProj: { value: PROJ_CODE[cfg.proj] },
    uDLam: { value: 0 },
    uRotPG: { value: [1, 0, 1, 0] },
    uLonOnly: { value: 1 },
    uK: { value: scale },
    uT: { value: [tx, size.height - ty] },
    uWrap: { value: wrap ? 1 : 0 },
  };
  const colors = palette(world.countries.featureCount);
  const landColor = packColor(LAND);
  const objects: Mesh[] = [];
  const disposers: (() => void)[] = [];
  let bytes = 0;
  let fillVerts = 0;
  let sourceFillVerts = 0;
  let triangles = 0;
  let segments = 0;
  let triangulateMs = 0;
  let subdivideMs = 0;

  if (cfg.layers !== 'lines') {
    const material = createPrimitiveMaterial({
      vertexShader: GEO_FILL_VERTEX,
      fragmentShader: GEO_FILL_FRAGMENT,
      uniforms: shared,
    });
    material.side = DoubleSide;
    disposers.push(() => material.dispose());
    [world.land, world.countries].forEach((src, k) => {
      // Cut at the antimeridian and close around the poles once, through d3, so the polygons are
      // simple in plain longitude / latitude. Then split long edges, which no longer curve.
      const cut = new FillSink();
      streamFills(src, CUT.stream(cut), cut, null);
      const lon: number[] = [];
      const lat: number[] = [];
      const rings: number[] = [];
      for (let r = 0; r < cut.ringCount; r++) {
        const path: Position[] = [];
        for (
          let i = cut.rings[r]!, e = r + 1 < cut.ringCount ? cut.rings[r + 1]! : cut.n;
          i < e;
          i++
        ) {
          path.push([
            Math.max(-180, Math.min(180, cut.x[i]!)),
            Math.max(-90, Math.min(90, -cut.y[i]!)),
          ]);
        }
        path.push(path[0]!);
        const dense = densePath(path, cfg.dens, true);
        rings.push(lon.length);
        for (let i = 0; i < dense.length - 1; i++) {
          lon.push(dense[i]![0]!);
          lat.push(dense[i]![1]!);
        }
      }
      const t1 = now();
      const tri = triangulateFills({
        x: lon,
        y: lat,
        rings,
        polygons: cut.polys.subarray(0, cut.polyCount),
      });
      const t2 = now();
      const vlon: number[] = [];
      const vlat: number[] = [];
      const vfeature: number[] = [];
      for (let p = 0; p < tri.polygonCount; p++) {
        for (let v = tri.vertexStarts[p]!; v < tri.vertexStarts[p + 1]!; v++) {
          vlon.push(tri.positions[3 * v]!);
          vlat.push(tri.positions[3 * v + 1]!);
          vfeature.push(cut.polyFeature[p]!);
        }
      }
      const indices = subdivide(vlon, vlat, vfeature, tri.indices, cfg.maxEdge);
      subdivideMs += now() - t2;
      triangulateMs += t2 - t1;
      const count = vlon.length;
      const position = new Float32Array(count * 2);
      const colorBytes = new Uint8Array(count * 4);
      const packed = new Uint32Array(colorBytes.buffer);
      for (let v = 0; v < count; v++) {
        position[2 * v] = vlon[v]! * RAD;
        position[2 * v + 1] = vlat[v]! * RAD;
        packed[v] = k === 1 ? colors.packed[vfeature[v]!]! : landColor;
      }
      const geometry = new InstancedBufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(position, 2));
      geometry.setAttribute('aColor', new BufferAttribute(colorBytes, 4, true));
      geometry.setIndex(new BufferAttribute(Uint32Array.from(indices), 1));
      geometry.instanceCount = wrap ? 3 : 1;
      geometry.boundingSphere = UNIT_SPHERE;
      const fill = new Mesh(geometry, material);
      fill.frustumCulled = false;
      fill.renderOrder = k;
      vp.scene.add(fill);
      objects.push(fill);
      disposers.push(() => geometry.dispose());
      bytes += geometryBytes(geometry);
      fillVerts += count;
      sourceFillVerts += src.n;
      triangles += indices.length / 3;
    });
  }

  if (cfg.layers !== 'fills') {
    const quad = new Float32BufferAttribute([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0], 3);
    LINE_LAYERS.forEach((layer, k) => {
      const src = dense[layer.key];
      const lon: number[] = [];
      const lat: number[] = [];
      for (let l = 0; l < src.lineCount; l++) {
        if (l > 0) {
          lon.push(0);
          lat.push(1e3 / RAD); // a break: latitude far out of range
        }
        for (let i = src.lineStart[l]!; i < src.lineStart[l + 1]!; i++) {
          lon.push(src.lon[i]!);
          lat.push(src.lat[i]!);
        }
      }
      const points = new Float32Array(lon.length * 2);
      for (let i = 0; i < lon.length; i++) {
        points[2 * i] = lon[i]! * RAD;
        points[2 * i + 1] = lat[i]! * RAD;
      }
      const buffer = new InstancedInterleavedBuffer(points, 2, 1);
      const geometry = new InstancedBufferGeometry();
      geometry.setAttribute('position', quad);
      geometry.setIndex([0, 1, 2, 2, 1, 3]);
      geometry.setAttribute('aA', new InterleavedBufferAttribute(buffer, 2, 0));
      geometry.setAttribute('aB', new InterleavedBufferAttribute(buffer, 2, 2));
      geometry.instanceCount = Math.max(0, lon.length - 1);
      disposers.push(() => geometry.dispose());
      bytes += points.byteLength;
      segments += geometry.instanceCount;
      for (const pass of wrap ? [0, 1] : [0]) {
        const material = createPrimitiveMaterial({
          vertexShader: GEO_LINE_VERTEX,
          fragmentShader: GEO_LINE_FRAGMENT,
          uniforms: {
            ...shared,
            uHalfWidth: { value: LINE_WIDTH[layer.key] / 2 },
            uAA: { value: 1 / root.pixelRatio },
            uPass: { value: pass },
            uColor: { value: [...layer.color] },
          },
        });
        material.side = DoubleSide;
        const line = new Mesh(geometry, material);
        line.frustumCulled = false;
        line.renderOrder = 2 + k;
        vp.scene.add(line);
        objects.push(line);
        disposers.push(() => material.dispose());
      }
    });
  }
  const buildMs = now() - t0;

  return {
    ready: Promise.resolve(),
    frame(rotation) {
      const phi = rotation[1] * RAD;
      shared['uDLam']!.value = rotation[0] * RAD;
      shared['uRotPG']!.value = [Math.cos(phi), Math.sin(phi), 1, 0];
      shared['uLonOnly']!.value = rotation[1] === 0 ? 1 : 0;
    },
    pan(view) {
      shared['uK']!.value = view.k * scale;
      shared['uT']!.value = [view.k * tx + view.ox, view.oy - view.k * ty];
    },
    setVisible(visible) {
      for (const object of objects) object.visible = visible;
    },
    stats: () => ({
      fillVerts,
      sourceFillVerts,
      triangles,
      lineSegments: segments,
      drawCalls: objects.length,
      geometryBytes: bytes,
      buildMs: round(buildMs),
      triangulateMs: round(triangulateMs),
      subdivideMs: round(subdivideMs),
    }),
    dispose() {
      for (const object of objects) object.removeFromParent();
      for (const dispose of disposers) dispose();
    },
  };
}

function createPipeline(
  root: RenderRoot,
  vp: Viewport,
  world: World,
  cfg: Config,
  size: Size,
): Pipeline {
  if (cfg.pipe === 'smart' && cfg.motion === 'rotate' && cfg.proj !== 'albersUsa') {
    return createSmartPipeline(root, vp, world, cfg, size);
  }
  if (cfg.pipe === 'shader' && cfg.proj !== 'albersUsa') {
    return createShaderPipeline(root, vp, world, cfg, size);
  }
  return createCpuPipeline(root, vp, world, cfg, size);
}

// ---- measurements --------------------------------------------------------------------------

function label(cfg: Config): string {
  const extras: string[] = [];
  if (cfg.pipe !== 'shader' && cfg.precision !== Math.SQRT1_2) {
    extras.push(`precision=${cfg.precision}`);
  }
  if (cfg.pipe === 'stream' && cfg.cull) extras.push('cull');
  if (cfg.pipe === 'smart') extras.push(`fast=${cfg.fast}`, ...(cfg.verify ? [] : ['verify=0']));
  if (cfg.pipe === 'shader') {
    extras.push(`maxEdge=${cfg.maxEdge}`);
    if (!cfg.wrap) extras.push('wrap=0');
  }
  return [cfg.res, cfg.proj, cfg.motion, cfg.pipe, ...extras, cfg.layers].join(' ');
}

/** Smallest step `performance.now()` reports (Chromium coarsens it unless cross-origin isolated). */
function timerResolution(): number {
  let best = Infinity;
  for (let i = 0; i < 50; i++) {
    const a = now();
    let b = now();
    while (b === a) b = now();
    best = Math.min(best, b - a);
  }
  return round(best, 3);
}

function readPixels(gl: WebGL2RenderingContext): Uint8Array {
  const out = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
  gl.readPixels(
    0,
    0,
    gl.drawingBufferWidth,
    gl.drawingBufferHeight,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    out,
  );
  return out;
}

/** Share of canvas pixels that differ at all, and by more than 24 / 255 in a channel. */
function pixelDiff(a: Uint8Array, b: Uint8Array): { any: number; visible: number } {
  let any = 0;
  let visible = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(
      Math.abs(a[i]! - b[i]!),
      Math.abs(a[i + 1]! - b[i + 1]!),
      Math.abs(a[i + 2]! - b[i + 2]!),
    );
    if (d > 0) any++;
    if (d > 24) visible++;
  }
  const pixels = a.length / 4;
  return { any: round((100 * any) / pixels, 3), visible: round((100 * visible) / pixels, 3) };
}

interface Bench {
  page: SpikePage;
  root: RenderRoot;
  vp: Viewport;
  gl: WebGL2RenderingContext;
  size: Size;
  worlds: Map<Res, World>;
  frames: number;
  check: boolean;
  release: boolean;
  capture: [number, number] | null;
}

async function runConfig(bench: Bench, cfg: Config): Promise<() => void> {
  const { page, root, vp, gl, size, frames } = bench;
  const world = bench.worlds.get(cfg.res)!;
  const tCreate = now();
  const pipeline = createPipeline(root, vp, world, cfg, size);
  await pipeline.ready;
  const createMs = now() - tCreate;
  const rotate = cfg.motion === 'rotate';

  // First frame: every buffer is allocated and uploaded here.
  const firstAcc: FrameAcc = { proj: 0, tri: 0, line: 0 };
  const f0 = now();
  pipeline.frame(rotate ? rotationAt(cfg, 0, frames) : [0, 0], firstAcc);
  const f1 = now();
  root.renderNow();
  syncGL(gl);
  const first = {
    createMs: round(createMs),
    projMs: round(firstAcc.proj),
    triMs: round(firstAcc.tri),
    lineMs: round(firstAcc.line),
    drawSyncedMs: round(now() - f1),
    totalMs: round(createMs + now() - f0),
  };
  const step = (i: number, acc: FrameAcc): void => {
    if (rotate) pipeline.frame(rotationAt(cfg, i, frames), acc);
    else pipeline.pan(panAt(i / frames, size));
  };
  for (let i = 0; i < 5; i++) {
    step(i, { proj: 0, tri: 0, line: 0 });
    root.renderNow();
    syncGL(gl);
    await yieldTask();
  }

  const timer = createGpuTimer(gl);
  const samples = {
    proj: [] as number[],
    tri: [] as number[],
    line: [] as number[],
    draw: [] as number[],
    sync: [] as number[],
    cpu: [] as number[],
    total: [] as number[],
  };
  const render = (): void => root.renderNow();
  const started = now();
  for (let i = 0; i < frames; i++) {
    const acc: FrameAcc = { proj: 0, tri: 0, line: 0 };
    const t0 = now();
    step(i, acc);
    const t1 = now();
    if (timer) timer.wrap(render);
    else render();
    const t2 = now();
    syncGL(gl);
    const t3 = now();
    samples.proj.push(acc.proj);
    samples.tri.push(acc.tri);
    samples.line.push(acc.line);
    samples.draw.push(t2 - t1);
    samples.sync.push(t3 - t2);
    samples.cpu.push(t2 - t0);
    samples.total.push(t3 - t0);
    await yieldTask();
  }
  const elapsed = now() - started;
  const gpu = timer ? await timer.collect() : [];
  const total = summarize(samples.total);
  const over = samples.total.filter((t) => t > BUDGET_MS).length;
  const result: Record<string, unknown> = {
    config: cfg,
    frames,
    fps: round(1000 / total.median, 1),
    wallFps: round((frames * 1000) / elapsed, 1),
    total,
    cpu: summarize(samples.cpu),
    proj: summarize(samples.proj),
    tri: summarize(samples.tri),
    line: summarize(samples.line),
    draw: summarize(samples.draw),
    sync: summarize(samples.sync),
    gpu: gpu.length ? summarize(gpu) : null,
    framesOverBudgetPct: round((100 * over) / frames, 1),
    budgetLeftPct: round(Math.max(0, (100 * (BUDGET_MS - total.median)) / BUDGET_MS), 1),
    budgetLeftAtP95Pct: round(Math.max(0, (100 * (BUDGET_MS - total.p95)) / BUDGET_MS), 1),
    first,
    stats: pipeline.stats(),
    rendererCalls: root.renderer.info.render.calls,
  };

  const baseline = cfg.pipe === 'stream' && !cfg.cull && cfg.precision === Math.SQRT1_2;
  if (bench.check && rotate && !baseline) {
    result['check'] = await compare(bench, cfg, pipeline);
  }
  if (bench.release && cfg.res === '110m' && 'setWorld' in pipeline) {
    result['release'] = await releaseTest(bench, cfg, pipeline as CpuPipeline);
  }
  if (!rotate) result['panCheck'] = panCheck(world, cfg, size);

  const s = result['stats'] as Record<string, number>;
  page.set(label(cfg), result);
  page.log(
    `${label(cfg)}: ${String(result['fps'])} fps · total ${total.median} ms (p95 ${total.p95}) · ` +
      `proj ${summarize(samples.proj).median} · tri ${summarize(samples.tri).median} · ` +
      `line ${summarize(samples.line).median} · draw ${summarize(samples.draw).median} · ` +
      `sync ${summarize(samples.sync).median} · gpu ${gpu.length ? summarize(gpu).median : 'n/a'} · ` +
      `first ${first.totalMs} ms · ${String(s['triangles'] ?? 0)} triangles`,
  );

  window.__spikeCapture = () => {
    const acc: FrameAcc = { proj: 0, tri: 0, line: 0 };
    if (rotate) {
      const centre = bench.capture ?? (cfg.proj === 'orthographic' ? [20, 25] : [150, 0]);
      pipeline.frame([-centre[0]!, -centre[1]!], acc);
    } else pipeline.pan(Y_FLIP(size));
    root.renderNow();
    return root.canvas.toDataURL('image/png');
  };
  return () => pipeline.dispose();
}

/** Pixel differences against the `stream` pipeline at a few rotations of the drag. */
async function compare(
  bench: Bench,
  cfg: Config,
  pipeline: Pipeline,
): Promise<Record<string, unknown>> {
  const { root, vp, gl, size, frames } = bench;
  const world = bench.worlds.get(cfg.res)!;
  const baseline = createCpuPipeline(
    root,
    vp,
    world,
    { ...cfg, pipe: 'stream', cull: false, precision: Math.SQRT1_2 },
    size,
  );
  await baseline.ready;
  const any: number[] = [];
  const visible: number[] = [];
  let flippedTriangles = 0;
  let flippedAreaPx = 0;
  const count = 8;
  for (let j = 0; j < count; j++) {
    const rotation = rotationAt(cfg, Math.round(((j + 0.37) * frames) / count), frames);
    const acc: FrameAcc = { proj: 0, tri: 0, line: 0 };
    baseline.frame(rotation, acc);
    pipeline.frame(rotation, acc);
    pipeline.setVisible(false);
    baseline.setVisible(true);
    root.renderNow();
    const a = readPixels(gl);
    pipeline.setVisible(true);
    baseline.setVisible(false);
    root.renderNow();
    const d = pixelDiff(a, readPixels(gl));
    any.push(d.any);
    visible.push(d.visible);
    if ('flipped' in pipeline) {
      const f = (pipeline as SmartPipeline).flipped();
      flippedTriangles = Math.max(flippedTriangles, f.triangles);
      flippedAreaPx = Math.max(flippedAreaPx, f.areaPx);
    }
    await yieldTask();
  }
  baseline.dispose();
  return {
    rotations: count,
    pixelsDifferingPct: summarize(any),
    pixelsVisiblyDifferingPct: summarize(visible),
    ...('flipped' in pipeline
      ? { maxFlippedTriangles: flippedTriangles, maxFlippedAreaPx: flippedAreaPx }
      : {}),
  };
}

/** Variant B: the one frame that swaps 110m for 50m when the drag ends. */
async function releaseTest(
  bench: Bench,
  cfg: Config,
  pipeline: CpuPipeline,
): Promise<Record<string, unknown>> {
  const { root, gl, frames } = bench;
  const low = bench.worlds.get('110m')!;
  const high = bench.worlds.get('50m')!;
  const total: number[] = [];
  const proj: number[] = [];
  const tri: number[] = [];
  const line: number[] = [];
  const draw: number[] = [];
  for (let j = 0; j < 20; j++) {
    const rotation = rotationAt(cfg, Math.round(((j + 0.5) * frames) / 20), frames);
    pipeline.setWorld(low);
    pipeline.frame(rotation, { proj: 0, tri: 0, line: 0 });
    root.renderNow();
    syncGL(gl);
    await yieldTask();
    const acc: FrameAcc = { proj: 0, tri: 0, line: 0 };
    const t0 = now();
    pipeline.setWorld(high);
    pipeline.frame(rotation, acc);
    const t1 = now();
    root.renderNow();
    syncGL(gl);
    const t2 = now();
    total.push(t2 - t0);
    proj.push(acc.proj);
    tri.push(acc.tri);
    line.push(acc.line);
    draw.push(t2 - t1);
    await yieldTask();
  }
  pipeline.setWorld(low);
  return {
    swaps: total.length,
    firstMs: round(total[0]!),
    total: summarize(total.slice(1)),
    proj: summarize(proj.slice(1)),
    tri: summarize(tri.slice(1)),
    line: summarize(line.slice(1)),
    drawSynced: summarize(draw.slice(1)),
    framesDroppedAt60: round(summarize(total.slice(1)).median / BUDGET_MS, 1),
  };
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/**
 * Is pan / zoom without rotation only a transform? Compares geometry projected once and scaled by
 * `zoom` with geometry projected at the zoomed scale: exactly (resampling off), and with d3's
 * adaptive resampling (vertex counts, and how far the scaled graticule is from the fresh one).
 */
function panCheck(world: World, cfg: Config, size: Size): Record<string, unknown> {
  const zoom = 8;
  const cx = size.width / 2;
  const cy = size.height / 2;
  const make = (precision: number, zoomed: boolean): GeoProjection => {
    const p = makeProjection(cfg.proj, size, world).precision(precision);
    if (zoomed) {
      const [tx, ty] = p.translate();
      p.scale(p.scale() * zoom).translate([zoom * (tx - cx) + cx, zoom * (ty - cy) + cy]);
    }
    return p;
  };
  const project = (p: GeoProjection): { fill: FillSink; coast: LineSink; graticule: LineSink } => {
    const fill = new FillSink();
    streamFills(world.countries, p.stream(fill), fill, null);
    const coast = new LineSink();
    streamLines(world.coast, p.stream(coast), null);
    const graticule = new LineSink();
    streamLines(world.graticule, p.stream(graticule), null);
    return { fill, coast, graticule };
  };
  const maxError = (a: FillSink | LineSink, b: FillSink | LineSink): number | null => {
    if (a.n !== b.n) return null;
    let worst = 0;
    for (let i = 0; i < a.n; i++) {
      worst = Math.max(
        worst,
        Math.abs(zoom * (a.x[i]! - cx) + cx - b.x[i]!),
        Math.abs(zoom * (a.y[i]! - cy) + cy - b.y[i]!),
      );
    }
    return worst;
  };
  const exactBase = project(make(0, false));
  const exactZoom = project(make(0, true));
  const base = project(make(Math.SQRT1_2, false));
  const fresh = project(make(Math.SQRT1_2, true));

  // Distance from each freshly resampled graticule vertex to the scaled base graticule.
  let deviation: number | null = null;
  if (base.graticule.startCount === fresh.graticule.startCount) {
    deviation = 0;
    const lines = base.graticule.startCount + 1;
    const startOf = (s: LineSink, l: number): number => (l === 0 ? 0 : s.starts[l - 1]!);
    const endOf = (s: LineSink, l: number): number => (l + 1 < lines ? s.starts[l]! : s.n);
    for (let l = 0; l < lines; l++) {
      const a0 = startOf(base.graticule, l);
      const a1 = endOf(base.graticule, l);
      for (let i = startOf(fresh.graticule, l); i < endOf(fresh.graticule, l); i++) {
        let best = Infinity;
        for (let j = a0; j + 1 < a1; j++) {
          best = Math.min(
            best,
            distanceToSegment(
              fresh.graticule.x[i]!,
              fresh.graticule.y[i]!,
              zoom * (base.graticule.x[j]! - cx) + cx,
              zoom * (base.graticule.y[j]! - cy) + cy,
              zoom * (base.graticule.x[j + 1]! - cx) + cx,
              zoom * (base.graticule.y[j + 1]! - cy) + cy,
            ),
          );
        }
        if (Number.isFinite(best)) deviation = Math.max(deviation, best);
      }
    }
  }
  const errors = [
    maxError(exactBase.fill, exactZoom.fill),
    maxError(exactBase.coast, exactZoom.coast),
    maxError(exactBase.graticule, exactZoom.graticule),
  ];
  return {
    zoom,
    /** Largest |scaled − reprojected| over all vertices with resampling off, in px at `zoom`. */
    affineMaxErrorPx: errors.some((e) => e === null) ? null : Math.max(...(errors as number[])),
    verticesBase: { fill: base.fill.n, coast: base.coast.n, graticule: base.graticule.n },
    verticesReprojected: { fill: fresh.fill.n, coast: fresh.coast.n, graticule: fresh.graticule.n },
    graticuleMaxDeviationPx: deviation === null ? null : round(deviation, 3),
  };
}

/** Largest difference between {@link projectOwn} and d3 over a sample of coast vertices, in px. */
function ownAgainstD3(world: World, proj: ProjName, size: Size): number {
  const projection = makeProjection(proj, size, world).rotate([
    -37,
    proj === 'orthographic' ? -20 : 0,
  ]);
  const [tx, ty] = projection.translate();
  const own: OwnState = {
    proj,
    m: new Float64Array(9),
    k: projection.scale(),
    tx,
    ty,
    dLon: -37,
    shift: 0,
  };
  rotationMatrix(-37, proj === 'orthographic' ? -20 : 0, own.m);
  const src = world.coast;
  const fast = lineFast(src);
  const terms = proj === 'orthographic' ? null : flatTerms(proj, src.lat);
  const out = new Float64Array(2);
  let worst = 0;
  for (let c = 0; c < fast.chunkCount; c += 7) {
    if (classify(own, fast, c) !== INSIDE) continue;
    const v = fast.v0[c]!;
    projectOwn(own, fast, terms, v, v + 1, out, 0, out, 1, 2);
    const expected = projection([src.lon[v]!, src.lat[v]!]);
    if (!expected) continue;
    worst = Math.max(worst, Math.abs(out[0]! - expected[0]), Math.abs(out[1]! - expected[1]));
  }
  return worst;
}

async function firstDraw(page: SpikePage, base: Config, reps: number): Promise<void> {
  const rows: Record<string, number>[] = [];
  for (let rep = 0; rep < reps; rep++) {
    await settleHeap();
    const heapBefore = heapMB() ?? NaN;
    const t0 = now();
    const world = await loadWorld(base.res);
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;inset:0';
    page.host.appendChild(div);
    const t1 = now();
    const root = createRenderRoot(div, { background: OCEAN, overlay: false });
    const gl = root.renderer.getContext() as WebGL2RenderingContext;
    const size = { width: root.size.width, height: root.size.height };
    const vp = root.addViewport({ rect: { x: 0, y: 0, ...size } });
    const t2 = now();
    const pipeline = createPipeline(root, vp, world, base, size);
    await pipeline.ready;
    const t3 = now();
    const acc: FrameAcc = { proj: 0, tri: 0, line: 0 };
    pipeline.frame(base.motion === 'rotate' ? rotationAt(base, 0, 1) : [0, 0], acc);
    const t4 = now();
    root.renderNow();
    const t5 = now();
    syncGL(gl);
    const t6 = now();
    const stats = pipeline.stats();
    page.record.env ??= await collectEnv(gl, root.canvas);
    rows.push({
      fetchMs: world.timings.fetchMs,
      parseMs: world.timings.parseMs,
      decodeMs: world.timings.decodeMs,
      flattenMs: world.timings.flattenMs,
      rootMs: round(t2 - t1),
      pipelineMs: round(t3 - t2),
      projMs: round(acc.proj),
      triMs: round(acc.tri),
      lineMs: round(acc.line),
      drawMs: round(t5 - t4),
      syncMs: round(t6 - t5),
      totalMs: round(t6 - t0),
      totalWithoutFetchMs: round(t6 - t0 - world.timings.fetchMs),
      jsonKB: round(world.jsonChars / 1024, 0),
      sourceArraysKB: round(worldBytes(world) / 1024, 0),
      geometryKB: round((stats['geometryBytes'] ?? 0) / 1024, 0),
      scratchKB: round((stats['scratchBytes'] ?? 0) / 1024, 0),
      triangles: stats['triangles'] ?? 0,
      heapBeforeMB: heapBefore,
      heapAfterMB: heapMB() ?? NaN,
    });
    pipeline.dispose();
    root.destroy();
    div.remove();
    await sleep(100);
  }
  const warm = rows.slice(1);
  const medians: Record<string, number> = {};
  for (const key of Object.keys(rows[0]!)) {
    medians[key] = warm.length ? summarize(warm.map((r) => r[key]!)).median : NaN;
  }
  const result = { config: base, cold: rows[0], warmMedian: medians, reps };
  page.set(`first ${label(base)}`, result);
  page.log(`first ${label(base)}: cold ${JSON.stringify(rows[0])}`);
  page.log(`first ${label(base)}: warm median ${JSON.stringify(medians)}`);
}

// ---- parameters ----------------------------------------------------------------------------

function oneOf<T extends string>(value: string | null, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function numberParam(q: URLSearchParams, key: string, fallback: number): number {
  const raw = q.get(key);
  const value = raw === null || raw === '' ? NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function parseConfig(q: URLSearchParams): Config {
  const proj = oneOf(q.get('proj'), PROJECTIONS, 'orthographic');
  return {
    proj,
    pipe: oneOf(q.get('pipe'), PIPES, 'stream'),
    res: oneOf(q.get('res'), RESOLUTIONS, '110m'),
    layers: oneOf(q.get('layers'), LAYERS, 'all'),
    motion: q.get('motion') === 'pan' || proj === 'albersUsa' ? 'pan' : 'rotate',
    precision: numberParam(q, 'precision', Math.SQRT1_2),
    cull: q.get('cull') === '1',
    fast: q.get('fast') === 'd3' ? 'd3' : 'own',
    wrap: q.get('wrap') !== '0',
    maxEdge: numberParam(q, 'maxEdge', 5),
    dens: numberParam(q, 'dens', 2.5),
    verify: q.get('verify') !== '0',
  };
}

function sweepConfigs(name: string, base: Config): Config[] {
  const rotating: ProjName[] = ['orthographic', 'naturalEarth1', 'equirectangular'];
  const rotate = { ...base, motion: 'rotate' } as const;
  switch (name) {
    // Variant A (and B with res=110m): everything through d3 every frame.
    case 'cpu':
      return rotating.flatMap((proj): Config[] => [
        { ...rotate, proj, pipe: 'geojson', layers: 'all' },
        { ...rotate, proj, pipe: 'stream', layers: 'all' },
        { ...rotate, proj, pipe: 'stream', layers: 'lines' },
        { ...rotate, proj, pipe: 'stream', layers: 'fills' },
      ]);
    // Variant C: the cheaper CPU strategies, one at a time.
    case 'cheap':
      return rotating.flatMap((proj): Config[] => [
        { ...rotate, proj, pipe: 'stream', layers: 'all', precision: 0 },
        ...(proj === 'orthographic'
          ? [{ ...rotate, proj, pipe: 'stream', layers: 'all', cull: true } as const]
          : []),
        { ...rotate, proj, pipe: 'smart', layers: 'all', fast: 'd3' },
        { ...rotate, proj, pipe: 'smart', layers: 'all', fast: 'own' },
        { ...rotate, proj, pipe: 'smart', layers: 'lines', fast: 'own' },
        { ...rotate, proj, pipe: 'smart', layers: 'fills', fast: 'own' },
      ]);
    // Variant D: projection in the vertex shader.
    case 'shader':
      return (['orthographic', 'equirectangular', 'mercator', 'naturalEarth1'] as const).flatMap(
        (proj) => LAYERS.map((layers): Config => ({ ...rotate, proj, pipe: 'shader', layers })),
      );
    // Cases 3 and 4: pan and zoom without rotation.
    case 'pan':
      return (['mercator', 'equirectangular', 'naturalEarth1', 'albersUsa'] as const).map(
        (proj): Config => ({ ...base, proj, pipe: 'stream', motion: 'pan', layers: 'all' }),
      );
    default:
      throw new Error(`Unknown sweep "${name}" (cpu, cheap, shader, pan).`);
  }
}

async function main(page: SpikePage, disposers: (() => void)[]): Promise<void> {
  const q = new URLSearchParams(window.location.search);
  const base = parseConfig(q);
  await sleep(200);
  page.set('timerResolutionMs', timerResolution());
  if (q.get('mode') === 'first') {
    await firstDraw(page, base, Math.max(2, numberParam(q, 'reps', 4)));
    return;
  }
  const sweep = q.get('sweep');
  const configs = sweep ? sweepConfigs(sweep, base) : [base];
  const root = createRenderRoot(page.host, { background: OCEAN, overlay: false });
  disposers.push(() => root.destroy());
  const gl = root.renderer.getContext() as WebGL2RenderingContext;
  page.record.env = await collectEnv(gl, root.canvas);
  const size = { width: root.size.width, height: root.size.height };
  const vp = root.addViewport({ rect: { x: 0, y: 0, ...size } });
  const release = q.get('release') === '1';
  const worlds = new Map<Res, World>();
  for (const res of new Set<Res>([...configs.map((c) => c.res), ...(release ? RESOLUTIONS : [])])) {
    const world = await loadWorld(res);
    worlds.set(res, world);
    page.set(`world ${res}`, {
      timings: world.timings,
      jsonKB: round(world.jsonChars / 1024, 0),
      vertices: {
        land: world.land.n,
        countries: world.countries.n,
        borders: world.borders.n,
        coast: world.coast.n,
        graticule: world.graticule.n,
      },
      polygons: { land: world.land.polyCount, countries: world.countries.polyCount },
      ownAgainstD3MaxPx: Object.fromEntries(
        (['orthographic', 'equirectangular', 'mercator', 'naturalEarth1'] as const).map((proj) => [
          proj,
          ownAgainstD3(world, proj, size),
        ]),
      ),
    });
  }
  const caplon = q.get('caplon');
  const bench: Bench = {
    page,
    root,
    vp,
    gl,
    size,
    worlds,
    frames: scaled(numberParam(q, 'frames', 240), 12),
    check: q.get('check') !== '0',
    release,
    capture: caplon === null ? null : [Number(caplon), numberParam(q, 'caplat', 0)],
  };
  let dispose: (() => void) | null = null;
  disposers.push(() => dispose?.());
  for (const cfg of configs) {
    dispose?.();
    dispose = await runConfig(bench, cfg);
    await sleep(100);
  }
}

export function run(el: HTMLElement): ExampleHandle {
  const page = createSpikePage(el, SPIKE_ID);
  const disposers: (() => void)[] = [];
  let disposed = false;
  main(page, disposers).then(
    () => {
      if (!disposed) page.done();
    },
    (error: unknown) => page.fail(error),
  );
  return {
    ready: Promise.resolve(),
    dispose() {
      disposed = true;
      delete window.__spikeCapture;
      for (const d of disposers.reverse()) d();
      page.dispose();
    },
  };
}
