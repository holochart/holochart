/**
 * `sankey` hover (plan E13.5b, E6.1), after plotly.js' `sankey/plot.js` hover handlers. The trace
 * is a domain trace: the runtime asks it with the pointer in container px and it returns what is
 * under it with distance 0 —
 *
 * - a node (its rect, or Plotly's wider hover zone around it: 10 px either side along the flow,
 *   half the padding across; nodes win over links): the label, `Incoming flow count` and
 *   `Outgoing flow count`, the value in the secondary box;
 * - a link ribbon (the topmost): its label, `Source`, `Target` and, with a concentration
 *   colorscale, `Concentration`, the value in the secondary box. Outside `closest` hovermode,
 *   every link of the hovered link's flow (same source and target) gets a label, as in Plotly.
 *
 * `node.hoverinfo` / `link.hoverinfo` (`'none'` keeps the highlight without a label, `'skip'`
 * turns hover off) and `node.hovertemplate` / `link.hovertemplate` apply to their part; values are
 * formatted with `valueformat` and `valuesuffix` (`%{value}`). Event points carry Plotly's node and
 * link fields ({@link nodeFields}, {@link linkFields}). The view highlights {@link highlightOf}.
 */
import { formatNumber, type FullTrace } from '@mk7s/holochart-core';
import {
  formatTemplate,
  splitExtra,
  type ChartPoint,
  type HoverContext,
  type HoverPoint,
  type HoverQuery,
} from '@mk7s/holochart-runtime';
import type { SankeyCalc } from './calc.ts';
import { outlineContains } from './geometry.ts';
import { modelFor, NODE_ZONE, type SankeyModel } from './model.ts';

/** What is under a point. */
export type SankeyHit = { readonly kind: 'node' | 'link'; readonly i: number };

/** The node (rect first, then hover zone) or else the topmost link under `(x, y)`. */
export function hitTest(model: SankeyModel, x: number, y: number): SankeyHit | undefined {
  const nodes = model.nodes;
  for (let k = nodes.length - 1; k >= 0; k--) {
    const n = nodes[k]!;
    if (x >= n.x0 && x <= n.x1 && y >= n.y0 && y <= n.y1) return { kind: 'node', i: k };
  }
  const pad = model.graph.padding / 2;
  const ax = model.horizontal ? NODE_ZONE : pad;
  const ay = model.horizontal ? pad : NODE_ZONE;
  let best: SankeyHit | undefined;
  let bestD = Infinity;
  for (let k = nodes.length - 1; k >= 0; k--) {
    const n = nodes[k]!;
    if (x < n.x0 - ax || x > n.x1 + ax || y < n.y0 - ay || y > n.y1 + ay) continue;
    const d = Math.hypot(x - (n.x0 + n.x1) / 2, y - (n.y0 + n.y1) / 2);
    if (d < bestD) {
      bestD = d;
      best = { kind: 'node', i: k };
    }
  }
  if (best) return best;
  const links = model.links;
  for (let k = links.length - 1; k >= 0; k--) {
    const l = links[k]!;
    const [x0, y0, x1, y1] = l.bounds;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    if (outlineContains(l.outline, x, y)) return { kind: 'link', i: k };
  }
  return undefined;
}

/** Hover state of nodes or links: `'all'`, `'none'` or `'skip'`. */
export function partHoverinfo(trace: FullTrace, part: 'node' | 'link'): string {
  if (trace['hoverinfo'] === 'skip') return 'skip';
  const v = ((trace[part] ?? {}) as Record<string, unknown>)['hoverinfo'];
  return v === 'none' || v === 'skip' ? v : 'all';
}

/** Links a hover highlights (link positions): those of a node, or a link, plus their label mates. */
export function highlightOf(model: SankeyModel, hit: SankeyHit | undefined): Set<number> {
  const out = new Set<number>();
  if (!hit || partHoverinfo(model.trace, hit.kind) === 'skip') return out;
  const links = model.links;
  if (hit.kind === 'link') out.add(hit.i);
  else links.forEach((l, k) => (l.source === hit.i || l.target === hit.i) && out.add(k));
  // Plotly also highlights every link sharing a (non-empty) label with a highlighted one.
  const labels = new Set<string>();
  for (const k of out) if (links[k]!.link.label !== '') labels.add(links[k]!.link.label);
  if (labels.size > 0) links.forEach((l, k) => labels.has(l.link.label) && out.add(k));
  return out;
}

/** A value with `valueformat` and `valuesuffix` (Plotly's `valueLabel`). */
export function valueLabel(trace: FullTrace, value: number): string {
  const format = typeof trace['valueformat'] === 'string' ? trace['valueformat'] : '.3s';
  const suffix = typeof trace['valuesuffix'] === 'string' ? trace['valuesuffix'] : '';
  return (format ? formatNumber(value, { tickformat: format }) : String(value)) + suffix;
}

/** A node as event and template data (Plotly's node object, links as link indices). */
function nodeSummary(model: SankeyModel, i: number): Record<string, unknown> {
  const box = model.nodes[i]!;
  const g = model.graph.nodes[i]!;
  return {
    pointNumber: box.node.index,
    label: box.node.label,
    value: box.value,
    color: box.css,
    customdata: box.customdata,
    group: box.node.group,
    childrenNodes: box.node.children,
    depth: g.depth,
    sourceLinks: g.sourceLinks.map((l) => model.calc.links[l.index]!.index),
    targetLinks: g.targetLinks.map((l) => model.calc.links[l.index]!.index),
  };
}

/** Event / template fields of node `i`. */
export function nodeFields(model: SankeyModel, i: number): Record<string, unknown> {
  return nodeSummary(model, i);
}

/** Event / template fields of link `i` (`source` / `target` are node summaries). */
export function linkFields(model: SankeyModel, i: number): Record<string, unknown> {
  const box = model.links[i]!;
  const l = box.link;
  return {
    pointNumber: l.index,
    label: l.label,
    value: l.value,
    color: box.css,
    customdata: box.customdata,
    source: nodeSummary(model, box.source),
    target: nodeSummary(model, box.target),
    flow: {
      value: l.flow.value,
      links: l.flow.links,
      concentration: l.concentration,
      labelConcentration: l.labelConcentration,
    },
  };
}

const present = (s: string): boolean => s !== '';

/** A label point in container px (converted by the caller). */
export interface SankeyLabel {
  readonly kind: 'node' | 'link';
  /** Node or link index (`pointNumber`). */
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly extra: string | undefined;
  readonly color: string;
  readonly fields: Record<string, unknown>;
  readonly value: string;
}

/** Fill a part's hovertemplate, or build Plotly's lines; the value goes in the secondary box. */
function labelText(
  trace: FullTrace,
  part: 'node' | 'link',
  fields: Record<string, unknown>,
  value: string,
  lines: string[],
): { text: string; extra: string | undefined } {
  if (partHoverinfo(trace, part) === 'none') return { text: '', extra: undefined };
  const template = ((trace[part] ?? {}) as Record<string, unknown>)['hovertemplate'];
  if (typeof template === 'string' && template !== '') {
    const filled = splitExtra(
      formatTemplate(template, { values: fields, labels: { value }, fullData: trace }),
    );
    return { text: filled.text, extra: filled.extra ?? value };
  }
  return { text: lines.filter(present).join('<br>'), extra: value };
}

/** Hover labels of a hit, in container px. */
export function hoverLabels(model: SankeyModel, hit: SankeyHit, hovermode: unknown): SankeyLabel[] {
  const trace = model.trace;
  if (partHoverinfo(trace, hit.kind) === 'skip') return [];
  if (hit.kind === 'node') {
    const box = model.nodes[hit.i]!;
    const g = model.graph.nodes[hit.i]!;
    const fields = nodeFields(model, hit.i);
    const value = valueLabel(trace, box.value);
    const { text, extra } = labelText(trace, 'node', fields, value, [
      box.node.label,
      `Incoming flow count: ${g.targetLinks.length}`,
      `Outgoing flow count: ${g.sourceLinks.length}`,
    ]);
    const left = box.labelLeft;
    return [
      {
        kind: 'node',
        index: box.node.index,
        x: left ? box.x0 - 2 : box.x1 + 2,
        y: box.y0 + (box.y1 - box.y0) / 4,
        text,
        extra,
        color: opaque(box.css),
        fields,
        value,
      },
    ];
  }
  const hovered = model.links[hit.i]!;
  const flow = hovered.link.flow.links;
  const all = hovermode !== 'closest' && flow.length > 1;
  const ks = all
    ? model.links.flatMap((l, k) => (flow.includes(l.link.index) ? [k] : []))
    : [hit.i];
  return ks.map((k) => {
    const box = model.links[k]!;
    const l = box.link;
    const fields = linkFields(model, k);
    const value = valueLabel(trace, l.value);
    const { text, extra } = labelText(trace, 'link', fields, value, [
      l.label,
      `Source: ${model.nodes[box.source]!.node.label}`,
      `Target: ${model.nodes[box.target]!.node.label}`,
      box.scaled
        ? `Concentration: ${formatNumber(l.labelConcentration, { tickformat: '.2%' })}`
        : '',
    ]);
    return {
      kind: 'link',
      index: l.index,
      x: box.ax,
      y: box.ay,
      text,
      extra,
      color: opaque(box.css),
      fields,
      value,
    };
  });
}

/** A CSS color at full opacity (Plotly's hover label background). */
function opaque(css: string): string {
  const m = /^rgba\((\d+), ?(\d+), ?(\d+), ?[\d.]+\)$/.exec(css);
  return m ? `rgb(${m[1]}, ${m[2]}, ${m[3]})` : css;
}

/** The trace's rect in container px (its domain; the plot area or the viewport otherwise). */
export function traceRect(ctx: {
  readonly domain?: { readonly rect: { x: number; y: number; width: number; height: number } };
  readonly plotArea?: { x: number; y: number; width: number; height: number };
  readonly viewport: { readonly size: { width: number; height: number } };
}): { x: number; y: number; width: number; height: number } {
  const size = ctx.viewport.size;
  const r = ctx.domain?.rect ?? ctx.plotArea ?? { x: 0, y: 0, ...size };
  return { x: r.x, y: r.y, width: Math.max(0, r.width), height: Math.max(0, r.height) };
}

/** Labels → runtime hover points (`height`: the figure height, for bottom-up `py`). */
export function toHoverPoints(labels: readonly SankeyLabel[], height: number): HoverPoint[] {
  const multi = labels.length > 1;
  return labels.map((l) => ({
    pointIndex: l.index,
    kind: l.kind,
    distance: 0,
    px: l.x,
    py: height - l.y,
    color: l.color,
    fields: l.fields,
    labels: { value: l.value },
    hoverText: l.text,
    ...(l.extra !== undefined ? { extra: l.extra } : {}),
    showName: false,
    ...(multi ? { multi: true } : {}),
  }));
}

/** The sankey `hoverPoints`: what is under `query.cx` / `query.cy`. */
export function sankeyHoverPoints(
  calc: SankeyCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  if (!ctx.domain || query.cx === undefined || query.cy === undefined) return [];
  if (trace['hoverinfo'] === 'skip') return [];
  const rect = traceRect({ domain: ctx.domain, viewport: { size: { width: 0, height: 0 } } });
  const model = modelFor(calc, trace, ctx.fullLayout, rect, 'current');
  const hit = hitTest(model, query.cx, query.cy);
  if (!hit) return [];
  return toHoverPoints(hoverLabels(model, hit, ctx.fullLayout['hovermode']), query.py + query.cy);
}

/**
 * A Plotly-shaped event point for a node the view handled itself (a click on a draggable node,
 * whose press the view took): the fields `hoverPoints` reports, plus `data`, `fullData`,
 * `curveNumber`, `pointNumber` and the label anchor `bbox`, as the runtime builds them.
 */
export function eventPoint(
  model: SankeyModel,
  hit: SankeyHit,
  curveNumber: number,
  data: unknown,
): ChartPoint {
  const label = hoverLabels(model, hit, 'closest')[0];
  const fields = hit.kind === 'node' ? nodeFields(model, hit.i) : linkFields(model, hit.i);
  const index =
    hit.kind === 'node' ? model.nodes[hit.i]!.node.index : model.links[hit.i]!.link.index;
  const out: Record<string, unknown> = {
    ...fields,
    data,
    fullData: model.trace,
    curveNumber,
    pointNumber: index,
    pointIndex: index,
  };
  if (label) out['bbox'] = { x0: label.x, x1: label.x, y0: label.y, y1: label.y };
  return out as unknown as ChartPoint;
}
