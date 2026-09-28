/**
 * The drill-down transition of `treemap` and `icicle` (plan E13.3, E13.4), ported from plotly.js'
 * `traces/treemap/plot_one.js` (`makeUpdateSliceInterpolator`, `makeExitSliceInterpolator`,
 * `findClosestEdge`): where each tile starts and ends when the entry changes, matched by id.
 *
 * - Tiles drawn before (hidden ones below `maxdepth` too, collapsed at their center) move from
 *   where they were.
 * - New tiles start at their place pushed out to the edges of the previous entry's new tile (the
 *   whole domain when drilling in), so they slide in from the sides; a new entry is in place at
 *   once (treemap) or grows from the root side (icicle).
 * - Leaving tiles are pushed out to the edges of the new entry's old tile (drilling in), or vanish.
 * - Path bar segments slide in from its right end and leave the same way.
 *
 * Rects are px relative to the domain, y down; everything interpolates linearly.
 */
import type { HierNode } from '../hierarchy/build.ts';
import { isHierarchyRoot } from '../hierarchy/levels.ts';

/** A rect at one moment. */
export interface RectState {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

/** How one rect moves: `from` → `to`. */
export interface RectTween {
  readonly from: RectState;
  readonly to: RectState;
}

/** A transition's plan: one tween per new rect (in their order) and the old ones leaving. */
export interface RectTweenPlan {
  readonly update: readonly RectTween[];
  /** Old rects without a new one (by index in the drawn list), drawn below the others. */
  readonly exit: readonly (RectTween & { readonly index: number })[];
}

/** A drawn rect and its node's key (Plotly's `getKey`: `''` for the hierarchy root). */
export interface DrawnRect extends RectState {
  readonly key: string;
}

/** Plotly's `getKey`. */
export function rectKey(node: HierNode): string {
  return isHierarchyRoot(node) ? '' : node.id;
}

export function stateOf(r: RectState): RectState {
  return { x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1 };
}

/** `a` → `b` at `t` (0–1). */
export function lerpRect(a: RectState, b: RectState, t: number): RectState {
  const l = (p: number, q: number): number => p + (q - p) * t;
  return { x0: l(a.x0, b.x0), x1: l(a.x1, b.x1), y0: l(a.y0, b.y0), y1: l(a.y1, b.y1) };
}

/**
 * Plotly's `findClosestEdge`: `r` with the sides beyond `ref` (within `e`, the tiling padding)
 * pushed to the domain's edges (`width` × `height`); `r` itself when it is `ref`.
 */
export function closestEdge(
  r: RectState,
  ref: RectState,
  e: number,
  width: number,
  height: number,
): RectState {
  if (r.x0 === ref.x0 && r.x1 === ref.x1 && r.y0 === ref.y0 && r.y1 === ref.y1) return stateOf(r);
  const x = (v: number, d: number): number =>
    v + d - e <= ref.x0 ? 0 : v + d + e >= ref.x1 ? width : v;
  const y = (v: number, d: number): number =>
    v + d - e <= ref.y0 ? 0 : v + d + e >= ref.y1 ? height : v;
  return { x0: x(r.x0, -e), x1: x(r.x1, e), y0: y(r.y0, -e), y1: y(r.y1, e) };
}

/** The tiles side of a transition (see {@link planRectTween}). */
export interface TileTweenInput {
  /** What was drawn, and the key of the entry then. */
  readonly prev: readonly DrawnRect[];
  readonly prevEntry: string | undefined;
  /** The new tiles and entry. */
  readonly next: readonly (RectState & { readonly node: HierNode })[];
  readonly entry: HierNode;
  /** `tiling.pad`, and the domain size. */
  readonly pad: number;
  readonly width: number;
  readonly height: number;
  /** Icicles grow a new entry from the root side: `'h'` / `'v'` and the flips. */
  readonly icicle?: {
    readonly orientation: string;
    readonly flipX: boolean;
    readonly flipY: boolean;
  };
}

function byKey(rects: readonly DrawnRect[]): Map<string, DrawnRect> {
  const map = new Map<string, DrawnRect>();
  for (const r of rects) if (!map.has(r.key)) map.set(r.key, r);
  return map;
}

/** Plan the tile transition (see the module comment). */
export function planRectTween(input: TileTweenInput): RectTweenPlan {
  const { next, entry, pad: e, width, height, icicle } = input;
  const prevByKey = byKey(input.prev);
  const nextKeys = new Set<string>();
  let nextOfPrevEntry: RectState | undefined;
  for (const r of next) {
    const key = rectKey(r.node);
    nextKeys.add(key);
    if (!nextOfPrevEntry && key === input.prevEntry) nextOfPrevEntry = r;
  }
  const ref = nextOfPrevEntry ?? { x0: 0, x1: width, y0: 0, y1: height };

  const update = next.map((r): RectTween => {
    const to = stateOf(r);
    const was = prevByKey.get(rectKey(r.node));
    if (was) return { from: stateOf(was), to };
    if (r.node !== entry) return { from: closestEdge(r, ref, e, width, height), to };
    if (!icicle) return { from: to, to };
    const { orientation, flipX, flipY } = icicle;
    if (orientation === 'h') return { from: flipX ? { ...to, x0: to.x1 } : { ...to, x1: 0 }, to };
    return { from: flipY ? { ...to, y0: to.y1 } : { ...to, y1: 0 }, to };
  });

  const entryPrev = prevByKey.get(rectKey(entry));
  const exit: (RectTween & { index: number })[] = [];
  if (entryPrev) {
    input.prev.forEach((p, index) => {
      if (nextKeys.has(p.key)) return;
      exit.push({ index, from: stateOf(p), to: closestEdge(p, entryPrev, e, width, height) });
    });
  }
  return { update, exit };
}

/**
 * The path bar side: kept segments move, new ones come from the bar's right end (`origin`), and
 * leaving ones go there.
 */
export function planPathbarTween(
  prev: readonly DrawnRect[],
  next: readonly (RectState & { readonly node: HierNode })[],
  origin: RectState,
): RectTweenPlan {
  const prevByKey = byKey(prev);
  const nextKeys = new Set(next.map((s) => rectKey(s.node)));
  return {
    update: next.map((s) => ({
      from: stateOf(prevByKey.get(rectKey(s.node)) ?? origin),
      to: stateOf(s),
    })),
    exit: prev.flatMap((p, index) =>
      nextKeys.has(p.key) ? [] : [{ index, from: stateOf(p), to: origin }],
    ),
  };
}
