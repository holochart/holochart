/**
 * Range slider margins (plan E5.9; plotly.js `components/rangeslider/draw.js`): the slider's
 * height, the depth of its axis and the bottom margin it needs, which layout computes
 * synchronously. The rest of the geometry and the drag math (`geometry.ts`) load with the view
 * (`shared/lazy-view.ts`).
 */
import type { FullLayout, Scale } from '@mk7s/holochart-core';
import type { MarginPush } from '@mk7s/holochart-runtime';
import { axisGeometry, axisTicks, cloneScale, type AxisLike } from '../axes/geometry.ts';
import type { MeasureLine } from '../shared/text.ts';

/** Gap between the axis (tick labels, title) and the slider, px (Plotly's `extraPad`). */
export const RANGESLIDER_PAD = 15;
/** A defaulted `xaxis.rangeslider` (see core's `rangesliderSchema`). */
export interface FullRangeslider {
  readonly visible: boolean;
  readonly thickness: number;
  readonly bgcolor: string;
  readonly bordercolor: string;
  readonly borderwidth: number;
  readonly autorange: boolean;
  readonly range?: readonly unknown[];
  /** Per y axis (`yaxis`, `yaxis2`, …): the thumbnail's y range. */
  readonly [yaxis: string]: unknown;
}

/** The visible range slider of an axis, if any. */
export function rangesliderOf(full: unknown): FullRangeslider | undefined {
  const rs = (full as { rangeslider?: FullRangeslider } | undefined)?.rangeslider;
  return rs?.visible === true ? rs : undefined;
}

/**
 * Slider height, px (Plotly's `_height`): `thickness` of the figure height minus the layout's own
 * top and bottom margins (before any component grows them, so it does not change as they grow).
 */
export function sliderHeight(
  figureHeight: number,
  margin: { readonly t: number; readonly b: number },
  thickness: number,
): number {
  return Math.max(0, (figureHeight - margin.t - margin.b) * thickness);
}

/**
 * How far an axis reaches below (or beyond) its plot edge: `margin.pad`, ticks, tick labels and
 * title (the axes component's outward extent). A scale not laid out yet is measured at
 * `lengthHint` px on a copy.
 */
export function axisDepth(
  axis: AxisLike,
  fullLayout: Pick<FullLayout, 'margin'>,
  size: { readonly width: number; readonly height: number },
  measure: MeasureLine,
  lengthHint?: number,
): number {
  if (axis.full.visible === false) return 0;
  let subject: AxisLike = axis;
  if (!(axis.scale.length > 1) && lengthHint !== undefined) {
    const scale: Scale = cloneScale(axis.scale, Math.max(1, lengthHint));
    subject = {
      id: axis.id,
      letter: axis.letter,
      type: axis.type,
      full: axis.full,
      scale,
      start: 0,
      end: scale.length,
      l2c: (l) => scale.l2p(l),
    };
  }
  const geo = axisGeometry(subject, { cross: 0, sgn: 1 }, axisTicks(subject), {
    measure,
    width: size.width,
    height: size.height,
  });
  return fullLayout.margin.pad + geo.extent;
}

/**
 * The bottom margin a slider needs (Plotly's `autoMarginOpts`): the axis depth (bottom axes),
 * the gap, the slider and its border, then the layout's `margin.b` again below it. `bottom` is
 * the paper fraction of the lowest subplot edge on the axis (0 at the plot-area bottom); room the
 * plot area already has below it counts, solved like Plotly for the plot height the margin leaves.
 */
export function sliderMarginPush(opts: {
  readonly height: number;
  readonly depth: number;
  readonly borderwidth: number;
  readonly marginB: number;
  readonly marginT: number;
  readonly figureHeight: number;
  readonly bottom: number;
}): MarginPush | undefined {
  const shift = Math.floor(Math.max(0, opts.borderwidth) / 2);
  const size = opts.height + opts.depth + opts.marginB + RANGESLIDER_PAD + 2 * shift;
  const y = Math.min(Math.max(opts.bottom, 0), 0.99);
  const need = y > 0 ? (size - y * (opts.figureHeight - opts.marginT)) / (1 - y) : size;
  return need > 0 ? { b: Math.ceil(need) } : undefined;
}
