/**
 * Axes and subplots created by `splom` traces (plan E10.9; Plotly's `fullLayout._splomAxes`,
 * `_splomSubplots` and `_splomGridDflt`, filled by `splom/defaults.js` and read by the cartesian
 * axis, constraint and grid defaults).
 *
 * A splom trace draws one scatter plot per pair of dimensions, so it creates one x axis and one y
 * axis per dimension and one cartesian subplot per cell, none of which its own `xaxis` / `yaxis`
 * could name. Its `supplyDefaults` records them here with {@link stashSplomAxis} and
 * {@link stashSplomSubplot}; then, as in Plotly:
 *
 * - the subplots and axes exist (`supplyCartesianAxes`), typed from the dimension's values when the
 *   axis `type` is `'-'`;
 * - each axis' `title.text` defaults to the dimension `label`, its `type` to the dimension's
 *   `axis.type`, and its `matches` to the dimension's other axis with `axis.matches`;
 * - without a `layout.grid` holding cell contents, the axes are laid out as a grid (`xaxes` /
 *   `yaxes` in dimension order), with the axes at the grid's bottom and left edges when the lower
 *   half or the diagonal is hidden ({@link splomGridFallback}).
 *
 * The stash lives on the (new every pass) `fullLayout`, so it never goes stale.
 */
import type { FullLayout, FullTrace } from './types.ts';

/** What one splom dimension says about one of its axes (Plotly's `_splomAxes[letter][id]`). */
export interface SplomAxisStash {
  /** Default `title.text`: the dimension's `label`. */
  label: string;
  /** Default `type`: the dimension's `axis.type`, when set. */
  type?: string;
  /** Default `matches`: the dimension's axis of the other letter (`axis.matches: true`). */
  matches?: string;
  /** Values that type the axis when its `type` is `'-'` (the dimension's `values`). */
  data?: unknown;
  /** The splom trace the axis belongs to (the first one that named it). */
  trace: FullTrace;
}

/** Axis and grid defaults recorded by splom traces during one supply-defaults pass. */
export interface SplomStash {
  /** Axes by letter, then axis id, in the order the dimensions named them. */
  axes: { x: Record<string, SplomAxisStash>; y: Record<string, SplomAxisStash> };
  /** Cartesian subplot ids of every drawn cell (`'x2y3'`), in order. */
  subplots: string[];
  /** Grid side defaults: axes at the grid's edges instead of the bottom / left cells. */
  gridDflt: { xside?: 'bottom'; yside?: 'left' };
}

const AXES_KEY = '_splomAxes';
const SUBPLOTS_KEY = '_splomSubplots';
const GRID_KEY = '_splomGridDflt';

/** The splom stash of `fullLayout`, or `undefined` when no splom trace recorded anything. */
export function getSplomStash(fullLayout: FullLayout): SplomStash | undefined {
  const axes = fullLayout[AXES_KEY] as SplomStash['axes'] | undefined;
  if (!axes) return undefined;
  return {
    axes,
    subplots: (fullLayout[SUBPLOTS_KEY] as string[] | undefined) ?? [],
    gridDflt: (fullLayout[GRID_KEY] as SplomStash['gridDflt'] | undefined) ?? {},
  };
}

function ensureStash(fullLayout: FullLayout): SplomStash {
  if (!fullLayout[AXES_KEY]) {
    fullLayout[AXES_KEY] = { x: {}, y: {} };
    fullLayout[SUBPLOTS_KEY] = [];
    fullLayout[GRID_KEY] = {};
  }
  return getSplomStash(fullLayout) as SplomStash;
}

/**
 * Record an axis of a splom dimension (Plotly's `fillAxisStashes`): the first trace that names an
 * axis decides its defaults. Returns whether this call created the entry.
 */
export function stashSplomAxis(fullLayout: FullLayout, id: string, entry: SplomAxisStash): boolean {
  const stash = ensureStash(fullLayout);
  const byId = id.charAt(0) === 'x' ? stash.axes.x : stash.axes.y;
  if (Object.hasOwn(byId, id)) return false;
  byId[id] = entry;
  return true;
}

/** Record a drawn cell (cartesian subplot id such as `'x2y3'`). */
export function stashSplomSubplot(fullLayout: FullLayout, id: string): void {
  const stash = ensureStash(fullLayout);
  if (!stash.subplots.includes(id)) stash.subplots.push(id);
}

/**
 * Put the splom axes at the grid edges (`xside: 'bottom'`, `yside: 'left'`): Plotly does this when
 * the lower half is hidden or only the diagonal is, so the axes stay on the left / bottom.
 */
export function stashSplomGridSides(fullLayout: FullLayout): void {
  const stash = ensureStash(fullLayout);
  stash.gridDflt.xside = 'bottom';
  stash.gridDflt.yside = 'left';
}

/** Per-axis default overrides from the stash: `title.text` (the label) and `type`. */
export function splomAxisOverrides(fullLayout: FullLayout): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  const stash = getSplomStash(fullLayout);
  if (!stash) return out;
  for (const byId of [stash.axes.x, stash.axes.y]) {
    for (const [id, s] of Object.entries(byId)) {
      const o: Record<string, unknown> = { 'title.text': s.label };
      if (s.type !== undefined) o['type'] = s.type;
      out.set(id, o);
    }
  }
  return out;
}

/** Default `matches` per axis id (the user's `matches` wins; loops are dropped as usual). */
export function splomMatchDefaults(fullLayout: FullLayout): Map<string, string> {
  const out = new Map<string, string>();
  const stash = getSplomStash(fullLayout);
  if (!stash) return out;
  for (const byId of [stash.axes.x, stash.axes.y]) {
    for (const [id, s] of Object.entries(byId)) if (s.matches) out.set(id, s.matches);
  }
  return out;
}

/** Cell contents and sides a splom gives `layout.grid` when the user's grid names none. */
export interface GridFallback {
  readonly xaxes: readonly string[];
  readonly yaxes: readonly string[];
  readonly xside?: string;
  readonly yside?: string;
}

/**
 * The grid the splom axes make (Plotly's grid `getAxes` reading `_splomAxes`, and
 * `_splomGridDflt`): one column per x axis and one row per y axis, in dimension order (row 0 on
 * top). `undefined` without splom axes.
 */
export function splomGridFallback(fullLayout: FullLayout): GridFallback | undefined {
  const stash = getSplomStash(fullLayout);
  if (!stash) return undefined;
  const xaxes = Object.keys(stash.axes.x);
  const yaxes = Object.keys(stash.axes.y);
  if (xaxes.length === 0 && yaxes.length === 0) return undefined;
  return {
    xaxes,
    yaxes,
    ...(stash.gridDflt.xside ? { xside: stash.gridDflt.xside } : {}),
    ...(stash.gridDflt.yside ? { yside: stash.gridDflt.yside } : {}),
  };
}
