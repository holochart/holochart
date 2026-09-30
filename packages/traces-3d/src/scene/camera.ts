/**
 * Scene camera math (plan E14.1a, E14.1c), pure and allocation-light: Plotly's `scene.camera`
 * (`eye`, `center`, `up` in scene units, plotly.js `gl3d/scene.js` `getLayoutCamera`) and the
 * moves the controls make — free orbit, z-up turntable, dolly and pan (gl-plot3d's orbit and
 * turntable controllers, `3d-view-controls`).
 *
 * Scene units: the axis box spans `[-a/2, a/2]` on each axis, `a` the resolved `aspectratio`
 * (gl-plot3d's model matrix), so the default eye `(1.25, 1.25, 1.25)` looks at the unit cube from
 * 2.17 units away. Rotations are about `center`.
 */

export type Vec3 = [number, number, number];

/** A scene camera in scene units (Plotly's `scene.camera` without `projection`). */
export interface SceneCamera {
  eye: Vec3;
  center: Vec3;
  up: Vec3;
}

export type SceneProjection = 'perspective' | 'orthographic';

/** Vertical field of view of the perspective camera, degrees (gl-plot3d's `fovy`, π/4). */
export const SCENE_FOV = 45;

/** Nearest and farthest the eye may get from `center` (gl-plot3d's distance limits). */
export const MIN_DISTANCE = 0.01;
export const MAX_DISTANCE = 100;

/** Plotly's default camera. */
export function defaultCamera(): SceneCamera {
  return { eye: [1.25, 1.25, 1.25], center: [0, 0, 0], up: [0, 0, 1] };
}

function vec(v: unknown, dflt: Vec3): Vec3 {
  const c = (v ?? {}) as Record<string, unknown>;
  const n = (k: string, d: number): number => {
    const x = c[k];
    return typeof x === 'number' && Number.isFinite(x) ? x : d;
  };
  return [n('x', dflt[0]), n('y', dflt[1]), n('z', dflt[2])];
}

/** The camera of a defaulted `scene.camera` container. */
export function cameraOf(camera: unknown): SceneCamera {
  const c = (camera ?? {}) as Record<string, unknown>;
  const d = defaultCamera();
  return { eye: vec(c['eye'], d.eye), center: vec(c['center'], d.center), up: vec(c['up'], d.up) };
}

export function copyCamera(c: SceneCamera): SceneCamera {
  return { eye: [...c.eye], center: [...c.center], up: [...c.up] };
}

export function sameCamera(a: SceneCamera, b: SceneCamera, eps = 1e-9): boolean {
  for (let i = 0; i < 3; i++) {
    if (Math.abs(a.eye[i]! - b.eye[i]!) > eps) return false;
    if (Math.abs(a.center[i]! - b.center[i]!) > eps) return false;
    if (Math.abs(a.up[i]! - b.up[i]!) > eps) return false;
  }
  return true;
}

const xyz = (v: Vec3): { x: number; y: number; z: number } => ({ x: v[0], y: v[1], z: v[2] });

/**
 * The `scene.camera` value of a relayout (Plotly's `getLayoutCamera` shape):
 * `{ up, center, eye, projection: { type } }`.
 */
export function sceneCameraPayload(
  c: SceneCamera,
  projection: SceneProjection,
): Record<string, unknown> {
  return {
    up: xyz(c.up),
    center: xyz(c.center),
    eye: xyz(c.eye),
    projection: { type: projection },
  };
}

// ---- vector helpers ---------------------------------------------------------------------------

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function norm(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a: Vec3): Vec3 {
  const n = norm(a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
}

/** `v` rotated by `angle` radians about the unit `axis` (Rodrigues). */
export function rotate(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = cross(axis, v);
  const d = dot(axis, v) * (1 - c);
  return [
    v[0] * c + k[0] * s + axis[0] * d,
    v[1] * c + k[1] * s + axis[1] * d,
    v[2] * c + k[2] * s + axis[2] * d,
  ];
}

/**
 * The camera's orthonormal frame: `forward` (eye → center), `right` and the screen `up` (`up`
 * made perpendicular to `forward`). A degenerate `up` (parallel to the view) falls back to a
 * perpendicular axis, so the frame is always valid.
 */
export function cameraFrame(c: SceneCamera): { forward: Vec3; right: Vec3; up: Vec3 } {
  const forward = normalize(sub(c.center, c.eye));
  let right = cross(forward, c.up);
  if (norm(right) < 1e-9) {
    right = cross(forward, Math.abs(forward[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]);
  }
  right = normalize(right);
  return { forward, right, up: cross(right, forward) };
}

// ---- moves ------------------------------------------------------------------------------------

/**
 * Free orbit (Plotly's `orbit` dragmode): the eye turns about `center` by `dx` radians about the
 * screen's up axis and `dy` radians about its right axis, and `up` turns with it (a trackball).
 * Dragging right (`dx > 0`) turns the scene right; dragging down (`dy > 0`) tilts it towards the
 * viewer.
 */
export function orbit(c: SceneCamera, dx: number, dy: number): SceneCamera {
  const f = cameraFrame(c);
  let offset = sub(c.eye, c.center);
  let up = f.up;
  offset = rotate(offset, f.up, -dx);
  const right = rotate(f.right, f.up, -dx);
  offset = rotate(offset, right, -dy);
  up = rotate(up, right, -dy);
  return {
    eye: [c.center[0] + offset[0], c.center[1] + offset[1], c.center[2] + offset[2]],
    center: [...c.center],
    up: normalize(up),
  };
}

/** Elevation limit of the turntable, just short of the poles (radians). */
const POLE = Math.PI / 2 - 1e-3;

/**
 * Turntable (Plotly's `turntable` dragmode): the eye turns about the vertical through `center` by
 * `dx` radians (azimuth) and rises by `dy` radians (elevation, stopping short of the poles); `up`
 * stays the z axis.
 */
export function turntable(c: SceneCamera, dx: number, dy: number): SceneCamera {
  const o = sub(c.eye, c.center);
  const r = norm(o) || 1;
  const theta = Math.atan2(o[1], o[0]) - dx;
  const phi = Math.min(POLE, Math.max(-POLE, Math.asin(Math.max(-1, Math.min(1, o[2] / r))) + dy));
  const h = r * Math.cos(phi);
  return {
    eye: [
      c.center[0] + h * Math.cos(theta),
      c.center[1] + h * Math.sin(theta),
      c.center[2] + r * Math.sin(phi),
    ],
    center: [...c.center],
    up: [0, 0, 1],
  };
}

/**
 * Dolly (perspective zoom): the eye moves towards `center` (`factor < 1`) or away from it, kept
 * between {@link MIN_DISTANCE} and {@link MAX_DISTANCE}.
 */
export function dolly(c: SceneCamera, factor: number): SceneCamera {
  const o = sub(c.eye, c.center);
  const r = norm(o) || 1;
  const k = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, r * factor)) / r;
  return {
    eye: [c.center[0] + o[0] * k, c.center[1] + o[1] * k, c.center[2] + o[2] * k],
    center: [...c.center],
    up: [...c.up],
  };
}

/**
 * Pan: eye and center move together across the screen by `(dx, dy)` px (screen y down), so the
 * scene follows the pointer; `unitsPerPx` is the size of a px at `center` (see
 * {@link unitsPerPx}).
 */
export function pan(c: SceneCamera, dx: number, dy: number, units: number): SceneCamera {
  const f = cameraFrame(c);
  const sx = -dx * units;
  const sy = dy * units;
  const d: Vec3 = [
    f.right[0] * sx + f.up[0] * sy,
    f.right[1] * sx + f.up[1] * sy,
    f.right[2] * sx + f.up[2] * sy,
  ];
  return {
    eye: [c.eye[0] + d[0], c.eye[1] + d[1], c.eye[2] + d[2]],
    center: [c.center[0] + d[0], c.center[1] + d[1], c.center[2] + d[2]],
    up: [...c.up],
  };
}

/**
 * Scene units per screen px at `center`, for a viewport `height` px tall: perspective views see
 * `2·distance·tan(fov/2)` units vertically, orthographic ones 2 units (gl-plot3d's `[-1, 1]`)
 * divided by the ortho `zoom`.
 */
export function unitsPerPx(
  c: SceneCamera,
  projection: SceneProjection,
  height: number,
  zoom = 1,
): number {
  const h = Math.max(1, height);
  if (projection === 'orthographic') return 2 / (zoom * h);
  const distance = norm(sub(c.eye, c.center));
  return (2 * distance * Math.tan(((SCENE_FOV / 2) * Math.PI) / 180)) / h;
}
