/**
 * `sunburst` calc and geometry (plan E13.2), ported from plotly.js' `traces/sunburst/plot.js`: the
 * entry's subtree is partitioned into rings — the entry a disc in the middle, each level a ring of
 * equal width out to the domain's inscribed circle — sectors spanning angles proportional to their
 * values, the first one starting at 3 o'clock and going counterclockwise (turned by `rotation`).
 * `maxdepth` limits the rings drawn; a generated root of several roots is not drawn.
 *
 * ## Angles
 *
 * Sectors keep Plotly's partition angles (`x0`, `x1`): radians counterclockwise from 3 o'clock,
 * which is also the arc primitive's convention in the y-up overlay. Text fitting and hover use
 * pie's convention (radians clockwise from 12 o'clock: `a = π/2 − x`), so a point at angle `a` and
 * radius `r` is at container px `(cx + r·sin a, cy − r·cos a)`.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { CalcContext } from '@mk7s/holochart-runtime';
import type { HierNode } from '../hierarchy/build.ts';
import { calcHierarchy, type HierarchyCalc, type HierarchyCalcOptions } from '../hierarchy/calc.ts';
import { findEntry, levelWindow, partition, type LevelWindow } from '../hierarchy/levels.ts';

const TAU = Math.PI * 2;

/**
 * Placement of a sunburst in container px (top-left origin), set by `crossTraceLayout`.
 * @experimental
 */
export interface SunburstLayout {
  /** Center and outer radius (half the smaller side of the domain). */
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  /** Figure size (the overlay viewport). */
  readonly width: number;
  readonly height: number;
}

/** Calcdata of a sunburst trace. @experimental */
export interface SunburstCalc extends HierarchyCalc {
  /** Set by `crossTraceLayout` (`undefined` before the first layout). */
  layout: SunburstLayout | undefined;
}

/** Sunburst calc: the hierarchy (see `../hierarchy/calc.ts`); placement comes with the layout. */
export function calcSunburst(
  trace: FullTrace,
  ctx: Pick<CalcContext, 'fullLayout'>,
  options?: HierarchyCalcOptions,
): SunburstCalc {
  return { ...calcHierarchy(trace, ctx, options), layout: undefined };
}

/** One drawn sector (a disc for the entry). @internal */
export interface Sector {
  readonly node: HierNode;
  /** Levels below the entry. */
  readonly depth: number;
  /** Partition angles, radians counterclockwise from 3 o'clock, `rotation` included. */
  readonly x0: number;
  readonly x1: number;
  /** Inner and outer radius, px. */
  readonly r0: number;
  readonly r1: number;
  /** Pie-convention angles of the edges and the bisector (see the module comment). */
  readonly startAngle: number;
  readonly stopAngle: number;
  readonly midAngle: number;
  /** Half the angular span, capped at π/2 (pie's `halfangle`). */
  readonly halfAngle: number;
  /** `1 − r0 / r1` (Plotly's `ring`). */
  readonly ring: number;
  /** Radius fraction of the largest circle inscribed in the sector (Plotly's `rInscribed`). */
  readonly rInscribed: number;
}

/**
 * The derived fields of a sector (Plotly's `pt.midangle`, `halfangle`, `ring`, `rInscribed`).
 * Unlike Plotly, sectors wider than a half turn keep a half angle of π/2 (as pie slices do), so
 * their labels fit like pie labels do.
 */
export function sector(
  node: HierNode,
  depth: number,
  x0: number,
  x1: number,
  r0: number,
  r1: number,
): Sector {
  const span = Math.abs(x1 - x0);
  const halfAngle = Math.min(span, Math.PI) / 2;
  const ring = r1 > 0 ? 1 - r0 / r1 : 0;
  const full = span >= TAU - 1e-9;
  const rInscribed =
    r0 === 0 && full ? 1 : Math.max(0, Math.min(1 / (1 + 1 / Math.sin(halfAngle)), ring / 2)) || 0;
  return {
    node,
    depth,
    x0,
    x1,
    r0,
    r1,
    startAngle: Math.PI / 2 - x0,
    stopAngle: Math.PI / 2 - x1,
    midAngle: Math.PI / 2 - (x0 + x1) / 2,
    halfAngle,
    ring,
    rInscribed,
  };
}

/** What a sunburst draws for its current `level`. @internal */
export interface SunburstGeometry {
  /** The current root (Plotly's entry). */
  readonly entry: HierNode;
  readonly window: LevelWindow;
  /** Drawn sectors, breadth first (parents before children). */
  readonly sectors: readonly Sector[];
  /** `rotation` in radians (counterclockwise). */
  readonly baseX: number;
}

/** Plotly's `getRotationAngle`: degrees → radians, counterclockwise. */
export function rotationOf(trace: FullTrace): number {
  const rotation = trace['rotation'];
  return typeof rotation === 'number' && Number.isFinite(rotation) ? (rotation * Math.PI) / 180 : 0;
}

/**
 * The sectors of `trace` at its `level` for outer radius `r` (Plotly's `partition` + `y2rpx`),
 * `undefined` without a hierarchy.
 */
export function layoutSectors(
  calc: HierarchyCalc,
  trace: FullTrace,
  r: number,
): SunburstGeometry | undefined {
  const hierarchy = calc.hierarchy;
  if (!hierarchy) return undefined;
  const entry = findEntry(hierarchy, trace['level']);
  const window = levelWindow(hierarchy, entry, trace['maxdepth']);
  const baseX = rotationOf(trace);
  const toR = (y: number): number =>
    window.levels > 0 ? ((y - window.offset) / window.levels) * r : 0;
  const sectors: Sector[] = [];
  for (const cell of partition(entry, TAU, entry.height + 1)) {
    if (cell.depth < window.offset || cell.depth >= window.cutoff) continue;
    sectors.push(
      sector(cell.node, cell.depth, cell.x0 + baseX, cell.x1 + baseX, toR(cell.y0), toR(cell.y1)),
    );
  }
  return { entry, window, sectors, baseX };
}

const cache = new WeakMap<SunburstCalc, { key: string; geometry: SunburstGeometry | undefined }>();

/**
 * The laid-out sectors of a sunburst (see {@link layoutSectors}), cached per calc for the inputs
 * that change them (`level`, `maxdepth`, `rotation`, the radius).
 */
export function sunburstGeometry(
  calc: SunburstCalc,
  trace: FullTrace,
): SunburstGeometry | undefined {
  const r = calc.layout?.r ?? 0;
  const key = `${String(trace['level'])}\u0000${String(trace['maxdepth'])}\u0000${String(trace['rotation'])}\u0000${r}`;
  const hit = cache.get(calc);
  if (hit && hit.key === key) return hit.geometry;
  const geometry = layoutSectors(calc, trace, r);
  cache.set(calc, { key, geometry });
  return geometry;
}

/** Whether container point `(x, y)` lies on sector `s` of a sunburst centered at `(cx, cy)`. */
export function sectorContains(s: Sector, cx: number, cy: number, x: number, y: number): boolean {
  const dx = x - cx;
  const dy = cy - y;
  const rr = Math.hypot(dx, dy);
  if (rr > s.r1 || rr < s.r0 || !(s.r1 > s.r0)) return false;
  const span = s.x1 - s.x0;
  if (span >= TAU - 1e-9) return true;
  if (!(span > 0)) return false;
  const rel = (((Math.atan2(dy, dx) - s.x0) % TAU) + TAU) % TAU;
  return rel <= span;
}

/** The sector under a container point, or `undefined`. */
export function sectorAt(
  geometry: SunburstGeometry,
  layout: Pick<SunburstLayout, 'cx' | 'cy'>,
  x: number,
  y: number,
): Sector | undefined {
  // Outer rings come later; with edges shared, the first hit is the one drawn below.
  for (let k = geometry.sectors.length - 1; k >= 0; k--) {
    const s = geometry.sectors[k]!;
    if (sectorContains(s, layout.cx, layout.cy, x, y)) return s;
  }
  return undefined;
}

/**
 * Container px of a sector's hover anchor (Plotly: along the bisector at the outer radius, pulled
 * in by `rInscribed`).
 */
export function hoverAnchor(
  s: Sector,
  layout: Pick<SunburstLayout, 'cx' | 'cy'>,
): [number, number] {
  const rr = s.r1 * (1 - s.rInscribed);
  return [layout.cx + rr * Math.sin(s.midAngle), layout.cy - rr * Math.cos(s.midAngle)];
}
