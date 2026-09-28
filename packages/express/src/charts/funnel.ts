/**
 * `funnel` and `funnelArea` (plan E23.6): px.funnel — one `funnel` trace per color group, per
 * facet and frame, on cartesian axes — and px.funnel_area — one `funnelarea` trace of stages
 * from `names` and `values`.
 */
import { prepare } from '../core/args.ts';
import type { Config, Grouper, Role } from '../core/config.ts';
import { buildFigure } from '../core/engine.ts';
import { expressFunction } from '../core/render.ts';
import type { DataInput } from '../data/table.ts';
import type {
  AnimationOptions,
  AxisOptions,
  ColumnRef,
  CommonOptions,
  DiscreteColorOptions,
  ExpressFigure,
  FacetOptions,
  HoverOptions,
  XYOptions,
} from '../options.ts';
import { defined, inferOrientation, tailRoles } from './shared.ts';

/** Options of {@link funnel}: px.funnel's arguments in camelCase. */
export interface FunnelOptions
  extends
    CommonOptions,
    XYOptions,
    DiscreteColorOptions,
    HoverOptions,
    FacetOptions,
    AnimationOptions,
    AxisOptions {
  /** Column of text drawn on the bars (next to the value, `textinfo: 'text+value'`). */
  readonly text?: ColumnRef;
  /** Trace opacity, 0–1. */
  readonly opacity?: number;
}

/** Options of {@link funnelArea}: px.funnel_area's arguments in camelCase. */
export interface FunnelAreaOptions extends CommonOptions, DiscreteColorOptions, HoverOptions {
  /** Column of stage names (`labels`). Rows with the same name add up. */
  readonly names?: ColumnRef;
  /** Column of stage sizes (`values`). Default: one per row. */
  readonly values?: ColumnRef;
  /** Trace opacity, 0–1. */
  readonly opacity?: number;
}

function buildFunnel(data: DataInput | null | undefined, options: FunnelOptions): ExpressFigure {
  const args = prepare('funnel', data, options as Record<string, unknown>);
  const orientation = inferOrientation(args, 'category');
  // px.funnel has no continuous color: a numeric `color` groups too.
  const attrs: Role[] = ['x', 'y', 'hoverName', 'text', ...tailRoles(args, false)];
  const groupers: Grouper[] = [
    { variable: 'color', path: 'marker.color' },
    { variable: 'animationFrame' },
    { variable: 'facetRow' },
    { variable: 'facetCol' },
  ];
  const config: Config = {
    specs: [{ type: 'funnel', attrs, patch: defined({ orientation, opacity: options.opacity }) }],
    groupers,
    orientation,
  };
  return buildFigure(args, config);
}

function buildFunnelArea(
  data: DataInput | null | undefined,
  options: FunnelAreaOptions,
): ExpressFigure {
  const prepared = prepare('funnelArea', data, options as Record<string, unknown>);
  const color = prepared.cols.color;
  // px lists the color column in the hover label (`hover_data`), as for pies.
  const args =
    color === undefined
      ? prepared
      : {
          ...prepared,
          lists: {
            ...prepared.lists,
            hoverData: [...(prepared.lists.hoverData ?? []), color],
          },
        };
  const config: Config = {
    specs: [
      {
        type: 'funnelarea',
        attrs: ['names', 'values', 'hoverName', 'customData', 'hoverData', 'color'],
        patch: defined({ showlegend: args.cols.names !== undefined, opacity: options.opacity }),
      },
    ],
    groupers: [],
    continuousColor: 'sectors',
    subplotType: 'domain',
    ...(options.colorDiscreteSequence
      ? { layoutPatch: { funnelareacolorway: [...options.colorDiscreteSequence] } }
      : {}),
  };
  return buildFigure(args, config);
}

/**
 * A funnel chart (`px.funnel`): one `funnel` trace per `color` group — stages on the category axis
 * (y when the values are x), each bar as wide as its value, stacked across groups
 * (`funnelmode: 'stack'`) — per facet and per frame.
 *
 * @example
 * ```ts
 * const figure = funnel(rows, { x: 'count', y: 'stage', color: 'office' });
 * ```
 */
export const funnel = expressFunction<FunnelOptions>(buildFunnel);

/**
 * A funnel area chart (`px.funnel_area`): one `funnelarea` trace, a stage per `names` value sized
 * by `values`, colored from the colorway (or `color` / `colorDiscreteMap`, always discrete).
 *
 * @example
 * ```ts
 * const figure = funnelArea(rows, { names: 'stage', values: 'count' });
 * ```
 */
export const funnelArea = expressFunction<FunnelAreaOptions>(buildFunnelArea);
