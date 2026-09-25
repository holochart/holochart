/**
 * `parcats` layout (plan E10.11), after plotly.js' `parcats/parcats.js` view models: dimension
 * columns spread over the trace's rect, category bands stacked in each column (sized by count,
 * 8 px apart, fewer categories centered), and paths stacked through the categories in Plotly's
 * sort order (by color when `bundlecolors`, then by their categories from the left or right).
 * Everything is in container px (top-left origin). Pure: the view and `hoverPoints` share one
 * memoized layout per calc ({@link layoutFor}).
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import { lineColorMapping, mappedCss } from '../parcoords/common.ts';
import type { ParcatsCalc } from './calc.ts';

/** Plotly's `categoryLabelPad`, `dimWidth` and `catSpacing`. */
export const PAD = 40;
export const DIM_WIDTH = 16;
export const CAT_SPACING = 8;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A display order: dimensions left to right, and per dimension its non-empty categories. */
export interface ParcatsOrder {
  /** Visible dimension indices, left to right. */
  readonly dims: readonly number[];
  /** Per visible dimension (by index): its non-empty category indices, top to bottom. */
  readonly cats: readonly (readonly number[])[];
}

/** View state: a reordering (dragged or awaiting its restyle) and the dragged element's position. */
export interface ParcatsState {
  readonly order?: ParcatsOrder;
  readonly drag?: {
    readonly dim: number;
    readonly cat?: number;
    readonly x?: number;
    readonly y?: number;
  };
}

/** A run of same-colored paths in one category. */
export interface Band {
  y: number;
  height: number;
  count: number;
  readonly color: string;
  readonly rawColor: number | undefined;
  /** Calc path indices. */
  readonly paths: number[];
}

export interface CatBox {
  readonly dim: number;
  readonly cat: number;
  readonly x: number;
  readonly y: number;
  readonly height: number;
  /** Position in its column, 0 = top. */
  readonly display: number;
  readonly label: string;
  readonly count: number;
  readonly bands: Band[];
}

export interface DimBox {
  readonly dim: number;
  readonly container: number;
  /** Left edge. */
  readonly x: number;
  readonly display: number;
  readonly label: string;
  /** Categories, top to bottom. */
  readonly cats: readonly CatBox[];
}

export interface PathBox {
  /** Calc path index. */
  readonly index: number;
  /** Top of the path at each dimension, in display order. */
  readonly ys: readonly number[];
  readonly height: number;
  readonly color: string;
  readonly rawColor: number | undefined;
  readonly count: number;
}

export interface ParcatsLayout {
  readonly calc: ParcatsCalc;
  readonly rect: Rect;
  readonly trace: FullTrace;
  readonly key: string;
  readonly order: ParcatsOrder;
  /** Dimensions, left to right. */
  readonly dims: readonly DimBox[];
  /** Non-empty paths in draw order (by `rawColor`, the last on top). */
  readonly paths: readonly PathBox[];
  /** 0 (`linear`) or 0.5 (`hspline`). */
  readonly curvature: number;
}

/** The order from calc: `displayindex` and category order, empty categories left out. */
export function defaultOrder(calc: ParcatsCalc): ParcatsOrder {
  return {
    dims: calc.dimensions
      .map((d) => d.index)
      .sort((a, b) => calc.dimensions[a]!.display - calc.dimensions[b]!.display),
    cats: calc.dimensions.map((d) => d.categories.filter((c) => c.count > 0).map((c) => c.index)),
  };
}

/** Whether a sort key entry is comparable (a number, not NaN). */
const comparable = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v);

/** Plotly's path order: element-wise, incomparable entries last, shorter keys first. */
export function compareKeys(a: readonly unknown[], b: readonly unknown[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    const cx = comparable(x);
    const cy = comparable(y);
    if (cx !== cy) return cx ? -1 : 1;
    if (cx && cy && x !== y) return x - (y as number);
  }
  return a.length - b.length;
}

const sameColor = (a: number | undefined, b: number | undefined): boolean =>
  a === b || (a !== a && b !== b);

/** CSS color of every calc path: its colorscale color, or the plain `line.color`. */
export function pathColors(
  calc: ParcatsCalc,
  trace: FullTrace,
  fullLayout: FullLayout | undefined,
): string[] {
  const color = ((trace['line'] ?? {}) as Record<string, unknown>)['color'];
  const mapping = calc.numeric ? lineColorMapping(trace, fullLayout) : undefined;
  const plain = typeof color === 'string' ? color : '#444';
  return calc.paths.map((p) =>
    mapping ? mappedCss(Number.isFinite(p.rawColor) ? p.rawColor! : mapping.cmin, mapping) : plain,
  );
}

/** Lay a parcats trace out in `rect` (see the module comment). */
export function layoutParcats(
  calc: ParcatsCalc,
  trace: FullTrace,
  fullLayout: FullLayout | undefined,
  rect: Rect,
  state: ParcatsState = {},
): ParcatsLayout {
  const order = state.order ?? defaultOrder(calc);
  const drag = state.drag;
  const n = order.dims.length;
  const dimDx = n > 1 ? (rect.width - 2 * PAD - DIM_WIDTH) / (n - 1) : 0;
  let maxCats = 1;
  for (const d of order.dims) maxCats = Math.max(maxCats, order.cats[d]?.length ?? 0);
  const scale =
    calc.total > 0 ? Math.max(0, rect.height - CAT_SPACING * (maxCats - 1)) / calc.total : 0;
  const colors = pathColors(calc, trace, fullLayout);

  const slots: Map<number, { box: CatBox; next: number }>[] = [];
  const dims = order.dims.map((d, display): DimBox => {
    const dim = calc.dimensions[d]!;
    const dragged = drag?.dim === d;
    const x = dragged && drag.x !== undefined ? drag.x : rect.x + PAD + dimDx * display;
    const list = order.cats[d] ?? [];
    let y = rect.y + ((maxCats - list.length) * CAT_SPACING) / 2;
    const slot = new Map<number, { box: CatBox; next: number }>();
    const cats = list.map((c, k): CatBox => {
      const cat = dim.categories[c]!;
      const height = cat.count * scale;
      const top = dragged && drag.cat === c && drag.y !== undefined ? drag.y : y;
      y += height + CAT_SPACING;
      const box: CatBox = {
        dim: d,
        cat: c,
        x,
        y: top,
        height,
        display: k,
        label: cat.label,
        count: cat.count,
        bands: [],
      };
      slot.set(c, { box, next: top });
      return box;
    });
    slots.push(slot);
    return { dim: d, container: dim.container, x, display, label: dim.label, cats };
  });

  // Stack the paths through the categories in Plotly's sort order.
  const bundle = trace['bundlecolors'] !== false;
  const seq = trace['sortpaths'] === 'backward' ? [...order.dims].reverse() : order.dims;
  const rank = (d: number, c: number): number => order.cats[d]?.indexOf(c) ?? -1;
  const live = calc.paths.map((_, i) => i).filter((i) => calc.paths[i]!.count > 0);
  const keys = new Map(
    live.map((i) => {
      const p = calc.paths[i]!;
      const key: unknown[] = bundle ? [p.rawColor] : [];
      for (const d of seq) key.push(rank(d, p.categories[d]!));
      key.push(p.valueInds[0]);
      return [i, key] as const;
    }),
  );
  live.sort((a, b) => compareKeys(keys.get(a)!, keys.get(b)!));
  const boxes = live.map((i): PathBox => {
    const p = calc.paths[i]!;
    const height = p.count * scale;
    const ys = dims.map((dim, k) => {
      const slot = slots[k]!.get(p.categories[dim.dim]!);
      if (!slot) return rect.y;
      const y = slot.next;
      slot.next += height;
      const bands = slot.box.bands;
      const last = bands[bands.length - 1];
      if (last && sameColor(last.rawColor, p.rawColor)) {
        last.height += height;
        last.count += p.count;
        last.paths.push(i);
      } else {
        bands.push({
          y,
          height,
          count: p.count,
          color: colors[i]!,
          rawColor: p.rawColor,
          paths: [i],
        });
      }
      return y;
    });
    return { index: i, ys, height, color: colors[i]!, rawColor: p.rawColor, count: p.count };
  });
  // Draw order: by color value, so the highest values are on top (stable otherwise).
  const paths = boxes
    .map((b, k) => [b, k] as const)
    .sort((a, b) => compareKeys([a[0].rawColor], [b[0].rawColor]) || a[1] - b[1])
    .map((e) => e[0]);
  return {
    calc,
    rect,
    trace,
    key: JSON.stringify(state),
    order,
    dims,
    paths,
    curvature:
      trace['line'] && (trace['line'] as Record<string, unknown>)['shape'] === 'hspline' ? 0.5 : 0,
  };
}

const cache = new WeakMap<ParcatsCalc, ParcatsLayout>();

const sameRect = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/**
 * The memoized layout of `calc`. With `state` (the view), it is laid out for that state; without
 * (hover), the view's last layout is reused when it is for the same trace and rect.
 */
export function layoutFor(
  calc: ParcatsCalc,
  trace: FullTrace,
  fullLayout: FullLayout | undefined,
  rect: Rect,
  state?: ParcatsState,
): ParcatsLayout {
  const hit = cache.get(calc);
  if (
    hit &&
    hit.trace === trace &&
    sameRect(hit.rect, rect) &&
    (state === undefined || hit.key === JSON.stringify(state))
  ) {
    return hit;
  }
  const out = layoutParcats(calc, trace, fullLayout, rect, state);
  cache.set(calc, out);
  return out;
}

function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Bezier control x of the gap from `a` to `b` (Plotly's `x1` / `x2`). */
export function controls(a: number, b: number, curvature: number): [number, number] {
  return [a + curvature * (b - a), a + (1 - curvature) * (b - a)];
}

/**
 * Outline of a path ribbon (Plotly's `buildSvgPath`): along the top edge through every column,
 * down by `h`, back along the bottom. Curves (hspline) are flattened to `segments` per gap; a
 * linear path has straight gaps.
 */
export function pathOutline(
  xs: readonly number[],
  ys: readonly number[],
  h: number,
  curvature: number,
  segments = 12,
): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  const w = DIM_WIDTH;
  const gap = (x0: number, y0: number, x3: number, y3: number, c1: number, c2: number): void => {
    if (curvature > 0) {
      for (let s = 1; s < segments; s++) {
        const t = s / segments;
        x.push(cubic(x0, c1, c2, x3, t));
        y.push(cubic(y0, y0, y3, y3, t));
      }
    }
    x.push(x3);
    y.push(y3);
  };
  const last = xs.length - 1;
  x.push(xs[0]!, xs[0]! + w);
  y.push(ys[0]!, ys[0]!);
  for (let d = 1; d <= last; d++) {
    const [x1, x2] = controls(xs[d - 1]! + w, xs[d]!, curvature);
    gap(xs[d - 1]! + w, ys[d - 1]!, xs[d]!, ys[d]!, x1, x2);
    x.push(xs[d]! + w);
    y.push(ys[d]!);
  }
  x.push(xs[last]! + w, xs[last]!);
  y.push(ys[last]! + h, ys[last]! + h);
  for (let d = last - 1; d >= 0; d--) {
    const [x1, x2] = controls(xs[d]! + w, xs[d + 1]!, curvature);
    gap(xs[d + 1]!, ys[d + 1]! + h, xs[d]! + w, ys[d]! + h, x2, x1);
    x.push(xs[d]!);
    y.push(ys[d]! + h);
  }
  return { x, y };
}

/** Top of a path at container `x` in the gap after display position `k` (clamped to the gap). */
export function pathTopAt(layout: ParcatsLayout, path: PathBox, k: number, x: number): number {
  const a = layout.dims[k]!.x + DIM_WIDTH;
  const b = layout.dims[k + 1]!.x;
  const y0 = path.ys[k]!;
  const y1 = path.ys[k + 1]!;
  let t = b > a ? Math.max(0, Math.min(1, (x - a) / (b - a))) : 0;
  if (layout.curvature > 0 && b > a) {
    // The curve's x is monotonic in t: bisect for the t at x.
    const [c1, c2] = controls(a, b, layout.curvature);
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      t = (lo + hi) / 2;
      if (cubic(a, c1, c2, b, t) < x) lo = t;
      else hi = t;
    }
  }
  return cubic(y0, y0, y1, y1, t);
}

/** What is under a container point. */
export type ParcatsHit =
  | { readonly kind: 'category'; readonly dim: DimBox; readonly cat: CatBox; readonly band?: Band }
  | { readonly kind: 'path'; readonly path: PathBox; readonly gap: number };

/** The category (within `tol` px) or else the topmost path under `(x, y)`. */
export function hitTest(
  layout: ParcatsLayout,
  x: number,
  y: number,
  tol = 0,
): ParcatsHit | undefined {
  for (const dim of layout.dims) {
    if (x < dim.x - tol || x > dim.x + DIM_WIDTH + tol) continue;
    for (const cat of dim.cats) {
      if (y < cat.y - tol || y > cat.y + cat.height + tol) continue;
      const band = cat.bands.find((b) => y >= b.y && y <= b.y + b.height);
      return { kind: 'category', dim, cat, ...(band ? { band } : {}) };
    }
  }
  const dims = layout.dims;
  for (let k = 0; k + 1 < dims.length; k++) {
    if (x < dims[k]!.x + DIM_WIDTH - 2 || x > dims[k + 1]!.x + 2) continue;
    for (let i = layout.paths.length - 1; i >= 0; i--) {
      const path = layout.paths[i]!;
      const top = pathTopAt(layout, path, k, x);
      if (y >= top && y <= top + path.height) return { kind: 'path', path, gap: k };
    }
  }
  return undefined;
}
