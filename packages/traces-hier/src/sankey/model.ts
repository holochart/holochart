/**
 * The screen model of a sankey trace (plan E13.5a, E13.5b), after plotly.js' `sankey/render.js`
 * `sankeyModel`: the layout ({@link sankeyLayout}) in the trace's domain, fixed `node.x` / `node.y`
 * positions (with `arrangement: 'snap'`, nodes then snap into columns and their overlaps are
 * resolved), node positions a drag moved, and everything the view draws and hover tests — node
 * rects, link ribbons (container px, top-left origin), colors (concentration colorscales
 * included), label placement and hover anchors.
 *
 * A vertical sankey (`orientation: 'v'`) is laid out in the flow frame with the domain's height
 * along the flow and transposed: flow x → screen y, flow y → screen x.
 *
 * The laid-out graph is cached per calc and domain size (drags and restyles of colors never lay
 * out again); the last model is cached per calc for `hoverPoints`, and a rebuilt model reuses the
 * previous model's ribbons for links whose geometry did not change.
 */
import { toRGBA, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { sampleColorscale, type RGBA } from '@mk7s/holochart-render';
import { resolveColorscale, rgbaToCss } from '@mk7s/holochart-traces-basic';
import type { SankeyCalc, SankeyCalcLink, SankeyCalcNode } from './calc.ts';
import { darkBackground } from './defaults.ts';
import { bandOutline, loopOutline, outlineBounds, type Outline } from './geometry.ts';
import {
  cloneGraph,
  resolveCollisions,
  sankeyLayout,
  updateSankey,
  type SankeyGraph,
  type SankeyNode,
} from './layout.ts';

/** Plotly's `sankeyIterations`. */
export const ITERATIONS = 50;
/** Plotly's node hover zone: 10 px either side along the flow (`nodePadAcross`), half the pad across. */
export const NODE_ZONE = 10;
/** Label offset from the node outline (Plotly's `TEXTPAD`). */
export const TEXT_PAD = 3;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Node positions a drag set (flow frame, by position in `calc.nodes`). */
export type NodeOverrides = ReadonlyMap<number, { readonly x0: number; readonly y0: number }>;

export interface NodeBox {
  /** Position in `calc.nodes` (and in the graph). */
  readonly i: number;
  readonly node: SankeyCalcNode;
  /** Screen rect, container px. */
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly value: number;
  readonly color: RGBA;
  readonly css: string;
  readonly lineColor: RGBA;
  readonly lineWidth: number;
  /** Label on the left of the node (the last column of a horizontal sankey). */
  readonly labelLeft: boolean;
  readonly customdata: unknown;
}

export interface LinkBox {
  /** Position in `calc.links` (and in the graph). */
  readonly i: number;
  readonly link: SankeyCalcLink;
  /** Node positions. */
  readonly source: number;
  readonly target: number;
  readonly circular: boolean;
  /** Ribbon polygon, container px. */
  readonly outline: Outline;
  readonly bounds: readonly [number, number, number, number];
  /** Geometry key: equal keys, equal ribbons. */
  readonly key: string;
  /** Hover label anchor, container px. */
  readonly ax: number;
  readonly ay: number;
  readonly color: RGBA;
  readonly css: string;
  readonly hover: RGBA;
  /** Colored by a concentration colorscale (hover leaves it as is, as Plotly). */
  readonly scaled: boolean;
  readonly lineColor: RGBA;
  readonly lineWidth: number;
  readonly customdata: unknown;
}

export interface SankeyModel {
  readonly calc: SankeyCalc;
  readonly trace: FullTrace;
  readonly rect: Rect;
  readonly horizontal: boolean;
  /** Extents along / across the flow. */
  readonly along: number;
  readonly across: number;
  /** The graph as drawn (flow frame; a copy when nodes were moved). */
  readonly graph: SankeyGraph;
  /** The laid-out graph before any drag (flow frame). */
  readonly base: SankeyGraph;
  readonly overrides: NodeOverrides | undefined;
  readonly nodes: readonly NodeBox[];
  readonly links: readonly LinkBox[];
}

/** A CSS color → RGBA, or `fallback`. */
export function rgba(v: unknown, fallback: RGBA): RGBA {
  return (typeof v === 'string' ? toRGBA(v) : null) ?? fallback;
}

/** Entry `i` of an array attribute, or the scalar. */
export function pick(v: unknown, i: number): unknown {
  return Array.isArray(v) || ArrayBuffer.isView(v) ? (v as ArrayLike<unknown>)[i] : v;
}

// ---- Layout ------------------------------------------------------------------------------------

/** Plotly's `snapToColumns`: nodes whose x ranges overlap share the leftmost one's column. */
export function snapToColumns(nodes: readonly SankeyNode[], thickness: number): SankeyNode[][] {
  const sorted = [...nodes].sort((a, b) => a.x0 - b.x0 || a.index - b.index);
  const columns: SankeyNode[][] = [];
  let colX = 0;
  let lastX = -Infinity;
  for (const node of sorted) {
    if (node.x0 > lastX + thickness) {
      columns.push([]);
      colX = node.x0;
    }
    lastX = node.x0;
    columns[columns.length - 1]!.push(node);
    const dx = colX - node.x0;
    node.x0 += dx;
    node.x1 += dx;
  }
  return columns;
}

/** Fixed `node.x` / `node.y` positions (and the snap to columns), then the link breadths. */
function applyFixed(graph: SankeyGraph, calc: SankeyCalc): void {
  const t = calc.thickness;
  let any = false;
  calc.nodes.forEach((n, i) => {
    if (!n.fixed) return;
    any = true;
    const node = graph.nodes[i]!;
    const x = n.fixed[0] * graph.width;
    const y = n.fixed[1] * graph.height;
    const h = node.y1 - node.y0;
    node.x0 = x - t / 2;
    node.x1 = x + t / 2;
    node.y0 = y - h / 2;
    node.y1 = y + h / 2;
  });
  if (!any) return;
  if (calc.arrangement === 'snap') {
    for (const column of snapToColumns(graph.nodes, t)) {
      resolveCollisions(column, 0, graph.height, graph.padding);
    }
  }
  updateSankey(graph);
}

const graphs = new WeakMap<SankeyCalc, { key: string; graph: SankeyGraph }>();

/** The laid-out graph of `calc` in a domain of `along` × `across` px (cached). */
export function baseGraph(calc: SankeyCalc, along: number, across: number): SankeyGraph {
  const key = `${along}x${across}`;
  const hit = graphs.get(calc);
  if (hit?.key === key) return hit.graph;
  const graph = sankeyLayout(
    calc.nodes.length,
    calc.links.map((l) => ({ source: l.source, target: l.target, value: l.value })),
    {
      width: along,
      height: across,
      nodeWidth: calc.thickness,
      nodePadding: calc.pad,
      align: calc.align,
      iterations: ITERATIONS,
    },
  );
  applyFixed(graph, calc);
  graphs.set(calc, { key, graph });
  return graph;
}

// ---- Colors ------------------------------------------------------------------------------------

/** Color of a concentration under `link.colorscales[k]` (Plotly's `makeColorScaleFunc`). */
function concentrationColor(trace: FullTrace, k: number, value: number): RGBA | undefined {
  const scales = ((trace['link'] ?? {}) as Record<string, unknown>)['colorscales'];
  const item = Array.isArray(scales)
    ? (scales[k] as Record<string, unknown> | undefined)
    : undefined;
  if (!item) return undefined;
  const scale = resolveColorscale(item['colorscale']);
  if (!scale) return undefined;
  const cmin = Number(item['cmin'] ?? 0);
  const cmax = Number(item['cmax'] ?? 1);
  const span = cmax - cmin;
  const t = span > 0 ? Math.max(0, Math.min(1, (value - cmin) / span)) : 0.5;
  return sampleColorscale(scale, t, [0, 0, 0, 0]);
}

// ---- Model -------------------------------------------------------------------------------------

/** Geometry key of a link as laid out (flow frame). */
function linkKey(graph: SankeyGraph, i: number, arrowlen: number): string {
  const l = graph.links[i]!;
  if (l.path) {
    const p = l.path;
    return `c${p.sourceX},${p.sourceY},${p.targetX},${p.targetY},${p.rightX},${p.leftX},${p.rSource},${p.rTarget},${p.extent},${l.width},${arrowlen}`;
  }
  return `${l.source.x1},${l.y0},${l.target.x0},${l.y1},${l.width},${arrowlen}`;
}

/**
 * Build the model (see the module comment). `overrides` moves nodes (a drag); `previous` lends
 * the ribbons of unchanged links.
 */
export function buildModel(
  calc: SankeyCalc,
  trace: FullTrace,
  fullLayout: FullLayout | undefined,
  rect: Rect,
  overrides?: NodeOverrides,
  previous?: SankeyModel,
): SankeyModel {
  const horizontal = calc.horizontal;
  const along = horizontal ? rect.width : rect.height;
  const across = horizontal ? rect.height : rect.width;
  const base = baseGraph(calc, along, across);
  let graph = base;
  if (overrides && overrides.size > 0) {
    graph = cloneGraph(base);
    for (const [i, p] of overrides) {
      const node = graph.nodes[i];
      if (!node) continue;
      const w = node.x1 - node.x0;
      const h = node.y1 - node.y0;
      node.x0 = p.x0;
      node.x1 = p.x0 + w;
      node.y0 = p.y0;
      node.y1 = p.y0 + h;
    }
    updateSankey(graph);
  }
  const X = (fx: number, fy: number): number => rect.x + (horizontal ? fx : fy);
  const Y = (fx: number, fy: number): number => rect.y + (horizontal ? fy : fx);

  const node = (trace['node'] ?? {}) as Record<string, unknown>;
  const nodeLine = (node['line'] ?? {}) as Record<string, unknown>;
  const link = (trace['link'] ?? {}) as Record<string, unknown>;
  const linkLine = (link['line'] ?? {}) as Record<string, unknown>;
  const colorway = Array.isArray(fullLayout?.['colorway'])
    ? (fullLayout['colorway'] as unknown[])
    : ['#1f77b4'];
  const dark = darkBackground(fullLayout?.['paper_bgcolor']);
  const linkFallback: RGBA = dark ? [1, 1, 1, 0.6] : [0, 0, 0, 0.2];
  const lastLayer = graph.layers - 1;

  const nodes = graph.nodes.map((g, i): NodeBox => {
    const n = calc.nodes[i]!;
    const idx = n.index;
    const color = rgba(
      pick(node['color'], idx),
      rgba(colorway[idx % colorway.length], [0, 0, 0, 1]),
    );
    // Plotly draws at least half a px along the node.
    const y1 = Math.max(g.y1, g.y0 + 0.5);
    const lw = Number(pick(nodeLine['width'], idx));
    return {
      i,
      node: n,
      x0: X(g.x0, g.y0),
      y0: Y(g.x0, g.y0),
      x1: X(g.x1, y1),
      y1: Y(g.x1, y1),
      value: g.value,
      color,
      css: rgbaToCss(color),
      lineColor: rgba(pick(nodeLine['color'], idx), [0, 0, 0, 0]),
      lineWidth: Number.isFinite(lw) && lw > 0 ? lw : 0,
      labelLeft: horizontal && lastLayer > 0 && base.nodes[i]!.layer === lastLayer,
      customdata: pick(node['customdata'], idx),
    };
  });

  const arrowlen = calc.arrowlen;
  const links = graph.links.map((g, i): LinkBox => {
    const l = calc.links[i]!;
    const idx = l.index;
    const key = linkKey(graph, i, arrowlen);
    const old = previous?.links[i];
    let outline: Outline;
    let bounds: readonly [number, number, number, number];
    if (old && old.key === key && previous!.rect === rect && previous!.horizontal === horizontal) {
      outline = old.outline;
      bounds = old.bounds;
    } else {
      const flow = g.path
        ? loopOutline(g.path, g.width, arrowlen)
        : bandOutline(g.source.x1, g.y0, g.target.x0, g.y1, g.width, arrowlen);
      outline = {
        x: flow.x.map((fx, k) => X(fx, flow.y[k]!)),
        y: flow.x.map((fx, k) => Y(fx, flow.y[k]!)),
      };
      bounds = outlineBounds(outline);
    }
    const scaled =
      l.colorscale >= 0 ? concentrationColor(trace, l.colorscale, l.labelConcentration) : undefined;
    const color = scaled ?? rgba(pick(link['color'], idx), linkFallback);
    const hover = scaled ?? rgba(pick(link['hovercolor'], idx), color);
    const lw = Number(pick(linkLine['width'], idx));
    // Plotly anchors link hover labels mid-gap on the center line; loops on their lane.
    const fx = g.path ? (g.path.sourceX + g.path.targetX) / 2 : (g.source.x1 + g.target.x0) / 2;
    const fy = g.path ? g.path.extent : (g.y0 + g.y1) / 2;
    return {
      i,
      link: l,
      source: l.source,
      target: l.target,
      circular: g.circular,
      outline,
      bounds,
      key,
      ax: X(fx, fy),
      ay: Y(fx, fy),
      color,
      css: rgbaToCss(color),
      hover,
      scaled: scaled !== undefined,
      lineColor: rgba(pick(linkLine['color'], idx), [0, 0, 0, 0]),
      lineWidth: Number.isFinite(lw) && lw > 0 ? lw : 0,
      customdata: pick(link['customdata'], idx),
    };
  });

  return {
    calc,
    trace,
    rect,
    horizontal,
    along,
    across,
    graph,
    base,
    overrides,
    nodes,
    links,
  };
}

const models = new WeakMap<SankeyCalc, SankeyModel>();

const sameRect = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/**
 * The memoized model of `calc`. The view passes its drag state (`overrides`, `undefined` for none)
 * and gets a fresh model when anything changed; `hoverPoints` passes `'current'` and reuses the
 * view's last model when it is for the same trace and rect.
 */
export function modelFor(
  calc: SankeyCalc,
  trace: FullTrace,
  fullLayout: FullLayout | undefined,
  rect: Rect,
  overrides: NodeOverrides | undefined | 'current',
): SankeyModel {
  const hit = models.get(calc);
  if (
    hit &&
    hit.trace === trace &&
    sameRect(hit.rect, rect) &&
    (overrides === 'current' || hit.overrides === overrides)
  ) {
    return hit;
  }
  const model = buildModel(
    calc,
    trace,
    fullLayout,
    rect,
    overrides === 'current' ? undefined : overrides,
    hit,
  );
  models.set(calc, model);
  return model;
}

/** Plotly-style flow-frame center of node `i` (for drags). */
export function nodeCenter(model: SankeyModel, i: number): [number, number] {
  const n = model.graph.nodes[i]!;
  return [(n.x0 + n.x1) / 2, (n.y0 + n.y1) / 2];
}

/** Screen point → flow frame. */
export function toFlow(model: SankeyModel, x: number, y: number): [number, number] {
  const dx = x - model.rect.x;
  const dy = y - model.rect.y;
  return model.horizontal ? [dx, dy] : [dy, dx];
}
