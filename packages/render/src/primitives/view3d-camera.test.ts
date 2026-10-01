import fc from 'fast-check';
import { Vector4 } from 'three';
import { describe, expect, it } from 'vitest';
import { orthoFrustum, type ViewportRect } from '../core/viewport.ts';
import {
  VIEW3D_MAX_ANGLE,
  view3dCamera,
  view3dProject,
  view3dRay,
  view3dUnproject,
} from './view3d-camera.ts';

/**
 * 2.5D camera math (plan E8.9): tilt 0 / rotation 0 is the flat view for every perspective,
 * pointer → plot plane → screen round-trips, and the fit keeps the tilted plane inside its rect.
 */

const rectArb = fc.record({
  x: fc.integer({ min: 0, max: 300 }),
  y: fc.integer({ min: 0, max: 300 }),
  width: fc.integer({ min: 40, max: 900 }),
  height: fc.integer({ min: 40, max: 700 }),
});

/** The rect in its render area: its own rect or the whole (larger) canvas. */
const frameArb = fc
  .tuple(rectArb, fc.boolean(), fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 200 }))
  .map(([rect, canvas, extraW, extraH]) => ({
    rect,
    area: canvas
      ? { x: 0, y: 0, width: rect.x + rect.width + extraW, height: rect.y + rect.height + extraH }
      : { ...rect },
  }));

const angleArb = fc.double({ min: -VIEW3D_MAX_ANGLE, max: VIEW3D_MAX_ANGLE, noNaN: true });
const perspectiveArb = fc.double({ min: 0, max: 1, noNaN: true });

/** Where the flat (orthographic) view draws world point (x, y), in container px. */
function flat(rect: ViewportRect, area: ViewportRect, x: number, y: number): [number, number] {
  const f = orthoFrustum(rect, area);
  const nx = (2 * (x - f.left)) / (f.right - f.left) - 1;
  const ny = (2 * (y - f.bottom)) / (f.top - f.bottom) - 1;
  return [area.x + ((nx + 1) / 2) * area.width, area.y + ((1 - ny) / 2) * area.height];
}

describe('view3dCamera', () => {
  it('draws the plot plane exactly as the flat view at tilt 0 and rotation 0', () => {
    fc.assert(
      fc.property(
        frameArb,
        perspectiveArb,
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        ({ rect, area }, perspective, u, v) => {
          const cam = view3dCamera(rect, area, { tilt: 0, rotation: 0, perspective });
          expect(cam.fit).toBe(1);
          const x = u * rect.width;
          const y = v * rect.height;
          const [sx, sy] = view3dProject(cam, area, x, y);
          const [fx, fy] = flat(rect, area, x, y);
          expect(Math.abs(sx - fx)).toBeLessThan(1e-6 * Math.max(1, area.width));
          expect(Math.abs(sy - fy)).toBeLessThan(1e-6 * Math.max(1, area.height));
          // In container px: the flat view's own mapping.
          expect(Math.abs(sx - (rect.x + x))).toBeLessThan(1e-6 * Math.max(1, area.width));
          expect(Math.abs(sy - (rect.y + rect.height - y))).toBeLessThan(
            1e-6 * Math.max(1, area.height),
          );
        },
      ),
    );
  });

  it('maps a pointer to the plot plane and back (round trip) at any angle', () => {
    fc.assert(
      fc.property(
        frameArb,
        angleArb,
        angleArb,
        perspectiveArb,
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        ({ rect, area }, tilt, rotation, perspective, u, v) => {
          const cam = view3dCamera(rect, area, { tilt, rotation, perspective });
          const x = u * rect.width;
          const y = v * rect.height;
          const [sx, sy] = view3dProject(cam, area, x, y);
          const [px, py] = view3dUnproject(cam, area, sx, sy);
          const scale = Math.max(rect.width, rect.height);
          expect(Math.abs(px - x)).toBeLessThan(1e-6 * scale);
          expect(Math.abs(py - y)).toBeLessThan(1e-6 * scale);
        },
      ),
    );
  });

  it('fits the tilted plane inside its rect', () => {
    fc.assert(
      fc.property(frameArb, angleArb, angleArb, perspectiveArb, ({ rect, area }, t, r, p) => {
        const cam = view3dCamera(rect, area, { tilt: t, rotation: r, perspective: p });
        expect(cam.fit).toBeGreaterThanOrEqual(1);
        for (const [x, y] of [
          [0, 0],
          [rect.width, 0],
          [0, rect.height],
          [rect.width, rect.height],
        ] as const) {
          const [sx, sy] = view3dProject(cam, area, x, y);
          expect(sx).toBeGreaterThanOrEqual(rect.x - 1e-6);
          expect(sx).toBeLessThanOrEqual(rect.x + rect.width + 1e-6);
          expect(sy).toBeGreaterThanOrEqual(rect.y - 1e-6);
          expect(sy).toBeLessThanOrEqual(rect.y + rect.height + 1e-6);
        }
      }),
    );
  });

  it('keeps the center of the rect at its place', () => {
    const rect = { x: 50, y: 30, width: 500, height: 300 };
    const area = { x: 0, y: 0, width: 640, height: 400 };
    const cam = view3dCamera(rect, area, { tilt: 35, rotation: -50, perspective: 0.8 });
    const [sx, sy] = view3dProject(cam, area, 250, 150);
    expect(sx).toBeCloseTo(300, 6);
    expect(sy).toBeCloseTo(180, 6);
  });

  it('looks from above for a positive tilt and from the right for a positive rotation', () => {
    const rect = { x: 0, y: 0, width: 400, height: 300 };
    const tilted = view3dCamera(rect, rect, { tilt: 30, rotation: 0, perspective: 0.5 });
    expect(tilted.eye.y).toBeGreaterThan(150);
    expect(tilted.eye.z).toBeGreaterThan(0);
    // Seen from above, the top edge of the plane is nearer: it is drawn wider.
    const top = view3dProject(tilted, rect, 400, 300)[0] - view3dProject(tilted, rect, 0, 300)[0];
    const bottom = view3dProject(tilted, rect, 400, 0)[0] - view3dProject(tilted, rect, 0, 0)[0];
    expect(top).toBeGreaterThan(bottom);
    // Something raised toward the viewer shows below its footprint.
    expect(view3dProject(tilted, rect, 200, 150, 20)[1]).toBeGreaterThan(
      view3dProject(tilted, rect, 200, 150)[1],
    );
    const turned = view3dCamera(rect, rect, { tilt: 0, rotation: 30, perspective: 0.5 });
    expect(turned.eye.x).toBeGreaterThan(200);
  });

  it('uses a parallel projection at perspective 0 and clamps the angles', () => {
    const rect = { x: 0, y: 0, width: 400, height: 300 };
    const cam = view3dCamera(rect, rect, { tilt: 200, rotation: -200, perspective: 0 });
    expect(cam.orthographic).toBe(true);
    const clamped = view3dCamera(rect, rect, {
      tilt: VIEW3D_MAX_ANGLE,
      rotation: -VIEW3D_MAX_ANGLE,
      perspective: 0,
    });
    expect(cam.eye.toArray()).toEqual(clamped.eye.toArray());
    // Parallel rays: every pointer ray has the same direction.
    const a = view3dRay(cam, rect, 10, 10).direction.normalize();
    const b = view3dRay(cam, rect, 390, 290).direction.normalize();
    expect(a.distanceTo(b)).toBeLessThan(1e-9);
    // Non-finite input falls back to the flat view.
    const flatCam = view3dCamera(rect, rect, { tilt: NaN, rotation: NaN, perspective: NaN });
    expect(flatCam.fit).toBe(1);
  });

  it('keeps every point of the tilted plane in front of the camera', () => {
    fc.assert(
      fc.property(frameArb, angleArb, angleArb, perspectiveArb, ({ rect, area }, t, r, p) => {
        const cam = view3dCamera(rect, area, { tilt: t, rotation: r, perspective: p });
        for (const [x, y] of [
          [0, 0],
          [rect.width, rect.height],
        ] as const) {
          const clip = new Vector4(x, y, 0, 1).applyMatrix4(cam.viewProjection);
          expect(clip.w).toBeGreaterThan(0);
          expect(Math.abs(clip.z / clip.w)).toBeLessThanOrEqual(1);
        }
      }),
    );
  });
});
