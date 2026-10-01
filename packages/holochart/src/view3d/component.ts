/**
 * The 2.5D view (plan E8.9): `layout.view3d` shows every cartesian subplot in perspective — its
 * plot area a plane in 3D, tilted and rotated, with extruded traces (`depth`) standing out of it —
 * while axes, grids, hover, click, zoom, pan and selection keep working.
 *
 * ## Attributes
 *
 * `layout.view3d` applies to every cartesian subplot (each turns about its own center, so the
 * figure's layout, margins and legends are those of the flat view):
 *
 * - `enabled` (default false);
 * - `tilt` (degrees, ±80, default 20): elevation — positive looks from above;
 * - `rotation` (degrees, ±80, default -20): azimuth — positive looks from the right;
 * - `perspective` (0–1, default 0.5): 0 is a parallel projection;
 * - `interactive` (default true): with `dragmode` `'turntable'` or `'orbit'`, dragging the plot
 *   area turns the view (committed as a `relayout` of `tilt` / `rotation` on release).
 *
 * `tilt: 0, rotation: 0` draws the plot plane exactly where the flat view does, so turning the
 * view on and off animates through it: with `layout.transition`, `relayout` / `react` / `animate`
 * move `tilt`, `rotation` and `perspective` smoothly, from and to the flat view when `enabled`
 * changes (runtime `anim/`; snapped under reduced motion).
 *
 * ## Drawing
 *
 * The component's view (`view.ts`, loaded the first time a figure enables the view, with render's
 * 2.5D chunk) attaches a projector to each subplot viewport (render `view3d.ts`: camera, stencil
 * clipping to the tilted plot area, pointer mapping) and draws the subplots' axes, grids and tick
 * labels in the same 3D space; the axes component leaves those subplots' axes out. Without the 2.5D
 * chunk (the script-tag build without `holochart-3d.iife.min.js`) figures stay flat, with one
 * warning.
 *
 * Like 3D, the 2.5D view is a full-bundle feature (the `basic` bundle has no room for it): this
 * package registers it, with `bar` extended by `depth` (`index.ts`). The runtime, the axes
 * component and render keep only generic hooks (a viewport `projector`).
 */
import { lazyRenderer } from '@mk7s/holochart-components';
import { attr, isPlainObject } from '@mk7s/holochart-core';
import { loadExtrusionModule } from '@mk7s/holochart-render';
import type { ComponentModule, ComponentView } from '@mk7s/holochart-runtime';
import { loadView3DView } from './view-loader.ts';

/** `layout.view3d` (see the module comment). */
export const view3dAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      enabled: attr.boolean({
        dflt: false,
        editType: 'plot',
        description: 'Show the cartesian subplots in perspective (2.5D).',
      }),
      tilt: attr.number({
        min: -80,
        max: 80,
        dflt: 20,
        editType: 'camera',
        animatable: true,
        description:
          'Elevation of the view, degrees: positive looks from above (the tops of vertical bars show).',
      }),
      rotation: attr.number({
        min: -80,
        max: 80,
        dflt: -20,
        editType: 'camera',
        animatable: true,
        description:
          'Azimuth of the view, degrees: positive looks from the right (right sides show).',
      }),
      perspective: attr.number({
        min: 0,
        max: 1,
        dflt: 0.5,
        editType: 'camera',
        animatable: true,
        description: 'Strength of the perspective: 0 is a parallel projection, 1 a strong one.',
      }),
      interactive: attr.boolean({
        dflt: true,
        editType: 'camera',
        description:
          "With `dragmode` `'turntable'` or `'orbit'`, dragging the plot area turns the view.",
      }),
    },
    {
      editType: 'plot',
      description:
        'The 2.5D view (Holochart extension): every cartesian subplot in perspective, its plot area a tilted plane; axes, hover, zoom and selection keep working.',
    },
  ))();

/** Whether a defaulted layout enables the 2.5D view. */
export function view3dEnabled(layout: unknown): boolean {
  const v = isPlainObject(layout) ? layout['view3d'] : undefined;
  return isPlainObject(v) && v['enabled'] === true;
}

/** The view of a chart whose 2.5D code could not load: draws nothing (the chart stays flat). */
const flat = (): ComponentView => ({ update() {} });

/**
 * The 2.5D view component (`layout.view3d`, plan E8.9). The full bundle registers it (see
 * `index.ts` for partial bundles).
 */
export const view3dComponent: ComponentModule = {
  name: 'view3d',
  // Before the axes (-10): they leave out the axes of subplots it tilts.
  order: -20,
  layoutSchema: { view3d: view3dAttributes },
  draw: lazyRenderer({
    name: 'view3d',
    used: (ctx) => view3dEnabled(ctx.fullLayout),
    // render's 2.5D chunk (with the mesh chunk) too; without it (it warned once) charts stay flat.
    // Script tags: both come from the 3D add-on, so without it the view's lookup fails as well.
    load: () =>
      loadExtrusionModule().then(
        (render) =>
          loadView3DView().then(
            ({ View3DView }) =>
              (ctx) =>
                new View3DView(ctx, render),
          ),
        () => flat,
      ),
  }),
};
