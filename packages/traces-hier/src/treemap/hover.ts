/**
 * Treemap and icicle hover and clicks (plan E13.3, E13.4, E6.1; ADR-010: CPU, 2D), following
 * plotly.js' sunburst `fx.js` for these types: the tile or path bar segment under the pointer
 * (domain traces are asked with the pointer in container px), with the hover label anchored at the
 * right end of the tile's header band (the segment's middle on the path bar). Path bar hover text
 * leaves out the entry percentage. A click drills into the tile (leaves included), up from the
 * entry, or up to a path bar segment's node.
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import type { ChartPoint, HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import {
  isValidTextValue,
  nodeAttr,
  nodeContext,
  nodeEventFields,
  nodeHoverText,
  nodeLabels,
  nodeValues,
  type NodeContext,
} from '../hierarchy/format.ts';
import { drillEntry } from '../hierarchy/levels.ts';
import { levelOf } from '../hierarchy/view.ts';
import { rectAt, rectGeometry, type RectCalc, type RectHit, type RectLayout } from './geometry.ts';
import { padsOf, textSpot } from './text.ts';
import { lazyA11y } from '../a11y-loader.ts';

/** Container px of a hit's hover anchor (Plotly's `_hoverX`, `_hoverY`). */
export function rectHoverAnchor(
  trace: FullTrace,
  hit: RectHit,
  layout: Pick<RectLayout, 'x' | 'y' | 'width'>,
): [number, number] {
  const r = hit.rect;
  if (hit.onPathbar) {
    const thickness = r.y1 - r.y0;
    return [
      layout.x + r.x1 - Math.min(layout.width, thickness) / 2,
      layout.y + r.y1 - thickness / 2,
    ];
  }
  const pads = padsOf(trace);
  const y = textSpot(trace['textposition']).bottom ? r.y1 - pads.b / 2 : r.y0 + pads.t / 2;
  return [layout.x + r.x1 - pads.r, layout.y + y];
}

/** The hover point of a hit (anchor in overlay px: bottom-left origin). */
export function rectHoverPoint(
  trace: FullTrace,
  hit: RectHit,
  ctx: NodeContext,
  layout: RectLayout,
): HoverPoint {
  const { node } = hit;
  const [ax, ay] = rectHoverAnchor(trace, hit, layout);
  const text = nodeAttr(trace['hovertext'], node.i) || nodeAttr(trace['text'], node.i);
  return {
    pointIndex: node.i,
    distance: 0,
    px: ax,
    py: layout.figureHeight - ay,
    ...(isValidTextValue(text) ? { text: String(text) } : {}),
    color: node.color,
    fields: { ...nodeValues(trace, node, ctx), ...nodeEventFields(trace, node, ctx) },
    labels: nodeLabels(node, ctx),
    hoverText: nodeHoverText(trace, node, ctx, { onPathbar: hit.onPathbar }),
  };
}

/** The tile or segment under container point `(x, y)`. */
function hitAt(calc: RectCalc, trace: FullTrace, x: number, y: number) {
  const layout = calc.layout;
  const geometry = calc.hierarchy && layout ? rectGeometry(calc, trace) : undefined;
  if (!geometry || !layout) return undefined;
  const hit = rectAt(geometry, x - layout.x, y - layout.y);
  // The generated root of several roots is only clickable on the path bar (to go up).
  return hit && (hit.onPathbar || hit.node.generated !== 'multiple')
    ? { hit, geometry, layout }
    : undefined;
}

/** The treemap and icicle `hoverPoints`: the tile or segment under `query.cx` / `query.cy`. */
export function rectHoverPoints(
  calc: RectCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const height = calc.layout?.figureHeight ?? query.py + (query.cy ?? 0);
  const found = hitAt(calc, trace, query.cx ?? query.px, query.cy ?? height - query.py);
  if (!found || !calc.hierarchy || found.hit.node.generated === 'multiple') return [];
  const nctx = nodeContext(calc.hierarchy, found.geometry.entry, ctx.fullLayout);
  return [rectHoverPoint(trace, found.hit, nctx, found.layout)];
}

/** What a click on a treemap or icicle means: its event point and where it drills. */
export interface RectClick {
  readonly hit: RectHit;
  readonly point: ChartPoint;
  /** Plotly's `nextLevel` (`''` for the whole hierarchy of several roots). */
  readonly nextLevel: string;
  /** Whether the click changes the entry. */
  readonly drills: boolean;
}

/**
 * The tile or segment at container point `(x, y)` and what clicking it means (Plotly's `onClick`:
 * into a tile, up from the entry, to a path bar segment's node), or `undefined` off them.
 */
export function rectClick(
  calc: RectCalc,
  trace: FullTrace,
  input: unknown,
  index: number,
  fullLayout: FullLayout | undefined,
  x: number,
  y: number,
): RectClick | undefined {
  const found = hitAt(calc, trace, x, y);
  const hierarchy = calc.hierarchy;
  if (!found || !hierarchy) return undefined;
  const { hit, geometry, layout } = found;
  const entry = geometry.entry;
  const ctx = nodeContext(hierarchy, entry, fullLayout);
  const p = rectHoverPoint(trace, hit, ctx, layout);
  const out: Record<string, unknown> = { ...p.fields };
  out['data'] = input;
  out['fullData'] = trace;
  out['curveNumber'] = index;
  const i = hit.node.i;
  if (i >= 0) {
    out['pointNumber'] = i;
    out['pointIndex'] = i;
  }
  const customdata = nodeAttr(trace['customdata'], i);
  if (customdata !== undefined) out['customdata'] = customdata;
  if (p.text !== undefined) out['text'] = p.text;
  const hovertext = nodeAttr(trace['hovertext'], i);
  if (hovertext !== undefined) out['hovertext'] = hovertext;
  const r = hit.rect;
  out['bbox'] = {
    x0: layout.x + r.x0,
    x1: layout.x + r.x1,
    y0: layout.y + r.y0,
    y1: layout.y + r.y1,
  };
  // The hierarchy root as the entry goes (nowhere) up: Plotly's `findEntryWithChild` of the root
  // is the root.
  const next =
    (hit.onPathbar ? hit.node : drillEntry(hierarchy, hit.node, entry, { leaves: true })) ??
    hierarchy.root;
  return {
    hit,
    point: out as unknown as ChartPoint,
    nextLevel: levelOf(next),
    drills: next !== entry,
  };
}

/** `TraceModule.a11y` of `treemap` and `icicle`: their tiles as keyboard stops along the tree. */
export const rectA11y = /* @__PURE__ */ lazyA11y(
  'rects',
  rectGeometry,
  rectHoverPoint,
  nodeContext,
);
