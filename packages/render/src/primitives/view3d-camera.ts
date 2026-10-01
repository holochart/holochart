/**
 * Camera math of the 2.5D view (plan E8.9, `layout.view3d`): a 2D subplot's plot area seen as a
 * plane in 3D. Pure (three.js math classes only), shared by the lazily loaded projector
 * (`view3d.ts`) and the unit tests.
 *
 * ## Frame
 *
 * A 2D viewport's world is CSS px with the origin at its rect's bottom-left, +y up (ADR-008); the
 * plot plane is z = 0 and extruded shapes stand out toward +z (the viewer). The camera orbits the
 * center of the rect, `C = (W / 2, H / 2, 0)`, at distance `D`:
 *
 * - `tilt` (degrees, ±{@link VIEW3D_MAX_ANGLE}): elevation — positive looks down from above, so the
 *   tops of vertical bars show;
 * - `rotation` (degrees, ±{@link VIEW3D_MAX_ANGLE}): azimuth — positive looks from the right, so
 *   the right sides show;
 * - `perspective` (0–1): the field of view is `perspective · 75°` across the rect's diagonal
 *   (`D = diagonal / 2 / tan(fov / 2)`); 0 is a parallel (orthographic) projection.
 *
 * ## Tilt 0 is the flat view
 *
 * The projection window is the flat view's orthographic frustum (`orthoFrustum` of the rect in its
 * render area), taken relative to `C` and, for a perspective camera, scaled to the near plane by
 * `near / D`. With `tilt = rotation = 0` every point of the plane z = 0 lands exactly where the
 * flat view draws it, for any `perspective` (extruded shapes then show a little of their sides).
 *
 * ## Fit
 *
 * Tilted, the near half of the plane grows: the window is widened by `fit ≥ 1` (a zoom out about
 * `C`) until the plane's four corners project inside the rect, so axes and their labels stay in
 * the subplot's area and the flat layout (margins, other subplots) still holds.
 */
import { Matrix4, Vector3, Vector4 } from 'three';
import type { ViewportRect } from '../core/viewport.ts';

/** Limit of `tilt` and `rotation` (degrees). */
export const VIEW3D_MAX_ANGLE = 80;

/** Field of view (degrees) at `perspective: 1`. */
export const VIEW3D_MAX_FOV = 75;

/** The angles of a 2.5D view (`layout.view3d`). */
export interface View3DAngles {
  /** Degrees; positive looks from above. */
  readonly tilt: number;
  /** Degrees; positive looks from the right. */
  readonly rotation: number;
  /** 0 (parallel projection) to 1 (strong perspective). */
  readonly perspective: number;
}

/** The camera of a 2.5D view (world = the viewport's world, CSS px). */
export interface View3DCamera {
  readonly orthographic: boolean;
  /** Camera position, and the point it looks at (`C`). */
  readonly eye: Vector3;
  readonly target: Vector3;
  /** Distance from the eye to `C`. */
  readonly distance: number;
  readonly near: number;
  readonly far: number;
  /** Projection window (near plane for perspective): left, right, top, bottom. */
  readonly window: readonly [number, number, number, number];
  /** How much the window was widened so the tilted plane fits the rect (≥ 1). */
  readonly fit: number;
  /** World → view. */
  readonly view: Matrix4;
  readonly projection: Matrix4;
  /** World → clip, and its inverse. */
  readonly viewProjection: Matrix4;
  readonly inverse: Matrix4;
}

const DEG = Math.PI / 180;

function clampAngle(v: number): number {
  return Number.isFinite(v) ? Math.max(-VIEW3D_MAX_ANGLE, Math.min(VIEW3D_MAX_ANGLE, v)) : 0;
}

/** The view matrix of a camera at `eye` looking at `target` with `up` (three.js' convention). */
function lookAt(eye: Vector3, target: Vector3, up: Vector3): Matrix4 {
  const z = new Vector3().subVectors(eye, target).normalize();
  const x = new Vector3().crossVectors(up, z).normalize();
  const y = new Vector3().crossVectors(z, x);
  // Rows are the camera axes; translation moves the eye to the origin.
  return new Matrix4().set(
    x.x,
    x.y,
    x.z,
    -x.dot(eye),
    y.x,
    y.y,
    y.z,
    -y.dot(eye),
    z.x,
    z.y,
    z.z,
    -z.dot(eye),
    0,
    0,
    0,
    1,
  );
}

/**
 * The 2.5D camera of a viewport whose rect (container px, top-left origin) is drawn into `area`
 * (see the module comment).
 */
export function view3dCamera(
  rect: Readonly<ViewportRect>,
  area: Readonly<ViewportRect>,
  angles: Readonly<View3DAngles>,
): View3DCamera {
  const W = Math.max(1, rect.width);
  const H = Math.max(1, rect.height);
  const diag = Math.hypot(W, H);
  const p = Number.isFinite(angles.perspective) ? Math.max(0, Math.min(1, angles.perspective)) : 0;
  const orthographic = p < 1e-3;
  const fov = p * VIEW3D_MAX_FOV * DEG;
  const distance = orthographic ? 2 * diag : diag / 2 / Math.tan(fov / 2);
  const tilt = clampAngle(angles.tilt) * DEG;
  const rot = clampAngle(angles.rotation) * DEG;
  const target = new Vector3(W / 2, H / 2, 0);
  const eye = new Vector3(
    Math.sin(rot) * Math.cos(tilt),
    Math.sin(tilt),
    Math.cos(rot) * Math.cos(tilt),
  )
    .multiplyScalar(distance)
    .add(target);
  const view = lookAt(eye, target, new Vector3(0, 1, 0));

  // Fit: widen the window until the plane's corners project inside the rect.
  let fit = 1;
  const v = new Vector4();
  for (const [cx, cy] of [
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
  ] as const) {
    v.set(cx, cy, 0, 1).applyMatrix4(view);
    if (v.z >= 0) continue;
    const s = orthographic ? 1 : distance / -v.z;
    fit = Math.max(fit, Math.abs(v.x * s) / (W / 2), Math.abs(v.y * s) / (H / 2));
  }
  // Rounding at tilt 0 (the corners land on the rect's edges): exactly the flat view.
  if (fit < 1 + 1e-9) fit = 1;

  // The flat view's frustum (`orthoFrustum` in `viewport.ts`; not imported, so this lazily loaded
  // chunk takes nothing from render's entry).
  const rectBottom = rect.y + rect.height;
  const f = {
    left: area.x - rect.x,
    right: area.x + area.width - rect.x,
    top: rectBottom - area.y,
    bottom: rectBottom - (area.y + area.height),
  };
  const near = orthographic ? 1 : Math.max(distance * 0.02, distance - diag);
  const far = distance + 2 * diag + 1;
  const k = (orthographic ? 1 : near / distance) * fit;
  const window = [
    (f.left - W / 2) * k,
    (f.right - W / 2) * k,
    (f.top - H / 2) * k,
    (f.bottom - H / 2) * k,
  ] as const;
  const projection = orthographic
    ? new Matrix4().makeOrthographic(window[0], window[1], window[2], window[3], near, far)
    : new Matrix4().makePerspective(window[0], window[1], window[2], window[3], near, far);
  const viewProjection = new Matrix4().multiplyMatrices(projection, view);
  const inverse = viewProjection.clone().invert();
  return {
    orthographic,
    eye,
    target,
    distance,
    near,
    far,
    window,
    fit,
    view,
    projection,
    viewProjection,
    inverse,
  };
}

const tmp = new Vector4();

/**
 * Where the world point `(x, y, z)` of a viewport (rect-local px, bottom-left origin) appears, in
 * container px (top-left origin).
 */
export function view3dProject(
  camera: View3DCamera,
  area: Readonly<ViewportRect>,
  x: number,
  y: number,
  z = 0,
): [number, number] {
  tmp.set(x, y, z, 1).applyMatrix4(camera.viewProjection);
  const nx = tmp.x / tmp.w;
  const ny = tmp.y / tmp.w;
  return [area.x + ((nx + 1) / 2) * area.width, area.y + ((1 - ny) / 2) * area.height];
}

/**
 * The pointer ray through a container point `(sx, sy)`: its world origin (on the near plane) and
 * direction (toward the scene, unnormalized).
 */
export function view3dRay(
  camera: View3DCamera,
  area: Readonly<ViewportRect>,
  sx: number,
  sy: number,
): { origin: Vector3; direction: Vector3 } {
  const nx = ((sx - area.x) / Math.max(1e-9, area.width)) * 2 - 1;
  const ny = 1 - ((sy - area.y) / Math.max(1e-9, area.height)) * 2;
  const a = new Vector4(nx, ny, -1, 1).applyMatrix4(camera.inverse);
  const b = new Vector4(nx, ny, 1, 1).applyMatrix4(camera.inverse);
  const origin = new Vector3(a.x / a.w, a.y / a.w, a.z / a.w);
  const end = new Vector3(b.x / b.w, b.y / b.w, b.z / b.w);
  return { origin, direction: end.sub(origin) };
}

/**
 * The world point of the plot plane (z = 0) under a container point `(sx, sy)`; NaN when the ray
 * runs parallel to the plane.
 */
export function view3dUnproject(
  camera: View3DCamera,
  area: Readonly<ViewportRect>,
  sx: number,
  sy: number,
): [number, number] {
  const { origin, direction } = view3dRay(camera, area, sx, sy);
  if (Math.abs(direction.z) < 1e-12) return [NaN, NaN];
  const t = -origin.z / direction.z;
  return [origin.x + t * direction.x, origin.y + t * direction.y];
}
