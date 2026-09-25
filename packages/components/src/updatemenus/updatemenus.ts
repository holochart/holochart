/**
 * The update-menus component (plan E5.10, plotly.js `components/updatemenus`): `layout.updatemenus`
 * attributes and defaults, margin pushes, and the DOM view (`view.ts`, loaded on first use: see
 * `shared/lazy-view.ts`).
 */
import type { ComponentLayoutContext, ComponentModule, MarginPush } from '@mk7s/holochart-runtime';
import { findChart } from '../shared/host.ts';
import { lazyRenderer, nonEmpty } from '../shared/lazy-view.ts';
import { oracleMeasure } from '../shared/text.ts';
import { layoutUpdatemenu, updatemenuMarginPush, visibleUpdatemenus } from './layout.ts';
import { supplyUpdatemenuDefaults, updatemenusAttributes } from './schema.ts';

/** Margins the visible menus need (one push per menu, like Plotly's per-menu `autoMargin`). */
export function updatemenusMarginPushes(ctx: ComponentLayoutContext): MarginPush[] {
  const out: MarginPush[] = [];
  const margin = ctx.fullLayout.margin;
  for (const menu of visibleUpdatemenus(ctx.fullLayout['updatemenus'])) {
    const layout = layoutUpdatemenu(menu, oracleMeasure);
    const push = updatemenuMarginPush(menu, layout, ctx, margin);
    if (push) out.push(push);
  }
  return out;
}

/**
 * Update menus: buttons and dropdowns that call `restyle`, `relayout`, `update` or `animate` and
 * emit `buttonclicked` (plan E5.10).
 */
export const updatemenusComponent: ComponentModule = {
  name: 'updatemenus',
  // After the other components (their DOM mirrors come first in the tab order), before the modebar.
  order: 90,
  layoutSchema: { updatemenus: updatemenusAttributes },
  supplyLayoutDefaults: supplyUpdatemenuDefaults,
  pushMargin: (ctx) => {
    const pushes = updatemenusMarginPushes(ctx);
    return pushes.length > 0 ? pushes : undefined;
  },
  draw: lazyRenderer({
    name: 'updatemenus',
    // Any menu, shown or not: the view also tracks the active button of hidden menus.
    used: (ctx) => nonEmpty(ctx.fullLayout['updatemenus']),
    load: () =>
      import('./view.ts').then(
        ({ createUpdatemenusView }) =>
          (ctx) =>
            createUpdatemenusView(findChart(ctx), ctx, { locate: findChart }),
      ),
  }),
};
