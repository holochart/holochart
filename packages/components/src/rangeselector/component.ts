/**
 * The range selector component (plan E5.9, Plotly's `xaxis.rangeselector`): margin pushes, and the
 * DOM view (`rangeselector.ts`), loaded the first time an x axis shows a range selector (see
 * `shared/lazy-view.ts`). Core owns the attributes and defaults.
 */
import type { ComponentDrawContext, ComponentModule, MarginPush } from '@mk7s/holochart-runtime';
import { findChart } from '../shared/host.ts';
import { lazyRenderer } from '../shared/lazy-view.ts';
import { oracleMeasure, type MeasureLine } from '../shared/text.ts';
import { rangeselectorMarginPush, readRangeselector } from './layout.ts';
import type { RangeselectorViewAxis } from './rangeselector.ts';

/** Margin pushes of every x axis with a visible range selector (Plotly's `autoMargin`). */
export function rangeselectorMarginPushes(
  ctx: Pick<ComponentDrawContext, 'fullLayout' | 'width' | 'height'> & {
    readonly axes: ReadonlyMap<string, Pick<RangeselectorViewAxis, 'letter' | 'full'>>;
  },
  measure: MeasureLine = oracleMeasure,
): MarginPush[] {
  const out: MarginPush[] = [];
  for (const axis of ctx.axes.values()) {
    if (axis.letter !== 'x') continue;
    const selector = readRangeselector(axis.full);
    if (!selector) continue;
    const push = rangeselectorMarginPush(
      selector,
      { width: ctx.width, height: ctx.height },
      ctx.fullLayout.margin,
      measure,
    );
    if (push) out.push(push);
  }
  return out;
}

/**
 * The range selector component (plan E5.9). Core owns `xaxis.rangeselector`'s schema and
 * defaults; this draws the buttons and pushes the margins they need.
 */
export const rangeselectorComponent: ComponentModule = {
  name: 'rangeselector',
  // After the update menus and the modebar: last in the tab order of the chart's DOM controls.
  order: 105,
  pushMargin(ctx) {
    const pushes = rangeselectorMarginPushes(ctx);
    return pushes.length > 0 ? pushes : undefined;
  },
  draw: lazyRenderer({
    name: 'rangeselector',
    used: (ctx) =>
      [...ctx.axes.values()].some(
        (a) => a.letter === 'x' && readRangeselector(a.full) !== undefined,
      ),
    load: () =>
      import('./rangeselector.ts').then(
        ({ createRangeselectorView }) =>
          (ctx) =>
            createRangeselectorView(findChart(ctx), ctx, { locate: findChart }),
      ),
  }),
};
