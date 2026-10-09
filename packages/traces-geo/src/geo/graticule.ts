/**
 * The graticule of a `geo` subplot: the meridians (`lonaxis`) or the parallels (`lataxis`) as
 * lines in degrees, for the caller to pass through `projectLines`. A port of `makeGraticule` in
 * plotly.js (`src/plots/geo/geo.js`, MIT) and of the part of `Axes.calcTicks`
 * (`src/plots/cartesian/axes.js`) it runs on a dummy linear axis.
 *
 * As in Plotly, the lines cover the **scope's** ranges (`SCOPE_DEFAULTS`), not the figure's
 * `lonaxis.range` / `lataxis.range`: the projection's clip does the cutting. Only `tick0` and
 * `dtick` are read from the axis.
 *
 * Two deliberate differences from Plotly:
 *
 * - **The duplicate meridian.** Plotly drops the last meridian "on the antimeridian" behind a test
 *   of `geoLayout.isScoped`, a property that does not exist (defaults set `_isScoped`). So it
 *   drops the last meridian of every map: the duplicate at 180° on a world map with the default
 *   ticks, but also 150°E on `scope: 'asia'`, 60°E on `'europe'`, and 160° on a world map with
 *   `tick0: 10`. Here the last meridian is dropped only when it is a full turn after the first,
 *   which is the first one again.
 * - **A `dtick` that is not a positive number** gives no lines. In Plotly a zero sends the dummy
 *   axis to the automatic ticks, which throw on it, and a negative one gives no ticks.
 *
 * Tick values are `first + i · dtick`. Plotly adds `dtick` step by step with a rounding fix
 * (`Lib.increment`), which can differ in the last digits for a fractional `dtick` and nowhere
 * that shows.
 */
import type { MultiLineString, Position } from 'geojson';
import { SCOPE_DEFAULTS } from './constants.ts';
import type { FullGeoLayout } from './types.ts';

/** The two axes of a `geo` subplot. */
export type GraticuleAxis = 'lonaxis' | 'lataxis';

/** What the graticule reads of a `layout.geo` container. */
export type GraticuleLayout = Pick<FullGeoLayout, 'scope' | 'lonaxis' | 'lataxis'>;

/** Plotly ends the tick range this far before the scope's upper bound (d3's ε). */
const RANGE_EPSILON = 1e-6;
/** `Axes.calcTicks` widens a range by this fraction at both ends, to catch ticks rounded out. */
const RANGE_PAD = 1e-4;
/** `Axes.calcTicks` stops once it has more ticks than this. */
const MAX_TICKS = 1000;
/** Degrees between the points of a line (the default of `geoGraticule`). */
const STEP = 2.5;

/**
 * The longitudes of the meridians (`'lonaxis'`) or the latitudes of the parallels (`'lataxis'`):
 * the multiples of `dtick` from `tick0` within the scope's range, ascending.
 */
export function graticuleValues(axis: GraticuleAxis, layout: GraticuleLayout): number[] {
  const { tick0, dtick } = layout[axis];
  const scope = SCOPE_DEFAULTS[layout.scope];
  const range = axis === 'lonaxis' ? scope.lonaxisRange : scope.lataxisRange;
  const values: number[] = [];
  if (!(dtick > 0) || !Number.isFinite(dtick) || !Number.isFinite(tick0)) return values;
  const r0 = range[0];
  const r1 = range[1] - RANGE_EPSILON;
  const pad = (r1 - r0) * RANGE_PAD;
  const first = Math.ceil((r0 - pad - tick0) / dtick) * dtick + tick0;
  const end = r1 + pad;
  for (let i = 0; ; i++) {
    const value = first + i * dtick;
    // The second test is Plotly's guard against a step too small to move the value.
    if (!(value <= end) || value === values[values.length - 1]) break;
    values.push(value);
    if (values.length > MAX_TICKS) break;
  }
  // The pad lets in both ends of a full turn, and they are one meridian. The padded range is
  // wider than a turn by less than a tenth of a degree, so at most one value is in excess.
  if (axis === 'lonaxis' && values.length > 1) {
    const turn = values[values.length - 1]! - values[0]!;
    if (turn > 360 - RANGE_EPSILON) values.pop();
  }
  return values;
}

/**
 * The graticule lines of one axis, in degrees: one line per value of {@link graticuleValues},
 * with a point every 2.5° across the scope's range of the other axis. The points are what lets
 * the projection bend a parallel; d3's resampling does the rest.
 */
export function graticuleLines(axis: GraticuleAxis, layout: GraticuleLayout): MultiLineString {
  const scope = SCOPE_DEFAULTS[layout.scope];
  const across = axis === 'lonaxis' ? scope.lataxisRange : scope.lonaxisRange;
  const coordinates: Position[][] = [];
  for (const value of graticuleValues(axis, layout)) {
    const line: Position[] = [];
    // Plotly's loop, kept as it is: a range that is not a multiple of 2.5° wide (Asia's
    // longitudes, 22° to 160°) runs past its end by less than one step.
    for (let l = across[0]; l < across[1] + STEP; l += STEP) {
      line.push(axis === 'lonaxis' ? [value, l] : [l, value]);
    }
    coordinates.push(line);
  }
  return { type: 'MultiLineString', coordinates };
}
