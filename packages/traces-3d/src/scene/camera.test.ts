import fc from 'fast-check';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  cameraFrame,
  cameraOf,
  dolly,
  dot,
  MAX_DISTANCE,
  MIN_DISTANCE,
  norm,
  orbit,
  pan,
  sceneCameraPayload,
  SCENE_FOV,
  sub,
  turntable,
  unitsPerPx,
  type SceneCamera,
  type Vec3,
} from './camera.ts';

const coord = fc.double({ min: -4, max: 4, noNaN: true });
const vec = fc.tuple(coord, coord, coord);
/** A camera whose eye is away from its center and whose up isn't along the view. */
const camera = fc.record({ eye: vec, center: vec, up: vec }).filter(({ eye, center, up }) => {
  const f = sub(center, eye);
  if (norm(f) < 0.2 || norm(up) < 0.2) return false;
  const c = Math.abs(dot(f, up)) / (norm(f) * norm(up));
  return c < 0.95;
}) as fc.Arbitrary<SceneCamera>;

/** A three.js camera looking as `c` does, 400 × 300 px. */
function three(c: SceneCamera): PerspectiveCamera {
  const cam = new PerspectiveCamera(SCENE_FOV, 4 / 3, 0.01, 1000);
  cam.up.set(...c.up);
  cam.position.set(...c.eye);
  cam.lookAt(...c.center);
  cam.updateMatrixWorld();
  return cam;
}

/** Container px of a scene point in a 400 × 300 viewport. */
function px(cam: PerspectiveCamera, p: Vec3): [number, number] {
  const v = new Vector3(...p).project(cam);
  return [((v.x + 1) / 2) * 400, ((1 - v.y) / 2) * 300];
}

describe('scene camera (layout ↔ camera)', () => {
  it('reads Plotly’s defaults and relayout payload shape', () => {
    const c = cameraOf({ eye: { x: 2 } });
    expect(c).toEqual({ eye: [2, 1.25, 1.25], center: [0, 0, 0], up: [0, 0, 1] });
    expect(sceneCameraPayload(c, 'orthographic')).toEqual({
      up: { x: 0, y: 0, z: 1 },
      center: { x: 0, y: 0, z: 0 },
      eye: { x: 2, y: 1.25, z: 1.25 },
      projection: { type: 'orthographic' },
    });
  });

  it('eye / center / up give a view with center in the middle and up pointing up', () => {
    fc.assert(
      fc.property(camera, (c) => {
        const cam = three(c);
        const [x, y] = px(cam, c.center);
        expect(x).toBeCloseTo(200, 6);
        expect(y).toBeCloseTo(150, 6);
        const f = cameraFrame(c);
        const above: Vec3 = [
          c.center[0] + f.up[0] * 0.01,
          c.center[1] + f.up[1] * 0.01,
          c.center[2] + f.up[2] * 0.01,
        ];
        const [ax, ay] = px(cam, above);
        expect(ax).toBeCloseTo(200, 4);
        expect(ay).toBeLessThan(150);
      }),
    );
  });
});

describe('camera moves', () => {
  it('orbit keeps the distance, turns up with the view, and drags right turn the scene right', () => {
    fc.assert(
      fc.property(camera, coord, coord, (c, dx, dy) => {
        const o = orbit(c, dx / 4, dy / 4);
        expect(norm(sub(o.eye, o.center))).toBeCloseTo(norm(sub(c.eye, c.center)), 9);
        expect(norm(o.up)).toBeCloseTo(1, 9);
        expect(dot(normalizeDiff(o), o.up)).toBeCloseTo(0, 9);
      }),
    );
    const c = cameraOf({});
    const moved = orbit(c, 0.1, 0);
    // The eye moves to the screen's left: the scene turns right.
    expect(dot(sub(moved.eye, c.eye), cameraFrame(c).right)).toBeLessThan(0);
    // Dragging down raises the eye.
    expect(dot(sub(orbit(c, 0, 0.1).eye, c.eye), cameraFrame(c).up)).toBeGreaterThan(0);
  });

  it('turntable keeps z up and the distance, stops short of the poles, and undoes itself', () => {
    fc.assert(
      fc.property(camera, coord, coord, (c, dx, dy) => {
        const t = turntable(c, dx, dy);
        expect(t.up).toEqual([0, 0, 1]);
        const r = norm(sub(t.eye, t.center));
        expect(r).toBeCloseTo(norm(sub(c.eye, c.center)), 9);
        expect(Math.abs(t.eye[2] - t.center[2])).toBeLessThan(r);
      }),
    );
    const c = cameraOf({});
    const back = turntable(turntable(c, 0.4, 0.2), -0.4, -0.2);
    back.eye.forEach((v, i) => expect(v).toBeCloseTo(c.eye[i]!, 9));
    expect(turntable(c, 0, 10).eye[2]).toBeLessThan(norm(sub(c.eye, c.center)));
  });

  it('dolly scales the distance within the limits', () => {
    const c = cameraOf({});
    const d = norm(sub(c.eye, c.center));
    expect(norm(sub(dolly(c, 0.5).eye, c.center))).toBeCloseTo(d / 2, 12);
    expect(norm(sub(dolly(c, 1e-9).eye, c.center))).toBeCloseTo(MIN_DISTANCE, 12);
    expect(norm(sub(dolly(c, 1e9).eye, c.center))).toBeCloseTo(MAX_DISTANCE, 12);
  });

  it('pan keeps the view direction and moves the scene with the pointer, px for px', () => {
    fc.assert(
      fc.property(camera, coord, coord, (c, dx, dy) => {
        const [mx, my] = [dx * 20, dy * 20];
        const p = pan(c, mx, my, unitsPerPx(c, 'perspective', 300));
        expect(sub(p.eye, p.center)).toEqual(
          sub(c.eye, c.center).map((v) => expect.closeTo(v, 9) as unknown as number),
        );
        // The old center, seen through the panned camera, moved by (mx, my) px.
        const [x, y] = px(three(p), c.center);
        expect(x).toBeCloseTo(200 + mx, 5);
        expect(y).toBeCloseTo(150 + my, 5);
      }),
    );
    expect(unitsPerPx(cameraOf({}), 'orthographic', 200, 2)).toBeCloseTo(2 / 400, 12);
  });
});

function normalizeDiff(c: SceneCamera): Vec3 {
  const f = sub(c.center, c.eye);
  const n = norm(f);
  return [f[0] / n, f[1] / n, f[2] / n];
}
