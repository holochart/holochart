/**
 * `bar` and `timeline` (plan E23.6): px's bar functions, one `bar` trace per group.
 */
import { dateToMs } from '@mk7s/holochart-core';
import { prepare, type Args } from '../core/args.ts';
import type { Config, Grouper, Role } from '../core/config.ts';
import { buildFigure } from '../core/engine.ts';
import { expressFunction } from '../core/render.ts';
import type { DataInput } from '../data/table.ts';
import type {
  AnimationOptions,
  AxisOptions,
  ColumnRef,
  CommonOptions,
  ContinuousColorOptions,
  DiscreteColorOptions,
  ErrorBarOptions,
  ExpressFigure,
  FacetOptions,
  HoverOptions,
  PatternOptions,
  XYOptions,
} from '../options.ts';
import { defined, inferOrientation, opacityPatch, tailRoles } from './shared.ts';

/** Options of {@link bar}: px.bar's arguments in camelCase. */
export interface BarOptions
  extends
    CommonOptions,
    XYOptions,
    DiscreteColorOptions,
    ContinuousColorOptions,
    PatternOptions,
    HoverOptions,
    FacetOptions,
    AnimationOptions,
    AxisOptions,
    ErrorBarOptions {
  /** Column of bar bases (where each bar starts). */
  readonly base?: ColumnRef;
  /** Column of text drawn on the bars (`textposition: 'auto'`). */
  readonly text?: ColumnRef;
  /** `layout.barmode`: `'relative'` (default: stacked, negatives below zero), `'group'`, `'overlay'`, `'stack'`. */
  readonly barmode?: 'relative' | 'group' | 'overlay' | 'stack';
  /** Bar opacity, 0–1. */
  readonly opacity?: number;
}

/** Options of {@link timeline}: px.timeline's arguments in camelCase. */
export interface TimelineOptions
  extends
    CommonOptions,
    DiscreteColorOptions,
    ContinuousColorOptions,
    PatternOptions,
    HoverOptions,
    FacetOptions,
    AnimationOptions {
  /** Column of start dates (ISO strings, `Date`s or ms). */
  readonly xStart: ColumnRef;
  /** Column of end dates. */
  readonly xEnd: ColumnRef;
  /** Column of row labels (tasks). */
  readonly y?: ColumnRef;
  /** Column of text drawn on the bars. */
  readonly text?: ColumnRef;
  /** Fixed x range (dates). */
  readonly rangeX?: readonly [unknown, unknown];
  /** Fixed y range. */
  readonly rangeY?: readonly [unknown, unknown];
  /** Bar opacity, 0–1. */
  readonly opacity?: number;
}

function barConfig(
  args: Args,
  orientation: 'v' | 'h',
  layoutPatch: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Config {
  const attrs: Role[] = [
    'base',
    'x',
    'y',
    'hoverName',
    'text',
    'errorX',
    'errorXMinus',
    'errorY',
    'errorYMinus',
    ...tailRoles(args),
  ];
  const groupers: Grouper[] = [{ variable: 'color', path: 'marker.color' }];
  // Fill patterns are drawn from plan E8.10: only written when `pattern` is given.
  if (args.cols.pattern !== undefined)
    groupers.push({ variable: 'pattern', path: 'marker.pattern.shape' });
  groupers.push({ variable: 'animationFrame' }, { variable: 'facetRow' }, { variable: 'facetCol' });
  return {
    specs: [
      {
        type: 'bar',
        attrs,
        patch: { textposition: 'auto', orientation, ...opacityPatch(args), ...extra },
      },
    ],
    groupers,
    continuousColor: 'marker',
    orientation,
    layoutPatch: defined(layoutPatch),
  };
}

function buildBar(data: DataInput | null | undefined, options: BarOptions): ExpressFigure {
  const args = prepare('bar', data, options as Record<string, unknown>);
  const orientation = inferOrientation(args, 'category');
  return buildFigure(
    args,
    barConfig(args, orientation, { barmode: options.barmode ?? 'relative' }),
  );
}

function buildTimeline(
  data: DataInput | null | undefined,
  options: TimelineOptions,
): ExpressFigure {
  const prepared = prepare('timeline', data, options as unknown as Record<string, unknown>);
  const { xStart, xEnd } = prepared.cols;
  if (xStart === undefined || xEnd === undefined) {
    throw new Error('timeline: both xStart and xEnd are required.');
  }
  const starts = prepared.table.column(xStart);
  const ends = prepared.table.column(xEnd);
  // px: the bars start at `base` = the start dates and are `x` = end − start ms long; the end
  // column keeps its name, so hover reads `Finish=%{x}` (the bar's end on a date axis).
  const durations = starts.map((s, i) => {
    const d = dateToMs(ends[i]) - dateToMs(s);
    return Number.isFinite(d) ? d : null;
  });
  const args: Args = {
    ...prepared,
    table: prepared.table.withColumn(xEnd, durations),
    cols: { ...prepared.cols, x: xEnd, base: xStart },
  };
  const config = barConfig(args, 'h', { barmode: 'overlay' });
  return buildFigure(args, { ...config, timeline: true });
}

/**
 * A bar chart (`px.bar`): one `bar` trace per group of `color` / `pattern` values, per facet and
 * per frame, stacked (`barmode: 'relative'`) by default. A numeric `color` is a colorscale instead.
 *
 * @example
 * ```ts
 * const figure = bar(rows, { x: 'day', y: 'total', color: 'sex', barmode: 'group' });
 * ```
 */
export const bar = expressFunction<BarOptions>(buildBar);

/**
 * A timeline / Gantt chart (`px.timeline`): horizontal bars from `xStart` to `xEnd` per row of
 * `y`, on a date x axis (`barmode: 'overlay'`). Unlike Holochart's `timeline()` helper in
 * traces-basic, the rows keep Plotly's bottom-up order, as in px.
 */
export const timeline = expressFunction<TimelineOptions>(buildTimeline);
