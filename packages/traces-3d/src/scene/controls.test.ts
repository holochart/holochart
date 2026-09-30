import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cameraOf, norm, sub } from './camera.ts';
import {
  addMotion,
  applyMotion,
  dampedStep,
  dragMotion,
  emptyMotion,
  ROTATE_PER_HEIGHT,
  settled,
  type Motion,
} from './controls.ts';

describe('3D controls', () => {
  it('maps drags to rotation (half a turn per height), pan px and zoom (down zooms in)', () => {
    expect(dragMotion('rotate', 100, -50, 200)).toEqual({
      rx: ROTATE_PER_HEIGHT / 2,
      ry: -ROTATE_PER_HEIGHT / 4,
    });
    expect(dragMotion('pan', 3, 4, 200)).toEqual({ px: 3, py: 4 });
    expect(dragMotion('zoom', 0, 50, 200).zoom).toBeLessThan(0);
  });

  it('damping reaches exactly what the input asked for', () => {
    const amount = fc.double({ min: -10, max: 10, noNaN: true });
    fc.assert(
      fc.property(amount, amount, amount, fc.integer({ min: 1, max: 60 }), (rx, px, zoom, dt) => {
        const pending: Motion = { ...emptyMotion(), rx, px, zoom };
        const total = emptyMotion();
        for (let i = 0; i < 2000 && !settled(pending); i++) {
          addMotion(total, dampedStep(pending, dt, 45));
        }
        addMotion(total, dampedStep(pending, dt, 45));
        expect(pending).toEqual(emptyMotion());
        expect(total.rx).toBeCloseTo(rx, 9);
        expect(total.px).toBeCloseTo(px, 9);
        expect(total.zoom).toBeCloseTo(zoom, 9);
      }),
    );
  });

  it('applies everything at once without damping (reduced motion)', () => {
    const pending: Motion = { rx: 1, ry: 2, px: 3, py: 4, zoom: 5 };
    expect(dampedStep(pending, 16, 0)).toEqual({ rx: 1, ry: 2, px: 3, py: 4, zoom: 5 });
    expect(settled(pending)).toBe(true);
  });

  it('turntable keeps z up; orthographic zoom scales the zoom factor, not the camera', () => {
    const camera = cameraOf({ up: { x: 0.2, y: 0, z: 1 } });
    const m: Motion = { rx: 0.3, ry: 0.1, px: 0, py: 0, zoom: 0 };
    expect(
      applyMotion({ camera, orthoZoom: 1 }, m, 'turntable', 'perspective', 300).camera.up,
    ).toEqual([0, 0, 1]);
    const zoom: Motion = { ...emptyMotion(), zoom: -Math.log(2) };
    const o = applyMotion({ camera, orthoZoom: 1 }, zoom, 'orbit', 'orthographic', 300);
    expect(o.orthoZoom).toBeCloseTo(2, 12);
    expect(o.camera).toBe(camera);
    const p = applyMotion({ camera, orthoZoom: 1 }, zoom, 'orbit', 'perspective', 300);
    expect(norm(sub(p.camera.eye, p.camera.center))).toBeCloseTo(
      norm(sub(camera.eye, camera.center)) / 2,
      12,
    );
  });
});
