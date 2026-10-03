/**
 * What hierarchy charts say about a node (plan E13.1): `textinfo` / `texttemplate` labels, hover
 * text from `hoverinfo`, `hovertemplate` variables and event payloads, ported from plotly.js'
 * sunburst `helpers.js` (`formatValue`, `formatPercent`, `getPath`), `plot.js`
 * (`formatSliceLabel`) and `fx.js` (`onMouseOver`, `makeEventData`). Shared by sunburst, treemap
 * and icicle.
 *
 * Plotly's quirks are kept: `value` is the node's own `values` entry (so neither a count nor a
 * summed `remainder` value is shown), labels skip the path and percentages of the hierarchy root,
 * and several percentages in one label say which one they are (`'25% of parent'`).
 */
import { isArrayLike, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { formatTemplate, type TemplateOptions } from '@mk7s/holochart-runtime';
import { formatPiePercent, formatPieValue } from '@mk7s/holochart-traces-basic';
import type { Hierarchy, HierNode } from './build.ts';
import { isHierarchyRoot, parentOf } from './levels.ts';

/**
 * A node value with 10 significant digits, thousands separated (Plotly's `formatValue`), with
 * `separators` (decimal then thousands, default `'.,'`).
 * @internal
 */
export function formatNodeValue(v: number, separators?: string): string {
  return formatPieValue(v, separators);
}

/**
 * A ratio as a whole percentage, or with 3 significant digits when that would read `0%` (Plotly's
 * hierarchy `formatPercent`).
 *
 * @example
 * ```ts
 * formatNodePercent(1 / 3); // '33%'
 * formatNodePercent(0.0012); // '0.12%'
 * ```
 * @internal
 */
export function formatNodePercent(ratio: number, separators?: string): string {
  const s = `${Math.round(100 * ratio).toFixed(0)}%`;
  return s === '0%' ? formatPiePercent(ratio, separators) : s;
}

/**
 * The labels from the root down to the node's parent, each followed by `/` (Plotly's `getPath`):
 * `'/'` for the root, `'Eve/Seth/'` for a grandchild of `Eve`.
 * @experimental
 */
export function nodePath(node: HierNode): string {
  const labels: string[] = [];
  for (let p = node.parent; p; p = p.parent) labels.unshift(p.label);
  return `${labels.join('/')}/`;
}

/** A per-point attribute at data index `i` (Plotly's `castOption`): arrays by index, else as is. */
export function nodeAttr(value: unknown, i: number): unknown {
  if (isArrayLike(value)) return i >= 0 ? value[i] : undefined;
  return value;
}

/** Plotly's `isValidTextValue`: a non-empty string or a finite number. */
export function isValidTextValue(v: unknown): v is string | number {
  return (typeof v === 'string' && v !== '') || (typeof v === 'number' && Number.isFinite(v));
}

/** Where a node sits, for its percentages: the hierarchy and the chart's current entry. */
export interface NodeContext {
  readonly hierarchy: Hierarchy;
  readonly entry: HierNode;
  /** The chart's number separators (decimal, thousands; default `'.,'`). */
  readonly separators?: string;
  /** The chart's locale (`fullLayout._locale`, plan E17.6), for `texttemplate` formats. */
  readonly locale?: unknown;
}

/** A {@link NodeContext} with the separators and locale of `fullLayout` (plan E17.6). */
export function nodeContext(
  hierarchy: Hierarchy,
  entry: HierNode,
  fullLayout: FullLayout | undefined,
): NodeContext {
  const locale = fullLayout?.['_locale'];
  const separators = (locale as { separators?: unknown } | undefined)?.separators;
  return {
    hierarchy,
    entry,
    ...(typeof separators === 'string' ? { separators } : {}),
    ...(locale !== undefined ? { locale } : {}),
  };
}

/** A node's ratios to its parent, the entry and the root (Plotly's `percent*`). */
export interface NodePercents {
  readonly percentParent: number;
  readonly percentEntry: number;
  readonly percentRoot: number;
}

/** {@link NodePercents} of `node` (a ratio to a zero value is NaN, as `0 / 0` in Plotly). */
export function nodePercents(node: HierNode, ctx: NodeContext): NodePercents {
  const ratio = (d: number): number => node.value / d;
  return {
    percentParent: ratio(parentOf(node).value),
    percentEntry: ratio(ctx.entry.value),
    percentRoot: ratio(ctx.hierarchy.root.value),
  };
}

/**
 * Template variables of a node (Plotly's `texttemplate` object and hover `hoverPt`): `label`,
 * `value` (with `values`), `currentPath`, `percentParent` / `parent` (not for the root),
 * `percentEntry` / `entry`, `percentRoot` / `root`, `color`, `text`, `customdata`, `id`, `meta`.
 */
export function nodeValues(
  trace: FullTrace,
  node: HierNode,
  ctx: NodeContext,
): Record<string, unknown> {
  const p = nodePercents(node, ctx);
  const root = isHierarchyRoot(node);
  const out: Record<string, unknown> = {
    currentPath: nodePath(node),
    percentEntry: p.percentEntry,
    entry: ctx.entry.label,
    percentRoot: p.percentRoot,
    root: ctx.hierarchy.root.label,
    color: node.color,
    id: node.generated ? undefined : node.id,
    customdata: nodeAttr(trace['customdata'], node.i),
    meta: trace['meta'],
  };
  if (node.label) out['label'] = node.label;
  if (node.v !== undefined) out['value'] = node.v;
  if (!root) {
    out['percentParent'] = p.percentParent;
    out['parent'] = parentOf(node).label;
  }
  const text = nodeAttr(trace['text'], node.i);
  if (isValidTextValue(text) || text === '') out['text'] = text;
  return out;
}

/** Preformatted template variables (Plotly's `*Label` fields): value and percentages. */
export function nodeLabels(node: HierNode, ctx: NodeContext): Record<string, string> {
  const p = nodePercents(node, ctx);
  const sep = ctx.separators;
  const out: Record<string, string> = {
    percentEntry: formatNodePercent(p.percentEntry, sep),
    percentRoot: formatNodePercent(p.percentRoot, sep),
  };
  if (node.v !== undefined) out['value'] = formatNodeValue(node.v, sep);
  if (!isHierarchyRoot(node)) out['percentParent'] = formatNodePercent(p.percentParent, sep);
  return out;
}

const TEXTINFO = new Map<
  string,
  { flags: ReadonlySet<string>; keys: readonly ('parent' | 'entry' | 'root')[] }
>();

/** A `textinfo` string's flags and percentage keys, parsed once (labels of big hierarchies). */
function textinfoFlags(info: string) {
  let parsed = TEXTINFO.get(info);
  if (!parsed) {
    const flags = new Set(info.split('+'));
    const keys = (['parent', 'entry', 'root'] as const).filter((k) => flags.has(`percent ${k}`));
    TEXTINFO.set(info, (parsed = { flags, keys }));
  }
  return parsed;
}

/**
 * The label of a node (Plotly's `formatSliceLabel`), in pseudo-HTML: `texttemplate` when set,
 * else the `textinfo` parts — label, value, current path, percentages (parent, entry, root), text —
 * joined with `<br>`. Paths and percentages are left out for the hierarchy root.
 */
export function nodeText(trace: FullTrace, node: HierNode, ctx: NodeContext): string {
  const template = trace['texttemplate'];
  if (template && (typeof template === 'string' || isArrayLike(template))) {
    const txt = nodeAttr(template, node.i);
    if (typeof txt !== 'string' || !txt) return '';
    // `locale` rides along where the runtime's templates take one (plan E17.6).
    const options = { fallback: '', locale: ctx.locale } as TemplateOptions;
    return formatTemplate(
      txt,
      { values: nodeValues(trace, node, ctx), labels: nodeLabels(node, ctx), fullData: trace },
      options,
    );
  }
  const info = trace['textinfo'];
  if (typeof info !== 'string' || !info || info === 'none') return '';
  const { flags, keys } = textinfoFlags(info);
  const sep = ctx.separators;
  const parts: string[] = [];
  if (flags.has('label') && node.label) parts.push(node.label);
  if (node.v !== undefined && flags.has('value')) parts.push(formatNodeValue(node.v, sep));
  if (!isHierarchyRoot(node)) {
    if (flags.has('current path')) parts.push(nodePath(node));
    const p = nodePercents(node, ctx);
    const ratios = { parent: p.percentParent, entry: p.percentEntry, root: p.percentRoot };
    for (const key of keys) {
      const tx = formatNodePercent(ratios[key], sep);
      parts.push(keys.length > 1 ? `${tx} of ${key}` : tx);
    }
  }
  if (flags.has('text')) {
    const tx = nodeAttr(trace['text'], node.i);
    if (isValidTextValue(tx)) parts.push(String(tx));
  }
  return parts.join('<br>');
}

/** Every `hoverinfo` flag of the hierarchy traces, for `'all'`. */
export const HOVER_FLAGS = [
  'label',
  'text',
  'value',
  'name',
  'current path',
  'percent root',
  'percent entry',
  'percent parent',
] as const;

/**
 * Hover label text from `hoverinfo` (Plotly's `onMouseOver`): label, value, current path (not
 * for the root), percentages of the parent, entry and root (`'25% of Eve'`, repeats dropped, the
 * entry and root ones not for the root), then `hovertext` (else `text`). The `name` flag is the
 * runtime's. `onPathbar` leaves the entry percentage out (treemap's path bar).
 */
export function nodeHoverText(
  trace: FullTrace,
  node: HierNode,
  ctx: NodeContext,
  options: { readonly onPathbar?: boolean } = {},
): string {
  let info = nodeAttr(trace['hoverinfo'], node.i);
  if (info === undefined || info === 'all') info = HOVER_FLAGS.join('+');
  if (typeof info !== 'string' || info === 'none' || info === 'skip') return '';
  const flags = new Set(info.split('+'));
  const root = isHierarchyRoot(node);
  const sep = ctx.separators;
  const lines: string[] = [];
  if (flags.has('label') && node.label) lines.push(node.label);
  if (node.v !== undefined && flags.has('value')) lines.push(formatNodeValue(node.v, sep));
  if (flags.has('current path') && !root) lines.push(nodePath(node));
  const p = nodePercents(node, ctx);
  const seen = new Set<string>();
  const percent = (ratio: number, of: string): void => {
    const tx = `${formatNodePercent(ratio, sep)} of ${of}`;
    if (seen.has(tx)) return;
    seen.add(tx);
    lines.push(tx);
  };
  if (flags.has('percent parent')) percent(p.percentParent, parentOf(node).label);
  if (flags.has('percent entry') && !root && !options.onPathbar) {
    percent(p.percentEntry, ctx.entry.label);
  }
  if (flags.has('percent root') && !root) percent(p.percentRoot, ctx.hierarchy.root.label);
  if (flags.has('text')) {
    const tx = nodeAttr(trace['hovertext'], node.i) || nodeAttr(trace['text'], node.i);
    if (isValidTextValue(tx)) lines.push(String(tx));
  }
  return lines.join('<br>');
}

/** Data arrays reported per point in events, by their event key (Plotly's `appendArrayPointValue`). */
const POINT_KEYS: readonly (readonly [string, string])[] = [
  ['labels', 'label'],
  ['parents', 'parent'],
  ['ids', 'id'],
  ['values', 'value'],
  ['marker.colors', 'color'],
  ['text', 'text'],
  ['hovertext', 'hovertext'],
  ['customdata', 'customdata'],
];

/**
 * A node's fields in `hover` / `click` events beyond the runtime's (Plotly's `makeEventData`):
 * `currentPath`, `root`, `entry`, `percentRoot`, `percentEntry`, `percentParent`, the parent's
 * label as `parent` (not for the root), then the node's entries of its data arrays (`label`,
 * `value`, `id`, `color`, …) where not set yet.
 */
export function nodeEventFields(
  trace: FullTrace,
  node: HierNode,
  ctx: NodeContext,
): Record<string, unknown> {
  const p = nodePercents(node, ctx);
  const out: Record<string, unknown> = {
    currentPath: nodePath(node),
    root: ctx.hierarchy.root.label,
    entry: ctx.entry.label,
    percentRoot: p.percentRoot,
    percentEntry: p.percentEntry,
    percentParent: p.percentParent,
  };
  if (!isHierarchyRoot(node)) out['parent'] = parentOf(node).label;
  if (node.i < 0) return out;
  for (const [path, key] of POINT_KEYS) {
    if (out[key] !== undefined) continue;
    const dot = path.indexOf('.');
    const container = dot < 0 ? trace : (trace[path.slice(0, dot)] as Record<string, unknown>);
    const array = container?.[dot < 0 ? path : path.slice(dot + 1)];
    if (!isArrayLike(array)) continue;
    const v = array[node.i];
    if (v !== undefined) out[key] = v;
  }
  return out;
}
