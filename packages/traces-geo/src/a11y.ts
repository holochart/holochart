/**
 * Accessibility of the geo traces that loads with the chart's first keyboard focus (backlog S2.14,
 * GEO6; `TraceModule.a11y`, `a11y-loader.ts`).
 *
 * ## Keyboard stops
 *
 * The points of a `scattergeo` trace that are on the map and inside the part of the subplot that
 * draws, in data order (← / ↑ the previous, → / ↓ the next), each the hover point the trace gives
 * where the point is drawn; and the regions of a `choropleth` that are drawn, in the order of
 * `locations`, each at the point of its feature (where its hover label is).
 *
 * A point the projection hides (the far side of a globe, outside the three parts of Albers USA)
 * and one that a pan or a zoom has taken out of the subplot is not a stop, and "point 2 of 5"
 * counts the stops there are: the cursor stays in view, as it does on cartesian axes, where only
 * the points inside the axis range are visited, and on polar ones. (The 3D scenes have no such
 * case to follow: every finite point of a `scatter3d` is in its scene's box.) The view keys bring
 * the others in: after a turn of the globe the stops are the points of the new near side.
 *
 * ## View keys
 *
 * The keys of the 3D scenes, on the subplot of the cursor's trace (on every geo subplot without a
 * cursor): Shift + arrows move the view where the arrow points by a tenth of the subplot (a scoped
 * map pans, a world map turns in longitude and moves up and down, a globe turns in longitude and
 * latitude), `+` / `-` zoom about the middle inside `minscale` and `maxscale`, `0` goes back to the
 * first drawn view like a double-click. The maths is a drag's and a wheel step's (`keyGeoView` in
 * `geo/interact.ts`), and each press is one GUI relayout with the keys Plotly writes for the kind
 * of map (`geo.projection.rotation.lon`, `geo.center.lat`, `geo.projection.scale`, …): the same
 * `relayout` event as the gesture's, kept by `layout.uirevision` like it. A key that changes
 * nothing (a zoom at its limit) commits and announces nothing.
 *
 * A pan, a turn and a zoom are announced with where the view is now ({@link VIEW_TEMPLATE}: the
 * longitude and latitude in the middle of the map, and `projection.scale`), a reset with the
 * runtime's "View reset." (what the first view was is known once it is drawn again).
 *
 * This file imports types only: each trace's loader hands over the functions its parts need (see
 * the loader).
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import type { HoverContext, HoverPoint, TraceA11y, TraceA11yParts } from '@mk7s/holochart-runtime';
import type { ChoroplethCalc } from './choropleth/calc.ts';
import type { choroplethAnchor, choroplethHoverPoint } from './choropleth/hover.ts';
import type { laidOutGeoSubplots } from './geo/cross-trace.ts';
import type { geoResetRelayout, keyGeoView } from './geo/interact.ts';
import type { geoOf } from './geo/layout-defaults.ts';
import type { ScattergeoCalc } from './scattergeo/calc.ts';
import type { geoHoverPointOf, geoLabel, scattergeoHoverPoints } from './scattergeo/hover.ts';
import type { geoPositions, subplotFrame } from './scattergeo/positions.ts';

/**
 * The announcement of a view key on a map: an English sentence that is also its key in a locale
 * dictionary. `{lon}` and `{lat}` are what is in the middle of the map, in degrees, and `{scale}`
 * is `projection.scale` (1 fits the map to its subplot), formatted like the hover labels.
 */
export const VIEW_TEMPLATE = 'Map centered at longitude {lon}°, latitude {lat}°, scale {scale}.';

/** What the view keys need of the package (see `a11y-loader.ts`). */
export type ViewKit = readonly [
  subplots: typeof laidOutGeoSubplots,
  subplotOf: typeof geoOf,
  key: typeof keyGeoView,
  reset: typeof geoResetRelayout,
  label: typeof geoLabel,
];

type Say = readonly [template: string, values: Readonly<Record<string, string>>];

/** The view keys of a geo trace: those of its subplot (see the module comment). */
function viewKeys(...kit: ViewKit): TraceA11y {
  const [subplots, subplotOf, key, reset, label] = kit;
  /** What each relayout handed out is announced with. */
  const says = new WeakMap<object, Say>();
  const round = (fullLayout: FullLayout, v: number, digits: number): string => {
    const unit = 10 ** digits;
    // No "-0" for a view a hair west of Greenwich.
    return label(fullLayout, Math.round(v * unit) / unit + 0);
  };
  return {
    keyboardView(trace, ctx, action) {
      const id = subplotOf(trace);
      const sp = subplots(ctx.fullLayout)?.get(id);
      const view = sp?.view;
      if (!sp || !view?.valid) return undefined;
      // The geo component saved the first view when it drew the subplot.
      if (action === 'reset') return sp.initial && reset(sp.initial, id);
      const step = key(view, action, sp.clipRect, id);
      if (!step?.changed || Object.keys(step.relayout).length === 0) return undefined;
      const now = view.toLayout(step.state);
      // A globe is centered on its rotation; the middle of another map is its `center`.
      const middle = view.mode === 'clipped' ? now.rotation : now.center;
      if (middle) {
        says.set(step.relayout, [
          VIEW_TEMPLATE,
          {
            lon: round(ctx.fullLayout, middle.lon, 1),
            lat: round(ctx.fullLayout, middle.lat, 1),
            scale: round(ctx.fullLayout, now.scale, 2),
          },
        ]);
      }
      return step.relayout;
    },
    keyboardViewSay: (_trace, _ctx, _action, update) => says.get(update),
  };
}

/** The parts of `scattergeo`. */
export const scattergeo = (
  hover: typeof scattergeoHoverPoints,
  positions: typeof geoPositions,
  frame: typeof subplotFrame,
  pointOf: typeof geoHoverPointOf,
  ...kit: ViewKit
): TraceA11yParts => ({
  scattergeo: {
    ...viewKeys(...kit),
    keyboardPoints(calc: ScattergeoCalc, trace: FullTrace, ctx: HoverContext) {
      const sp = calc.subplot;
      const at = sp && positions(calc, sp);
      if (!sp || !at) return [];
      const height = ctx.height ?? 0;
      const { toContainer } = frame(sp, height);
      const stops: HoverPoint[] = [];
      for (let i = 0; i < calc.length; i++) {
        const x = at.x[i] as number;
        // Hidden by the projection, or a gap.
        if (Number.isNaN(x)) continue;
        const [cx, cy] = toContainer(x, at.y[i] as number);
        // Panned or zoomed out of view.
        if (!sp.contains(cx, cy)) continue;
        const py = height - cy;
        // The trace's own hover point, asked where the point is drawn. Of points drawn on one
        // spot the hit test finds one: each is still a stop, with its own label.
        const [p] = hover(
          calc,
          trace,
          { px: cx, py, xl: cx, yl: py, cx, cy, mode: 'closest', distance: 1 },
          ctx,
        );
        if (p) stops.push(pointOf(calc, trace, i, p, ctx.fullLayout));
      }
      return stops;
    },
  },
});

/** The parts of `choropleth`. */
export const choropleth = (
  pointOf: typeof choroplethHoverPoint,
  anchor: typeof choroplethAnchor,
  ...kit: ViewKit
): TraceA11yParts => ({
  choropleth: {
    ...viewKeys(...kit),
    keyboardPoints(calc: ChoroplethCalc, trace: FullTrace, ctx: HoverContext) {
      const drawn = calc.drawn;
      if (!drawn) return [];
      const height = ctx.height ?? 0;
      const stops: HoverPoint[] = [];
      for (let k = 0; k < drawn.index.length; k++) {
        const i = drawn.index[k] as number;
        // Hidden by the projection, panned or zoomed out of view, or a feature without a point.
        const at = anchor(calc, i);
        if (at) stops.push(pointOf(calc, trace, i, at[0], height - at[1], ctx.fullLayout));
      }
      return stops;
    },
  },
});
