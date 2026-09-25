/**
 * The range slider component (plan E5.9; plotly.js `components/rangeslider`): an overview strip
 * under each x axis with `rangeslider.visible`, showing all the data with a window over the range
 * in view.
 *
 * ## Drawing
 *
 * The thumbnail is not a picture: it is the subplot's traces drawn a second time, through the
 * runtime's subplot mirrors (`ctx.mirrorSubplot`): one mirror per subplot on the axis, stacked in
 * the slider's rect, each with the slider's x range (all the data) and its own y range
 * (`rangeslider.yaxis<N>.rangemode`). The first mirror paints the slider background. Masks over
 * the data outside the window, the handles and the border are overlay rects (one batch).
 *
 * ## Interaction
 *
 * Dragging the window pans, dragging an end zooms, and dragging from outside the window draws a
 * new window (Plotly); a click outside the window centers the window there. While dragging, the
 * axis range is previewed (`chart.previewRanges`: transforms only, `relayouting` events), and the
 * release commits it with one `relayout` (`chart.commitRanges`). Plotly relayouts on every move.
 *
 * ## Margins
 *
 * The bottom margin grows by the axis depth, a 15 px gap, the slider and the layout's `margin.b`
 * again (Plotly). The axis title stays with the axis, above the slider (Plotly moves it below).
 *
 * ## Loading
 *
 * The margins are computed here, synchronously; the view (`view.ts`) loads the first time an x
 * axis shows a range slider (`shared/lazy-view.ts`).
 */
import type { AxisInfo, ComponentLayoutContext, ComponentModule } from '@mk7s/holochart-runtime';
import { lazyRenderer } from '../shared/lazy-view.ts';
import { oracleMeasure } from '../shared/text.ts';
import { axisDepth, rangesliderOf, sliderHeight, sliderMarginPush } from './margins.ts';

/** The y axes' paper fraction of the lowest subplot edge on x axis `id` (for margins). */
function counterBottom(axes: ReadonlyMap<string, AxisInfo>, id: string): number {
  let bottom = Infinity;
  for (const a of axes.values()) {
    if (a.letter !== 'y' || a.full.anchor !== id) continue;
    const d = a.full.domain as readonly number[];
    bottom = Math.min(bottom, Math.min(d[0] ?? 0, d[1] ?? 1));
  }
  return Number.isFinite(bottom) ? bottom : 0;
}

/**
 * The range slider component (`xaxis.rangeslider`, plan E5.9). Its attributes are core's (the
 * x axis schema); this draws the slider and pushes the bottom margin.
 */
export const rangesliderComponent: ComponentModule = {
  name: 'rangeslider',
  // Above the axes (its title) and shapes, below the legend.
  order: 40,
  pushMargin(ctx: ComponentLayoutContext) {
    const pushes = [];
    const m = ctx.fullLayout.margin;
    for (const axis of ctx.axes.values()) {
      const rs = axis.letter === 'x' ? rangesliderOf(axis.full) : undefined;
      if (!rs) continue;
      const d = axis.full.domain as readonly number[];
      const hint = Math.abs((d[1] ?? 1) - (d[0] ?? 0)) * (ctx.width - m.l - m.r);
      const depth =
        String(axis.full.side) === 'top'
          ? 0
          : axisDepth(axis, ctx.fullLayout, ctx, oracleMeasure, hint);
      const push = sliderMarginPush({
        height: sliderHeight(ctx.height, m, rs.thickness),
        depth,
        borderwidth: rs.borderwidth,
        marginB: m.b,
        marginT: m.t,
        figureHeight: ctx.height,
        bottom: counterBottom(ctx.axes, axis.id),
      });
      if (push) pushes.push(push);
    }
    return pushes;
  },
  draw: lazyRenderer({
    name: 'rangeslider',
    used: (ctx) =>
      [...ctx.axes.values()].some((a) => a.letter === 'x' && rangesliderOf(a.full) !== undefined),
    load: () =>
      import('./view.ts').then(
        ({ RangesliderView }) =>
          (ctx) =>
            new RangesliderView(ctx),
      ),
  }),
};
