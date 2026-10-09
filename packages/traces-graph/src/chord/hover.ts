/**
 * `chord` hover (backlog G8, ADR-029). The trace is a domain trace: the runtime asks it with the
 * pointer in container px and it returns what is under it with distance 0 —
 *
 * - a node arc (`kind: 'node'`): its label, its outgoing and incoming flow when the trace is
 *   directed and its share of the ring, the width of the arc in the secondary box;
 * - a group arc (`kind: 'group'`): its name, how many nodes it has and its share of the ring;
 * - a ribbon (`kind: 'link'`, the topmost): its label, its two ends with an arrow between them
 *   when directed, both flows of a pair of matrix cells, and its share of the total flow, the
 *   value in the secondary box.
 *
 * `node.hoverinfo` / `link.hoverinfo` (`'none'` keeps the highlight without a label, `'skip'`
 * turns hover off) and `node.hovertemplate` / `link.hovertemplate` apply to their part; values
 * are formatted with `valueformat` and `valuesuffix` (`%{value}`). Hover and click events carry
 * {@link nodeFields}, {@link linkFields} or {@link groupFields}, with the node, link or group
 * index as `pointNumber` and the part as `kind`. The view highlights {@link highlightOf}.
 */
import { formatNumber, type FullTrace } from '@mk7s/holochart-core';
import {
  formatTemplate,
  splitExtra,
  type HoverContext,
  type HoverPoint,
  type HoverQuery,
} from '@mk7s/holochart-runtime';
import type { ChordCalc } from './calc.ts';
import { outlineContains, ringCoordinates, ringPoint, spanContains } from './geometry.ts';
import { modelFor, part, traceRect, type ChordModel } from './model.ts';

/** What is under a point: a node arc, a ribbon or a group arc, by position in the model. */
export interface ChordHit {
  readonly kind: 'node' | 'link' | 'group';
  /** Position in `model.nodes`, `model.ribbons` or `model.groups`. */
  readonly i: number;
}

/** The node arc, else the group arc, else the topmost ribbon under container point (`x`, `y`). */
export function hitTest(model: ChordModel, x: number, y: number): ChordHit | undefined {
  const { cx, cy, radii } = model;
  const { angle, radius } = ringCoordinates(cx, cy, x, y);
  if (radius >= radii.inner && radius <= radii.outer && radii.outer > radii.inner) {
    const i = model.nodes.findIndex((n) => spanContains(n.arc.start, n.arc.end, angle));
    return i >= 0 ? { kind: 'node', i } : undefined;
  }
  if (radius >= radii.groupInner && radius <= radii.groupOuter && radii.groupOuter > 0) {
    const i = model.groups.findIndex((g) => spanContains(g.arc.start, g.arc.end, angle));
    return i >= 0 ? { kind: 'group', i } : undefined;
  }
  if (radius > Math.max(radii.source, radii.target)) return undefined;
  for (let d = model.order.length - 1; d >= 0; d--) {
    const at = model.order[d]!;
    const r = model.ribbons[at]!;
    const [x0, y0, x1, y1] = r.bounds;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    if (outlineContains(r.outline, x, y)) return { kind: 'link', i: at };
  }
  return undefined;
}

/** Hover state of nodes or links: `'all'`, `'none'` or `'skip'`. Group arcs follow the nodes. */
export function partHoverinfo(trace: FullTrace, kind: ChordHit['kind']): string {
  if (trace['hoverinfo'] === 'skip') return 'skip';
  const v = part(trace, kind === 'link' ? 'link' : 'node')['hoverinfo'];
  return v === 'none' || v === 'skip' ? v : 'all';
}

/**
 * The ribbons a hover is about (positions in `model.ribbons`): the hovered one, those of the
 * hovered node, or those of the nodes of the hovered group. `undefined` when nothing is
 * highlighted.
 */
export function highlightOf(model: ChordModel, hit: ChordHit | undefined): Set<number> | undefined {
  if (!hit || partHoverinfo(model.trace, hit.kind) === 'skip') return undefined;
  const out = new Set<number>();
  if (hit.kind === 'link') out.add(hit.i);
  else {
    const mine =
      hit.kind === 'node'
        ? (node: number): boolean => node === model.nodes[hit.i]!.i
        : (node: number): boolean => model.calc.group[node] === model.groups[hit.i]!.g;
    model.ribbons.forEach((r, at) => (mine(r.link.source) || mine(r.link.target)) && out.add(at));
  }
  return out;
}

/** A value with `valueformat` and `valuesuffix`. */
export function valueLabel(trace: FullTrace, value: number): string {
  const format = typeof trace['valueformat'] === 'string' ? trace['valueformat'] : ',.4~g';
  const suffix = typeof trace['valuesuffix'] === 'string' ? trace['valuesuffix'] : '';
  return (format ? formatNumber(value, { tickformat: format }) : String(value)) + suffix;
}

/** A share of a whole, as a percentage. */
export function percentLabel(share: number): string {
  return formatNumber(Number.isFinite(share) ? share : 0, { tickformat: '.1~%' });
}

/** A node as event and template data; its arc's numbers are 0 when it has no arc. */
function nodeSummary(model: ChordModel, node: number): Record<string, unknown> {
  const { calc } = model;
  const drawn = model.nodes[model.nodeAt[node]!];
  const g = calc.group[node]!;
  const value = drawn?.arc.value ?? 0;
  return {
    kind: 'node',
    pointNumber: node,
    label: calc.labels[node],
    value,
    out: drawn?.arc.out ?? 0,
    in: drawn?.arc.in ?? 0,
    percent: calc.layout.total > 0 ? value / calc.layout.total : 0,
    ...(g >= 0 ? { group: calc.groupNames[g] } : {}),
    color: drawn?.css,
    customdata: drawn?.customdata,
  };
}

/** Event / template fields of the node arc at position `i`. */
export function nodeFields(model: ChordModel, i: number): Record<string, unknown> {
  return nodeSummary(model, model.nodes[i]!.i);
}

/** Event / template fields of the ribbon at position `i` (`source` / `target`: node summaries). */
export function linkFields(model: ChordModel, i: number): Record<string, unknown> {
  const r = model.ribbons[i]!;
  const l = r.link;
  return {
    kind: 'link',
    pointNumber: l.index,
    label: l.label,
    value: l.value,
    ...(l.pair ? { reverse: l.reverse } : {}),
    percent: model.calc.total > 0 ? (l.value + l.reverse) / model.calc.total : 0,
    color: r.css,
    customdata: r.customdata,
    source: nodeSummary(model, l.source),
    target: nodeSummary(model, l.target),
  };
}

/** Event / template fields of the group arc at position `i`. */
export function groupFields(model: ChordModel, i: number): Record<string, unknown> {
  const g = model.groups[i]!;
  const total = model.calc.layout.total;
  return {
    kind: 'group',
    pointNumber: g.g,
    label: g.name,
    value: g.arc.value,
    percent: total > 0 ? g.arc.value / total : 0,
    color: g.css,
    nodes: g.arc.nodes,
  };
}

const present = (s: string): boolean => s !== '';

/** A label point in container px (converted by the caller). */
export interface ChordLabel {
  readonly kind: ChordHit['kind'];
  /** Node, link or group index (`pointNumber`). */
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly extra: string | undefined;
  readonly color: string;
  readonly fields: Record<string, unknown>;
  readonly labels: Record<string, string>;
}

/** Fill a part's hovertemplate, or join the built lines; `box` goes in the secondary box. */
function labelText(
  trace: FullTrace,
  kind: ChordHit['kind'],
  fields: Record<string, unknown>,
  labels: Record<string, string>,
  lines: string[],
  box: string,
): { text: string; extra: string | undefined } {
  if (partHoverinfo(trace, kind) === 'none') return { text: '', extra: undefined };
  const template = kind === 'group' ? undefined : part(trace, kind)['hovertemplate'];
  if (typeof template === 'string' && template !== '') {
    const filled = splitExtra(
      formatTemplate(template, { values: fields, labels, fullData: trace }),
    );
    return { text: filled.text, extra: filled.extra ?? box };
  }
  return { text: lines.filter(present).join('<br>'), extra: box };
}

/** A CSS color at full opacity (the hover label's background). */
function opaque(color: string): string {
  const m = /^rgba\((\d+), ?(\d+), ?(\d+), ?[\d.]+\)$/.exec(color);
  return m ? `rgb(${m[1]}, ${m[2]}, ${m[3]})` : color;
}

/** The hover label of a hit, in container px; `undefined` for a part with `hoverinfo: 'skip'`. */
export function hoverLabel(model: ChordModel, hit: ChordHit): ChordLabel | undefined {
  const { trace, calc, cx, cy, radii } = model;
  if (partHoverinfo(trace, hit.kind) === 'skip') return undefined;
  const names = calc.names;
  if (hit.kind === 'link') {
    const r = model.ribbons[hit.i]!;
    const l = r.link;
    const fields = linkFields(model, hit.i);
    const labels: Record<string, string> = {
      value: valueLabel(trace, l.value),
      percent: percentLabel(fields['percent'] as number),
      ...(l.pair ? { reverse: valueLabel(trace, l.reverse) } : {}),
    };
    const a = names[l.source]!;
    const b = names[l.target]!;
    const lines = l.pair
      ? [l.label, `${a} → ${b}: ${labels['value']}`, `${b} → ${a}: ${labels['reverse']}`]
      : [l.label, calc.directed ? `${a} → ${b}` : l.source === l.target ? a : `${a} — ${b}`];
    lines.push(`Share of flow: ${labels['percent']}`);
    // A pair's box shows both directions together.
    const box = l.pair ? valueLabel(trace, l.value + l.reverse) : labels['value']!;
    const { text, extra } = labelText(trace, 'link', fields, labels, lines, box);
    return {
      kind: 'link',
      index: l.index,
      x: r.ax,
      y: r.ay,
      text,
      extra,
      color: opaque(r.css),
      fields,
      labels,
    };
  }
  const arc = hit.kind === 'node' ? model.nodes[hit.i]!.arc : model.groups[hit.i]!.arc;
  const fields = hit.kind === 'node' ? nodeFields(model, hit.i) : groupFields(model, hit.i);
  const labels: Record<string, string> = {
    value: valueLabel(trace, arc.value),
    percent: percentLabel(fields['percent'] as number),
  };
  let lines: string[];
  let color: string;
  let index: number;
  if (hit.kind === 'node') {
    const n = model.nodes[hit.i]!;
    labels['out'] = valueLabel(trace, n.arc.out);
    labels['in'] = valueLabel(trace, n.arc.in);
    lines = [
      names[n.i]!,
      calc.directed ? `Outgoing: ${labels['out']}` : '',
      calc.directed ? `Incoming: ${labels['in']}` : '',
    ];
    color = n.css;
    index = n.i;
  } else {
    const g = model.groups[hit.i]!;
    lines = [g.name, `Nodes: ${g.arc.nodes.length}`];
    color = g.css;
    index = g.g;
  }
  lines.push(`Share: ${labels['percent']}`);
  const { text, extra } = labelText(trace, hit.kind, fields, labels, lines, labels['value']!);
  // Anchored on the middle of the arc, at its outer edge.
  const radius = hit.kind === 'node' ? radii.outer : radii.groupOuter;
  const [x, y] = ringPoint(cx, cy, radius, (arc.start + arc.end) / 2);
  return { kind: hit.kind, index, x, y, text, extra, color: opaque(color), fields, labels };
}

/** A label → a runtime hover point (`height`: the figure height, for bottom-up `py`). */
export function toHoverPoint(label: ChordLabel, height: number): HoverPoint {
  return {
    pointIndex: label.index,
    kind: label.kind,
    distance: 0,
    px: label.x,
    py: height - label.y,
    color: label.color,
    fields: label.fields,
    labels: label.labels,
    hoverText: label.text,
    ...(label.extra !== undefined ? { extra: label.extra } : {}),
    showName: false,
  };
}

/** The model of a hover or keyboard query: the view's last one when it is for this rect. */
export function hoverModel(
  calc: ChordCalc,
  trace: FullTrace,
  ctx: HoverContext,
): ChordModel | undefined {
  if (!ctx.domain) return undefined;
  const rect = traceRect({ domain: ctx.domain, viewport: { size: { width: 0, height: 0 } } });
  return modelFor(calc, trace, ctx.fullLayout, rect);
}

/** The chord `hoverPoints`: what is under `query.cx` / `query.cy`. */
export function chordHoverPoints(
  calc: ChordCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  if (query.cx === undefined || query.cy === undefined || trace['hoverinfo'] === 'skip') return [];
  const model = hoverModel(calc, trace, ctx);
  const hit = model && hitTest(model, query.cx, query.cy);
  const label = hit && hoverLabel(model, hit);
  return label ? [toHoverPoint(label, query.py + query.cy)] : [];
}
