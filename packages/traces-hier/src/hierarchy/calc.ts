/**
 * The calc shared by the hierarchy traces (plan E13.1): the trace's rows built into a
 * {@link Hierarchy} (see `build.ts`) with the node colors known before the cross-trace step
 * (colorscale colors, explicit `marker.colors`; see `colors.ts`). Plotly's warnings go to `warn`.
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import { buildHierarchy, type Hierarchy } from './build.ts';
import { calcNodeColors, type ExplicitColors } from './colors.ts';

/** Calcdata of a hierarchy trace. */
export interface HierarchyCalc {
  /** The hierarchy, or `undefined` when the rows do not make one (nothing is drawn). */
  readonly hierarchy: Hierarchy | undefined;
  /** Plotly's warning when the hierarchy could not be built. */
  readonly error: string | undefined;
  /** Nodes are colored by a colorscale (Plotly's `_hasColorscale`). */
  readonly colorscale: boolean;
  /** Valid `marker.colors` entries by node (no colorscale). */
  readonly explicit: ExplicitColors;
}

/** Options of {@link calcHierarchy}. */
export interface HierarchyCalcOptions {
  /** Warning sink (default `console.warn`). */
  readonly warn?: (message: string) => void;
}

/** The name Plotly's warnings give a trace: its `name`, else `trace <index>`. */
export function traceLabel(trace: FullTrace): string {
  return typeof trace.name === 'string' && trace.name ? trace.name : `trace ${trace._index}`;
}

/** Build a hierarchy trace's calcdata (see the module comment). */
export function calcHierarchy(
  trace: FullTrace,
  ctx: { readonly fullLayout?: FullLayout },
  options: HierarchyCalcOptions = {},
): HierarchyCalc {
  const { hierarchy, warnings } = buildHierarchy({
    labels: trace['labels'],
    parents: trace['parents'],
    ids: trace['ids'],
    values: trace['values'],
    branchvalues: trace['branchvalues'],
    count: trace['count'],
    sort: trace['sort'],
    type: trace.type,
    name: traceLabel(trace),
  });
  const warn = options.warn ?? ((m: string) => console.warn(m));
  for (const w of warnings) warn(`[holochart] ${w}`);
  const colorscale = trace['_hasColorscale'] === true;
  return {
    hierarchy,
    error: warnings[0],
    colorscale,
    explicit: hierarchy ? calcNodeColors(trace, hierarchy, ctx.fullLayout, colorscale) : new Map(),
  };
}
