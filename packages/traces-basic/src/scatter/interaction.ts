/**
 * Scatter interaction parts (plan E6.1, E6.3, E5.2; ADR-010): CPU hover hit-testing and box/lasso
 * selection over a lazily built spatial index, and the legend glyph.
 *
 * The {@link PointIndex} is built once per calc in *linear* coordinates, so zoom and pan never
 * rebuild it. Hover distances are px, which differ per axis from linear units, so a query searches
 * the linear rectangle covering the px search radius and ranks the candidates by their exact px
 * distance (Plotly's marker-radius-aware distance functions).
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import { PointIndex } from '@mk7s/holochart-render';
import type {
  HoverContext,
  HoverPoint,
  HoverQuery,
  LegendGlyph,
  SelectionQuery,
} from '@mk7s/holochart-runtime';
import type { ScatterCalc } from './calc.ts';
import { hasLines, hasMarkers, hasText, isBubble } from './defaults.ts';
import { dataValue } from './plot.ts';
import { markerOf, pointColor } from './style.ts';

/** Plotly's minimum hover radius (px): small markers still catch the pointer this far out. */
const MIN_RADIUS = 3;

interface Spatial {
  readonly index: PointIndex;
  /** Largest drawn marker radius (px), to widen candidate searches. */
  readonly maxRadius: number;
  /** Whether x (resp. y) is sorted ascending over the finite points, for binary search. */
  readonly xSorted: boolean;
  readonly ySorted: boolean;
  /** Bounding box of the finite points (linear). */
  readonly bounds: readonly [number, number, number, number];
}

const SPATIAL = new WeakMap<ScatterCalc, Spatial>();

function isSorted(values: Float64Array): boolean {
  let prev = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (Number.isNaN(v)) continue;
    if (v < prev) return false;
    prev = v;
  }
  return true;
}

/** The calc's spatial index and summaries, built on first use (ADR-010). */
function spatial(calc: ScatterCalc): Spatial {
  let s = SPATIAL.get(calc);
  if (s) return s;
  let maxRadius = 0;
  const sizes = calc.markerSize;
  if (typeof sizes === 'number') maxRadius = sizes / 2;
  else for (let i = 0; i < sizes.length; i++) maxRadius = Math.max(maxRadius, sizes[i]! / 2);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < calc.length; i++) {
    const x = calc.x[i]!;
    const y = calc.y[i]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  s = {
    index: new PointIndex(calc.x, calc.y),
    maxRadius,
    xSorted: isSorted(calc.x),
    ySorted: isSorted(calc.y),
    bounds: [x0, y0, x1, y1],
  };
  SPATIAL.set(calc, s);
  return s;
}

function radiusAt(calc: ScatterCalc, i: number): number {
  const s = calc.markerSize;
  return (typeof s === 'number' ? s : (s[i] ?? 0)) / 2;
}

/** Plotly's `dxy` for `closest`: distance to the marker edge, ranking points under the pointer. */
function closestDistance(dpx: number, r: number): number {
  const rad = Math.max(MIN_RADIUS, r);
  return Math.max(dpx - rad, 1 - MIN_RADIUS / rad);
}

/** Plotly's `dx`/`dy` for `x`/`y` hovermodes: a kink inside the marker keeps ranks stable. */
function axisDistance(dRaw: number, r: number): number {
  const rad = Math.max(MIN_RADIUS, r);
  const kink = 1 - 1 / rad;
  return dRaw < rad ? (kink * dRaw) / rad : dRaw - rad + kink;
}

interface Hit {
  i: number;
  d: number;
  /** Secondary key (px distance off the hover axis) for ties in `x`/`y` modes. */
  d2: number;
}

function consider(best: Hit | undefined, i: number, d: number, d2: number): Hit | undefined {
  if (!best || d < best.d || (d === best.d && d2 < best.d2)) return { i, d, d2 };
  return best;
}

/** Candidates of a linear rectangle around the pointer spanning `rx`/`ry` px. */
function rectCandidates(
  s: Spatial,
  q: HoverQuery,
  sx: number,
  sy: number,
  rx: number,
  ry: number,
): number[] {
  const dx = rx / sx;
  const dy = ry / sy;
  return s.index.withinRect(q.xl - dx, q.yl - dy, q.xl + dx, q.yl + dy);
}

function hoverClosest(calc: ScatterCalc, q: HoverQuery, sx: number, sy: number): Hit | undefined {
  const s = spatial(calc);
  const [bx0, by0, bx1, by1] = s.bounds;
  if (!(bx0 <= bx1)) return undefined;
  const evaluate = (candidates: readonly number[]): Hit | undefined => {
    let best: Hit | undefined;
    for (const i of candidates) {
      const dpx = Math.hypot((calc.x[i]! - q.xl) * sx, (calc.y[i]! - q.yl) * sy);
      best = consider(best, i, closestDistance(dpx, radiusAt(calc, i)), dpx);
    }
    return best && best.d <= q.distance ? best : undefined;
  };
  if (Number.isFinite(q.distance)) {
    const r = q.distance + Math.max(s.maxRadius, MIN_RADIUS) + 1;
    return evaluate(rectCandidates(s, q, sx, sy, r, r));
  }
  // No distance limit: grow the search until the best hit is provably the nearest overall
  // (every point outside the searched square is farther than `r` px minus its radius).
  const farthest = Math.hypot(
    Math.max(Math.abs(bx0 - q.xl), Math.abs(bx1 - q.xl)) * sx,
    Math.max(Math.abs(by0 - q.yl), Math.abs(by1 - q.yl)) * sy,
  );
  for (let r = 16; ; r *= 2) {
    const pad = Math.max(s.maxRadius, MIN_RADIUS) + 1;
    const best = evaluate(rectCandidates(s, q, sx, sy, r + pad, r + pad));
    if ((best && best.d <= r - pad) || r >= farthest) return best;
  }
}

/** Nearest point along one axis (`x` or `y` hovermode). */
function hoverAxis(
  calc: ScatterCalc,
  q: HoverQuery,
  letter: 'x' | 'y',
  sx: number,
  sy: number,
): Hit | undefined {
  const s = spatial(calc);
  const along = letter === 'x' ? calc.x : calc.y;
  const across = letter === 'x' ? calc.y : calc.x;
  const scale = letter === 'x' ? sx : sy;
  const crossScale = letter === 'x' ? sy : sx;
  const target = letter === 'x' ? q.xl : q.yl;
  const crossTarget = letter === 'x' ? q.yl : q.xl;
  let best: Hit | undefined;
  const visit = (i: number): void => {
    const a = along[i]!;
    const c = across[i]!;
    if (!Number.isFinite(a) || !Number.isFinite(c)) return;
    const d = axisDistance(Math.abs(a - target) * scale, radiusAt(calc, i));
    best = consider(best, i, d, Math.abs(c - crossTarget) * crossScale);
  };
  const reach = (Number.isFinite(q.distance) ? q.distance : Infinity) + s.maxRadius + 1;
  const sorted = letter === 'x' ? s.xSorted : s.ySorted;
  if (sorted) {
    // Binary search the first point at or after the pointer, then walk out both ways while
    // points can still beat the best (distance grows monotonically along a sorted axis).
    let lo = 0;
    let hi = calc.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const v = along[mid]!;
      // NaNs sort nowhere: treat them as "before" so the search keeps moving right.
      if (Number.isNaN(v) || v < target) lo = mid + 1;
      else hi = mid;
    }
    const limit = (i: number): boolean => {
      const a = along[i]!;
      if (Number.isNaN(a)) return true;
      const raw = Math.abs(a - target) * scale;
      return raw - s.maxRadius <= Math.min(reach, (best?.d ?? Infinity) + 1);
    };
    for (let i = lo; i < calc.length && limit(i); i++) visit(i);
    for (let i = lo - 1; i >= 0 && limit(i); i--) visit(i);
  } else if (Number.isFinite(reach)) {
    const r = reach / scale;
    const hits =
      letter === 'x'
        ? s.index.withinRect(target - r, -Infinity, target + r, Infinity)
        : s.index.withinRect(-Infinity, target - r, Infinity, target + r);
    for (const i of hits) visit(i);
  } else {
    for (let i = 0; i < calc.length; i++) visit(i);
  }
  return best && best.d <= q.distance ? best : undefined;
}

function stringAt(v: unknown, i: number): string | undefined {
  const s = typeof v === 'string' ? v : isArrayLike(v) ? (v as ArrayLike<unknown>)[i] : undefined;
  return typeof s === 'string' && s !== '' ? s : typeof s === 'number' ? String(s) : undefined;
}

function valueAt(v: unknown, i: number): unknown {
  return isArrayLike(v) && typeof v !== 'string' ? (v as ArrayLike<unknown>)[i] : v;
}

/**
 * Hover hit-test (plan E6.1): the point nearest the pointer — by px distance to the marker edge
 * (`closest`) or along the hover axis (`x`, `y`) — within `query.distance`. Returns at most one
 * point: unified labels are assembled by the runtime across traces.
 */
export function scatterHoverPoints(
  calc: ScatterCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  if (calc.length === 0) return [];
  const mode = trace['mode'];
  if (!hasMarkers(mode) && !hasLines(mode) && !hasText(mode)) return [];
  const t = ctx.transform;
  const sx = Math.abs(t.scaleX) || 1;
  const sy = Math.abs(t.scaleY) || 1;
  const hit =
    query.mode === 'closest'
      ? hoverClosest(calc, query, sx, sy)
      : hoverAxis(calc, query, query.mode, sx, sy);
  if (!hit) return [];
  const i = hit.i;
  const marker = trace['marker'] as Record<string, unknown> | undefined;
  const fields: Record<string, unknown> = {};
  if (marker) {
    fields['marker.size'] = valueAt(marker['size'], i);
    fields['marker.color'] = valueAt(marker['color'], i);
    fields['marker.symbol'] = valueAt(marker['symbol'], i);
  }
  if (trace['customdata'] !== undefined) fields['customdata'] = valueAt(trace['customdata'], i);
  if (trace['ids'] !== undefined) fields['id'] = valueAt(trace['ids'], i);
  const text = stringAt(trace['hovertext'], i) ?? stringAt(trace['text'], i);
  const color = pointColor(trace, i, ctx.fullLayout);
  return [
    {
      pointIndex: i,
      distance: hit.d,
      px: calc.x[i]! * t.scaleX + t.offsetX,
      py: calc.y[i]! * t.scaleY + t.offsetY,
      x: dataValue(trace, 'x', i),
      y: dataValue(trace, 'y', i),
      ...(text !== undefined ? { text } : {}),
      ...(color !== undefined ? { color } : {}),
      fields,
    },
  ];
}

/**
 * Box / lasso selection (plan E6.3) in linear coordinates. Like Plotly, only traces that draw
 * markers or text are selectable: a bare line has no points to pick.
 */
export function scatterSelectPoints(
  calc: ScatterCalc,
  trace: FullTrace,
  query: SelectionQuery,
): number[] {
  const mode = trace['mode'];
  if (calc.length === 0 || (!hasMarkers(mode) && !hasText(mode))) return [];
  const { index } = spatial(calc);
  if (query.kind === 'lasso' && query.polygon && query.polygon.length >= 3) {
    const flat = new Float64Array(query.polygon.length * 2);
    query.polygon.forEach(([x, y], k) => {
      flat[2 * k] = x;
      flat[2 * k + 1] = y;
    });
    return index.withinPolygon(flat);
  }
  return index.withinRect(query.x[0], query.y[0], query.x[1], query.y[1]);
}

function first(v: unknown): unknown {
  return isArrayLike(v) && typeof v !== 'string' ? (v as ArrayLike<unknown>)[0] : v;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function mean(v: unknown, fallback: number): number {
  if (typeof v === 'number') return v;
  if (!isArrayLike(v)) return fallback;
  const arr = v as ArrayLike<unknown>;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (typeof x === 'number' && Number.isFinite(x)) {
      sum += x;
      n++;
    }
  }
  return n > 0 ? sum / n : fallback;
}

/**
 * Legend glyph (plan E5.2), as Plotly's legend style: the first point's symbol and color, the mean
 * marker size clamped to 2–16 px (bubbles: 12), outline width ≤ 2 px, line width ≤ 10 px.
 * Text-only traces show a marker in the text color until the contract has a text glyph.
 */
export function scatterLegendIcon(trace: FullTrace): LegendGlyph {
  const mode = trace['mode'];
  const lines = hasLines(mode);
  const markers = hasMarkers(mode);
  const opacity = typeof trace['opacity'] === 'number' ? trace['opacity'] : 1;
  const line = trace['line'] as Record<string, unknown> | undefined;
  const lineGlyph = lines
    ? {
        color: typeof line?.['color'] === 'string' ? line['color'] : undefined,
        width: clamp(typeof line?.['width'] === 'number' ? line['width'] : 2, 0, 10),
        dash: typeof line?.['dash'] === 'string' ? line['dash'] : 'solid',
      }
    : undefined;
  let markerGlyph: LegendGlyph['marker'];
  if (markers) {
    const m = markerOf(trace);
    const symbol = first(m.symbol);
    const lineColor = first(m.line?.color);
    const mo = first(m.opacity);
    markerGlyph = {
      symbol: typeof symbol === 'string' || typeof symbol === 'number' ? symbol : 'circle',
      size: isBubble(trace) ? 12 : clamp(mean(m.size, 6), 2, 16),
      color: pointColor(trace, 0),
      lineColor: typeof lineColor === 'string' ? lineColor : undefined,
      lineWidth: clamp(Number(first(m.line?.width)) || 0, 0, 2),
      opacity: (typeof mo === 'number' ? mo : 1) * opacity,
    };
  } else if (!lines && hasText(mode)) {
    const font = trace['textfont'] as Record<string, unknown> | undefined;
    const color = first(font?.['color']);
    markerGlyph = {
      symbol: 'square',
      size: 8,
      color: typeof color === 'string' ? color : undefined,
      opacity,
    };
  }
  const kind: LegendGlyph['kind'] = lines && markers ? 'lines+markers' : lines ? 'line' : 'marker';
  return strip({ kind, marker: markerGlyph, line: lineGlyph });
}

/** Drop undefined fields (legend code treats a present key as "set"). */
function strip<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) continue;
    out[k] = v !== null && typeof v === 'object' && !Array.isArray(v) ? strip(v) : v;
  }
  return out as T;
}
