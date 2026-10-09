/**
 * Pan, zoom and rotate of a geo subplot as pure maths (backlog GEO2): given a view and a gesture
 * in plain numbers, the new view state and the relayout that commits it. No DOM, no events.
 *
 * Ported from plotly.js `src/plots/geo/zoom.js` (MIT): the three interactions `zoomScoped`,
 * `zoomNonClipped` and `zoomClipped` with its quaternion helpers (after Jason Davies'
 * `d3.geo.zoom`), and the keys `sync` writes; from `src/plots/geo/geo.js` (MIT): `saveViewInitial`
 * and the double-click reset of `updateFx`. Plotly drives these with d3 v3's zoom behaviour; the
 * part of that behaviour they depend on (the scale clamped to its extent, and the translate that
 * keeps the grabbed pixel under the pointer) is {@link moveGeoGesture}'s first lines.
 *
 * ## The three modes ({@link GeoView.mode})
 *
 * - **scoped** (any scope but the world, and Albers USA): a drag moves the translate point, a
 *   zoom scales about the pointer. Both are exact and neither reprojects. The relayout has
 *   `center.lon`, `center.lat` and `projection.scale`.
 * - **unclipped** (a world map that shows the whole sphere: equirectangular, natural earth, …):
 *   the map moves up and down with the pointer and turns in longitude so that the meridian that
 *   was grabbed stays under it. The relayout has `projection.rotation.lon`, `center.lon`,
 *   `center.lat` and `projection.scale`. A gesture that starts off the map does nothing.
 * - **clipped** (a world map of part of the sphere: orthographic, stereographic, …): the globe
 *   turns in longitude and latitude so that the point that was grabbed stays under the pointer,
 *   keeping its roll; a zoom scales about the middle and then turns the same way. The relayout has
 *   `projection.rotation.lon`, `projection.rotation.lat` and `projection.scale`.
 *
 * Every relayout also has `fitbounds: false` when `fitbounds` was on, so the next draw does not
 * fit again over what the user chose. As in Plotly, a key is left out when its value is what the
 * layout already has.
 *
 * Pixels are subplot px (y up), as everywhere in this folder.
 */
import type { FullGeoLayout } from './types.ts';
import {
  geoInteractionMode,
  INSIDE_TOLERANCE_PX,
  type GeoView,
  type GeoViewState,
} from './view.ts';

type Pair = readonly [number, number];
type Vec3 = readonly [number, number, number];
type Quaternion = readonly [number, number, number, number];

const RADIANS = Math.PI / 180;
const DEGREES = 180 / Math.PI;

/**
 * A turn smaller than this many degrees (a tenth of a millimetre on the ground) is rounding, not
 * a rotation: a zoom about the middle of a map must not reproject it.
 */
const ROTATION_EPSILON = 1e-9;

/** A relayout update: attribute paths (`'geo.center.lon'`) to values. */
export type GeoRelayout = Record<string, number | string | boolean | null>;

/** A pointer gesture from where it began. */
export interface GeoGesture {
  /** The view's state when the gesture began. */
  readonly state: GeoViewState;
  /** Where it began, in subplot px. */
  readonly start: Pair;
  /** The longitude and latitude under `start`; `null` when it began off the map. */
  readonly anchor: Pair | null;
}

/** What a step of a gesture does. */
export interface GeoInteraction {
  /** The new state: preview it with `view.set(state)`. The view's own state when nothing changed. */
  readonly state: GeoViewState;
  /** Whether `state` differs from the view's. */
  readonly changed: boolean;
  /** The relayout that commits `state`, with exactly the keys Plotly emits for the mode. */
  readonly relayout: GeoRelayout;
  /**
   * The gesture to pass to the next step. It is the one passed in, except when a rotation that
   * began off the globe has reached it: then it is anchored where the pointer is now.
   */
  readonly gesture: GeoGesture;
}

/**
 * The scale factor of one wheel event, as d3 v3's zoom behaviour computes it: a tick of 100 px
 * down zooms out by about 13%. `deltaMode` is the event's (0 for pixels).
 */
export function geoWheelFactor(deltaY: number, deltaMode = 0): number {
  return Math.pow(2, -deltaY * (deltaMode ? 120 : 1) * 0.002);
}

/** Begins a gesture (a drag, a pinch or a wheel step) at a pixel. */
export function startGeoGesture(view: GeoView, x: number, y: number): GeoGesture {
  return { state: view.state, start: [x, y], anchor: view.invertAt(view.state, x, y) };
}

/**
 * One step of a gesture: the pointer (or the middle of a pinch) is now at `(x, y)` and the zoom
 * since the gesture began is `factor`. Apply each result (`view.set(result.state)`) before the
 * next step: the rotations turn from where the last step left the view, as Plotly's do.
 *
 * `id` is the subplot's id (`'geo'`, `'geo2'`, …), the prefix of the relayout keys.
 */
export function moveGeoGesture(
  view: GeoView,
  gesture: GeoGesture,
  x: number,
  y: number,
  factor = 1,
  id = 'geo',
): GeoInteraction {
  const current = view.state;
  const s0 = gesture.state;
  const [lo, hi] = view.scaleExtent;
  const clamp = (k: number): number => Math.max(lo, Math.min(hi, k));
  // d3's zoom clamps the scale it starts from, so a view outside its extent snaps into it on the
  // first step of any gesture.
  const k0 = clamp(s0.scale);
  const k1 = clamp(k0 * (factor > 0 && Number.isFinite(factor) ? factor : 1));
  if (!(k0 > 0) || !(k1 > 0) || !Number.isFinite(x + y)) return unchanged(view, gesture, id);
  // The zoom's translate keeps what was under the start pixel under the pointer.
  const z = k1 / k0;
  const tx = x - (gesture.start[0] - s0.translate[0]) * z;
  const ty = y - (gesture.start[1] - s0.translate[1]) * z;

  let next: GeoViewState;
  let nextGesture = gesture;
  if (view.mode === 'scoped') {
    next = { rotation: current.rotation, scale: k1, translate: [tx, ty] };
    // Past where the projection can say what is in the middle there is no `center` to commit.
    if (!view.toLayout(next).center) return unchanged(view, gesture, id);
  } else if (view.mode === 'unclipped') {
    if (isOutside(view, current, gesture.start)) return unchanged(view, gesture, id);
    // Up and down is a translation; left and right is a rotation, so x stays where it was.
    const moved: GeoViewState = {
      rotation: current.rotation,
      scale: k1,
      translate: [s0.translate[0], ty],
    };
    let rotation = current.rotation;
    if (!gesture.anchor) {
      nextGesture = { state: s0, start: [x, y], anchor: view.invertAt(moved, x, y) };
    } else {
      // Turn by the difference between the meridian now under the pointer and the one grabbed.
      // Exact where parallels are drawn as horizontal lines (cylindrical and pseudocylindrical
      // projections): the move up or down has brought the grabbed parallel under the pointer, and
      // a turn slides it along itself. For the others each step closes most of the gap.
      const under = view.invertAt(moved, x, y);
      const turn = under ? angleMod(under[0] - gesture.anchor[0]) : 0;
      if (Math.abs(turn) > ROTATION_EPSILON) {
        rotation = {
          lon: angleMod(current.rotation.lon - turn),
          lat: s0.rotation.lat,
          roll: s0.rotation.roll,
        };
      }
    }
    next = { ...moved, rotation };
  } else {
    // Only the scale and the rotation change: the globe stays where it is in the subplot.
    const scaled: GeoViewState = { ...current, scale: k1 };
    let rotation = current.rotation;
    if (!gesture.anchor) {
      // The pointer was not over the globe yet. Perhaps it is now: the next step will tell.
      nextGesture = { state: s0, start: [x, y], anchor: view.invertAt(scaled, x, y) };
    } else if (view.invertAt(scaled, x, y)) {
      // Go back to the rotation the gesture began with (at the new scale), find what the pointer
      // is over there, and compose the turn that brings the anchor to it with that rotation.
      const under = view.invertAt({ ...s0, scale: k1 }, x, y);
      const last: Vec3 = [-current.rotation.lon, -current.rotation.lat, current.rotation.roll];
      const from = cartesian(gesture.anchor);
      const between = under && rotateBetween(from, cartesian(under));
      if (between) {
        const start: Vec3 = [-s0.rotation.lon, -s0.rotation.lat, s0.rotation.roll];
        const euler = eulerFromQuaternion(multiply(quaternionFromEuler(start), between));
        const angles = unRoll(euler, from, last);
        if (
          Number.isFinite(angles[0] + angles[1] + angles[2]) &&
          angleDistance(last[0], last[1], angles[0], angles[1]) > ROTATION_EPSILON
        ) {
          rotation = { lon: angleMod(-angles[0]), lat: angleMod(-angles[1]), roll: angles[2] };
        }
      }
    }
    next = { ...scaled, rotation };
  }

  const changed = !sameState(next, current);
  const state = changed ? next : current;
  return { state, changed, relayout: geoRelayout(view, state, id), gesture: nextGesture };
}

/** A drag from one pixel to another in one step. */
export function dragGeoView(view: GeoView, from: Pair, to: Pair, id = 'geo'): GeoInteraction {
  return moveGeoGesture(view, startGeoGesture(view, from[0], from[1]), to[0], to[1], 1, id);
}

/** A wheel step or a pinch about a fixed pixel: zoom by `factor` (above 1 zooms in) about `(x, y)`. */
export function zoomGeoView(
  view: GeoView,
  factor: number,
  x: number,
  y: number,
  id = 'geo',
): GeoInteraction {
  return moveGeoGesture(view, startGeoGesture(view, x, y), x, y, factor, id);
}

/** The share of the subplot a Shift + arrow moves its map by (as the cartesian pan keys do). */
export const GEO_KEY_PAN = 0.1;
/** The factor `+` zooms a map by; `-` zooms by its inverse (the cartesian keys' 0.8 of a range). */
export const GEO_KEY_ZOOM = 1.25;

/** Where each pan key takes the view, as `[east, north]`. */
const KEY_PANS: Readonly<Record<string, Pair>> = {
  panLeft: [-1, 0],
  panRight: [1, 0],
  panUp: [0, 1],
  panDown: [0, -1],
};

/**
 * A view key as the gesture it stands for (backlog GEO6, S2.14), from the middle of the map
 * ({@link GeoView.midPoint}):
 *
 * - `'panLeft'`, `'panRight'`, `'panUp'`, `'panDown'` (Shift + arrows): a drag by a tenth of
 *   `size`, the size of the rect the subplot draws in. The view goes where the arrow points, so
 *   the map moves the other way: a scoped map pans, a world map turns in longitude and moves up
 *   and down, a globe turns in longitude and latitude (by a tenth of the rect's smaller side in
 *   both directions, so that it turns as far up as sideways).
 * - `'zoomIn'`, `'zoomOut'` (`+`, `-`): a zoom by {@link GEO_KEY_ZOOM} about the middle, inside
 *   `[minscale, maxscale]`.
 *
 * The result is a drag's or a wheel step's: `relayout` commits it with the keys Plotly writes.
 * `undefined` for any other action, and for a view that is not valid.
 */
export function keyGeoView(
  view: GeoView,
  action: string,
  size: { readonly width: number; readonly height: number },
  id = 'geo',
): GeoInteraction | undefined {
  if (!view.valid) return undefined;
  const [x, y] = view.midPoint;
  if (action === 'zoomIn' || action === 'zoomOut') {
    return zoomGeoView(view, action === 'zoomIn' ? GEO_KEY_ZOOM : 1 / GEO_KEY_ZOOM, x, y, id);
  }
  const pan = KEY_PANS[action];
  if (!pan) return undefined;
  const side = Math.min(size.width, size.height);
  const dx = GEO_KEY_PAN * (view.mode === 'clipped' ? side : size.width);
  const dy = GEO_KEY_PAN * (view.mode === 'clipped' ? side : size.height);
  // Subplot px have y up: the map moves west for a view that goes east, and south for north.
  return dragGeoView(view, [x, y], [x - pan[0] * dx, y - pan[1] * dy], id);
}

/**
 * Brings `projection.scale` into `[minscale, maxscale]` when the layout's is outside it: the zoom
 * event Plotly dispatches on the first draw of an interactive map, a zoom by 1 about the middle.
 */
export function clampGeoView(view: GeoView, id = 'geo'): GeoInteraction {
  return zoomGeoView(view, 1, view.midPoint[0], view.midPoint[1], id);
}

/**
 * The relayout that commits `state`: Plotly's `sync`. The mode's keys, then `projection.scale`,
 * then `fitbounds: false`; a key whose value the layout already has is left out. While
 * `fitbounds` is on the layout's view attributes are only stand-ins for the fit, so all are written.
 */
export function geoRelayout(view: GeoView, state: GeoViewState, id = 'geo'): GeoRelayout {
  const layout = view.layout;
  const fitted = layout.fitbounds !== false;
  const out: GeoRelayout = {};
  // The centre comes back through the projection's inverse, so a value nobody moved returns a
  // few ulps off (14.999999999999998 for 15); that is not a change.
  const same = (current: unknown, value: number): boolean =>
    typeof current === 'number' && Math.abs(current - value) <= 1e-9 * Math.max(1, Math.abs(value));
  const put = (path: string, current: unknown, value: number): void => {
    if (fitted || !same(current, value)) out[`${id}.${path}`] = value;
  };
  const now = view.toLayout(state);
  if (view.mode !== 'scoped') {
    put('projection.rotation.lon', layout.projection.rotation?.lon, now.rotation.lon);
  }
  if (view.mode === 'clipped') {
    put('projection.rotation.lat', layout.projection.rotation?.lat, now.rotation.lat);
  } else if (now.center) {
    put('center.lon', layout.center?.lon, now.center.lon);
    put('center.lat', layout.center?.lat, now.center.lat);
  }
  put('projection.scale', layout.projection.scale, now.scale);
  if (fitted) out[`${id}.fitbounds`] = false;
  return out;
}

/**
 * The state of `to` that shows what `from` shows at `state`, for a layout pass that replaces the
 * view of a subplot while a gesture holds it (new data, a resize, the relayout of the gesture
 * before): the new view takes up the gesture's view, which the layout does not have yet.
 *
 * What is carried is the view as the layout would say it ({@link GeoView.toLayout}): the rotation,
 * `projection.scale`, and the longitude and latitude in the middle. Two views of one size and fit
 * then draw the same picture; after a resize the new one draws the same map in its own rect.
 * `null` when `to` is another kind of map (its type or its interaction differ), when either view
 * is not valid, or when the projection cannot say what is in the middle.
 */
export function carryGeoViewState(
  from: GeoView,
  to: GeoView,
  state: GeoViewState,
): GeoViewState | null {
  if (!from.valid || !to.valid || from.type !== to.type || from.mode !== to.mode) return null;
  // A globe stays where it is in its subplot: only its rotation and its scale are the view.
  const placed: GeoViewState = {
    rotation: state.rotation,
    scale: state.scale,
    translate: to.initialState.translate,
  };
  if (to.mode === 'clipped') return placed;
  const center = from.invertAt(state, from.midPoint[0], from.midPoint[1]);
  const drawn = center && to.projectAt(placed, center[0], center[1]);
  if (!drawn) return null;
  return {
    rotation: placed.rotation,
    scale: placed.scale,
    translate: [
      placed.translate[0] + to.midPoint[0] - drawn[0],
      placed.translate[1] + to.midPoint[1] - drawn[1],
    ],
  };
}

/** The view a double-click returns to, as attribute paths inside the container (Plotly's `viewInitial`). */
export type GeoViewInitial = Readonly<Record<string, number | string | false | null>>;

/**
 * Plotly's `saveViewInitial`: what to keep of a container when its subplot is first drawn (and
 * again when its `scope` changes), for {@link geoResetRelayout}. While `fitbounds` is on, the
 * attributes it computes are saved as `null`: resetting them lets the fit run again.
 */
export function saveGeoViewInitial(layout: FullGeoLayout): GeoViewInitial {
  const mode = geoInteractionMode(layout.scope, layout.projection.type);
  const auto = layout.fitbounds !== false;
  const kept = (v: number | undefined): number | null => (auto || v === undefined ? null : v);
  const center = {
    'center.lon': kept(layout.center?.lon),
    'center.lat': kept(layout.center?.lat),
  };
  const rotation = layout.projection.rotation;
  const base = { fitbounds: layout.fitbounds, 'projection.scale': kept(layout.projection.scale) };
  if (mode === 'scoped') return { ...base, ...center };
  if (mode === 'clipped') {
    return {
      ...base,
      'projection.rotation.lon': kept(rotation?.lon),
      'projection.rotation.lat': kept(rotation?.lat),
      ...center,
    };
  }
  return { ...base, ...center, 'projection.rotation.lon': kept(rotation?.lon) };
}

/** The relayout of a double-click: every key of the saved view, whatever the layout has now. */
export function geoResetRelayout(initial: GeoViewInitial, id = 'geo'): GeoRelayout {
  const out: GeoRelayout = {};
  for (const [path, value] of Object.entries(initial)) out[`${id}.${path}`] = value;
  return out;
}

function unchanged(view: GeoView, gesture: GeoGesture, id: string): GeoInteraction {
  return {
    state: view.state,
    changed: false,
    relayout: geoRelayout(view, view.state, id),
    gesture,
  };
}

function sameState(a: GeoViewState, b: GeoViewState): boolean {
  return (
    a.scale === b.scale &&
    a.translate[0] === b.translate[0] &&
    a.translate[1] === b.translate[1] &&
    a.rotation.lon === b.rotation.lon &&
    a.rotation.lat === b.rotation.lat &&
    a.rotation.roll === b.rotation.roll
  );
}

/**
 * Plotly's `outside`: a pixel is off the map when it has no longitude and latitude, or when they
 * are drawn somewhere else (the inverse of a projection reaches past its outline).
 */
function isOutside(view: GeoView, state: GeoViewState, px: Pair): boolean {
  const lonlat = view.invertAt(state, px[0], px[1]);
  if (!lonlat) return true;
  const back = view.projectAt(state, lonlat[0], lonlat[1]);
  return (
    !back ||
    Math.abs(back[0] - px[0]) > INSIDE_TOLERANCE_PX ||
    Math.abs(back[1] - px[1]) > INSIDE_TOLERANCE_PX
  );
}

// The helpers of `zoomClipped`. Angles are d3's `rotate`: degrees, `[-lon, -lat, roll]`.

function cartesian(lonlat: Pair): Vec3 {
  const lambda = lonlat[0] * RADIANS;
  const phi = lonlat[1] * RADIANS;
  const cosPhi = Math.cos(phi);
  return [cosPhi * Math.cos(lambda), cosPhi * Math.sin(lambda), Math.sin(phi)];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function quaternionFromEuler(euler: Vec3): Quaternion {
  const lambda = 0.5 * euler[0] * RADIANS;
  const phi = 0.5 * euler[1] * RADIANS;
  const gamma = 0.5 * euler[2] * RADIANS;
  const sinLambda = Math.sin(lambda);
  const cosLambda = Math.cos(lambda);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinGamma = Math.sin(gamma);
  const cosGamma = Math.cos(gamma);
  return [
    cosLambda * cosPhi * cosGamma + sinLambda * sinPhi * sinGamma,
    sinLambda * cosPhi * cosGamma - cosLambda * sinPhi * sinGamma,
    cosLambda * sinPhi * cosGamma + sinLambda * cosPhi * sinGamma,
    cosLambda * cosPhi * sinGamma - sinLambda * sinPhi * cosGamma,
  ];
}

function multiply(a: Quaternion, b: Quaternion): Quaternion {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

/**
 * The rotation that takes unit vector `a` to `b` along the great circle through them. Two equal
 * points need no rotation; two opposite ones have no single answer, and get `null`.
 */
function rotateBetween(a: Vec3, b: Vec3): Quaternion | null {
  const axis = cross(a, b);
  const norm = Math.sqrt(dot(axis, axis));
  const cosAngle = Math.max(-1, Math.min(1, dot(a, b)));
  if (norm === 0) return cosAngle > 0 ? [1, 0, 0, 0] : null;
  const halfGamma = 0.5 * Math.acos(cosAngle);
  const k = Math.sin(halfGamma) / norm;
  return [Math.cos(halfGamma), axis[2] * k, -axis[1] * k, axis[0] * k];
}

function eulerFromQuaternion(q: Quaternion): Vec3 {
  return [
    Math.atan2(2 * (q[0] * q[1] + q[2] * q[3]), 1 - 2 * (q[1] * q[1] + q[2] * q[2])) * DEGREES,
    Math.asin(Math.max(-1, Math.min(1, 2 * (q[0] * q[2] - q[3] * q[1])))) * DEGREES,
    Math.atan2(2 * (q[0] * q[3] + q[1] * q[2]), 1 - 2 * (q[2] * q[2] + q[3] * q[3])) * DEGREES,
  ];
}

/** Rotates a vector about axis 0 (x), 1 (y) or 2 (z) by an angle in degrees. */
function rotateCartesian(vector: Vec3, axis: 0 | 1 | 2, angle: number): Vec3 {
  const rad = angle * RADIANS;
  const out: [number, number, number] = [vector[0], vector[1], vector[2]];
  const ax1 = axis === 0 ? 1 : 0;
  const ax2 = axis === 2 ? 1 : 2;
  const cosa = Math.cos(rad);
  const sina = Math.sin(rad);
  out[ax1] = vector[ax1] * cosa - vector[ax2] * sina;
  out[ax2] = vector[ax2] * cosa + vector[ax1] * sina;
  return out;
}

/** Reduces an angle in degrees to [-180, 180). */
function angleMod(angle: number): number {
  return (((angle % 360) + 540) % 360) - 180;
}

function angleDistance(yaw0: number, pitch0: number, yaw1: number, pitch1: number): number {
  return Math.hypot(angleMod(yaw1 - yaw0), angleMod(pitch1 - pitch0));
}

/**
 * Plotly's `unRoll`: Euler angles that draw `pt` where `angles` draw it, but with the roll of
 * `last`, so a drag turns the globe without tilting it. There are two such rotations (the point
 * can be reached from either side of the pole); the one nearer to `last` is taken. When the roll
 * cannot be undone exactly (the point is nearer the pole than its target), the yaw that comes
 * closest is used.
 */
function unRoll(angles: Vec3, pt: Vec3, last: Vec3): Vec3 {
  // Where the angles put the point, with the unwanted roll taken back out.
  let rotated = rotateCartesian(pt, 2, angles[0]);
  rotated = rotateCartesian(rotated, 1, angles[1]);
  rotated = rotateCartesian(rotated, 0, angles[2] - last[2]);

  const [x, y, z] = pt;
  const [f, g, h] = rotated;

  // Solve rotated = pitch(yaw(pt)) for the yaw and the pitch.
  const theta = Math.atan2(y, x) * DEGREES;
  const a = Math.sqrt(x * x + y * y);
  let b: number;
  let yaw1: number;
  if (Math.abs(g) > a) {
    yaw1 = (g > 0 ? 90 : -90) - theta;
    b = 0;
  } else {
    yaw1 = Math.asin(g / a) * DEGREES - theta;
    b = Math.sqrt(a * a - g * g);
  }
  const yaw2 = 180 - yaw1 - 2 * theta;
  const pitch1 = (Math.atan2(h, f) - Math.atan2(z, b)) * DEGREES;
  const pitch2 = (Math.atan2(h, f) - Math.atan2(z, -b)) * DEGREES;

  const dist1 = angleDistance(last[0], last[1], yaw1, pitch1);
  const dist2 = angleDistance(last[0], last[1], yaw2, pitch2);
  return dist1 <= dist2 ? [yaw1, pitch1, last[2]] : [yaw2, pitch2, last[2]];
}
