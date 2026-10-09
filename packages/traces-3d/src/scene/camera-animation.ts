/**
 * Camera animation math (plan E7.5), pure: in-between cameras of a camera animation and the
 * turntable steps of auto-rotation, plus the `scene.autorotate` attributes.
 *
 * ## Interpolation
 *
 * A camera animation orbits: `center` moves in a straight line, the eye's distance from it changes
 * geometrically (zooming in by 4 × feels the same at every step), and its direction turns along an
 * arc, so the camera never cuts through the scene the way a straight eye path would.
 *
 * - When both cameras share their `up` (Plotly's usual z up), the direction turns like the
 *   turntable controls: azimuth about `up` the short way round, elevation linearly. The camera
 *   never flips over a pole, and `up` stays put.
 * - Otherwise the whole view (direction and `up`) turns by the one rotation taking the first view
 *   to the second (a quaternion slerp in axis–angle form).
 *
 * The easing (Plotly's easings, runtime `anim/easing.ts`) maps time to progress before this.
 */
import { attr } from '@mk7s/holochart-core';
import {
  cameraFrame,
  cross,
  dot,
  norm,
  normalize,
  rotate,
  sub,
  type SceneCamera,
} from './camera.ts';
import type { Vec3 } from '@mk7s/holochart-render';

const EPS = 1e-9;

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function scaled(v: Vec3, k: number): Vec3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** A unit vector perpendicular to the unit `v`. */
function perpendicular(v: Vec3): Vec3 {
  return normalize(cross(v, Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
}

/** Wrap an angle to (−π, π]. */
function wrap(a: number): number {
  const t = a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
  return t === -Math.PI ? Math.PI : t;
}

/** The rotation taking unit frame `a` onto unit frame `b` (columns right, up, forward). */
function frameRotation(
  a: { right: Vec3; up: Vec3; forward: Vec3 },
  b: { right: Vec3; up: Vec3; forward: Vec3 },
): { axis: Vec3; angle: number } {
  // R = B·Aᵀ = Σ b_k a_kᵀ.
  const m = (i: number, j: number): number =>
    b.right[i]! * a.right[j]! + b.up[i]! * a.up[j]! + b.forward[i]! * a.forward[j]!;
  const trace = m(0, 0) + m(1, 1) + m(2, 2);
  const angle = Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2)));
  if (angle < 1e-9) return { axis: [0, 0, 1], angle: 0 };
  if (Math.PI - angle < 1e-6) {
    // Half a turn: the axis is the column of (R + I) / 2 with the largest norm.
    const cols: Vec3[] = [0, 1, 2].map(
      (j) => [0, 1, 2].map((i) => (m(i, j) + (i === j ? 1 : 0)) / 2) as Vec3,
    );
    cols.sort((p, q) => norm(q) - norm(p));
    return { axis: normalize(cols[0]!), angle };
  }
  const s = 2 * Math.sin(angle);
  return {
    axis: normalize([(m(2, 1) - m(1, 2)) / s, (m(0, 2) - m(2, 0)) / s, (m(1, 0) - m(0, 1)) / s]),
    angle,
  };
}

/**
 * The in-between cameras from `from` to `to`: a function of progress (0 → `from`, 1 → `to`
 * exactly; values outside [0, 1], from overshooting easings, extrapolate). See the module comment.
 * @internal
 */
export function cameraTween(from: SceneCamera, to: SceneCamera): (t: number) => SceneCamera {
  const oa = sub(from.eye, from.center);
  const ob = sub(to.eye, to.center);
  const ra = Math.max(norm(oa), EPS);
  const rb = Math.max(norm(ob), EPS);
  const da = scaled(oa, 1 / ra);
  const db = scaled(ob, 1 / rb);
  const ua = normalize(from.up);
  const ub = normalize(to.up);
  const distance = (t: number): number => ra * Math.pow(rb / ra, t);
  let direction: (t: number) => { dir: Vec3; up: Vec3 };
  if (norm(sub(ua, ub)) < 1e-6) {
    // Turntable about the shared up: azimuth the short way, elevation linearly.
    const e1 = perpendicular(ua);
    const e2 = cross(ua, e1);
    const polar = (d: Vec3): [number, number] => [
      Math.atan2(dot(d, e2), dot(d, e1)),
      Math.asin(Math.max(-1, Math.min(1, dot(d, ua)))),
    ];
    const [az0, el0] = polar(da);
    const [az1, el1] = polar(db);
    const daz = wrap(az1 - az0);
    const up: Vec3 = [...from.up];
    direction = (t) => {
      const az = az0 + daz * t;
      const el = el0 + (el1 - el0) * t;
      const h = Math.cos(el);
      return {
        dir: add(
          add(scaled(e1, h * Math.cos(az)), scaled(e2, h * Math.sin(az))),
          scaled(ua, Math.sin(el)),
        ),
        up,
      };
    };
  } else {
    const fa = cameraFrame(from);
    const { axis, angle } = frameRotation(fa, cameraFrame(to));
    direction = (t) => ({ dir: rotate(da, axis, angle * t), up: rotate(fa.up, axis, angle * t) });
  }
  return (t) => {
    if (t === 0) return { eye: [...from.eye], center: [...from.center], up: [...from.up] };
    if (t === 1) return { eye: [...to.eye], center: [...to.center], up: [...to.up] };
    const center = lerp(from.center, to.center, t);
    const { dir, up } = direction(t);
    return { eye: add(center, scaled(dir, distance(t))), center, up: [...up] };
  };
}

/** The camera at progress `t` from `from` to `to` (see {@link cameraTween}). @experimental */
export function interpolateCamera(from: SceneCamera, to: SceneCamera, t: number): SceneCamera {
  return cameraTween(from, to)(t);
}

/**
 * A camera vector of `animateCamera` / `scene.camera` input: missing components are kept.
 * @internal
 */
export interface CameraVectorInput {
  readonly x?: number | undefined;
  readonly y?: number | undefined;
  readonly z?: number | undefined;
}

/** What `animateCamera` moves to: Plotly's `scene.camera` shape; missing parts stay. @internal */
export interface CameraTargetInput {
  readonly eye?: CameraVectorInput | undefined;
  readonly center?: CameraVectorInput | undefined;
  readonly up?: CameraVectorInput | undefined;
}

function merged(v: CameraVectorInput | undefined, current: Vec3): Vec3 {
  const n = (x: unknown, d: number): number =>
    typeof x === 'number' && Number.isFinite(x) ? x : d;
  return [n(v?.x, current[0]), n(v?.y, current[1]), n(v?.z, current[2])];
}

/** The camera `target` asks for, starting from `current` (missing components kept). @internal */
export function resolveCameraTarget(current: SceneCamera, target: CameraTargetInput): SceneCamera {
  return {
    eye: merged(target.eye, current.eye),
    center: merged(target.center, current.center),
    up: merged(target.up, current.up),
  };
}

// ---- auto-rotation ------------------------------------------------------------------------------

/** Degrees per second of `autorotate` when the container is given without a `speed`. */
export const AUTOROTATE_SPEED = 15;

const AXES: Readonly<Record<string, Vec3>> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/**
 * The camera after the scene turned `degrees` about `axis` through `center` (counterclockwise
 * seen from the axis' positive end): the eye and `up` turn the other way.
 * @internal
 */
export function autorotateCamera(
  camera: SceneCamera,
  axis: 'x' | 'y' | 'z',
  degrees: number,
): SceneCamera {
  const a = AXES[axis] ?? AXES['z']!;
  const angle = (-degrees * Math.PI) / 180;
  const offset = rotate(sub(camera.eye, camera.center), a, angle);
  return {
    eye: add(camera.center, offset),
    center: [...camera.center],
    up: rotate(camera.up, a, angle),
  };
}

/** `layout.sceneN.autorotate` (Holochart extension, E7.5). @internal */
export const sceneAutorotateAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      speed: attr.number({
        editType: 'camera',
        description: `Degrees per second the scene turns, counterclockwise seen from the positive end of \`axis\` (negative: clockwise). Default ${AUTOROTATE_SPEED} when \`autorotate\` is given, else 0 (off).`,
      }),
      axis: attr.enumerated({
        values: ['x', 'y', 'z'],
        dflt: 'z',
        editType: 'camera',
        description: "The axis the scene turns about, through the camera's `center`.",
      }),
      time: attr.number({
        editType: 'camera',
        description:
          'Freeze the rotation at this many seconds after the start (the layout camera turned by `speed × time`): a fixed frame for exports and tests.',
      }),
    },
    {
      editType: 'camera',
      description:
        "Turn the scene continuously, like a turntable (Holochart extension). The rotation pauses while the user moves the camera and carries on from the new view when the camera comes to rest; it runs only while the chart is on screen, and not at all with reduced motion (`prefers-reduced-motion`). The layout camera doesn't follow the rotation: `relayout` reports the camera when a gesture or `animateCamera` ends, or the rotation stops.",
    },
  ))();

/** Default `autorotate` from the scene's input and template containers. */
export function supplySceneAutorotate(
  input: Readonly<Record<string, unknown>>,
  template: Readonly<Record<string, unknown>> | undefined,
  out: Record<string, unknown>,
): void {
  const plain = (v: unknown): Record<string, unknown> | undefined =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : undefined;
  const aIn = plain(input['autorotate']);
  const aT = plain(template?.['autorotate']);
  const given = aIn !== undefined || aT !== undefined;
  const num = (k: string): number | undefined => {
    for (const v of [aIn?.[k], aT?.[k]]) if (typeof v === 'number' && Number.isFinite(v)) return v;
    return undefined;
  };
  const axis = [aIn?.['axis'], aT?.['axis']].find((v) => v === 'x' || v === 'y' || v === 'z');
  const time = num('time');
  out['autorotate'] = {
    speed: num('speed') ?? (given ? AUTOROTATE_SPEED : 0),
    axis: axis ?? 'z',
    ...(time === undefined ? {} : { time }),
  };
}
