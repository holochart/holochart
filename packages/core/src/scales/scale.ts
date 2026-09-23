/**
 * Scale implementations (plan E3.1): `linear`, `log`, `date`, `category` and `multicategory`.
 *
 * Every type is affine from linear space to pixels; the types differ only in how data and range
 * values reach linear space (see `types.ts`). Conversions follow Plotly's `set_convert`:
 *
 * - linear/log accept numbers and numeric strings, ignoring the junk Plotly ignores (`'$1,000'`);
 * - date accepts ms numbers, `Date`s, ISO strings, bare years (`'2024'`) and numeric strings (ms).
 *   Unlike Plotly, a *number* on a date axis is always ms (Plotly reads numbers below 10000 as
 *   years) — the same convention as data ingestion (E1.6);
 * - category/multicategory look values up in a fixed category list; unknown values are NaN.
 */
import { formatDate, isValidDate, parseDate } from '../data/dates.ts';
import type { AxisType, Scale, ScaleOptions } from './types.ts';

// Leading/trailing quotes, %, $, # and whitespace, and embedded commas/spaces (Plotly's `JUNK`).
const JUNK = /^['"%,$#\s]+|[, ]|['"%,$#\s]+$/g;
const YEAR_ONLY = /^\s*(-?\d{4})\s*$/;

/**
 * Plotly's `cleanNumber`: a finite number from a number or a numeric string (ignoring currency
 * and thousands junk such as `'$1,200'`), else NaN.
 */
export function cleanNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const s = v.replace(JUNK, '');
  if (s === '') return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** A date value (ms, `Date`, ISO string, bare year, numeric string) → ms since epoch, or NaN. */
export function dateToMs(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (isValidDate(v)) return v.getTime();
  if (typeof v !== 'string') return NaN;
  const ms = parseDate(v);
  if (ms !== undefined) return ms;
  const year = YEAR_ONLY.exec(v);
  if (year) return parseDate(`${year[1]}-01`) ?? NaN;
  return cleanNumber(v);
}

const warned = new Set<string>();

/** Process-wide warn-once, so a log axis re-created on every relayout warns a single time. */
function defaultWarn(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[holochart] ${message}`);
}

/** Key of a multicategory pair in the lookup map (NUL cannot appear in user category text). */
function pairKey(group: unknown, item: unknown): string {
  return `${String(group)}\u0000${String(item)}`;
}

function isValidCategory(v: unknown): boolean {
  return v !== null && v !== undefined && v !== '';
}

function isArrayLikeValue(v: unknown): v is ArrayLike<unknown> {
  return Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView));
}

/** True for multicategory data given as two rows `[[groups], [items]]`. */
export function isTwoLevel(
  values: unknown,
): values is readonly [ArrayLike<unknown>, ArrayLike<unknown>] {
  return (
    isArrayLikeValue(values) &&
    values.length === 2 &&
    isArrayLikeValue(values[0]) &&
    isArrayLikeValue(values[1])
  );
}

type Converter = (v: unknown) => number;

/**
 * Create a scale.
 *
 * @example
 * ```ts
 * const s = createScale({ type: 'log', range: [0, 3], length: 300 });
 * s.d2l(100);  // 2
 * s.d2p(100);  // 200
 * ```
 */
export function createScale(options: ScaleOptions): Scale {
  const type: AxisType = options.type;
  let r0 = options.range?.[0] ?? 0;
  let r1 = options.range?.[1] ?? 1;
  let length = options.length ?? 1;
  const warnFn = options.onWarning;
  const seenWarnings = new Set<string>();
  const warn = (message: string): void => {
    if (!warnFn) return defaultWarn(message);
    if (seenWarnings.has(message)) return;
    seenWarnings.add(message);
    warnFn(message);
  };

  const categories: readonly string[] =
    type === 'category' ? (options.categories ?? []).map(String) : [];
  const multicategories: readonly (readonly [string, string])[] =
    type === 'multicategory'
      ? (
          options.multicategories ??
          // Plain `categories` on a multicategory axis: one group per category.
          (options.categories ?? []).map((c): readonly [string, string] => ['', String(c)])
        ).map(([g, i]): readonly [string, string] => [String(g), String(i)])
      : [];
  const catIndex = new Map<string, number>();
  categories.forEach((c, i) => {
    if (!catIndex.has(c)) catIndex.set(c, i);
  });
  multicategories.forEach(([g, it], i) => {
    const key = pairKey(g, it);
    if (!catIndex.has(key)) catIndex.set(key, i);
  });

  const categoryD2l: Converter = (v) => {
    if (!isValidCategory(v)) return NaN;
    return catIndex.get(String(v)) ?? NaN;
  };
  const pairD2l = (group: unknown, item: unknown): number => {
    if (!isValidCategory(group) || !isValidCategory(item)) return NaN;
    return catIndex.get(pairKey(group, item)) ?? NaN;
  };
  const multiD2l: Converter = (v) =>
    isArrayLikeValue(v) && v.length >= 2 ? pairD2l(v[0], v[1]) : NaN;
  const logD2l: Converter = (v) => {
    const n = cleanNumber(v);
    return n > 0 ? Math.log10(n) : NaN;
  };

  let d2l: Converter;
  let r2l: Converter;
  let l2d: (l: number) => number | string;
  let l2r: (l: number) => number | string;
  switch (type) {
    case 'log':
      d2l = logD2l;
      // Plotly: log ranges (and tick0) are already exponents.
      r2l = cleanNumber;
      l2d = (l) => 10 ** l;
      l2r = (l) => l;
      break;
    case 'date':
      d2l = dateToMs;
      r2l = dateToMs;
      l2d = (l) => l;
      l2r = (l) => formatDate(l) ?? l;
      break;
    case 'category':
    case 'multicategory': {
      d2l = type === 'category' ? categoryD2l : multiD2l;
      // Ranges may be fractional indices (`[-0.5, 3.5]`) or category names.
      r2l = (v) => {
        const idx = type === 'category' ? categoryD2l(v) : multiD2l(v);
        return Number.isNaN(idx) ? cleanNumber(v) : idx;
      };
      const count = type === 'category' ? categories.length : multicategories.length;
      l2d = (l) => {
        const i = Math.round(l);
        if (i < 0 || i >= count) return l;
        return type === 'category' ? (categories[i] as string) : (multicategories[i]?.[1] ?? l);
      };
      l2r = (l) => l;
      break;
    }
    default:
      d2l = cleanNumber;
      r2l = cleanNumber;
      l2d = (l) => l;
      l2r = (l) => l;
  }

  const slope = (): number => length / (r1 - r0 || 1);

  function d2lArray(values: ArrayLike<unknown>, out?: Float64Array): Float64Array {
    if (type === 'multicategory' && isTwoLevel(values)) {
      const [groups, items] = values;
      const n = Math.min(groups.length, items.length);
      const o = target(out, n);
      for (let i = 0; i < n; i++) o[i] = pairD2l(groups[i], items[i]);
      return o;
    }
    const n = values.length;
    const o = target(out, n);
    const typed = ArrayBuffer.isView(values);
    if (typed && (type === 'linear' || type === 'date')) {
      // Typed arrays hold numbers only: one native copy, no per-element dispatch.
      o.set(values as unknown as ArrayLike<number>);
      return o;
    }
    if (type === 'log') {
      let bad = 0;
      for (let i = 0; i < n; i++) {
        const v = values[i];
        const x = typeof v === 'number' ? v : cleanNumber(v);
        if (x > 0) o[i] = Math.log10(x);
        else {
          o[i] = NaN;
          if (x <= 0) bad++;
        }
      }
      if (bad > 0) {
        warn('Non-positive values cannot be shown on a log axis and were left out.');
      }
      return o;
    }
    if (type === 'linear') {
      for (let i = 0; i < n; i++) {
        const v = values[i];
        o[i] = typeof v === 'number' ? (Number.isFinite(v) ? v : NaN) : cleanNumber(v);
      }
      return o;
    }
    for (let i = 0; i < n; i++) o[i] = d2l(values[i]);
    return o;
  }

  const scale: Scale = {
    type,
    d2l: (v) => d2l(v),
    d2lArray,
    l2d: (l) => l2d(l),
    r2l: (v) => r2l(v),
    l2r: (l) => l2r(l),
    get range() {
      return [r0, r1] as const;
    },
    setRange(a, b) {
      r0 = a;
      r1 = b;
    },
    get length() {
      return length;
    },
    setLength(px) {
      length = px;
    },
    l2p: (l) => (l - r0) * slope(),
    p2l: (p) => r0 + p / slope(),
    d2p: (v) => (d2l(v) - r0) * slope(),
    p2d: (p) => l2d(r0 + p / slope()),
    affine() {
      const m = slope();
      return { m, b: -r0 * m };
    },
    categories,
    multicategories,
  };
  return scale;
}

function target(out: Float64Array | undefined, n: number): Float64Array {
  if (out === undefined) return new Float64Array(n);
  if (out.length < n) {
    throw new RangeError(`d2lArray: output has ${out.length} slots but ${n} values were given`);
  }
  return out;
}
