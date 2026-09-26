/**
 * `pie` (plan E23.6): px.pie — one `pie` trace per facet, sectors from `names` and `values`.
 */
import { prepare } from '../core/args.ts';
import type { Config, GroupData } from '../core/config.ts';
import { buildFigure } from '../core/engine.ts';
import { groupValue } from '../core/labels.ts';
import { expressFunction } from '../core/render.ts';
import type { DataInput } from '../data/table.ts';
import type {
  ColumnRef,
  CommonOptions,
  ContinuousColorOptions,
  DiscreteColorOptions,
  ExpressFigure,
  FacetOptions,
  HoverOptions,
} from '../options.ts';
import { defined, opacityPatch } from './shared.ts';

/** Options of {@link pie}: px.pie's arguments in camelCase. */
export interface PieOptions
  extends CommonOptions, DiscreteColorOptions, ContinuousColorOptions, HoverOptions, FacetOptions {
  /** Column of sector names (`labels`). Rows with the same name add up. */
  readonly names?: ColumnRef;
  /** Column of sector sizes (`values`). Default: one per row. */
  readonly values?: ColumnRef;
  /** Column of sector text. */
  readonly text?: ColumnRef;
  /** Size of the hole, 0–1 of the radius (a donut). */
  readonly hole?: number;
  /** Sector opacity, 0–1. */
  readonly opacity?: number;
}

function buildPie(data: DataInput | null | undefined, options: PieOptions): ExpressFigure {
  const args = prepare('pie', data, options as Record<string, unknown>);
  const names = args.cols.names;
  const patch: Record<string, unknown> = defined({
    showlegend: names !== undefined,
    hole: options.hole,
    ...opacityPatch(args),
  });
  // px: with a `categoryOrders` entry for `names`, sectors follow it (clockwise, unsorted).
  const listed = names === undefined ? undefined : options.categoryOrders?.[names];
  let transform: ((rows: readonly number[]) => GroupData) | undefined;
  if (names !== undefined && listed && listed.length > 0) {
    patch['sort'] = false;
    patch['direction'] = 'clockwise';
    const column = args.table.column(names);
    const rank = new Map(listed.map((v, i) => [JSON.stringify([groupValue(v)]), i]));
    transform = (rows) => {
      const key = (i: number) => rank.get(JSON.stringify([groupValue(column[i])])) ?? listed.length;
      return { rows: [...rows].sort((a, b) => key(a) - key(b)) };
    };
  }
  const config: Config = {
    specs: [
      {
        type: 'pie',
        attrs: ['names', 'values', 'hoverName', 'text', 'customData', 'hoverData', 'color'],
        patch,
      },
    ],
    groupers: [{ variable: 'facetRow' }, { variable: 'facetCol' }],
    continuousColor: 'pie',
    subplotType: 'domain',
    ...(transform ? { transform } : {}),
    ...(options.colorDiscreteSequence
      ? { layoutPatch: { piecolorway: [...options.colorDiscreteSequence] } }
      : {}),
  };
  return buildFigure(args, config);
}

/**
 * A pie chart (`px.pie`): one `pie` trace (per facet) with `labels` from `names` and `values`;
 * `color` colors the sectors, from the colorway or `colorDiscreteMap` (or a colorscale when
 * numeric); `hole` makes a donut.
 *
 * @example
 * ```ts
 * const figure = pie(rows, { names: 'day', values: 'tip', hole: 0.4 });
 * ```
 */
export const pie = expressFunction<PieOptions>(buildPie);
