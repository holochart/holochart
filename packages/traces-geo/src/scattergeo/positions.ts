/**
 * Where the points of a `scattergeo` trace are drawn (backlog GEO3, ADR-025): each point projected
 * to the geometry of its subplot view's base state, the coordinates `GeoSubplot.transform` carries
 * to the screen. They are cached per calc and view version, so a pan or a zoom reuses them and
 * only a rotation (or a rebase after a zoom) projects again; the view, hover, selection and
 * keyboard stops share them. A trace given by `locations` gets its coordinates in the layout pass,
 * as new arrays: the positions are of the coordinates they were projected from.
 *
 * A point the projection hides (the far side of an orthographic globe, outside the three parts
 * of Albers USA) and a gap have NaN positions: they draw nothing and cannot be hovered or selected
 * (Plotly's `isLonLatOverEdges`).
 */
import type { DataTransform } from '@mk7s/holochart-render';
import type { ScatterCalc } from '@mk7s/holochart-traces-basic';
import type { GeoSubplot } from '../geo/subplot.ts';
import type { GeoView } from '../geo/view.ts';
import type { ScattergeoCalc } from './calc.ts';

/** The projected points of a trace at one view version. */
export interface GeoPositions {
  /** The view version the positions were projected at. */
  readonly version: number;
  /** The longitudes they were projected from (`calc.lon`). */
  readonly lon: Float64Array;
  /** Base-state subplot px of each point; NaN where the point is hidden or a gap. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  /**
   * The trace as a scatter calc in those px, for scatter's view, hit test and selection (they
   * keep a spatial index per calc object, so one object lives as long as the positions do).
   */
  readonly scatter: ScatterCalc;
}

const MEMO = new WeakMap<ScattergeoCalc, GeoPositions>();

const RADIANS = Math.PI / 180;

/**
 * `GeoSubplot.basePoint` for every point of `calc`, into `x` and `y`: the same positions and the
 * same hidden points (the tests compare the two), without its three arrays per point and with the
 * clip test as one cosine. `basePoint` asks d3's `geoDistance` whether a point is past the clip
 * angle, and that streams a line through d3's length sum.
 *
 * This runs on every frame of a rotation, so its cost is the frame's (ADR-025's follow-up for
 * GEO3). For 100,000 points on an M1 Max, in Node, the least and the median of 60 frames in ms:
 *
 * | Projection      | This loop   | A `basePoint` loop | The whole frame |
 * | --------------- | ----------- | ------------------ | --------------- |
 * | orthographic    | 8.2 / 10.3  | 46 / 79            | 10.0 / 12.6     |
 * | equirectangular | 5.2 / 6.1   | 6.0 / 6.9          | 6.4 / 7.5       |
 * | natural earth   | 5.7 / 6.9   | 6.1 / 8.6          | 6.8 / 8.3       |
 * | mercator        | 11.4 / 13.9 | 12.4 / 17.0        | 12.8 / 15.1     |
 *
 * The whole frame is this loop and the marker set packing the new positions (the upload to the
 * GPU is not in it). Half of an orthographic globe's points are hidden and are not projected.
 */
function projectPoints(
  calc: ScattergeoCalc,
  view: GeoView,
  x: Float64Array,
  y: Float64Array,
): void {
  const { lon, lat, length } = calc;
  const projection = view.projection;
  const height = view.size.height;
  // The projection is at the view's current state; positions are kept at its base state.
  const t = view.transform;
  // Plotly's `isLonLatOverEdges`: past the clip angle from the centre of the rotation, by the
  // spherical law of cosines.
  const clip = view.clipAngle;
  const { lon: lon0, lat: lat0 } = view.state.rotation;
  const sin0 = Math.sin(lat0 * RADIANS);
  const cos0 = Math.cos(lat0 * RADIANS);
  const cosClip = clip === null ? -Infinity : Math.cos(clip * RADIANS);
  const lonlat: [number, number] = [0, 0];
  for (let i = 0; i < length; i++) {
    const a = lon[i] as number;
    const b = lat[i] as number;
    x[i] = y[i] = NaN;
    if (Number.isNaN(a)) continue;
    if (clip !== null) {
      const phi = b * RADIANS;
      const cosDistance =
        sin0 * Math.sin(phi) + cos0 * Math.cos(phi) * Math.cos((a - lon0) * RADIANS);
      if (cosDistance < cosClip) continue;
    }
    lonlat[0] = a;
    lonlat[1] = b;
    const px = projection(lonlat);
    if (!px || !Number.isFinite(px[0]) || !Number.isFinite(px[1])) continue;
    x[i] = (px[0] - t.offsetX) / t.scaleX;
    y[i] = (height - px[1] - t.offsetY) / t.scaleY;
  }
}

/**
 * The positions of `calc`'s points on `subplot`, or `undefined` while the subplot has no view (its
 * projection is loading) or the view is not valid.
 */
export function geoPositions(calc: ScattergeoCalc, subplot: GeoSubplot): GeoPositions | undefined {
  const view = subplot.view;
  if (!view?.valid) return undefined;
  const hit = MEMO.get(calc);
  if (hit?.version === view.version && hit.lon === calc.lon) return hit;
  const length = calc.length;
  // New arrays for each version: scatter's spatial index notices new positions by their arrays.
  const x = new Float64Array(length);
  const y = new Float64Array(length);
  projectPoints(calc, view, x, y);
  const positions: GeoPositions = {
    version: view.version,
    lon: calc.lon,
    x,
    y,
    scatter: {
      x,
      y,
      length,
      markerSize: calc.markerSize,
      ppad: calc.ppad,
      errorX: undefined,
      errorY: undefined,
    },
  };
  MEMO.set(calc, positions);
  return positions;
}

/** What {@link subplotFrame} returns. */
export interface SubplotFrame {
  /** Base geometry → container px from the left, and from the **bottom** of a figure `height` tall. */
  readonly transform: DataTransform;
  /** A container point (px, top-left origin) in base geometry coordinates. */
  toBase(cx: number, cy: number): [number, number];
  /** A base geometry point in container px (top-left origin). */
  toContainer(x: number, y: number): [number, number];
}

/**
 * The subplot's current pan and zoom between container px and the base geometry that positions are
 * in. Hover works in the overlay's px (from the bottom of the figure, `height` tall), selection
 * and keyboard stops in container px.
 */
export function subplotFrame(subplot: GeoSubplot, height: number): SubplotFrame {
  const clip = subplot.clipRect;
  const t = subplot.transform;
  // The subplot's viewport has its origin at the bottom-left corner of the clip rect.
  const left = clip.x;
  const bottom = clip.y + clip.height;
  return {
    transform: {
      scaleX: t.scaleX,
      scaleY: t.scaleY,
      offsetX: t.offsetX + left,
      offsetY: t.offsetY + height - bottom,
    },
    toBase: (cx, cy) => [(cx - left - t.offsetX) / t.scaleX, (bottom - cy - t.offsetY) / t.scaleY],
    toContainer: (x, y) => [left + x * t.scaleX + t.offsetX, bottom - (y * t.scaleY + t.offsetY)],
  };
}
