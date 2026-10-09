/**
 * `graph` hover, selection and event data (backlog G1, ADR-029; highlighting and dragging are
 * G5). Nodes and links answer one query:
 *
 * - a node is hit within its outline (and a few px around a small one), the nearest center
 *   winning; nodes are found through a spatial index in linear coordinates, built once per calc;
 * - else the link whose drawn path (curve, loop or route) passes nearest the pointer, within its
 *   width and {@link LINK_REACH}.
 *
 * Hover points say what they are (`kind: 'node' | 'link'`, as sankey's do): `pointIndex` is the
 * node index, or the link's index in the trace's `link` arrays. Event points carry `kind` too,
 * with the fields of {@link nodeFields} or {@link linkFields}. Labels come from
 * `node.hovertemplate` / `link.hovertemplate`, or are built here: the node's label, its degree
 * (in and out for a directed graph) and group; a link's two ends, label and value.
 *
 * A click on a link selects its two ends (`HoverPoint.selects`), where clicks select. In a
 * selection event every node also lists `links`, the links between it and the other selected
 * nodes (so the links among a selection are the union of its nodes' lists), and when the
 * selection highlights a path (`highlight.ts`), `path`.
 */
import { formatNumber, isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import { PointIndex } from '@mk7s/holochart-render';
import {
  formatTemplate,
  selectionContains,
  splitExtra,
  type HoverContext,
  type HoverPoint,
  type HoverQuery,
  type SelectionQuery,
} from '@mk7s/holochart-runtime';
import type { GraphCalc, GraphModelCalc } from './calc.ts';
import { frameOf, nodeScaleOf } from './frame.ts';
import { distanceToLink, type LinkGeometry } from './geometry.ts';
import {
  adjacencyOf,
  highlightOptions,
  modelPath,
  neighborsOf,
  pathInfo,
  type GraphHit,
  type GraphPathInfo,
} from './highlight.ts';
import { buildLinkIndex, type LinkIndex } from './link-index.ts';
import { arrowsOf, drawnLinks, type DrawnLinks } from './links.ts';
import { lodOf } from './lod.ts';
import { nodeLabel, type GraphModel } from './model.ts';
import { linkCss, nodeCss, part } from './style.ts';

/** A small node is hit this far from its center at least, in px (Plotly's minimum). */
const MIN_RADIUS = 3;
/** A link is hit this far from its edge, in px. */
export const LINK_REACH = 4;

/** From this many links on, link hover looks only at the links near the pointer. */
export const LINK_INDEX_MIN = 500;

const SPATIAL = new WeakMap<GraphCalc, { index: PointIndex; maxHalf: number; stamp: number }>();
const LINK_INDEX = new WeakMap<LinkGeometry, LinkIndex>();
const MAX_WIDTH = new WeakMap<Float32Array, number>();

/**
 * The spatial index of a link geometry, built on first use. A geometry is another object when
 * the positions, the routes or what follows the zoom change, so the index never outlives what it
 * was built from.
 */
export function linkIndexOf(geometry: LinkGeometry): LinkIndex {
  let index = LINK_INDEX.get(geometry);
  if (!index) LINK_INDEX.set(geometry, (index = buildLinkIndex(geometry)));
  return index;
}

/** The width of the widest link, in px. */
function maxWidthOf(drawn: DrawnLinks): number {
  let max = MAX_WIDTH.get(drawn.widths);
  if (max === undefined) {
    max = 0;
    for (let k = 0; k < drawn.widths.length; k++)
      if (drawn.widths[k]! > max) max = drawn.widths[k]!;
    MAX_WIDTH.set(drawn.widths, max);
  }
  return max;
}

/**
 * The spatial index of the drawn nodes (linear coordinates), built on first use and again for
 * another frame of the calc (`frame.ts`), so that the nodes are found where they are drawn.
 */
function spatial(calc: GraphCalc): { index: PointIndex; maxHalf: number } {
  const frame = frameOf(calc);
  let s = SPATIAL.get(calc);
  if (s && s.stamp === frame.stamp) return s;
  const { model } = calc;
  let x = frame.x;
  let y = frame.y;
  let maxHalf = 0;
  let copied = false;
  for (let i = 0; i < calc.length; i++) {
    if (frame.hidden[i] === 1) {
      if (!copied) {
        x = Float64Array.from(x);
        y = Float64Array.from(y);
        copied = true;
      }
      x[i] = y[i] = NaN;
      continue;
    }
    maxHalf = Math.max(maxHalf, model.halfWidth[i]!, model.halfHeight[i]!);
  }
  s = { index: new PointIndex(x, y), maxHalf, stamp: frame.stamp };
  SPATIAL.set(calc, s);
  return s;
}

/** Hover state of nodes or links: `'all'`, `'none'` or `'skip'`. */
export function partHoverinfo(trace: FullTrace, key: 'node' | 'link'): string {
  if (trace['hoverinfo'] === 'skip') return 'skip';
  const v = part(trace, key)['hoverinfo'];
  if (v === 'none' || v === 'skip') return v;
  return trace['hoverinfo'] === 'none' ? 'none' : 'all';
}

function at(values: unknown, i: number): unknown {
  return isArrayLike(values) && typeof values !== 'string'
    ? (values as ArrayLike<unknown>)[i]
    : undefined;
}

/** What a template or an event knows of node `i`. */
export function nodeFields(
  calc: GraphModelCalc,
  trace: FullTrace,
  i: number,
): Record<string, unknown> {
  const { model } = calc;
  const node = part(trace, 'node');
  const g = model.group[i] ?? -1;
  return {
    kind: 'node',
    index: i,
    label: nodeLabel(model, i),
    degree: model.degree[i],
    indegree: model.indegree[i],
    outdegree: model.outdegree[i],
    neighbors: neighborsOf(model)[i],
    group: g >= 0 ? model.groupNames[g] : undefined,
    value: Number.isFinite(model.nodeValue?.[i]) ? model.nodeValue![i] : undefined,
    size: model.size[i],
    color: at(node['color'], i) ?? node['color'],
    customdata: at(node['customdata'], i),
  };
}

/** What a template or an event knows of kept link `k`. */
export function linkFields(
  calc: GraphModelCalc,
  trace: FullTrace,
  k: number,
): Record<string, unknown> {
  const { model } = calc;
  const link = part(trace, 'link');
  const index = model.linkIndex[k]!;
  const value = model.value[k]!;
  const end = (i: number): Record<string, unknown> => ({
    index: i,
    label: nodeLabel(model, i),
    degree: model.degree[i],
  });
  const label = at(link['label'], index);
  return {
    kind: 'link',
    index,
    label: label === undefined || label === null ? '' : String(label),
    value: Number.isFinite(value) ? value : undefined,
    source: end(model.source[k]!),
    target: end(model.target[k]!),
    customdata: at(link['customdata'], index),
  };
}

const present = (s: string): boolean => s !== '';

/** A node's or a link's value as hover labels show it: whole numbers in full, others to 4 digits. */
export function valueText(v: number): string {
  return formatNumber(v, { tickformat: Number.isInteger(v) ? ',d' : ',.4~g' });
}

/**
 * The text of a hover label: the part's `hovertemplate` filled with `fields`, or the built
 * `lines` joined (the empty ones left out). `labels`: the formatted values a template shows in
 * place of the raw ones; by default the value of the node or link, as {@link valueText} writes it.
 */
export function labelText(
  trace: FullTrace,
  key: 'node' | 'link',
  fields: Record<string, unknown>,
  lines: string[],
  labels?: Readonly<Record<string, string>>,
): { text: string; extra: string | undefined } {
  if (partHoverinfo(trace, key) === 'none') return { text: '', extra: undefined };
  const template = part(trace, key)['hovertemplate'];
  if (typeof template === 'string' && template !== '') {
    const value = fields['value'];
    const filled = splitExtra(
      formatTemplate(template, {
        values: fields,
        labels: labels ?? (typeof value === 'number' ? { value: valueText(value) } : {}),
        fullData: trace,
      }),
    );
    return { text: filled.text, extra: filled.extra };
  }
  return { text: lines.filter(present).join('<br>'), extra: undefined };
}

/**
 * The lines of a link's hover label when it has no template: its two ends joined the way the
 * arrowheads point, its label and its value. `fields`: the link's {@link linkFields}.
 */
export function linkHoverLines(
  model: GraphModel,
  trace: FullTrace,
  k: number,
  fields: Readonly<Record<string, unknown>>,
): string[] {
  const arrows = arrowsOf(trace);
  const joint = arrows.end && arrows.start ? '↔' : arrows.end ? '→' : arrows.start ? '←' : '–';
  const name = (i: number): string => nodeLabel(model, i) || `Node ${i}`;
  const value = model.value[k]!;
  return [
    `${name(model.source[k]!)} ${joint} ${name(model.target[k]!)}`,
    String(fields['label'] ?? ''),
    Number.isFinite(value) ? `Value: ${valueText(value)}` : '',
  ];
}

/** The hover point of node `i`, anchored at its center. */
export function nodeHoverPoint(
  calc: GraphCalc,
  trace: FullTrace,
  i: number,
  ctx: HoverContext,
  distance = 0,
): HoverPoint {
  const { model } = calc;
  const node = part(trace, 'node');
  const fields = nodeFields(calc, trace, i);
  const frame = frameOf(calc);
  // The positions the figure gave, where they are what the axis shows.
  const position = calc.real?.kind === 'position' ? calc.real.axis : undefined;
  const x = calc.preset || position === 'x' ? at(node['x'], i) : undefined;
  const y = calc.preset || position === 'y' ? at(node['y'], i) : undefined;
  const directed = arrowsOf(trace).end || arrowsOf(trace).start;
  const { text, extra } = labelText(trace, 'node', { ...fields, x, y }, [
    nodeLabel(model, i) || `Node ${i}`,
    directed
      ? `Links in: ${model.indegree[i]}, out: ${model.outdegree[i]}`
      : `Links: ${model.degree[i]}`,
    typeof fields['group'] === 'string' ? `Group: ${fields['group']}` : '',
    typeof fields['value'] === 'number' ? `Value: ${valueText(fields['value'])}` : '',
  ]);
  const t = ctx.transform;
  return {
    pointIndex: i,
    kind: 'node',
    distance,
    px: frame.x[i]! * t.scaleX + t.offsetX,
    py: frame.y[i]! * t.scaleY + t.offsetY,
    ...(x !== undefined ? { x } : {}),
    ...(y !== undefined ? { y } : {}),
    color: nodeCss(calc, trace, ctx.fullLayout, i),
    fields,
    hoverText: text,
    ...(extra !== undefined ? { extra } : {}),
  };
}

/**
 * The hover point of kept link `k`, anchored at linear (`x`, `y`) on its path: where the pointer
 * found it, or where a keyboard stop puts it (`../a11y.ts`).
 */
export function linkHoverPoint(
  calc: GraphCalc,
  trace: FullTrace,
  k: number,
  ctx: HoverContext,
  x: number,
  y: number,
  distance: number,
): HoverPoint {
  const { model } = calc;
  const fields = linkFields(calc, trace, k);
  const a = model.source[k]!;
  const b = model.target[k]!;
  const value = model.value[k]!;
  const { text, extra } = labelText(trace, 'link', fields, linkHoverLines(model, trace, k, fields));
  const t = ctx.transform;
  return {
    pointIndex: model.linkIndex[k]!,
    kind: 'link',
    // A link is not a point of the trace: where clicks select, it selects its two ends.
    selects: a === b ? [a] : [a, b],
    distance,
    px: x * t.scaleX + t.offsetX,
    py: y * t.scaleY + t.offsetY,
    color: linkCss(model, trace, k),
    fields,
    ...(typeof value === 'number' && Number.isFinite(value)
      ? { labels: { value: valueText(value) } }
      : {}),
    hoverText: text,
    ...(extra !== undefined ? { extra } : {}),
  };
}

/**
 * The node under the pointer: its index and the px distance outside its outline (≤ 0 inside).
 * `query`: the pointer in linear coordinates and how far from a node it may be, in px.
 */
export function nodeAt(
  calc: GraphCalc,
  query: Pick<HoverQuery, 'xl' | 'yl' | 'distance'>,
  ctx: Pick<HoverContext, 'transform'>,
): [number, number] | undefined {
  const { model } = calc;
  const frame = frameOf(calc);
  const t = ctx.transform;
  const sx = Math.abs(t.scaleX);
  const sy = Math.abs(t.scaleY);
  if (!(sx > 0) || !(sy > 0)) return undefined;
  const s = spatial(calc);
  // Nodes drawn smaller (boxes with the axes, markers by the level of detail) are hit smaller.
  const k = nodeScaleOf(calc, t.scaleX, t.scaleY) * lodOf(calc).nodeScale;
  const limit = Number.isFinite(query.distance) ? query.distance : 1e6;
  const reach = s.maxHalf + Math.max(MIN_RADIUS, limit);
  const candidates = s.index.withinRect(
    query.xl - reach / sx,
    query.yl - reach / sy,
    query.xl + reach / sx,
    query.yl + reach / sy,
  );
  let best: [number, number] | undefined;
  let bestCenter = Infinity;
  for (const i of candidates) {
    const dx = (frame.x[i]! - query.xl) * sx;
    const dy = (frame.y[i]! - query.yl) * sy;
    const hw = Math.max(MIN_RADIUS, model.halfWidth[i]! * k);
    const hh = Math.max(MIN_RADIUS, model.halfHeight[i]! * k);
    const outside = model.box
      ? Math.max(Math.abs(dx) - hw, Math.abs(dy) - hh)
      : Math.hypot(dx, dy) - hw;
    if (outside > 0) continue;
    // Among overlapping nodes the one whose center is nearest (the later one on a tie: on top).
    const center = Math.hypot(dx, dy);
    if (center <= bestCenter) {
      bestCenter = center;
      best = [i, outside];
    }
  }
  return best;
}

/** What {@link graphHitAt} found: the node or link, and for a link where on it and how far. */
export type GraphHitAt =
  | (GraphHit & { readonly kind: 'node'; readonly distance: number })
  | (GraphHit & {
      readonly kind: 'link';
      readonly distance: number;
      readonly x: number;
      readonly y: number;
    });

/**
 * What is under the pointer: the node, else the nearest link within reach (see the module
 * comment). One answer for hover labels and for the view's highlighting. `links: false` leaves
 * the links out.
 */
export function graphHitAt(
  calc: GraphCalc,
  trace: FullTrace,
  query: Pick<HoverQuery, 'xl' | 'yl' | 'px' | 'py' | 'distance'>,
  ctx: Pick<HoverContext, 'transform'>,
  links = true,
): GraphHitAt | undefined {
  if (trace['hoverinfo'] === 'skip') return undefined;
  if (partHoverinfo(trace, 'node') !== 'skip') {
    const hit = nodeAt(calc, query, ctx);
    if (hit) return { kind: 'node', i: hit[0], distance: Math.max(0, hit[1]) };
  }
  if (!links || partHoverinfo(trace, 'link') === 'skip' || calc.model.links === 0) {
    return undefined;
  }
  const t = ctx.transform;
  const drawn = drawnLinks(calc, trace, t.scaleX, t.scaleY);
  const { geometry, widths } = drawn;
  const limit = Math.min(LINK_REACH, Number.isFinite(query.distance) ? query.distance : LINK_REACH);
  let best = -1;
  let bestD = Infinity;
  const near = { x: 0, y: 0 };
  const found = { x: 0, y: 0 };
  const test = (k: number): void => {
    if (geometry.offsets[k] === geometry.offsets[k + 1]) return;
    const reach = widths[k]! / 2 + limit;
    const d2 = distanceToLink(geometry, k, query.px, query.py, t, near);
    if (d2 > reach * reach) return;
    const d = Math.max(0, Math.sqrt(d2) - widths[k]! / 2);
    // The later link is drawn on top: it wins a tie.
    if (d < bestD || (d === bestD && k > best)) {
      bestD = d;
      best = k;
      found.x = near.x;
      found.y = near.y;
    }
  };
  const sx = Math.abs(t.scaleX);
  const sy = Math.abs(t.scaleY);
  if (calc.model.links >= LINK_INDEX_MIN && sx > 0 && sy > 0) {
    // Only the links of the grid cells around the pointer (`link-index.ts`).
    const reach = maxWidthOf(drawn) / 2 + limit;
    const candidates = linkIndexOf(geometry).near(query.xl, query.yl, reach / sx, reach / sy);
    for (let j = 0; j < candidates.length; j++) test(candidates[j]!);
  } else {
    for (let k = 0; k < calc.model.links; k++) test(k);
  }
  return best < 0 ? undefined : { kind: 'link', k: best, distance: bestD, x: found.x, y: found.y };
}

/** The graph `hoverPoints`: the node under the pointer, else the nearest link within reach. */
export function graphHoverPoints(
  calc: GraphCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const hit = graphHitAt(calc, trace, query, ctx);
  if (!hit) return [];
  return hit.kind === 'node'
    ? [nodeHoverPoint(calc, trace, hit.i, ctx, hit.distance)]
    : [linkHoverPoint(calc, trace, hit.k, ctx, hit.x, hit.y, hit.distance)];
}

/** The graph `selectPoints`: the drawn nodes whose center is inside the box or lasso. */
export function graphSelectPoints(
  calc: GraphCalc,
  _trace: FullTrace,
  query: SelectionQuery,
): number[] {
  const [x0, x1] = query.x;
  const [y0, y1] = query.y;
  const candidates = spatial(calc).index.withinRect(
    Math.min(x0, x1),
    Math.min(y0, y1),
    Math.max(x0, x1),
    Math.max(y0, y1),
  );
  const frame = frameOf(calc);
  const out = candidates.filter((i) => selectionContains(query, frame.x[i]!, frame.y[i]!));
  return out.sort((a, b) => a - b);
}

/** What a selection says beyond its nodes, worked out once per selection. */
interface SelectionInfo {
  readonly mask: Uint8Array;
  readonly path: GraphPathInfo | undefined;
}

const SELECTIONS = new WeakMap<readonly number[], { calc: GraphCalc; info: SelectionInfo }>();

function selectionInfo(
  calc: GraphCalc,
  trace: FullTrace,
  selection: readonly number[],
): SelectionInfo {
  const hit = SELECTIONS.get(selection);
  if (hit && hit.calc === calc) return hit.info;
  const { model } = calc;
  const mask = new Uint8Array(model.nodes);
  for (const i of selection) if (i >= 0 && i < model.nodes) mask[i] = 1;
  const { hidden } = frameOf(calc);
  const path = modelPath(model, highlightOptions(trace), selection, {
    hidden,
    omitted: calc.omitted,
  });
  const info = { mask, path: path ? pathInfo(model, path) : undefined };
  SELECTIONS.set(selection, { calc, info });
  return info;
}

/**
 * The graph `eventData`: the fields of node `i` in selection events. With the `selection` it is
 * part of, also `links` (the trace's indices of the links between it and the other selected
 * nodes) and, when the selection highlights a path, `path` (its nodes, links and length).
 */
export function graphEventData(
  calc: GraphCalc,
  trace: FullTrace,
  i: number,
  selection?: readonly number[],
): Readonly<Record<string, unknown>> {
  if (!(i >= 0 && i < calc.length)) return {};
  const fields = nodeFields(calc, trace, i);
  if (!selection) return fields;
  const { model } = calc;
  const { mask, path } = selectionInfo(calc, trace, selection);
  const adjacency = adjacencyOf(model);
  const links: number[] = [];
  for (let e = adjacency.outStart[i]!; e < adjacency.outStart[i + 1]!; e++) {
    if (mask[adjacency.outNode[e]!] === 1) links.push(model.linkIndex[adjacency.outLink[e]!]!);
  }
  for (let e = adjacency.inStart[i]!; e < adjacency.inStart[i + 1]!; e++) {
    // A loop is in both rows of its node: once is enough.
    if (adjacency.inNode[e] === i) continue;
    if (mask[adjacency.inNode[e]!] === 1) links.push(model.linkIndex[adjacency.inLink[e]!]!);
  }
  fields['links'] = links.sort((a, b) => a - b);
  if (path) fields['path'] = path;
  return fields;
}
