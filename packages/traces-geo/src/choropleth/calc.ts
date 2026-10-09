/**
 * `choropleth` calc (backlog GEO4), following plotly.js `choropleth/calc.js` and the `fitbounds`
 * part of `choropleth/plot.js` (`fitCoords`; MIT): `z` as numbers, the request for the features
 * the `locations` name, and the trace's part in `fitbounds`.
 *
 * The features come from the layout pass (`GeoCalc.located`): until they are in hand, and when
 * their data cannot be loaded, the trace is `unresolved` and draws nothing. A location that names
 * no feature, and one whose `z` is not a number, is not drawn (`regions.ts`).
 *
 * The color domain (`zauto`, `zmin`, `zmax`, `zmid`) is not computed here: the shared colorscale
 * helpers resolve it from the trace when it is drawn (`colors.ts`), so that a change of the
 * colorscale attributes is a `style` edit.
 *
 * **`fitbounds: 'locations'`** fits the view to every coordinate of the drawn regions (their
 * bounds, not their label points), as Plotly does: the view takes the narrower of their longitude
 * span and the smallest arc that holds them, so regions on both sides of the antimeridian fit as
 * one group. `fitbounds: 'geojson'` fits the whole `geojson` of a `'geojson-id'` trace, which the
 * layout pass reads itself.
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import type { CalcContext } from '@mk7s/holochart-runtime';
import type { GeoCalc } from '../geo/cross-trace.ts';
import {
  geojsonCoords,
  locationsOf,
  type LocatedFeature,
  type LocationsResult,
} from '../geo/locations.ts';
import { zValues } from './colors.ts';
import { drawnRegions, type DrawnRegions } from './regions.ts';

/** @experimental */
export interface ChoroplethCalc extends GeoCalc {
  /** `z` per location as a number; NaN where it is not one (the region is not drawn). */
  readonly z: Float64Array;
  /** Location count: the shorter of `locations` and `z`. */
  readonly length: number;
  /**
   * `elevation` per location as a number, NaN where it is not one; `undefined` without the
   * attribute. The height of the regions on a 3D globe (`globe.ts`), and a field of event data.
   */
  readonly elevation?: Float64Array | undefined;
  /**
   * What the locations are matched against is not in hand (it is loading, or could not be
   * loaded): the trace has no regions.
   */
  readonly unresolved: boolean;
  /** The feature each location names; `undefined` where it names none, and while unresolved. */
  readonly features?: readonly (LocatedFeature | undefined)[] | undefined;
  /**
   * The point of each location's feature, in degrees (Plotly's `ct`): where its hover label and
   * keyboard stop are, and what a box or lasso selects it by. NaN where there is none.
   */
  readonly lon?: Float64Array | undefined;
  readonly lat?: Float64Array | undefined;
  /** The regions that are drawn; `undefined` while unresolved. */
  readonly drawn: DrawnRegions | undefined;
}

/** {@link ChoroplethCalc} as its own `located` writes it. */
type Writable<T> = { -readonly [K in keyof T]: T[K] };

type Fit = NonNullable<GeoCalc['fit']>;

const FITS = new WeakMap<DrawnRegions, Fit | null>();

/** Every coordinate of the drawn regions, computed when `fitbounds` first asks. */
function fitOf(drawn: DrawnRegions | undefined): Fit | undefined {
  if (!drawn) return undefined;
  let fit = FITS.get(drawn);
  if (fit === undefined) {
    const lon: number[] = [];
    const lat: number[] = [];
    for (const located of drawn.located) {
      for (const p of geojsonCoords(located.feature)) {
        lon.push(p[0]);
        lat.push(p[1]);
      }
    }
    fit = lon.length > 0 ? { lon, lat } : null;
    FITS.set(drawn, fit);
  }
  return fit ?? undefined;
}

export function calcChoropleth(trace: FullTrace, ctx: CalcContext): ChoroplethCalc {
  const length = typeof trace['_length'] === 'number' ? trace['_length'] : 0;
  const z = zValues(trace['z']);
  // What the warnings call the trace: its name, when it was given one.
  const name = trace['name'];
  const named = typeof name === 'string' && name !== '' && name !== `trace ${ctx.index}`;
  const locations = locationsOf(trace, `choropleth trace ${ctx.index}${named ? ` "${name}"` : ''}`);
  const elevation = trace['elevation'];
  const calc: Writable<ChoroplethCalc> = {
    z,
    length,
    ...(isArrayLike(elevation) && elevation.length > 0 ? { elevation: zValues(elevation) } : {}),
    unresolved: true,
    subplot: undefined,
    drawn: undefined,
    // Read by the layout pass only when the subplot has `fitbounds`.
    get fit() {
      return fitOf(this.drawn);
    },
  };
  if (locations) {
    let current: LocationsResult | undefined;
    calc.locations = locations;
    calc.located = (result) => {
      if (result === current) return;
      current = result;
      calc.unresolved = !result;
      calc.features = result?.features;
      // The answer's arrays are shared with every trace of the same locations: never written.
      calc.lon = result?.lon;
      calc.lat = result?.lat;
      calc.drawn = result ? drawnRegions(result, z, length, locations) : undefined;
    };
  }
  return calc;
}
