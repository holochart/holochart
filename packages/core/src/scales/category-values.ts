/**
 * Value-based category orders (plan E3.6): `categoryorder: '<aggregate> ascending|descending'`
 * with `total`, `sum`, `min`, `max`, `mean` or `median`, following plotly.js
 * `sortAxisCategoriesByValue` (`src/plots/plots.js`).
 *
 * Plotly sorts after a first calc: every visible trace on the axis reports, per point, the index of
 * its category and a value (a bar's own size, a scatter point's other coordinate, …); values are
 * aggregated per category, the categories sorted by the aggregate, and calc runs again so positions
 * follow the new order. The runtime owns the two calc passes; this module is the pure part.
 *
 * Semantics (Plotly's, with its undefined corners made deterministic):
 *
 * - Only finite values count (Plotly's `aggNums` skips non-numeric values).
 * - `total` and `sum` are the same sum; a category without values sums to 0 (Plotly's `aggNums`
 *   returns `false` for an empty list, which compares as 0).
 * - `median` sorts numerically. (Plotly's `Lib.median` sorts with the default string comparison,
 *   so `[10, 9, 2]` gives 2 there; that is a bug we don't copy.)
 * - The sort is stable in both directions: ties keep trace order for `descending` too (Plotly sorts
 *   with `b - a`, not by reversing the ascending result).
 * - A category with no value for `min`/`max`/`mean`/`median` goes last in both directions, in trace
 *   order. (In Plotly its aggregate is `NaN`, `undefined` or 0 depending on the trace type, and a
 *   `NaN` comparison leaves the result up to the engine's sort.)
 * - `geometric mean` is not supported (not in the `categoryorder` schema).
 */
import type { CategoryValues } from './categories.ts';

/** The aggregates of the value-based `categoryorder`s. */
export type CategoryAggregate = 'total' | 'sum' | 'min' | 'max' | 'mean' | 'median';

const AGGREGATES: ReadonlySet<string> = new Set(['total', 'sum', 'min', 'max', 'mean', 'median']);

/** A value-based `categoryorder`, split into its aggregate and direction. */
export interface ValueCategoryOrder {
  readonly aggregate: CategoryAggregate;
  readonly descending: boolean;
}

/**
 * Parse a value-based `categoryorder` (`'total descending'`, `'median ascending'`, …); `undefined`
 * for every other order (`trace`, `array`, `category …`) or a missing one.
 */
export function valueCategoryOrder(order: string | undefined): ValueCategoryOrder | undefined {
  if (order === undefined) return undefined;
  const [aggregate, direction, extra] = order.split(' ');
  if (extra !== undefined || aggregate === undefined || !AGGREGATES.has(aggregate)) {
    return undefined;
  }
  if (direction !== 'ascending' && direction !== 'descending') return undefined;
  return { aggregate: aggregate as CategoryAggregate, descending: direction === 'descending' };
}

/**
 * One trace's contribution to a value-based order: per point, the index of its category in the
 * axis' category list and the value to aggregate (index-aligned). Points whose index is not a
 * valid category (NaN, negative, fractional or past the end) or whose value is not finite are
 * skipped.
 */
export interface CategorySamples {
  readonly index: ArrayLike<number>;
  readonly value: ArrayLike<number>;
}

/**
 * Collect the values of every category from the samples of the traces on one axis, in trace
 * order (Plotly's `categoriesValue`).
 *
 * @param categories - The axis' category list the sample indices refer to (the list calc ran
 * with).
 * @returns Values per category name; every category is present, possibly with no values.
 */
export function collectCategoryValues(
  categories: readonly string[],
  samples: Iterable<CategorySamples>,
): Map<string, number[]> {
  const lists: number[][] = categories.map(() => []);
  for (const s of samples) {
    const n = Math.min(s.index.length, s.value.length);
    for (let i = 0; i < n; i++) {
      const c = s.index[i] as number;
      const v = s.value[i] as number;
      if (!Number.isInteger(c) || c < 0 || c >= lists.length || !Number.isFinite(v)) continue;
      (lists[c] as number[]).push(v);
    }
  }
  const out = new Map<string, number[]>();
  categories.forEach((c, i) => {
    // A category listed twice keeps the values of both entries.
    const prev = out.get(c);
    if (prev) prev.push(...(lists[i] as number[]));
    else out.set(c, lists[i] as number[]);
  });
  return out;
}

function numericMedian(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1
    ? (s[mid] as number)
    : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/**
 * Aggregate one category's values. Non-finite values are ignored; with no values left, `total` and
 * `sum` give 0 and the other aggregates `NaN` (see the module notes).
 */
export function aggregateCategoryValues(
  aggregate: CategoryAggregate,
  values: readonly number[] | undefined,
): number {
  let sum = 0;
  let count = 0;
  let min = Infinity;
  let max = -Infinity;
  const finite: number[] = [];
  for (const v of values ?? []) {
    if (!Number.isFinite(v)) continue;
    sum += v;
    count++;
    if (v < min) min = v;
    if (v > max) max = v;
    if (aggregate === 'median') finite.push(v);
  }
  if (aggregate === 'total' || aggregate === 'sum') return sum;
  if (count === 0) return NaN;
  switch (aggregate) {
    case 'min':
      return min;
    case 'max':
      return max;
    case 'mean':
      return sum / count;
    default:
      return numericMedian(finite);
  }
}

/**
 * Sort categories by a value-based `categoryorder` (see the module notes for the exact rules).
 * Other orders return a copy of `categories` unchanged.
 *
 * @param categories - Categories in trace order (first appearance): the tie order.
 * @param values - Values per category name, e.g. from {@link collectCategoryValues}. Categories
 * missing from the map have no values.
 */
export function sortCategoriesByValue(
  categories: readonly string[],
  order: string,
  values: CategoryValues | undefined,
): string[] {
  const parsed = valueCategoryOrder(order);
  if (!parsed) return [...categories];
  const scored = categories.map((c) => ({
    c,
    v: aggregateCategoryValues(parsed.aggregate, values?.get(c)),
  }));
  const valid = scored.filter((s) => !Number.isNaN(s.v));
  // Array#sort is stable, so equal aggregates keep trace order in both directions. Compare rather
  // than subtract: two infinite sums would give NaN.
  const cmp = (a: number, b: number): number => (a < b ? -1 : a > b ? 1 : 0);
  valid.sort(parsed.descending ? (a, b) => cmp(b.v, a.v) : (a, b) => cmp(a.v, b.v));
  const missing = scored.filter((s) => Number.isNaN(s.v));
  return [...valid, ...missing].map((s) => s.c);
}
