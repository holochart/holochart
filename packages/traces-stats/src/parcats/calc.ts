/**
 * `parcats` calc (plan E10.11), after plotly.js' `parcats/calc.js`: the categories of every visible
 * dimension (in `categoryorder`, labelled by `ticktext`) and the paths — samples aggregated by
 * their category in every visible dimension and their numeric color — weighted by `counts`.
 * Pure and layout-independent: `layout.ts` places everything in px.
 *
 * Every category of `categoryarray` is kept here (with `count` 0 when no sample has it); the
 * layout drops empty categories, which take no room.
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import { isNumericColorArray } from '../parcoords/common.ts';

/** One category of a dimension. */
export interface ParcatsCategory {
  /** Index in the dimension's category order (Plotly's `categoryInd`, its initial display order). */
  readonly index: number;
  readonly value: unknown;
  /** `ticktext` entry, else the value as text. */
  readonly label: string;
  /** Sum of the samples' counts. */
  readonly count: number;
  /** Samples in this category. */
  readonly valueInds: readonly number[];
}

/** One visible dimension. */
export interface ParcatsDimension {
  /** Index among the visible dimensions. */
  readonly index: number;
  /** Index in `dimensions` (Plotly's `containerInd`). */
  readonly container: number;
  /** Display position, 0 = leftmost. */
  readonly display: number;
  readonly label: string;
  readonly categories: readonly ParcatsCategory[];
}

/** One path: the samples with the same category in every dimension and the same color. */
export interface ParcatsPath {
  /** Category index per visible dimension. */
  readonly categories: readonly number[];
  /** The numeric `line.color` value, `undefined` for one plain color. */
  readonly rawColor: number | undefined;
  readonly count: number;
  readonly valueInds: readonly number[];
}

/** Calcdata of a parcats trace. */
export interface ParcatsCalc {
  readonly dimensions: readonly ParcatsDimension[];
  readonly paths: readonly ParcatsPath[];
  /** Sum of all counts. */
  readonly total: number;
  /** `line.color` is numeric (paths are colored through the colorscale). */
  readonly numeric: boolean;
}

/** Category order key of a value (Plotly compares categories as strings). */
const keyOf = (v: unknown): string => String(v);

function isNumberLike(v: unknown): boolean {
  return (
    (typeof v === 'number' && Number.isFinite(v)) ||
    (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)))
  );
}

/** Unique values of a dimension in `categoryorder` (see the module comment). */
export function categoryValues(dim: Record<string, unknown>, length: number): unknown[] {
  const values = dim['values'] as ArrayLike<unknown>;
  const order = dim['categoryorder'];
  const seen = new Set<string>();
  const out: unknown[] = [];
  const add = (v: unknown): void => {
    const k = keyOf(v);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(v);
  };
  if (order === 'array' && isArrayLike(dim['categoryarray'])) {
    Array.from(dim['categoryarray'], add);
  }
  for (let i = 0; i < length; i++) add(values[i]);
  if (order === 'category ascending' || order === 'category descending') {
    if (out.every(isNumberLike)) out.sort((a, b) => Number(a) - Number(b));
    else out.sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
    if (order === 'category descending') out.reverse();
  }
  return out;
}

/** Display positions: `displayindex` when it is a permutation of 0 … n − 1, else visible order. */
export function displayPositions(indices: readonly unknown[]): number[] {
  const sorted = indices.map(Number).sort((a, b) => a - b);
  const ok = sorted.every((v, i) => v === i);
  return indices.map((v, i) => (ok ? Number(v) : i));
}

function countOf(counts: unknown, i: number): number {
  const v = isArrayLike(counts) ? (counts.length ? counts[i % counts.length] : 1) : counts;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Parcats calc. */
export function calcParcats(trace: FullTrace): ParcatsCalc {
  const all = (trace['dimensions'] ?? []) as Record<string, unknown>[];
  const dimsIn = all.filter((d) => d['visible'] !== false);
  const length = Number(trace._length) || 0;
  const line = (trace['line'] ?? {}) as Record<string, unknown>;
  const color = line['color'];
  const numeric = isNumericColorArray(color);
  const counts = trace['counts'];
  const displays = displayPositions(dimsIn.map((d) => d['displayindex']));

  // Category index of every sample, per dimension.
  const cats = dimsIn.map((dim) => {
    const values = categoryValues(dim, length);
    const index = new Map(values.map((v, i) => [keyOf(v), i]));
    const src = dim['values'] as ArrayLike<unknown>;
    const inds = new Int32Array(length);
    for (let i = 0; i < length; i++) inds[i] = index.get(keyOf(src[i]))!;
    return {
      values,
      inds,
      counts: new Float64Array(values.length),
      members: values.map(() => [] as number[]),
    };
  });

  const paths = new Map<
    string,
    { categories: number[]; rawColor: number | undefined; count: number; valueInds: number[] }
  >();
  let total = 0;
  for (let i = 0; i < length; i++) {
    const c = countOf(counts, i);
    total += c;
    const catInds = cats.map((d) => d.inds[i]!);
    cats.forEach((d, k) => {
      d.counts[catInds[k]!]! += c;
      d.members[catInds[k]!]!.push(i);
    });
    const raw = numeric ? Number((color as ArrayLike<unknown>)[i]) : undefined;
    const key = `${catInds.join(',')}|${raw}`;
    let path = paths.get(key);
    if (!path)
      paths.set(key, (path = { categories: catInds, rawColor: raw, count: 0, valueInds: [] }));
    path.count += c;
    path.valueInds.push(i);
  }

  const dimensions = dimsIn.map((dim, d): ParcatsDimension => {
    const info = cats[d]!;
    const ticktext = isArrayLike(dim['ticktext']) ? dim['ticktext'] : [];
    return {
      index: d,
      container: Number(dim['_index']),
      display: displays[d]!,
      label: typeof dim['label'] === 'string' ? dim['label'] : '',
      categories: info.values.map((value, c) => ({
        index: c,
        value,
        label: String(c < ticktext.length && ticktext[c] != null ? ticktext[c] : value),
        count: info.counts[c]!,
        valueInds: info.members[c]!,
      })),
    };
  });
  return { dimensions, paths: [...paths.values()], total, numeric };
}
