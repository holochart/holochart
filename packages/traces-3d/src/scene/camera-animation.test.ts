import { describe, expect, it } from 'vitest';
import {
  autorotateCamera,
  cameraTween,
  interpolateCamera,
  resolveCameraTarget,
  supplySceneAutorotate,
  AUTOROTATE_SPEED,
} from './camera-animation.ts';
import { dot, norm, normalize, sub, type SceneCamera } from './camera.ts';
import type { Vec3 } from '@mk7s/holochart-render';

const cam = (eye: Vec3, center: Vec3 = [0, 0, 0], up: Vec3 = [0, 0, 1]): SceneCamera => ({
  eye,
  center,
  up,
});

function close(a: readonly number[], b: readonly number[], digits = 9): void {
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));
}

const distance = (c: SceneCamera): number => norm(sub(c.eye, c.center));
const elevation = (c: SceneCamera): number => Math.asin(normalize(sub(c.eye, c.center))[2]);

describe('cameraTween', () => {
  it('starts and ends exactly at the two cameras', () => {
    const a = cam([1.25, 1.25, 1.25]);
    const b = cam([2, -1, 0.3], [0.1, 0.2, -0.1]);
    const tween = cameraTween(a, b);
    expect(tween(0)).toEqual(a);
    expect(tween(1)).toEqual(b);
    expect(tween(0)).not.toBe(a);
  });

  it('orbits about z (shared up): azimuth the short way, elevation and distance kept', () => {
    const a = cam([1.25, 1.25, 1.25]);
    const b = cam([-1.25, -1.25, 1.25]);
    const r = distance(a);
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const c = interpolateCamera(a, b, t);
      // Never over the pole (a straight or great-circle path would pass above the center).
      expect(distance(c)).toBeCloseTo(r, 9);
      expect(elevation(c)).toBeCloseTo(elevation(a), 9);
      expect(c.up).toEqual([0, 0, 1]);
    }
    // Half a turn: the midpoint is a quarter turn round (either way), at the same height.
    const mid = interpolateCamera(a, b, 0.5);
    expect(Math.abs(mid.eye[0])).toBeCloseTo(Math.abs(mid.eye[1]), 9);
    expect(mid.eye[0]).toBeCloseTo(-mid.eye[1], 9);
  });

  it('takes the short way round across ±180°', () => {
    const a = cam([Math.cos(3), Math.sin(3), 0]);
    const b = cam([Math.cos(-3), Math.sin(-3), 0]);
    const mid = interpolateCamera(a, b, 0.5);
    close(mid.eye, [-1, 0, 0]);
  });

  it('changes the distance geometrically and moves the center in a line', () => {
    const a = cam([1, 0, 0]);
    const b = cam([4, 0, 0], [0, 0, 1]);
    const mid = interpolateCamera(a, b, 0.5);
    close(mid.center, [0, 0, 0.5]);
    // Halfway in time is the geometric mean of the two distances.
    expect(distance(mid)).toBeCloseTo(Math.sqrt(distance(a) * distance(b)), 9);
  });

  it('turns the whole view (direction and up) when the ups differ', () => {
    const a = cam([0, -2, 0], [0, 0, 0], [0, 0, 1]);
    const b = cam([2, 0, 0], [0, 0, 0], [0, 1, 0]);
    for (const t of [0.2, 0.5, 0.8]) {
      const c = interpolateCamera(a, b, t);
      expect(distance(c)).toBeCloseTo(2, 9);
      expect(norm(c.up)).toBeCloseTo(1, 9);
      // The up vector stays perpendicular to the view (a rigid rotation of an orthonormal frame).
      expect(dot(c.up, normalize(sub(c.center, c.eye)))).toBeCloseTo(0, 9);
    }
    // Just before the end it is next to the target view.
    const near = interpolateCamera(a, b, 0.999);
    close(near.eye, b.eye, 2);
    close(near.up, b.up, 2);
  });

  it('handles half a turn of the whole view', () => {
    const a = cam([0, 0, 2], [0, 0, 0], [0, 1, 0]);
    const b = cam([0, 0, -2], [0, 0, 0], [0, -1, 0]);
    const mid = interpolateCamera(a, b, 0.5);
    expect(distance(mid)).toBeCloseTo(2, 9);
    expect(Number.isFinite(mid.eye[0] + mid.eye[1] + mid.eye[2])).toBe(true);
    expect(Math.abs(mid.eye[2])).toBeLessThan(1e-6);
  });

  it('extrapolates for overshooting easings', () => {
    const a = cam([1, 0, 0]);
    const b = cam([0, 1, 0]);
    const over = interpolateCamera(a, b, 1.1);
    expect(Math.atan2(over.eye[1], over.eye[0])).toBeCloseTo((Math.PI / 2) * 1.1, 9);
  });
});

describe('resolveCameraTarget', () => {
  it('keeps what the target leaves out', () => {
    const current = cam([1, 2, 3], [0, 0, 0], [0, 0, 1]);
    expect(resolveCameraTarget(current, { eye: { x: 5 }, center: { z: 1 } })).toEqual({
      eye: [5, 2, 3],
      center: [0, 0, 1],
      up: [0, 0, 1],
    });
  });
});

describe('autorotateCamera', () => {
  it('turns the scene counterclockwise about the axis (the eye goes the other way)', () => {
    const c = autorotateCamera(cam([1, 0, 0.5], [0, 0, 0.5]), 'z', 90);
    close(c.eye, [0, -1, 0.5]);
    close(c.up, [0, 0, 1]);
    expect(c.center).toEqual([0, 0, 0.5]);
  });

  it('turns about x through the center, with up', () => {
    const c = autorotateCamera(cam([0, 1, 0], [0, 0, 0], [0, 0, 1]), 'x', 90);
    close(c.eye, [0, 0, -1]);
    close(c.up, [0, 1, 0]);
  });
});

describe('supplySceneAutorotate', () => {
  it('is off unless given, and spins at the default speed when given', () => {
    const out: Record<string, unknown> = {};
    supplySceneAutorotate({}, undefined, out);
    expect(out['autorotate']).toEqual({ speed: 0, axis: 'z' });
    supplySceneAutorotate({ autorotate: {} }, undefined, out);
    expect(out['autorotate']).toEqual({ speed: AUTOROTATE_SPEED, axis: 'z' });
    supplySceneAutorotate(
      { autorotate: { axis: 'q', time: 2 } },
      { autorotate: { speed: -5 } },
      out,
    );
    expect(out['autorotate']).toEqual({ speed: -5, axis: 'z', time: 2 });
  });
});
