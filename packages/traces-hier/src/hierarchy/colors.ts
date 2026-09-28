/**
 * Node colors of hierarchy charts (plan E13.1), following plotly.js' sunburst `calc` (explicit and
 * colorscale colors) and `crossTraceCalc` (defaults):
 *
 * - With a colorscale (numeric `marker.colors`, `marker.colorscale` / `showscale` / … set, or a
 *   shared `marker.coloraxis`), every node is colored by its `marker.colors` entry — or its `values` entry, or its count without
 *   `values`. Valid CSS colors among them are kept; anything else is `#444`.
 * - Otherwise valid `marker.colors` entries are used and registered by node id in a map shared by
 *   every trace of the type (Plotly's `_sunburstcolormap`); the remaining nodes take, in order: the
 *   map's color for their id, their parent's color from the second level on, the next
 *   `<type>colorway` color on the first level (extended with lighter and darker copies by
 *   `extend<type>colors`), and `root.color` for the root.
 */
import {
  isArrayLike,
  isValidColor,
  toRGBA,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
} from '@mk7s/holochart-core';
import type { ColorbarSpec } from '@mk7s/holochart-runtime';
import {
  extendColors,
  hasColorscale,
  mapColor,
  markerColorbar,
  numericExtent,
  resolveColorMapping,
  rgbaToCss,
  supplyColorscaleDefaults,
} from '@mk7s/holochart-traces-basic';
import { buildHierarchy, type Hierarchy, type HierNode } from './build.ts';

/** Plotly's `Color.defaultLine`. */
export const DEFAULT_LINE = '#444';

/** A color as `rgb()` / `rgba()` (Plotly's `Color.addOpacity` of a tinycolor), or `null`. */
export function cssColor(color: unknown): string | null {
  if (!isValidColor(color)) return null;
  const c = toRGBA(color);
  return c ? rgbaToCss(c) : null;
}

function marker(trace: FullTrace): Record<string, unknown> {
  const m = trace['marker'];
  return m !== null && typeof m === 'object' ? (m as Record<string, unknown>) : {};
}

/**
 * Plotly's `_hasColorscale` of a hierarchy trace's input: numeric `marker.colors`, any colorscale
 * attribute of `marker` set, or `marker.coloraxis` (which colors by `values` without colors).
 */
export function hierarchyHasColorscale(traceIn: Readonly<Record<string, unknown>>): boolean {
  const m = traceIn['marker'];
  return (
    hasColorscale(m, 'colors') ||
    (m !== null && typeof m === 'object' && !!(m as Record<string, unknown>)['coloraxis'])
  );
}

/**
 * The value each data index is colored by with a colorscale: `marker.colors` when given, else
 * `values`, else the node counts (Plotly's `trace._values`).
 */
export function colorValues(
  trace: FullTrace,
  hierarchy: Hierarchy | undefined,
): ArrayLike<unknown> {
  const colors = marker(trace)['colors'];
  if (isArrayLike(colors) && colors.length > 0) return colors;
  const values = trace['values'];
  if (isArrayLike(values)) return values;
  const counts: number[] = [];
  if (hierarchy) for (const n of hierarchy.nodes) if (n.i >= 0) counts[n.i] = n.value;
  return counts;
}

/** Explicit node colors (no colorscale), by node, set by {@link calcNodeColors}. */
export type ExplicitColors = ReadonlyMap<HierNode, string>;

/**
 * Colors known after calc: with a colorscale every node's color (written to `node.color`),
 * otherwise the valid `marker.colors` entries (returned; see {@link resolveHierarchyColors}).
 */
export function calcNodeColors(
  trace: FullTrace,
  hierarchy: Hierarchy,
  fullLayout: FullLayout | undefined,
  colorscale: boolean,
): ExplicitColors {
  const explicit = new Map<HierNode, string>();
  if (colorscale) {
    const vals = colorValues(trace, hierarchy);
    const mapping = resolveColorMapping({ ...marker(trace), colors: vals }, fullLayout, 'colors');
    for (const n of hierarchy.nodes) {
      const v = n.i >= 0 ? vals[n.i] : undefined;
      const num = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
      if (mapping && typeof v !== 'boolean' && v !== '' && Number.isFinite(num)) {
        n.color = rgbaToCss(mapColor(num, mapping));
      } else n.color = cssColor(v) ?? DEFAULT_LINE;
    }
    return explicit;
  }
  const colors = marker(trace)['colors'];
  if (!isArrayLike(colors)) return explicit;
  for (const n of hierarchy.nodes) {
    const c = n.i >= 0 ? cssColor(colors[n.i]) : null;
    if (c) explicit.set(n, c);
  }
  return explicit;
}

/** The default node colors of `type` (`<type>colorway`, extended when `extend<type>colors`). */
export function hierarchyColorway(fullLayout: FullLayout, type: string): readonly string[] {
  const way = fullLayout[`${type}colorway`];
  const base: readonly string[] =
    Array.isArray(way) && way.length > 0
      ? (way as string[])
      : fullLayout.colorway.length > 0
        ? fullLayout.colorway
        : [DEFAULT_LINE];
  return fullLayout[`extend${type}colors`] === false ? base : extendColors(base);
}

/** One trace of {@link resolveHierarchyColors}. */
export interface ColorEntry {
  readonly trace: FullTrace;
  readonly hierarchy: Hierarchy | undefined;
  readonly colorscale: boolean;
  readonly explicit: ExplicitColors;
}

/**
 * Resolve the colors of every node of `entries` (the traces of one type, in trace order) that
 * calc left open (Plotly's `crossTraceCalc`, see the module comment). Idempotent.
 */
export function resolveHierarchyColors(
  entries: readonly ColorEntry[],
  fullLayout: FullLayout,
  type: string,
): void {
  const map = new Map<string, string>();
  for (const e of entries) {
    for (const [n, c] of e.explicit) if (!map.has(n.id)) map.set(n.id, c);
  }
  const way = hierarchyColorway(fullLayout, type);
  let count = 0;
  for (const e of entries) {
    if (e.colorscale || !e.hierarchy) continue;
    const rootColor = (e.trace['root'] as { color?: unknown } | undefined)?.color;
    for (const n of e.hierarchy.nodes) {
      const explicit = e.explicit.get(n);
      if (explicit !== undefined) {
        n.color = explicit;
        continue;
      }
      const mapped = map.get(n.id);
      if (mapped !== undefined) n.color = mapped;
      else if (n.parent?.parent) n.color = n.parent.color;
      else if (n.parent) {
        n.color = way[count % way.length] as string;
        count++;
        map.set(n.id, n.color);
      } else n.color = cssColor(rootColor) ?? 'rgba(0, 0, 0, 0)';
    }
  }
}

/**
 * {@link colorValues} of a defaulted trace, building its hierarchy only when nodes are colored by
 * their counts (no `marker.colors` or `values`).
 */
function colorValuesOf(trace: FullTrace): ArrayLike<unknown> {
  const needsCounts = !isArrayLike(marker(trace)['colors']) && !isArrayLike(trace['values']);
  const hierarchy = needsCounts
    ? buildHierarchy({
        labels: trace['labels'],
        parents: trace['parents'],
        ids: trace['ids'],
        count: trace['count'],
        type: trace.type,
        name: '',
      }).hierarchy
    : undefined;
  return colorValues(trace, hierarchy);
}

/**
 * The colorbar of a colorscaled hierarchy trace with `marker.showscale`, or of its color axis (the
 * trace module's `colorbar` hook, E5.3), spanning the values nodes are colored by (see
 * {@link colorValues}).
 */
export function hierarchyColorbar(trace: FullTrace, fullLayout: FullLayout): ColorbarSpec | null {
  if (trace['_hasColorscale'] !== true) return null;
  const m = marker(trace);
  if (m['showscale'] !== true && typeof m['coloraxis'] !== 'string') return null;
  return markerColorbar({ ...trace, marker: { ...m, color: colorValuesOf(trace) } }, fullLayout);
}

/** Trace types colored through {@link colorValues}. */
const HIERARCHY_TYPES = new Set(['sunburst', 'treemap', 'icicle']);

/**
 * Layout defaults for the color axes hierarchy traces reference with `marker.coloraxis` (Plotly's
 * `colorAxisDefaults`, and the extents its sunburst `calc` adds to the axis): coerce each axis and
 * widen its cross-trace `_min` / `_max` with the values the traces' nodes are colored by.
 * Idempotent, and merges with the extents other trace types gave the axis.
 */
export function supplyHierarchyColoraxisDefaults(
  layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  for (const trace of ctx.fullData) {
    const id = marker(trace)['coloraxis'];
    if (trace.visible === false || !HIERARCHY_TYPES.has(trace.type) || typeof id !== 'string') {
      continue;
    }
    const input = layoutIn[id];
    supplyColorscaleDefaults(
      input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : undefined,
      ctx.coerce,
      `${id}.`,
      { inTrace: false, showscale: true },
    );
    const out = layoutOut[id] as Record<string, unknown> | undefined;
    if (out === null || typeof out !== 'object') continue;
    const [lo, hi] = numericExtent(colorValuesOf(trace));
    const min = out['_min'];
    const max = out['_max'];
    out['_min'] = Math.min(lo, typeof min === 'number' ? min : Infinity);
    out['_max'] = Math.max(hi, typeof max === 'number' ? max : -Infinity);
  }
}
