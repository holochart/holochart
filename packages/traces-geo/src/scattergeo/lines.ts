/**
 * The path of a `scattergeo` trace as GeoJSON (backlog GEO3), for its line and its `toself` fill.
 * Ported from plotly.js `src/lib/geojson_utils.js` (MIT): `calcTraceToLineCoords` (gaps split the
 * path unless `connectgaps`), `makeLine` and `makePolygon`.
 *
 * `d3-geo` draws each segment of a `LineString` along its great circle, cut at the antimeridian
 * and at the projection's clip edge and resampled until it is smooth, so the GeoJSON holds the
 * trace's points and nothing else.
 *
 * Two differences from Plotly, both in how a filled path is closed:
 *
 * - Plotly hands the runs to d3 as polygon rings as they are. d3 reads a ring as closed and skips
 *   its last coordinate, so an open run loses its last point. Here a run that does not end where
 *   it starts gets its first point again.
 * - On a sphere a ring bounds two regions, and d3 fills the one on the left of its direction, so
 *   in Plotly a path drawn the other way round fills the whole globe but the shape. Here a ring
 *   that covers more than a hemisphere is reversed: the smaller region is filled.
 */
import { geoArea } from 'd3-geo';
import type { MultiLineString, MultiPolygon, Position } from 'geojson';
import type { ScattergeoCalc } from './calc.ts';

/** The path of a trace, built once per calc and option set. */
export interface GeoPath {
  /** The runs of the trace, closed when the trace is filled. */
  readonly lines: MultiLineString;
  /** `fill: 'toself'`: each closed run as a polygon wound for d3. */
  readonly polygons: MultiPolygon | undefined;
}

/** Plotly's `calcTraceToLineCoords`: the points in order, split at gaps unless `connectgaps`. */
export function lineCoords(calc: ScattergeoCalc, connectgaps: boolean): Position[][] {
  const { lon, lat, length } = calc;
  const coords: Position[][] = [];
  let run: Position[] = [];
  for (let i = 0; i < length; i++) {
    const x = lon[i] as number;
    if (!Number.isNaN(x)) {
      run.push([x, lat[i] as number]);
    } else if (!connectgaps && run.length > 0) {
      coords.push(run);
      run = [];
    }
  }
  if (run.length > 0) coords.push(run);
  return coords;
}

/** `run` ending where it starts. */
function closed(run: Position[]): Position[] {
  const first = run[0] as Position;
  const last = run[run.length - 1] as Position;
  return first[0] === last[0] && first[1] === last[1] ? run : [...run, first];
}

/** A closed run as a ring d3 fills the smaller side of (see the file comment). */
function ring(run: Position[]): Position[] {
  const area = geoArea({ type: 'Polygon', coordinates: [run] });
  return area > 2 * Math.PI ? [...run].reverse() : run;
}

const MEMO = new WeakMap<
  ScattergeoCalc,
  { lon: Float64Array; connectgaps: boolean; fill: boolean; path: GeoPath }
>();

/**
 * The path of `calc`'s points: one line per run, and with `fill` each run closed and as a polygon
 * (a run of fewer than three points bounds nothing and is left out of the polygons).
 */
export function geoPath(calc: ScattergeoCalc, connectgaps: boolean, fill: boolean): GeoPath {
  const hit = MEMO.get(calc);
  // A located trace gets new coordinate arrays when its locations are found.
  if (hit && hit.lon === calc.lon && hit.connectgaps === connectgaps && hit.fill === fill) {
    return hit.path;
  }
  let runs = lineCoords(calc, connectgaps);
  let polygons: MultiPolygon | undefined;
  if (fill) {
    runs = runs.map(closed);
    polygons = {
      type: 'MultiPolygon',
      // A closed run of three distinct points has four coordinates.
      coordinates: runs.filter((run) => run.length >= 4).map((run) => [ring(run)]),
    };
  }
  const path: GeoPath = { lines: { type: 'MultiLineString', coordinates: runs }, polygons };
  MEMO.set(calc, { lon: calc.lon, connectgaps, fill, path });
  return path;
}
