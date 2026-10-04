import fc from 'fast-check';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { SCENE_FOV } from './camera.ts';
import { boxFrame, closestCorner, type CornerPoint } from './walls.ts';
import type { Vec3 } from '@mk7s/holochart-render';

/** NDC of the unit box's corners seen from `eye`, looking at the origin with z up. */
function corners(eye: Vec3, ortho = false): CornerPoint[] {
  const cam = ortho
    ? new OrthographicCamera(-1.5, 1.5, 1, -1, 0.01, 100)
    : new PerspectiveCamera(SCENE_FOV, 1.5, 0.01, 100);
  cam.up.set(0, 0, 1);
  cam.position.set(...eye);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  return Array.from({ length: 8 }, (_, i) => {
    const v = new Vector3(i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5).project(cam);
    return { x: v.x, y: v.y };
  });
}

describe('far walls and label edges (gl-axes3d)', () => {
  it('the closest corner takes the eye’s side on each axis', () => {
    expect(closestCorner([1.25, 1.25, 1.25])).toBe(7);
    expect(closestCorner([-1, 2, -3])).toBe(2);
  });

  it('default camera: walls at the low sides, labels on the lower outline edges', () => {
    const eye: Vec3 = [1.25, 1.25, 1.25];
    const frame = boxFrame(corners(eye), closestCorner(eye));
    expect(frame.walls).toEqual([0, 0, 0]);
    // x runs along y = +, z = − (corner 2 → 3); y along x = +, z = − (1 → 3): the two bottom
    // edges nearest the viewer; z up the left edge.
    expect(frame.edges[0]).toBe(2);
    expect(frame.edges[1]).toBe(1);
    expect(frame.edges[2] & 3).not.toBe(3);
  });

  it('for any eye: walls face away from it, edges run along their axis, off the nearest corner', () => {
    const c = fc.double({ min: -5, max: 5, noNaN: true }).filter((v) => Math.abs(v) > 0.8);
    fc.assert(
      fc.property(c, c, c, fc.boolean(), (x, y, z, ortho) => {
        const eye: Vec3 = [x, y, z];
        // Keep away from looking straight down z (the up vector).
        fc.pre(Math.hypot(x, y) > 0.5);
        const closest = closestCorner(eye);
        const frame = boxFrame(corners(eye, ortho), closest);
        for (let d = 0; d < 3; d++) {
          expect(frame.walls[d]).toBe(eye[d]! > 0 ? 0 : 1);
          const edge = frame.edges[d]!;
          expect(edge & (1 << d)).toBe(0);
          expect([edge, edge | (1 << d)]).not.toContain(closest);
        }
      }),
    );
  });
});
