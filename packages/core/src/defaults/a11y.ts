/**
 * Accessibility defaults (plan E17.5): pattern fills as an encoding redundant with color
 * (`config.a11y.patterns`) and the reduced-motion switch (`config.a11y.reducedMotion`).
 */
import { getIn } from '../path/path.ts';
import type { ObjectNode } from '../schema/types.ts';
import { getNodeAtPath } from '../schema/walk.ts';
import { deepMerge } from '../util/objects.ts';

/**
 * Pattern shapes `config.a11y.patterns` hands out, in order: neighbours differ in direction or
 * texture, so two adjacent traces (or slices) never get mirror-image hatches.
 */
export const A11Y_PATTERN_SHAPES = ['/', '.', '\\', 'x', '-', '+', '|'] as const;

/** The pattern `config.a11y.patterns` adds: the shape overlaid on the trace color. */
function pattern(shape: unknown): Record<string, unknown> {
  return { shape, fillmode: 'overlay' };
}

/** Points of a pie-like input trace: one pattern per slice (by input index, Plotly's arrays). */
function pointCount(traceIn: Readonly<Record<string, unknown>>): number {
  for (const key of ['labels', 'values']) {
    const v = traceIn[key] as { length?: unknown } | null | undefined;
    if (typeof v?.length === 'number') return v.length;
  }
  return 0;
}

/**
 * The trace template of one trace with an `a11y.patterns` pattern merged in, when the trace
 * type has one (`marker.pattern` or `fillpattern` in `schema`) and neither the trace nor its
 * template sets that pattern's shape: one shape per trace, the `next()`th, or one per slice for
 * pie-like traces (`perPoint`, by input index). Returns `template` unchanged otherwise.
 */
export function withA11yPattern(
  template: Record<string, unknown> | undefined,
  schema: ObjectNode,
  traceIn: Readonly<Record<string, unknown>>,
  perPoint: boolean,
  next: () => number,
): Record<string, unknown> | undefined {
  for (const path of ['marker.pattern', 'fillpattern']) {
    if (getNodeAtPath(schema, `${path}.shape`) === undefined) continue;
    const shape = `${path}.shape`;
    if (getIn(traceIn, shape) !== undefined || getIn(template, shape) !== undefined)
      return template;
    // Scatter coerces `fillpattern` only for filled traces (stacked ones fill by default): count
    // those alone.
    const fill = traceIn['fill'] ?? (traceIn['stackgroup'] ? 'tonexty' : 'none');
    if (path === 'fillpattern' && fill === 'none') return template;
    // Slices by input index, the same in every pie; traces in order.
    const shapes = perPoint
      ? Array.from(
          { length: pointCount(traceIn) },
          (_, i) => A11Y_PATTERN_SHAPES[i % A11Y_PATTERN_SHAPES.length],
        )
      : A11Y_PATTERN_SHAPES[next() % A11Y_PATTERN_SHAPES.length];
    const add =
      path === 'fillpattern'
        ? { fillpattern: pattern(shapes) }
        : { marker: { pattern: pattern(shapes) } };
    return deepMerge(template ?? {}, add) as Record<string, unknown>;
  }
  return template;
}

/** `config.a11y.reducedMotion`: `'auto'` follows the user's `prefers-reduced-motion`. */
export type ReducedMotion = 'auto' | boolean;

/**
 * Whether animations should snap (plan E17.5): `config.a11y.reducedMotion` of the chart whose full
 * layout (or full axis) is `owner` — `true` / `false` as set, and with `'auto'` (the default, and
 * for objects built by hand) whether the user prefers reduced motion (`prefers-reduced-motion:
 * reduce` in `view`, default the global window). Transitions, drill-down tweens and slider glides
 * check it.
 */
export function reducedMotion(owner: unknown, view?: Window | null): boolean {
  const setting = (owner as { _reducedMotion?: ReducedMotion } | null | undefined)?._reducedMotion;
  if (typeof setting === 'boolean') return setting;
  try {
    const w = view === undefined ? (globalThis as { matchMedia?: Window['matchMedia'] }) : view;
    return w?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}
