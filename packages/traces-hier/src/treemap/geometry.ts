/**
 * Calc and geometry of the rectangle hierarchy traces, `treemap` (plan E13.3) and `icicle`
 * (E13.4), ported from plotly.js' `traces/treemap/plot_one.js`, `draw_descendants.js` and
 * `draw_ancestors.js`:
 *
 * - **Tiles**: the entry's subtree laid out over the domain by the trace's partition (treemap
 *   tilings, `tiling.ts`; icicle levels, `../icicle/partition.ts`). Levels below `maxdepth` stay in
 *   the layout collapsed to their center (Plotly), so a later drill grows them from there. Branch
 *   tiles above the last level drawn are headers: their label sits in the header padding.
 * - **Path bar**: the entry's ancestors, root first, as equal segments of a bar `pathbar.thickness`
 *   px thick outside the domain (above it, or below with `side: 'bottom'`), `marker.line.width` + 1
 *   px away.
 *
 * Coordinates are px relative to the domain's top-left corner, y down (as Plotly's); the layout
 * places the domain in the container.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { CalcContext } from '@mk7s/holochart-runtime';
import type { HierNode } from '../hierarchy/build.ts';
import { calcHierarchy, type HierarchyCalc, type HierarchyCalcOptions } from '../hierarchy/calc.ts';
import { findEntry, isLeaf, levelWindow, type PartitionCell } from '../hierarchy/levels.ts';
import { treemapPartition, type TreemapPacking } from './tiling.ts';

/** Placement of a treemap or icicle in container px (top-left origin), set by `crossTraceLayout`. */
export interface RectLayout {
  /** The domain rect. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Figure height (the overlay viewport's). */
  readonly figureHeight: number;
}

/**
 * Lays the subtree at `entry` out over `width` × `height` px for `trace`; `cutoff` is the number of
 * levels drawn (Plotly's `_maxDepth`).
 */
export type CellLayout = (
  entry: HierNode,
  trace: FullTrace,
  width: number,
  height: number,
  cutoff: number,
) => PartitionCell[];

/** Calcdata of a treemap or icicle trace. */
export interface RectCalc extends HierarchyCalc {
  /** The trace type's partition. */
  readonly cells: CellLayout;
  /** Set by `crossTraceLayout` (`undefined` before the first layout). */
  layout: RectLayout | undefined;
}

/** One tile (an icicle cell), px from the domain's top-left corner. */
export interface Tile extends PartitionCell {
  /** Below `maxdepth`: collapsed to its center, not drawn. */
  readonly hidden: boolean;
  /** A branch above the last level drawn: its label is a header (Plotly's `isHeader`). */
  readonly header: boolean;
}

/** One path bar segment: an ancestor of the entry, px from the domain's top-left corner. */
export interface Segment {
  readonly node: HierNode;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

/** What a treemap or icicle draws for its current `level`. */
export interface RectGeometry {
  readonly entry: HierNode;
  /** Levels drawn from the entry (Plotly's `_maxDepth`), `Infinity` without `maxdepth`. */
  readonly cutoff: number;
  /** Levels actually drawn (Plotly's `_maxVisibleLayers`). */
  readonly layers: number;
  /** Tiles breadth first (parents before children), hidden ones included. */
  readonly tiles: readonly Tile[];
  /** Path bar segments, the entry's parent first (drawn first) and the root last. */
  readonly pathbar: readonly Segment[];
}

function flags(trace: FullTrace, key: string): string {
  const v = (trace['tiling'] as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'string' ? v : '';
}

/** A number attribute of a container (`0` when unset). */
export function numberIn(container: unknown, key: string): number {
  const v = (container as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** The treemap partition of a trace (Plotly's `partition` options from `tiling` and `marker.pad`). */
export const treemapCells: CellLayout = (entry, trace, width, height) => {
  const tiling = trace['tiling'] as Record<string, unknown> | undefined;
  const pad = (trace['marker'] as { pad?: unknown } | undefined)?.pad;
  const flip = flags(trace, 'flip');
  return treemapPartition(entry, width, height, {
    packing: (tiling?.['packing'] as TreemapPacking | undefined) ?? 'squarify',
    squarifyratio: numberIn(tiling, 'squarifyratio') || 1,
    flipX: flip.includes('x'),
    flipY: flip.includes('y'),
    pad: {
      inner: numberIn(tiling, 'pad'),
      top: numberIn(pad, 't'),
      left: numberIn(pad, 'l'),
      right: numberIn(pad, 'r'),
      bottom: numberIn(pad, 'b'),
    },
  });
};

/** Treemap and icicle calc: the hierarchy (see `../hierarchy/calc.ts`) and the type's partition. */
export function calcRects(
  trace: FullTrace,
  ctx: Pick<CalcContext, 'fullLayout'>,
  cells: CellLayout,
  options?: HierarchyCalcOptions,
): RectCalc {
  return { ...calcHierarchy(trace, ctx, options), cells, layout: undefined };
}

/** Path bar placement: its thickness and offset from the domain top (Plotly's `barDifY`), px. */
export function pathbarBand(
  trace: FullTrace,
  domainHeight: number,
): { readonly y0: number; readonly y1: number } | undefined {
  const pathbar = trace['pathbar'] as Record<string, unknown> | undefined;
  if (!pathbar?.['visible']) return undefined;
  const thickness = numberIn(pathbar, 'thickness');
  const line = (trace['marker'] as { line?: unknown } | undefined)?.line;
  const gap = numberIn(line, 'width') + 1;
  const y0 = pathbar['side'] === 'bottom' ? domainHeight + gap : -(thickness + gap);
  return { y0, y1: y0 + thickness };
}

/**
 * The tiles and path bar of `trace` at its `level` over a `width` × `height` px domain,
 * `undefined` without a hierarchy.
 */
export function layoutRects(
  calc: RectCalc,
  trace: FullTrace,
  width: number,
  height: number,
): RectGeometry | undefined {
  const hierarchy = calc.hierarchy;
  if (!hierarchy) return undefined;
  const entry = findEntry(hierarchy, trace['level']);
  const { cutoff } = levelWindow(hierarchy, entry, trace['maxdepth']);
  let layers = 0;
  const tiles = calc.cells(entry, trace, width, height, cutoff).map((c): Tile => {
    const hidden = c.depth >= cutoff;
    if (hidden) {
      c.x0 = c.x1 = (c.x0 + c.x1) / 2;
      c.y0 = c.y1 = (c.y0 + c.y1) / 2;
    } else layers = Math.max(layers, c.depth + 1);
    return { ...c, hidden, header: !(isLeaf(c.node) || c.depth === cutoff - 1) };
  });

  const pathbar: Segment[] = [];
  const band = pathbarBand(trace, height);
  if (band && entry.depth > 0) {
    const each = width / entry.depth;
    for (let n = entry.parent; n; n = n.parent) {
      pathbar.push({ node: n, x0: each * n.depth, x1: each * (n.depth + 1), ...band });
    }
  }
  return { entry, cutoff, layers, tiles, pathbar };
}

const cache = new WeakMap<
  RectCalc,
  { trace: FullTrace; layout: RectLayout | undefined; geometry: RectGeometry | undefined }
>();

/**
 * The laid-out tiles of a treemap or icicle (see {@link layoutRects}) in its domain, cached per
 * calc for the trace and layout it was computed with.
 */
export function rectGeometry(calc: RectCalc, trace: FullTrace): RectGeometry | undefined {
  const layout = calc.layout;
  const hit = cache.get(calc);
  if (hit && hit.trace === trace && hit.layout === layout) return hit.geometry;
  const geometry = layout ? layoutRects(calc, trace, layout.width, layout.height) : undefined;
  cache.set(calc, { trace, layout, geometry });
  return geometry;
}

/** Whether `(x, y)` (domain px) is on a rect of positive size. */
export function rectContains(
  r: Pick<PartitionCell, 'x0' | 'x1' | 'y0' | 'y1'>,
  x: number,
  y: number,
): boolean {
  return r.x1 > r.x0 && r.y1 > r.y0 && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

/** What is under a point: a tile, or a path bar segment (`onPathbar`). */
export interface RectHit {
  readonly node: HierNode;
  readonly rect: Tile | Segment;
  readonly onPathbar: boolean;
}

/** The tile or path bar segment under domain point `(x, y)`: the deepest tile drawn there. */
export function rectAt(geometry: RectGeometry, x: number, y: number): RectHit | undefined {
  for (const s of geometry.pathbar) {
    if (rectContains(s, x, y)) return { node: s.node, rect: s, onPathbar: true };
  }
  // Children come later and lie inside their parents: the last hit is the one drawn on top.
  const { tiles } = geometry;
  for (let k = tiles.length - 1; k >= 0; k--) {
    const t = tiles[k]!;
    if (rectContains(t, x, y)) return { node: t.node, rect: t, onPathbar: false };
  }
  return undefined;
}
