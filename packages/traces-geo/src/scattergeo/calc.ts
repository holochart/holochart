/**
 * `scattergeo` calc (backlog GEO3), following plotly.js `scattergeo/calc.js` and the `fitbounds`
 * part of `scattergeo/plot.js` (`calcGeoJSON`, `fitCoords`; MIT): `lon` / `lat` → typed arrays
 * (a point missing either coordinate is a gap), marker sizes as scatter computes them, and the
 * trace's part in `fitbounds`: its coordinates, with room for half the largest marker.
 *
 * A trace given by `locations` has its coordinates from the features they name (the basemap's, or
 * the trace's `geojson`), which the layout pass finds and hands over (`GeoCalc.located`): until
 * then, and when their data cannot be loaded, the trace has no positions and draws nothing. As in
 * Plotly, `locations` win over `lon` / `lat`.
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import type { CalcContext } from '@mk7s/holochart-runtime';
import { scatter, type ScatterCalc } from '@mk7s/holochart-traces-basic';
import type { GeoCalc } from '../geo/cross-trace.ts';
import { locationsOf, type LocatedFeature, type LocationsResult } from '../geo/locations.ts';

/** @experimental */
export interface ScattergeoCalc extends GeoCalc {
  /**
   * Longitude and latitude per point, in degrees; both NaN where the point is a gap. For a trace
   * given by `locations` they are the points of the features, and the arrays are replaced when
   * the layout pass locates the trace: what is derived from them is cached by the arrays.
   */
  readonly lon: Float64Array;
  readonly lat: Float64Array;
  /** Point count. */
  readonly length: number;
  /** Drawn marker diameters in px (one value, or per point), as scatter's calc gives them. */
  readonly markerSize: ScatterCalc['markerSize'];
  readonly ppad: ScatterCalc['ppad'];
  /**
   * The trace gives `locations` and what they are matched against is not in hand (it is loading,
   * or could not be loaded): the trace has no positions.
   */
  readonly unresolved: boolean;
  /** For a located trace, the feature each location names; `undefined` where it names none. */
  readonly features?: readonly (LocatedFeature | undefined)[] | undefined;
}

/** {@link ScattergeoCalc} as its own `located` writes it. */
type Writable<T> = { -readonly [K in keyof T]: T[K] };

/** A number, or a numeric string (Plotly's `isNumeric`); NaN otherwise. */
function numeric(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string' || v.trim() === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Half the largest marker diameter, in px. */
function fitPad(size: ScatterCalc['markerSize']): number {
  if (typeof size === 'number') return size / 2;
  let max = 0;
  for (let i = 0; i < size.length; i++) if ((size[i] as number) > max) max = size[i] as number;
  return max / 2;
}

export function calcScattergeo(trace: FullTrace, ctx: CalcContext): ScattergeoCalc {
  const length = typeof trace['_length'] === 'number' ? trace['_length'] : 0;
  const lon = new Float64Array(length).fill(NaN);
  const lat = new Float64Array(length).fill(NaN);
  // What the warning about unmatched locations calls the trace: its name, when it was given one.
  const name = trace['name'];
  const named = typeof name === 'string' && name !== '' && name !== `trace ${ctx.index}`;
  const locations = locationsOf(trace, `scattergeo trace ${ctx.index}${named ? ` "${name}"` : ''}`);
  if (!locations) {
    const lonIn = trace['lon'];
    const latIn = trace['lat'];
    if (isArrayLike(lonIn) && isArrayLike(latIn)) {
      for (let i = 0; i < length; i++) {
        const x = numeric(lonIn[i]);
        const y = numeric(latIn[i]);
        if (Number.isNaN(x) || Number.isNaN(y)) continue;
        lon[i] = x;
        lat[i] = y;
      }
    }
  }
  // Scatter's calc resolves marker sizes (`sizeref`, `sizemode`, …).
  const base = scatter.calc!({ ...trace, x: lon, y: lat, _length: length } as FullTrace, {
    fullLayout: ctx.fullLayout,
    index: ctx.index,
    xaxis: undefined,
    yaxis: undefined,
  });
  const pad = fitPad(base.markerSize);
  const calc: Writable<ScattergeoCalc> = {
    lon,
    lat,
    length,
    markerSize: base.markerSize,
    ppad: base.ppad,
    unresolved: locations !== undefined,
    subplot: undefined,
    ...(!locations && length > 0 ? { fit: { lon, lat, pad } } : {}),
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
      calc.lon = result?.lon ?? lon;
      calc.lat = result?.lat ?? lat;
      calc.fit = result ? { lon: result.lon, lat: result.lat, pad } : undefined;
    };
  }
  return calc;
}
