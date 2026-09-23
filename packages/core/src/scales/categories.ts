/**
 * Category and multicategory axes (plan E3.6): collecting categories from trace data, ordering
 * them (`categoryorder`, `categoryarray`), and the group labels and divider lines of multicategory
 * axes.
 *
 * Categories are compared by their string form, as in Plotly (`1` and `'1'` are one category).
 */
import type { CATEGORY_ORDERS } from '../layout/schema.ts';
import { isTwoLevel } from './scale.ts';
import type { Scale, ScaleOptions, Tick } from './types.ts';

/** A `categoryorder` value. */
export type CategoryOrder = (typeof CATEGORY_ORDERS)[number];

/**
 * Per-category trace values for the aggregate orders (`total`/`min`/`max`/`sum`/`mean`/`median`),
 * keyed by category name. What counts as "the value" is up to each trace type (bar length,
 * histogram count, heatmap `z`, …), as in Plotly, so the caller collects it.
 */
export type CategoryValues = ReadonlyMap<string, readonly number[]>;

function isValidCategory(v: unknown): boolean {
  return v !== null && v !== undefined && v !== '';
}

/**
 * Categories in order of first appearance across `columns` (one data array per trace, in trace
 * order). `null`, `undefined` and `''` are not categories.
 */
export function collectCategories(columns: Iterable<ArrayLike<unknown> | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const col of columns) {
    if (col === undefined) continue;
    for (let i = 0; i < col.length; i++) {
      const v = col[i];
      if (!isValidCategory(v)) continue;
      const key = String(v);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}

/**
 * `[group, item]` categories from two-row columns (`[[groups], [items]]`), in Plotly's order:
 * groups by first appearance, then items within a group by the first appearance of the item
 * anywhere. Columns that are not two-row arrays are ignored.
 */
export function collectMulticategories(columns: Iterable<unknown>): [string, string][] {
  const groupRank = new Map<string, number>();
  const itemRank = new Map<string, number>();
  const pairs = new Map<string, [string, string]>();
  for (const col of columns) {
    if (!isTwoLevel(col)) continue;
    const [groups, items] = col;
    const n = Math.min(groups.length, items.length);
    for (let i = 0; i < n; i++) {
      const g = groups[i];
      const it = items[i];
      if (!isValidCategory(g) || !isValidCategory(it)) continue;
      const gs = String(g);
      const is = String(it);
      if (!groupRank.has(gs)) groupRank.set(gs, groupRank.size);
      if (!itemRank.has(is)) itemRank.set(is, itemRank.size);
      const key = `${gs}\u0000${is}`;
      if (!pairs.has(key)) pairs.set(key, [gs, is]);
    }
  }
  return [...pairs.values()].sort(
    (a, b) =>
      (groupRank.get(a[0]) as number) - (groupRank.get(b[0]) as number) ||
      (itemRank.get(a[1]) as number) - (itemRank.get(b[1]) as number),
  );
}

/**
 * Compare category names like Plotly's `d3.ascending` on the original values: numerically when
 * both are numbers, otherwise as strings.
 */
export function compareCategories(a: string, b: string): number {
  const na = a.trim() === '' ? NaN : Number(a);
  const nb = b.trim() === '' ? NaN : Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1
    ? (s[mid] as number)
    : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** Aggregate one category's values; NaN when there is nothing to aggregate. */
function aggregate(kind: string, raw: readonly number[] | undefined): number {
  const values = (raw ?? []).filter((v) => Number.isFinite(v));
  if (kind === 'total' || kind === 'sum') return values.reduce((s, v) => s + v, 0);
  if (values.length === 0) return NaN;
  switch (kind) {
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'mean':
      return values.reduce((s, v) => s + v, 0) / values.length;
    default:
      return median(values);
  }
}

/** Options for {@link orderCategories}. */
export interface OrderCategoriesOptions {
  /** Explicit order for `categoryorder: 'array'`. */
  categoryarray?: ArrayLike<unknown>;
  /** Per-category values for the aggregate orders. */
  values?: CategoryValues;
}

/**
 * Order categories (given in trace order) by `categoryorder`, following Plotly:
 *
 * - `trace`: unchanged;
 * - `category ascending|descending`: by name (numerically when both names are numbers);
 * - `array`: `categoryarray` first — including entries with no data — then the remaining
 *   categories in trace order;
 * - `<aggregate> ascending|descending`: by the aggregate of `values` per category (stable, so ties
 *   keep trace order; descending is the reverse of ascending, as in Plotly). Categories without
 *   values sort last in both directions (`total`/`sum` count them as 0).
 */
export function orderCategories(
  categories: readonly string[],
  order: CategoryOrder,
  options: OrderCategoriesOptions = {},
): string[] {
  if (order === 'trace') return [...categories];
  if (order === 'array') {
    const head = collectCategories([options.categoryarray]);
    const inHead = new Set(head);
    return [...head, ...categories.filter((c) => !inHead.has(c))];
  }
  const [kind, direction] = order.split(' ') as [string, string];
  const descending = direction === 'descending';
  if (kind === 'category') {
    const sorted = [...categories].sort(compareCategories);
    return descending ? sorted.reverse() : sorted;
  }
  const scored = categories.map((c) => ({ c, v: aggregate(kind, options.values?.get(c)) }));
  const valid = scored.filter((s) => !Number.isNaN(s.v)).sort((a, b) => a.v - b.v);
  if (descending) valid.reverse();
  const missing = scored.filter((s) => Number.isNaN(s.v));
  return [...valid, ...missing].map((s) => s.c);
}

/** The axis attributes {@link axisCategories} reads. */
export interface CategoryAxisLike {
  type: string;
  categoryorder?: CategoryOrder | undefined;
  categoryarray?: ArrayLike<unknown> | undefined;
}

/**
 * The category list of one axis, ready to spread into `createScale` options: `{ categories }`
 * for `category` axes, `{ multicategories }` for `multicategory` axes, `{}` otherwise.
 *
 * @param columns - The data arrays of the traces on this axis (e.g. each trace's `x`), in trace
 * order. Multicategory columns are two-row arrays `[[groups], [items]]`.
 * @param values - Per-category values for the aggregate `categoryorder`s.
 *
 * Multicategory axes support `trace` and `category ascending|descending` (by group, then item);
 * other orders keep trace order.
 */
export function axisCategories(
  axis: CategoryAxisLike,
  columns: Iterable<unknown>,
  values?: CategoryValues,
): Pick<ScaleOptions, 'categories' | 'multicategories'> {
  const order = axis.categoryorder ?? 'trace';
  if (axis.type === 'multicategory') {
    const pairs = collectMulticategories(columns);
    if (order === 'category ascending' || order === 'category descending') {
      pairs.sort((a, b) => compareCategories(a[0], b[0]) || compareCategories(a[1], b[1]));
      if (order === 'category descending') pairs.reverse();
    }
    return { multicategories: pairs };
  }
  if (axis.type !== 'category') return {};
  const cols: (ArrayLike<unknown> | undefined)[] = [];
  for (const c of columns) {
    cols.push(
      Array.isArray(c) || (ArrayBuffer.isView(c) && !(c instanceof DataView))
        ? (c as ArrayLike<unknown>)
        : undefined,
    );
  }
  const opts: OrderCategoriesOptions = {};
  if (axis.categoryarray !== undefined) opts.categoryarray = axis.categoryarray;
  if (values !== undefined) opts.values = values;
  return { categories: orderCategories(collectCategories(cols), order, opts) };
}

/** Group labels and divider lines of a multicategory axis (see {@link multicategoryLevels}). */
export interface MulticategoryLevels {
  /** One label per visible group: `text` is the group, `l` the median of its ticks. */
  groups: Tick[];
  /** Divider positions in linear space (between groups and at the outer edges), in range. */
  dividers: number[];
}

/**
 * The second label row and dividers of a multicategory axis, from its major ticks (which carry the
 * group in `text2`), following Plotly's `getSecondaryLabelVals` and `getDividerVals`: each group
 * label sits at the median of its ticks; dividers sit half a category (or half a tick step) outside
 * the first and last tick of each run of a group, and only those inside the visible range count.
 */
export function multicategoryLevels(scale: Scale, ticks: readonly Tick[]): MulticategoryLevels {
  const major = ticks.filter((t) => t.minor !== true && t.noTick !== true);
  const byGroup = new Map<string, number[]>();
  for (const t of major) {
    const g = t.text2 ?? '';
    const list = byGroup.get(g);
    if (list) list.push(t.l);
    else byGroup.set(g, [t.l]);
  }
  const groups: Tick[] = [];
  for (const [text, ls] of byGroup) groups.push({ l: median(ls), text });

  const [r0, r1] = scale.range;
  const lo = Math.min(r0, r1);
  const hi = Math.max(r0, r1);
  const inRange = (l: number): boolean => l >= lo && l <= hi;
  const first = major[0];
  const second = major[1];
  const step = first && second ? Math.abs(second.l - first.l) || 1 : 1;
  const reversed = first && second ? second.l < first.l : r1 < r0;
  // Boundaries of a tick's category span, in the direction the ticks run.
  const before = (l: number): number => (reversed ? l + step - 0.5 : l - 0.5);
  const after = (l: number): number => (reversed ? l - 0.5 : l + step - 0.5);

  const dividers: number[] = [];
  const push = (l: number): void => {
    if (inRange(l) && !dividers.includes(l)) dividers.push(l);
  };
  let current: string | undefined;
  for (let i = 0; i < major.length; i++) {
    const t = major[i] as Tick;
    const g = t.text2 ?? '';
    if (i === 0 || g !== current) push(before(t.l));
    current = g;
  }
  const last = major[major.length - 1];
  if (last) push(after(last.l));
  return { groups, dividers };
}
