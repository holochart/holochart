/**
 * The sliders component (plan E5.11, plotly.js `components/sliders`): `layout.sliders`
 * attributes and defaults, margin pushes, and the DOM view (`view.ts`, loaded on first use: see
 * `shared/lazy-view.ts`).
 */
import type { ComponentLayoutContext, ComponentModule, MarginPush } from '@mk7s/holochart-runtime';
import { findChart } from '../shared/host.ts';
import { lazyRenderer, nonEmpty } from '../shared/lazy-view.ts';
import { oracleMeasure } from '../shared/text.ts';
import { layoutSlider, sliderBoxMarginPush, visibleSliders } from './layout.ts';
import { slidersAttributes, supplySliderDefaults } from './schema.ts';

/** Margins the visible sliders need (one push per slider, like Plotly's per-slider `autoMargin`). */
export function slidersMarginPushes(ctx: ComponentLayoutContext): MarginPush[] {
  const out: MarginPush[] = [];
  const margin = ctx.fullLayout.margin;
  const plotWidth = Math.max(1, ctx.width - margin.l - margin.r);
  for (const slider of visibleSliders(ctx.fullLayout['sliders'])) {
    const layout = layoutSlider(slider, oracleMeasure, plotWidth);
    const push = sliderBoxMarginPush(slider, layout, ctx, margin);
    if (push) out.push(push);
  }
  return out;
}

/**
 * Sliders: step through `restyle`, `relayout`, `update` or `animate` calls; emit `sliderchange`,
 * `sliderstart` and `sliderend` (plan E5.11).
 */
export const slidersComponent: ComponentModule = {
  name: 'sliders',
  order: 91,
  layoutSchema: { sliders: slidersAttributes },
  supplyLayoutDefaults: supplySliderDefaults,
  pushMargin: (ctx) => {
    const pushes = slidersMarginPushes(ctx);
    return pushes.length > 0 ? pushes : undefined;
  },
  draw: lazyRenderer({
    name: 'sliders',
    // Any slider, shown or not: the view also tracks the active step of hidden sliders.
    used: (ctx) => nonEmpty(ctx.fullLayout['sliders']),
    load: () =>
      import('./view.ts').then(
        ({ createSlidersView }) =>
          (ctx) =>
            createSlidersView(findChart(ctx), ctx, { locate: findChart }),
      ),
  }),
};
