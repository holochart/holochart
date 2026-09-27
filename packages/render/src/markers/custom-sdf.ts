/**
 * Signed distance fields for custom marker symbols (plan E8.11), part of the lazily loaded
 * custom-marker code (`custom-markers.ts`). Pure functions, no DOM: rasterized coverage in,
 * distances out.
 *
 * The distance transform is Felzenszwalb & Huttenlocher's exact squared Euclidean distance
 * transform ("Distance Transforms of Sampled Functions", 2012), run twice — distances to the inside
 * and to the outside — with anti-aliased edge pixels seeded at their sub-pixel offset from the edge
 * (coverage 0.5 is on it), so the zero crossing lands between pixels rather than on pixel centers.
 */

const INF = 1e20;

/**
 * One dimension of the transform, in place: `grid[offset + i * stride]` for `i < n` holds `f(i)`
 * on entry and `min_q f(q) + (i − q)²` on exit. `f`, `v` and `z` are scratch arrays (length ≥ n,
 * n + 1).
 */
function edt1d(
  grid: Float64Array,
  offset: number,
  stride: number,
  n: number,
  f: Float64Array,
  v: Uint32Array,
  z: Float64Array,
): void {
  for (let i = 0; i < n; i++) f[i] = grid[offset + i * stride]!;
  // Lower envelope of the parabolas rooted at (q, f(q)).
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s: number;
    do {
      const r = v[k]!;
      s = (f[q]! - f[r]! + q * q - r * r) / (2 * (q - r));
    } while (s <= z[k]! && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const r = v[k]!;
    grid[offset + q * stride] = f[r]! + (q - r) * (q - r);
  }
}

/** Squared Euclidean distance transform of a `width × height` grid, in place. */
export function edt2d(grid: Float64Array, width: number, height: number): void {
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const v = new Uint32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < width; x++) edt1d(grid, x, width, height, f, v, z);
  for (let y = 0; y < height; y++) edt1d(grid, y * width, 1, width, f, v, z);
}

/**
 * Signed distance (in pixels; negative inside, positive outside) from each pixel center to the
 * edge of a shape given as coverage (0 = outside, 1 = inside, fractions on anti-aliased edges),
 * row-major `width × height`.
 */
export function coverageToSdf(
  coverage: ArrayLike<number>,
  width: number,
  height: number,
): Float32Array {
  const size = width * height;
  const outer = new Float64Array(size);
  const inner = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const a = coverage[i]!;
    if (a >= 1) {
      outer[i] = 0;
      inner[i] = INF;
    } else if (a <= 0) {
      outer[i] = INF;
      inner[i] = 0;
    } else {
      // An edge pixel: the edge is about (0.5 − a) px from its center (outside when a < 0.5).
      const d = 0.5 - a;
      outer[i] = d > 0 ? d * d : 0;
      inner[i] = d < 0 ? d * d : 0;
    }
  }
  edt2d(outer, width, height);
  edt2d(inner, width, height);
  const out = new Float32Array(size);
  for (let i = 0; i < size; i++) out[i] = Math.sqrt(outer[i]!) - Math.sqrt(inner[i]!);
  return out;
}

/** How far (in marker radius units) the stored distances reach on each side of the edge. */
export const SDF_SPREAD = 0.75;
/** Pixels per side of one symbol's SDF cell in the atlas. */
export const SDF_CELL = 128;

/** Where a symbol's geometry sits in its SDF cell. */
export interface SymbolFrame {
  /** Largest |x|, |y| of the viewBox around the anchor, in marker radius units (1–2). */
  extent: number;
  /** Half the cell's side in radius units: `extent + SDF_SPREAD`. */
  cellHalf: number;
  /** Canvas transform from viewBox units to cell pixels: `px = (x − anchorX) · scale + CELL / 2`. */
  scale: number;
  anchorX: number;
  anchorY: number;
}

/** Parse `[minX, minY, width, height]` or an SVG viewBox string; `undefined` when invalid. */
export function parseViewBox(
  box: readonly [number, number, number, number] | string | undefined,
): [number, number, number, number] | undefined {
  const values =
    box === undefined
      ? [0, 0, 24, 24]
      : typeof box === 'string'
        ? box
            .trim()
            .split(/[\s,]+/)
            .map(Number)
        : [...box];
  if (values.length !== 4 || !values.every(Number.isFinite)) return undefined;
  return values[2]! > 0 && values[3]! > 0
    ? (values as [number, number, number, number])
    : undefined;
}

/**
 * Frame of a symbol: its viewBox's larger side spans the marker diameter (2 radius units), and the
 * anchor (clamped into the viewBox; default its center) is the cell center.
 */
export function symbolFrame(
  viewBox: readonly [number, number, number, number],
  anchor?: readonly [number, number],
): SymbolFrame {
  const [x, y, w, h] = viewBox;
  const clamp = (v: number | undefined, lo: number, span: number): number =>
    v !== undefined && Number.isFinite(v) ? Math.min(Math.max(v, lo), lo + span) : lo + span / 2;
  const anchorX = clamp(anchor?.[0], x, w);
  const anchorY = clamp(anchor?.[1], y, h);
  const unit = 2 / Math.max(w, h);
  const extent = unit * Math.max(anchorX - x, x + w - anchorX, anchorY - y, y + h - anchorY);
  const cellHalf = extent + SDF_SPREAD;
  return { extent, cellHalf, scale: (unit * SDF_CELL) / (2 * cellHalf), anchorX, anchorY };
}

/**
 * Encode distances (cell pixels, positive outside) as bytes: 0.5 is the edge, 0 and 1 are
 * {@link SDF_SPREAD} radius units inside / outside. `pxPerRadius` is `SDF_CELL / (2 · cellHalf)`.
 */
export function encodeSdf(distances: ArrayLike<number>, pxPerRadius: number): Uint8Array {
  const out = new Uint8Array(distances.length);
  const k = 255 / (2 * SDF_SPREAD * pxPerRadius);
  for (let i = 0; i < distances.length; i++) {
    const v = Math.round(127.5 + distances[i]! * k);
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

/** Decode one byte of {@link encodeSdf} to radius units (what the fragment shader does). */
export function decodeSdf(byte: number): number {
  return (byte / 255 - 0.5) * 2 * SDF_SPREAD;
}

/** Cell `slot` of an atlas `columns` cells wide: its top-left pixel. */
export function atlasCell(slot: number, columns: number, cell: number): [number, number] {
  return [(slot % columns) * cell, Math.floor(slot / columns) * cell];
}

/** Rows (of cells) an atlas needs for `slots` cells, rounded up to a power of two. */
export function atlasRows(slots: number, columns: number): number {
  const rows = Math.max(1, Math.ceil(slots / columns));
  return 2 ** Math.ceil(Math.log2(rows));
}
