/**
 * Marker symbol table (plan E2.4) — the single source of truth for symbol names, Plotly numeric
 * codes, and the SDF geometry uploaded to the GPU.
 *
 * ## Numeric codes (Plotly compatible)
 *
 * `code = base + 100 * variant`, where variant 0 = filled, 1 = `-open`, 2 = `-dot`, 3 = `-open-dot`.
 * Base indices follow plotly.js `symbol_defs` order:
 *
 * | #  | name              | #  | name               | #  | name             |
 * |----|-------------------|----|--------------------|----|------------------|
 * | 0  | circle            | 19 | star-triangle-up   | 38 | y-down           |
 * | 1  | square            | 20 | star-triangle-down | 39 | y-left           |
 * | 2  | diamond           | 21 | star-square        | 40 | y-right          |
 * | 3  | cross             | 22 | star-diamond       | 41 | line-ew          |
 * | 4  | x                 | 23 | diamond-tall       | 42 | line-ns          |
 * | 5  | triangle-up       | 24 | diamond-wide       | 43 | line-ne          |
 * | 6  | triangle-down     | 25 | hourglass          | 44 | line-nw          |
 * | 7  | triangle-left     | 26 | bowtie             | 45 | arrow-up         |
 * | 8  | triangle-right    | 27 | circle-cross       | 46 | arrow-down       |
 * | 9  | triangle-ne       | 28 | circle-x           | 47 | arrow-left       |
 * | 10 | triangle-se       | 29 | square-cross       | 48 | arrow-right      |
 * | 11 | triangle-sw       | 30 | square-x           | 49 | arrow-bar-up     |
 * | 12 | triangle-nw       | 31 | diamond-cross      | 50 | arrow-bar-down   |
 * | 13 | pentagon          | 32 | diamond-x          | 51 | arrow-bar-left   |
 * | 14 | hexagon           | 33 | cross-thin         | 52 | arrow-bar-right  |
 * | 15 | hexagon2          | 34 | x-thin             | 53 | arrow            |
 * | 16 | octagon           | 35 | asterisk           | 54 | arrow-wide       |
 * | 17 | star              | 36 | hash               |    |                  |
 * | 18 | hexagram          | 37 | y-up               |    |                  |
 *
 * ## Rendering semantics
 *
 * - Filled: area filled with the fill color; outline (stroke centered on the edge, like SVG) and
 *   interior lines (`circle-cross`, …) in the line color with the line width.
 * - `-open`: no fill; outline and lines drawn with the *fill* color at `max(lineWidth, 1)` px.
 * - `-dot` / `-open-dot`: as above plus a center dot (line color for `-dot`, fill color for
 *   `-open-dot`). Symbols flagged `noDot` (Plotly has no dot variant for them) ignore the dot.
 * - `noFill` symbols (`line-*`, `cross-thin`, `x-thin`, `asterisk`, `hash`, `y-*`) are pure strokes:
 *   like Plotly they use the line color and are invisible with `lineWidth = 0` unless `-open`.
 *
 * Geometry is in units of the marker radius (`size / 2`), y up, and follows plotly.js paths
 * (concave arcs of `star-*` symbols are sampled into polygons; `arrow`/`arrow-wide` are
 * approximations). Arrows have their tip at the anchor point, as in Plotly.
 */
import { DataTexture, FloatType, NearestFilter, NoColorSpace, RGBAFormat } from 'three';

type Vec2 = readonly [number, number];
type Segment = readonly [number, number, number, number];

/** Geometry of one base symbol. */
export interface SymbolDef {
  readonly name: string;
  /** Base code (0–54). */
  readonly code: number;
  /** Filled area: a unit circle, a polygon (even-odd), or none. */
  readonly area: 'circle' | readonly Vec2[] | null;
  /** Line segments stroked with the line (or open) color. */
  readonly segments: readonly Segment[];
  /** Plotly has no `-dot` variants for this symbol. */
  readonly noDot: boolean;
  /** Stroke-only glyph (no fill region). */
  readonly noFill: boolean;
  /** Max |x|, |y| of the geometry in radius units (quad half-extent before stroke/AA). */
  readonly extent: number;
}

const S3 = Math.sqrt(3);
const SQ2 = Math.SQRT2;

function poly(...pts: number[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) out.push([pts[i]!, pts[i + 1]!]);
  return out;
}

function regular(n: number, radius: number, startDeg: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((startDeg + (360 * i) / n) * Math.PI) / 180;
    out.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return out;
}

function star(points: number, outer: number, inner: number, startDeg = 90): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = ((startDeg + (180 * i) / points) * Math.PI) / 180;
    const r = i % 2 === 0 ? outer : inner;
    out.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return out;
}

function rotate(pts: readonly Vec2[], deg: number): Vec2[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c] as const);
}

const flipY = (pts: readonly Vec2[]): Vec2[] => pts.map(([x, y]) => [x, -y] as const);
const flipX = (pts: readonly Vec2[]): Vec2[] => pts.map(([x, y]) => [-x, y] as const);
const swapXY = (pts: readonly Vec2[]): Vec2[] => pts.map(([x, y]) => [y, x] as const);

/**
 * Polygon whose edges are concave circular arcs of `radius` (plotly `star-triangle`, `star-square`,
 * `star-diamond`): each arc bulges toward the centroid.
 */
function concaveArcPolygon(corners: readonly Vec2[], radius: number, steps = 6): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % corners.length]!;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const half = Math.hypot(dx, dy) / 2;
    // Unit normal pointing away from the origin (centroid) → arc center outside the shape.
    let nx = -dy;
    let ny = dx;
    if (nx * mx + ny * my < 0) {
      nx = -nx;
      ny = -ny;
    }
    const nl = Math.hypot(nx, ny);
    const h = Math.sqrt(Math.max(0, radius * radius - half * half));
    const cx = mx + (nx / nl) * h;
    const cy = my + (ny / nl) * h;
    const a0 = Math.atan2(a[1] - cy, a[0] - cx);
    let a1 = Math.atan2(b[1] - cy, b[0] - cx);
    // Take the short arc.
    let da = a1 - a0;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    a1 = a0 + da;
    for (let s = 0; s < steps; s++) {
      const t = a0 + ((a1 - a0) * s) / steps;
      out.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t)]);
    }
  }
  return out;
}

function seg(x0: number, y0: number, x1: number, y1: number): Segment {
  return [x0, y0, x1, y1];
}

/** Segments from the origin to each point (y-* glyphs). */
function spokes(pts: readonly Vec2[]): Segment[] {
  return pts.map(([x, y]) => seg(0, 0, x, y));
}

interface RawDef {
  name: string;
  area: 'circle' | Vec2[] | null;
  segments?: Segment[];
  noDot?: boolean;
  noFill?: boolean;
}

const SQUARE = poly(-1, -1, 1, -1, 1, 1, -1, 1);
const DIAMOND = poly(1.3, 0, 0, 1.3, -1.3, 0, 0, -1.3);
const CROSS = poly(
  0.4, 1.2, 0.4, 0.4, 1.2, 0.4, 1.2, -0.4, 0.4, -0.4, 0.4, -1.2,
  -0.4, -1.2, -0.4, -0.4, -1.2, -0.4, -1.2, 0.4, -0.4, 0.4, -0.4, 1.2,
); // prettier-ignore
const RT = 2 / S3;
const TRI_UP = poly(-RT, -0.5, RT, -0.5, 0, 1);
const TRI_NE = poly(-1.2, 0.6, 0.6, 0.6, 0.6, -1.2);
const ARROW_UP = poly(0, 0, -1, -2, 1, -2);
const ARROW = poly(0, 0, -1, -2, 0, -1.4, 1, -2);
const ARROW_WIDE = poly(0, 0, -2, -2, 0, -1.4, 2, -2);
const Y_UP: Vec2[] = [
  [-1.2, -0.8],
  [1.2, -0.8],
  [0, 1.6],
];
const D = 1 / SQ2;

const RAW: RawDef[] = [
  { name: 'circle', area: 'circle' },
  { name: 'square', area: SQUARE },
  { name: 'diamond', area: DIAMOND },
  { name: 'cross', area: CROSS },
  { name: 'x', area: rotate(CROSS, 45) },
  { name: 'triangle-up', area: TRI_UP },
  { name: 'triangle-down', area: flipY(TRI_UP) },
  { name: 'triangle-left', area: flipX(swapXY(TRI_UP)) },
  { name: 'triangle-right', area: swapXY(TRI_UP) },
  { name: 'triangle-ne', area: TRI_NE },
  { name: 'triangle-se', area: flipY(TRI_NE) },
  { name: 'triangle-sw', area: flipX(flipY(TRI_NE)) },
  { name: 'triangle-nw', area: flipX(TRI_NE) },
  { name: 'pentagon', area: regular(5, 1, 90) },
  { name: 'hexagon', area: regular(6, 1, 90) },
  { name: 'hexagon2', area: regular(6, 1, 0) },
  { name: 'octagon', area: regular(8, 1, 22.5) },
  { name: 'star', area: star(5, 1.4, 1.4 * 0.382) },
  { name: 'hexagram', area: star(6, 1.32, 0.76, 90) },
  {
    name: 'star-triangle-up',
    area: concaveArcPolygon(poly(-0.8 * S3, -0.8, 0.8 * S3, -0.8, 0, 1.6), 4),
  },
  {
    name: 'star-triangle-down',
    area: concaveArcPolygon(poly(0.8 * S3, 0.8, -0.8 * S3, 0.8, 0, -1.6), 4),
  },
  {
    name: 'star-square',
    area: concaveArcPolygon(poly(-1.1, -1.1, 1.1, -1.1, 1.1, 1.1, -1.1, 1.1), 2),
  },
  { name: 'star-diamond', area: concaveArcPolygon(poly(1.4, 0, 0, 1.4, -1.4, 0, 0, -1.4), 1.9) },
  { name: 'diamond-tall', area: poly(0.7, 0, 0, 1.4, -0.7, 0, 0, -1.4) },
  { name: 'diamond-wide', area: poly(1.4, 0, 0, 0.7, -1.4, 0, 0, -0.7) },
  { name: 'hourglass', area: poly(1, 1, -1, 1, 1, -1, -1, -1) },
  { name: 'bowtie', area: poly(1, 1, 1, -1, -1, 1, -1, -1) },
  { name: 'circle-cross', area: 'circle', segments: [seg(0, 1, 0, -1), seg(1, 0, -1, 0)] },
  { name: 'circle-x', area: 'circle', segments: [seg(D, D, -D, -D), seg(D, -D, -D, D)] },
  { name: 'square-cross', area: SQUARE, segments: [seg(0, 1, 0, -1), seg(1, 0, -1, 0)] },
  { name: 'square-x', area: SQUARE, segments: [seg(1, 1, -1, -1), seg(1, -1, -1, 1)] },
  { name: 'diamond-cross', area: DIAMOND, segments: [seg(0, 1.3, 0, -1.3), seg(1.3, 0, -1.3, 0)] },
  {
    name: 'diamond-x',
    area: DIAMOND,
    segments: [seg(0.65, 0.65, -0.65, -0.65), seg(0.65, -0.65, -0.65, 0.65)],
  },
  {
    name: 'cross-thin',
    area: null,
    segments: [seg(0, 1.4, 0, -1.4), seg(1.4, 0, -1.4, 0)],
    noDot: true,
    noFill: true,
  },
  {
    name: 'x-thin',
    area: null,
    segments: [seg(1, 1, -1, -1), seg(1, -1, -1, 1)],
    noDot: true,
    noFill: true,
  },
  {
    name: 'asterisk',
    area: null,
    segments: [
      seg(0, 1.2, 0, -1.2),
      seg(1.2, 0, -1.2, 0),
      seg(0.85, 0.85, -0.85, -0.85),
      seg(0.85, -0.85, -0.85, 0.85),
    ],
    noDot: true,
    noFill: true,
  },
  {
    name: 'hash',
    area: null,
    segments: [
      seg(0.5, 1, 0.5, -1),
      seg(-0.5, -1, -0.5, 1),
      seg(1, 0.5, -1, 0.5),
      seg(-1, -0.5, 1, -0.5),
    ],
    noFill: true,
  },
  { name: 'y-up', area: null, segments: spokes(Y_UP), noDot: true, noFill: true },
  { name: 'y-down', area: null, segments: spokes(flipY(Y_UP)), noDot: true, noFill: true },
  { name: 'y-left', area: null, segments: spokes(flipX(swapXY(Y_UP))), noDot: true, noFill: true },
  { name: 'y-right', area: null, segments: spokes(swapXY(Y_UP)), noDot: true, noFill: true },
  { name: 'line-ew', area: null, segments: [seg(1.4, 0, -1.4, 0)], noDot: true, noFill: true },
  { name: 'line-ns', area: null, segments: [seg(0, 1.4, 0, -1.4)], noDot: true, noFill: true },
  { name: 'line-ne', area: null, segments: [seg(1, 1, -1, -1)], noDot: true, noFill: true },
  { name: 'line-nw', area: null, segments: [seg(-1, 1, 1, -1)], noDot: true, noFill: true },
  { name: 'arrow-up', area: ARROW_UP, noDot: true },
  { name: 'arrow-down', area: flipY(ARROW_UP), noDot: true },
  { name: 'arrow-left', area: flipX(swapXY(ARROW_UP)), noDot: true },
  { name: 'arrow-right', area: swapXY(ARROW_UP), noDot: true },
  { name: 'arrow-bar-up', area: ARROW_UP, segments: [seg(-1, 0, 1, 0)], noDot: true },
  { name: 'arrow-bar-down', area: flipY(ARROW_UP), segments: [seg(-1, 0, 1, 0)], noDot: true },
  {
    name: 'arrow-bar-left',
    area: flipX(swapXY(ARROW_UP)),
    segments: [seg(0, -1, 0, 1)],
    noDot: true,
  },
  { name: 'arrow-bar-right', area: swapXY(ARROW_UP), segments: [seg(0, -1, 0, 1)], noDot: true },
  { name: 'arrow', area: ARROW, noDot: true },
  { name: 'arrow-wide', area: ARROW_WIDE, noDot: true },
];

function extentOf(def: RawDef): number {
  let e = def.area === 'circle' ? 1 : 0;
  if (Array.isArray(def.area))
    for (const [x, y] of def.area) e = Math.max(e, Math.abs(x), Math.abs(y));
  for (const [x0, y0, x1, y1] of def.segments ?? []) {
    e = Math.max(e, Math.abs(x0), Math.abs(y0), Math.abs(x1), Math.abs(y1));
  }
  return e;
}

/** All base symbols, indexed by base code. */
export const MARKER_SYMBOLS: readonly SymbolDef[] = RAW.map((def, code) => ({
  name: def.name,
  code,
  area: def.area,
  segments: def.segments ?? [],
  noDot: def.noDot ?? false,
  noFill: def.noFill ?? false,
  extent: extentOf(def),
}));

/** Number of base symbols (55). */
export const SYMBOL_COUNT = MARKER_SYMBOLS.length;

/** Variant suffixes by variant index (code / 100). */
export const SYMBOL_VARIANTS = ['', '-open', '-dot', '-open-dot'] as const;

const BY_NAME = new Map<string, number>();
for (const def of MARKER_SYMBOLS) {
  SYMBOL_VARIANTS.forEach((suffix, v) => BY_NAME.set(def.name + suffix, def.code + 100 * v));
}

/**
 * Resolve a Plotly symbol (name like `'diamond-open-dot'`, numeric code, or numeric string) to its
 * numeric code. Unknown symbols resolve to 0 (`circle`), like Plotly's fallback.
 */
export function resolveSymbol(symbol: number | string): number {
  if (typeof symbol === 'number') return normalizeCode(symbol);
  const byName = BY_NAME.get(symbol.trim().toLowerCase());
  if (byName !== undefined) return byName;
  const n = Number(symbol);
  return symbol.trim() !== '' && Number.isFinite(n) ? normalizeCode(n) : 0;
}

function normalizeCode(code: number): number {
  if (!Number.isInteger(code) || code < 0) return 0;
  const base = code % 100;
  const variant = Math.floor(code / 100);
  return base < SYMBOL_COUNT && variant <= 3 ? code : 0;
}

/** Name for a numeric code (inverse of {@link resolveSymbol}). */
export function symbolName(code: number): string {
  const c = normalizeCode(code);
  return MARKER_SYMBOLS[c % 100]!.name + SYMBOL_VARIANTS[Math.floor(c / 100)]!;
}

// ---- GPU table ------------------------------------------------------------------------------

/** Width of the symbol data texture. */
export const SYMBOL_TEXTURE_WIDTH = 256;
/** Area kinds stored in the meta row. */
export const AREA_NONE = 0;
export const AREA_CIRCLE = 1;
export const AREA_POLYGON = 2;

/** Where a symbol's geometry lives in the symbol texture, plus its shape flags (texture rows 0–1). */
export interface SymbolLayoutEntry {
  polyStart: number;
  polyCount: number;
  segStart: number;
  segCount: number;
  /** `AREA_NONE`, `AREA_CIRCLE`, or `AREA_POLYGON`. */
  areaKind: number;
  extent: number;
  noDot: boolean;
  noFill: boolean;
}

/**
 * Lay out every symbol's polygon vertices and segments in one region (vec4 texels) and record where
 * each symbol's data starts. Shared by the texture builder and shader specialization, so a
 * specialized shader indexes the same texels as the generic one.
 */
export function symbolLayout(symbols: readonly SymbolDef[] = MARKER_SYMBOLS): {
  entries: SymbolLayoutEntry[];
  region: number[];
} {
  const region: number[] = [];
  const entries: SymbolLayoutEntry[] = [];
  for (const def of symbols) {
    let polyStart = 0;
    let polyCount = 0;
    if (Array.isArray(def.area)) {
      polyStart = region.length / 4;
      polyCount = def.area.length;
      for (const [x, y] of def.area) region.push(x, y, 0, 0);
    }
    const segStart = region.length / 4;
    for (const s of def.segments) region.push(s[0], s[1], s[2], s[3]);
    entries.push({
      polyStart,
      polyCount,
      segStart,
      segCount: def.segments.length,
      areaKind: def.area === 'circle' ? AREA_CIRCLE : def.area ? AREA_POLYGON : AREA_NONE,
      extent: def.extent,
      noDot: def.noDot,
      noFill: def.noFill,
    });
  }
  return { entries, region };
}
/**
 * Packed symbol table (RGBA32F, width {@link SYMBOL_TEXTURE_WIDTH}):
 * - row 0, texel `s`: `(polyStart, polyCount, segStart, segCount)` for base symbol `s`
 * - row 1, texel `s`: `(areaKind, extent, noDot, noFill)`
 * - rows 2+: a linear data region; polygon vertices use `.xy` of one texel each, segments use all
 *   four channels. `polyStart` / `segStart` are indices into this region
 *   (`texel = (i % 256, 2 + floor(i / 256))`).
 */
export interface SymbolTable {
  data: Float32Array;
  width: number;
  height: number;
}

export function buildSymbolTable(symbols: readonly SymbolDef[] = MARKER_SYMBOLS): SymbolTable {
  const W = SYMBOL_TEXTURE_WIDTH;
  if (symbols.length > W) throw new RangeError('Too many symbols for the symbol texture');
  const { entries, region } = symbolLayout(symbols);
  const regionRows = Math.max(1, Math.ceil(region.length / 4 / W));
  const height = 2 + regionRows;
  const data = new Float32Array(W * height * 4);
  entries.forEach((e, s) => {
    data.set([e.polyStart, e.polyCount, e.segStart, e.segCount], s * 4);
    data.set([e.areaKind, e.extent, +e.noDot, +e.noFill], (W + s) * 4);
  });
  data.set(region, 2 * W * 4);
  return { data, width: W, height };
}

/** Resource key of the shared symbol texture. */
export const SYMBOL_TEXTURE_KEY = 'markers:symbol-table';

/** Create the symbol data texture (acquire it through the resource manager with {@link SYMBOL_TEXTURE_KEY}). */
export function createSymbolTexture(): DataTexture {
  const table = buildSymbolTable();
  const texture = new DataTexture(table.data, table.width, table.height, RGBAFormat, FloatType);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = NoColorSpace;
  texture.flipY = false;
  texture.name = 'holochart:marker-symbols';
  texture.needsUpdate = true;
  return texture;
}
