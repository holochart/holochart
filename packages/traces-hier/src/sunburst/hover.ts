/**
 * Sunburst hover (plan E13.2, E6.1; ADR-010: CPU, 2D), following plotly.js' sunburst `fx.js`.
 * Sunbursts are domain traces: the runtime asks them on every hover with the pointer in container
 * px (`query.cx` / `query.cy`), and they return the sector under it with distance 0. The label
 * anchors on the sector's bisector, `1 − rInscribed` of its outer radius out (Plotly). Hovering
 * does not restyle sectors (Plotly highlights treemap and icicle tiles only).
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
import { MULTIPLE_ROOTS_ID } from '../hierarchy/build.ts';
import { drillEntry } from '../hierarchy/levels.ts';
import {
  hoverAnchor,
  sectorAt,
  sunburstGeometry,
  type Sector,
  type SunburstCalc,
  type SunburstLayout,
} from './geometry.ts';

/** The hover point of sector `s` (anchor in overlay px: bottom-left origin). */
export function sectorHoverPoint(
  trace: FullTrace,
  s: Sector,
  ctx: NodeContext,
  layout: Pick<SunburstLayout, 'cx' | 'cy' | 'height'>,
  height: number = layout.height,
): HoverPoint {
  const node = s.node;
  const [ax, ay] = hoverAnchor(s, layout);
  const text = nodeAttr(trace['hovertext'], node.i) || nodeAttr(trace['text'], node.i);
  return {
    pointIndex: node.i,
    distance: 0,
    px: ax,
    py: height - ay,
    ...(isValidTextValue(text) ? { text: String(text) } : {}),
    color: node.color,
    // Event fields win (Plotly's hover templates read the event point: `color` is the node's
    // `marker.colors` entry there); the template variables fill in the rest.
    fields: { ...nodeValues(trace, node, ctx), ...nodeEventFields(trace, node, ctx) },
    labels: nodeLabels(node, ctx),
    hoverText: nodeHoverText(trace, node, ctx),
  };
}

/** The sunburst `hoverPoints`: the sector under `query.cx` / `query.cy`, if any. */
export function sunburstHoverPoints(
  calc: SunburstCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const layout = calc.layout;
  const hierarchy = calc.hierarchy;
  if (!layout || !hierarchy) return [];
  const geometry = sunburstGeometry(calc, trace);
  if (!geometry) return [];
  // Figure height: overlay px are from the bottom, container px from the top.
  const height = query.cy !== undefined ? query.py + query.cy : layout.height;
  const x = query.cx ?? query.px;
  const y = query.cy ?? height - query.py;
  const s = sectorAt(geometry, layout, x, y);
  if (!s) return [];
  return [
    sectorHoverPoint(
      trace,
      s,
      nodeContext(hierarchy, geometry.entry, ctx.fullLayout),
      layout,
      height,
    ),
  ];
}

/**
 * A sector as a point of `click` / `sunburstclick` events (the runtime's `buildPoint` for domain
 * traces, which the view emits itself: it handles sector clicks to drill).
 */
export function sectorEventPoint(
  trace: FullTrace,
  input: unknown,
  index: number,
  s: Sector,
  layout: SunburstLayout,
  ctx: NodeContext,
): ChartPoint {
  const p = sectorHoverPoint(trace, s, ctx, layout);
  const i = s.node.i;
  const out: Record<string, unknown> = { ...p.fields };
  out['data'] = input;
  out['fullData'] = trace;
  out['curveNumber'] = index;
  if (i >= 0) {
    out['pointNumber'] = i;
    out['pointIndex'] = i;
  }
  const customdata = nodeAttr(trace['customdata'], i);
  if (customdata !== undefined) out['customdata'] = customdata;
  if (p.text !== undefined) out['text'] = p.text;
  const hovertext = nodeAttr(trace['hovertext'], i);
  if (hovertext !== undefined) out['hovertext'] = hovertext;
  const x = p.px;
  const y = layout.height - p.py;
  out['bbox'] = { x0: x, x1: x, y0: y, y1: y };
  return out as unknown as ChartPoint;
}

/** What a click on a sunburst sector means: its event point and the level it drills to. */
export interface SunburstClick {
  readonly sector: Sector;
  readonly point: ChartPoint;
  /**
   * The `level` the click leads to (Plotly's `nextLevel`): the sector's id, the level above for
   * the center, `''` for the whole hierarchy; `undefined` on the root and on leaves.
   */
  readonly nextLevel: string | undefined;
}

/**
 * The sector at container point `(x, y)` of a laid-out sunburst and what clicking it means
 * (Plotly's `onClick` in `fx.js`), or `undefined` off the sectors.
 */
export function sunburstClick(
  calc: SunburstCalc,
  trace: FullTrace,
  input: unknown,
  index: number,
  fullLayout: FullLayout | undefined,
  x: number,
  y: number,
): SunburstClick | undefined {
  const layout = calc.layout;
  const hierarchy = calc.hierarchy;
  const geometry = hierarchy && layout ? sunburstGeometry(calc, trace) : undefined;
  if (!geometry || !layout || !hierarchy) return undefined;
  const sector = sectorAt(geometry, layout, x, y);
  if (!sector) return undefined;
  const ctx = nodeContext(hierarchy, geometry.entry, fullLayout);
  const next = drillEntry(hierarchy, sector.node, geometry.entry);
  return {
    sector,
    point: sectorEventPoint(trace, input, index, sector, layout, ctx),
    // The generated root of several roots is the whole hierarchy: level ''.
    nextLevel: next === undefined ? undefined : next.id === MULTIPLE_ROOTS_ID ? '' : next.id,
  };
}
