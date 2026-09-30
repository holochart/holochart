/**
 * 3D controls math (plan E14.1c): what drags, wheel and pinches ask of the camera, and the damping
 * that eases the camera there. Pure; the scene component feeds it pointer input and applies the
 * steps to the live scene (`component.ts`).
 *
 * Input accumulates as a pending {@link Motion}; every frame a share `1 − e^(−dt/τ)` of what is
 * pending is applied, so the camera glides to where the input asked and stops exactly there (no
 * overshoot, no drift). With `τ = 0` (reduced motion) everything applies at once.
 */
import {
  dolly,
  orbit,
  pan,
  turntable,
  unitsPerPx,
  type SceneProjection,
  type SceneCamera,
} from './camera.ts';

/** Camera input not applied yet. */
export interface Motion {
  /** Rotation, radians: about the screen's vertical (x drags) and horizontal (y drags). */
  rx: number;
  ry: number;
  /** Pan, screen px (y down). */
  px: number;
  py: number;
  /** Zoom as the log of the eye distance factor (> 0 zooms out). */
  zoom: number;
}

export function emptyMotion(): Motion {
  return { rx: 0, ry: 0, px: 0, py: 0, zoom: 0 };
}

/** Damping time constant, ms. */
export const DAMPING_MS = 45;

/** What a rotation drag turns: gl-plot3d turns the scene half a turn per viewport height. */
export const ROTATE_PER_HEIGHT = Math.PI;

/** Wheel zoom: log distance factor per wheel delta px (a 100 px notch ≈ ×1.16). */
export const WHEEL_ZOOM = 0.0015;

/** The motion a pointer drag by `(dx, dy)` px asks for, in a viewport `height` px tall. */
export function dragMotion(
  mode: 'rotate' | 'pan' | 'zoom',
  dx: number,
  dy: number,
  height: number,
): Partial<Motion> {
  const h = Math.max(1, height);
  if (mode === 'pan') return { px: dx, py: dy };
  // Plotly: dragging down zooms in.
  if (mode === 'zoom') return { zoom: (-2 * dy) / h };
  return { rx: (ROTATE_PER_HEIGHT * dx) / h, ry: (ROTATE_PER_HEIGHT * dy) / h };
}

export function addMotion(to: Motion, m: Partial<Motion>): void {
  to.rx += m.rx ?? 0;
  to.ry += m.ry ?? 0;
  to.px += m.px ?? 0;
  to.py += m.py ?? 0;
  to.zoom += m.zoom ?? 0;
}

/** Whether nothing noticeable is pending (below 1e-4 rad / 0.05 px / 1e-4 zoom). */
export function settled(m: Motion): boolean {
  return (
    Math.abs(m.rx) < 1e-4 &&
    Math.abs(m.ry) < 1e-4 &&
    Math.abs(m.px) < 0.05 &&
    Math.abs(m.py) < 0.05 &&
    Math.abs(m.zoom) < 1e-4
  );
}

/**
 * The part of `pending` to apply after `dt` ms with time constant `tau` (everything when `tau`
 * is 0 or the rest is {@link settled}); `pending` keeps the remainder.
 */
export function dampedStep(pending: Motion, dt: number, tau: number): Motion {
  const k = tau > 0 ? 1 - Math.exp(-Math.max(0, dt) / tau) : 1;
  const step: Motion = {
    rx: pending.rx * k,
    ry: pending.ry * k,
    px: pending.px * k,
    py: pending.py * k,
    zoom: pending.zoom * k,
  };
  pending.rx -= step.rx;
  pending.ry -= step.ry;
  pending.px -= step.px;
  pending.py -= step.py;
  pending.zoom -= step.zoom;
  if (settled(pending)) {
    addMotion(step, pending);
    Object.assign(pending, emptyMotion());
  }
  return step;
}

/** What {@link applyMotion} moves: the camera, and the orthographic zoom factor. */
export interface MotionTarget {
  camera: SceneCamera;
  orthoZoom: number;
}

/**
 * Apply one step: rotation (`orbit` free, `turntable` about z), pan (px at the viewport's
 * `height`), and zoom — a dolly in perspective, the orthographic zoom factor otherwise (committed
 * as an aspect ratio, Plotly's orthographic zoom).
 */
export function applyMotion(
  target: MotionTarget,
  m: Motion,
  rotation: 'orbit' | 'turntable',
  projection: SceneProjection,
  height: number,
): MotionTarget {
  let camera = target.camera;
  let orthoZoom = target.orthoZoom;
  if (m.rx !== 0 || m.ry !== 0) {
    camera = rotation === 'orbit' ? orbit(camera, m.rx, m.ry) : turntable(camera, m.rx, m.ry);
  }
  if (m.px !== 0 || m.py !== 0) {
    camera = pan(camera, m.px, m.py, unitsPerPx(camera, projection, height, orthoZoom));
  }
  if (m.zoom !== 0) {
    if (projection === 'orthographic') {
      orthoZoom = Math.min(100, Math.max(0.01, orthoZoom * Math.exp(-m.zoom)));
    } else camera = dolly(camera, Math.exp(m.zoom));
  }
  return { camera, orthoZoom };
}
