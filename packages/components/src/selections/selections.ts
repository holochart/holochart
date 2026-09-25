/**
 * The selections component (plan E5.12; plotly.js `components/selections`): draws the outlines of
 * `layout.selections` and lets users move and resize them.
 *
 * The runtime owns what a selection *selects*: box and lasso drags store their outline in
 * `layout.selections` (one GUI `relayout`), and on every draw the points inside the selections
 * are selected (`selectedpoints` follows). This component only draws and edits the outlines.
 *
 * ## Drawing
 *
 * Each outline is one line primitive in its subplot's viewport (clipped to the plot area), in the
 * subplot's linear coordinates with the traces' transform, so zoom and pan re-upload nothing.
 * Style: `line.color` (default: white on a dark `plot_bgcolor`, `#444` on a light one), `width`,
 * `dash` (default `dot`) and `opacity` (default 0.7). The active selection draws solid.
 *
 * ## Editing (in `select` and `lasso` drag modes)
 *
 * A click on a selection makes it active (Plotly's active selection). Dragging a box's edge or
 * corner resizes it; dragging inside the active selection moves it (a drag inside an inactive one
 * starts a new selection, as without it). The release commits one GUI `relayout` of
 * `selections[i].x0` … (or `.path`), after which the runtime selects the points again and emits
 * `selected`. A double-click clears every selection (the runtime's select-mode double-click).
 * Lasso vertices cannot be dragged one by one (Plotly can, on the active selection).
 *
 * The view (`view.ts`) loads the first time a figure has selections (`shared/lazy-view.ts`).
 */
import { selectionsOf, type ComponentModule } from '@mk7s/holochart-runtime';
import { lazyRenderer } from '../shared/lazy-view.ts';
import { contrastColor } from '../shapes/draw.ts';

/**
 * The selections component (`layout.selections`, plan E5.12): outlines and editing. The
 * attributes are core's; the runtime selects the points.
 */
export const selectionsComponent: ComponentModule = {
  name: 'selections',
  // Above shapes (35), below annotations.
  order: 38,
  draw: lazyRenderer({
    name: 'selections',
    used: (ctx) => selectionsOf(ctx.fullLayout).length > 0,
    load: () =>
      import('./view.ts').then(
        ({ SelectionsView }) =>
          (ctx) =>
            new SelectionsView(ctx, contrastColor),
      ),
  }),
};
