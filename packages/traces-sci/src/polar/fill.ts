/**
 * Fills of `scatterpolar` (plan E11.4): `toself` closes each run of the line into a ring;
 * `tonext` fills the ring between the trace and the previous scatterpolar trace of its subplot.
 * Rings follow the line shape (splines included), drawn in geometric px, and are clipped to the
 * subplot's region like plotly.js clips traces to the subplot outline: the region's rings join
 * each polygon and the fill primitive's `intersect` rule keeps only their intersection.
 */
import type { FillGeometryInput, FillRule } from '@mk7s/holochart-render';
import { buildLinePath } from '@mk7s/holochart-traces-basic';
import type { FullTrace } from '@mk7s/holochart-core';
import { regionRings, signedArea } from './geometry.ts';
import type { PolarPositions } from './positions.ts';
import type { PolarSubplot } from './subplot.ts';

/** The drawn path of a trace's line (or fill outline) in geometric px, NaN-separated runs. */
export function linePath(
  trace: FullTrace,
  p: PolarPositions,
): { x: Float64Array; y: Float64Array } {
  const line = (trace['line'] ?? {}) as { shape?: unknown; smoothing?: unknown };
  return buildLinePath(p.x, p.y, {
    shape: line.shape === 'spline' ? 'spline' : 'linear',
    smoothing: typeof line.smoothing === 'number' ? line.smoothing : 1,
    connectgaps: trace['connectgaps'] === true,
    scaleX: 1,
    scaleY: 1,
    simplify: false,
  });
}

/** Runs of a NaN-separated path with at least 3 vertices, as `[start, end)` index pairs. */
function runs(x: ArrayLike<number>, y: ArrayLike<number>): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  const n = Math.min(x.length, y.length);
  for (let i = 0; i <= n; i++) {
    const ok = i < n && Number.isFinite(x[i] as number) && Number.isFinite(y[i] as number);
    if (ok && start < 0) start = i;
    if (!ok && start >= 0) {
      if (i - start >= 3) out.push([start, i]);
      start = -1;
    }
  }
  return out;
}

const REGION_CACHE = new WeakMap<
  PolarSubplot,
  { version: number; rings: ReturnType<typeof regionRings> }
>();

function regionOf(subplot: PolarSubplot): ReturnType<typeof regionRings> {
  const hit = REGION_CACHE.get(subplot);
  if (hit && hit.version === subplot.version) return hit.rings;
  const rings = regionRings(subplot.region);
  REGION_CACHE.set(subplot, { version: subplot.version, rings });
  return rings;
}

class Builder {
  readonly x: number[] = [];
  readonly y: number[] = [];
  readonly rings: number[] = [];
  readonly polygons: number[] = [];

  polygon(): void {
    this.polygons.push(this.rings.length);
  }

  /** Append the ring `[start, end)` of a path, oriented `ccw` (or kept as is when undefined). */
  ring(
    px: ArrayLike<number>,
    py: ArrayLike<number>,
    start: number,
    end: number,
    ccw?: boolean,
  ): void {
    this.rings.push(this.x.length);
    const flip = ccw !== undefined && signedArea(px, py, start, end) > 0 !== ccw;
    for (let k = 0; k < end - start; k++) {
      const i = flip ? end - 1 - k : start + k;
      this.x.push(px[i] as number);
      this.y.push(py[i] as number);
    }
  }

  region(r: ReturnType<typeof regionRings>): void {
    for (let k = 0; k < r.rings.length; k++) {
      this.ring(
        r.x,
        r.y,
        r.rings[k] as number,
        (r.rings[k + 1] as number | undefined) ?? r.x.length,
      );
    }
  }
}

/**
 * The fill geometry of a scatterpolar trace (geometric px), or `undefined` for none. `previous`
 * is the drawn path of the trace a `tonext` fill fills to. `clipToRegion: false` leaves the region
 * out (hover tests the pointer against the region separately).
 */
export function polarFillGeometry(
  trace: FullTrace,
  path: { x: Float64Array; y: Float64Array },
  subplot: PolarSubplot,
  previous?: { x: Float64Array; y: Float64Array },
  clipToRegion = true,
): FillGeometryInput | undefined {
  const fill = trace['fill'];
  if (fill !== 'toself' && fill !== 'tonext') return undefined;
  const own = runs(path.x, path.y);
  if (own.length === 0) return undefined;
  const prev = fill === 'tonext' && previous ? runs(previous.x, previous.y) : [];
  const tester = subplot.tester;
  let clip = clipToRegion && !tester.convex;
  const check = (p: { x: Float64Array; y: Float64Array }, list: [number, number][]): void => {
    for (const [a, b] of list) {
      for (let i = a; i < b && clipToRegion && !clip; i++) {
        if (!tester.inside(p.x[i]!, p.y[i]!)) clip = true;
      }
    }
  };
  check(path, own);
  if (previous) check(previous, prev);
  const region = clip ? regionOf(subplot) : undefined;
  const g = new Builder();
  let fillRule: FillRule;
  if (prev.length > 0) {
    g.polygon();
    for (const [a, b] of own) g.ring(path.x, path.y, a, b, clip ? true : undefined);
    for (const [a, b] of prev) g.ring(previous!.x, previous!.y, a, b, clip ? false : undefined);
    if (region) g.region(region);
    fillRule = clip ? 'intersect' : 'evenodd';
  } else {
    for (const [a, b] of own) {
      g.polygon();
      g.ring(path.x, path.y, a, b, clip ? true : undefined);
      if (region) g.region(region);
    }
    fillRule = clip ? 'intersect' : 'nonzero';
  }
  return {
    x: Float64Array.from(g.x),
    y: Float64Array.from(g.y),
    rings: g.rings,
    polygons: g.polygons,
    fillRule,
  };
}

/** Whether `(x, y)` (geometric px) is inside a fill geometry (nonzero, or even-odd for `tonext`). */
export function fillContains(g: FillGeometryInput, x: number, y: number): boolean {
  const rings = g.rings ?? [0];
  const n = Math.min(g.x.length, g.y.length);
  let winding = 0;
  let crossings = 0;
  for (let r = 0; r < rings.length; r++) {
    const start = rings[r] as number;
    const end = (rings[r + 1] as number | undefined) ?? n;
    for (let i = start, j = end - 1; i < end; j = i++) {
      const yi = g.y[i] as number;
      const yj = g.y[j] as number;
      const xi = g.x[i] as number;
      const xj = g.x[j] as number;
      if (yi > y !== yj > y) {
        const xc = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (x < xc) {
          crossings++;
          winding += yi > yj ? 1 : -1;
        }
      }
    }
  }
  return g.fillRule === 'evenodd' ? crossings % 2 === 1 : winding !== 0;
}
