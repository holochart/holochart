import fc from 'fast-check';
import { Matrix4, Object3D, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { IDENTITY_TRANSFORM } from '../types.ts';
import {
  DepthSorter,
  depthOrder,
  floatSortKey,
  viewDepthCoefficients,
  type DepthCoefficients,
} from './depth-sort.ts';

function fakeClock() {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  return {
    now: () => now,
    setTimeout(fn: () => void, ms: number) {
      const t = { at: now + ms, fn };
      timers.push(t);
      return t;
    },
    clearTimeout(handle: unknown) {
      const i = timers.indexOf(handle as (typeof timers)[number]);
      if (i >= 0) timers.splice(i, 1);
    },
    advance(ms: number) {
      now += ms;
      for (const t of [...timers].sort((a, b) => a.at - b.at)) {
        if (t.at > now) continue;
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
    },
  };
}

describe('floatSortKey', () => {
  it('orders like the floats (property), NaN first', () => {
    fc.assert(
      fc.property(
        fc.float({ noNaN: true, noDefaultInfinity: false }),
        fc.float({ noNaN: true }),
        (a, b) => {
          const ka = floatSortKey(a);
          const kb = floatSortKey(b);
          if (a < b) expect(ka).toBeLessThan(kb);
          else if (a > b) expect(ka).toBeGreaterThan(kb);
          else if (!Object.is(a, -0) && !Object.is(b, -0)) expect(ka).toBe(kb);
          expect(floatSortKey(NaN)).toBeLessThanOrEqual(Math.min(ka, kb));
        },
      ),
    );
  });
});

describe('depthOrder', () => {
  it('sorts back to front: ascending view depth, stable, NaN first (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.oneof(fc.double({ min: -1e3, max: 1e3, noNaN: true }), fc.constant(NaN)),
            fc.double({ min: -1e3, max: 1e3, noNaN: true }),
            fc.integer({ min: -3, max: 3 }), // few distinct z: many ties
          ),
          { maxLength: 300 },
        ),
        fc.tuple(
          fc.double({ min: -2, max: 2, noNaN: true }),
          fc.double({ min: -2, max: 2, noNaN: true }),
          fc.double({ min: -2, max: 2, noNaN: true }),
          fc.double({ min: -5, max: 5, noNaN: true }),
        ),
        (pts, k) => {
          const n = pts.length;
          const x = pts.map((p) => p[0]);
          const y = pts.map((p) => p[1]);
          const z = pts.map((p) => p[2]);
          const order = depthOrder(x, y, z, n, k as DepthCoefficients, new Uint32Array(n));
          expect([...order].sort((a, b) => a - b)).toEqual([...Array(n).keys()]);
          const key = (i: number) => {
            const d = k[0] * x[i]! + k[1] * y[i]! + k[2] * z[i]! + k[3];
            return Number.isFinite(d) ? Math.fround(d) : -Infinity;
          };
          for (let i = 1; i < n; i++) {
            const a = order[i - 1]!;
            const b = order[i]!;
            expect(key(a)).toBeLessThanOrEqual(key(b));
            // Stable among identical keys (-0 and +0 are distinct keys: -0 sorts first).
            const same = Number.isFinite(key(a)) && floatSortKey(key(a)) === floatSortKey(key(b));
            if (same) expect(a).toBeLessThan(b);
          }
        },
      ),
    );
  });

  it('matches the view-space z three.js computes', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(3, 2, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const object = new Object3D();
    object.position.set(0.5, 0, 0);
    object.updateMatrixWorld();
    const transform = { scaleX: 2, scaleY: 0.5, scaleZ: 3, offsetX: -1, offsetY: 1, offsetZ: 0 };
    const mv = new Matrix4().multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
    const k = viewDepthCoefficients(mv.elements, transform);
    const p = new Vector3(0.3, -0.7, 0.2);
    const world = new Vector3(p.x * 2 - 1, p.y * 0.5 + 1, p.z * 3);
    const view = world.applyMatrix4(mv);
    expect(k[0] * p.x + k[1] * p.y + k[2] * p.z + k[3]).toBeCloseTo(view.z, 12);
  });
});

describe('DepthSorter', () => {
  it('keeps data order until a view is observed, then re-sorts on view changes (throttled)', () => {
    const clock = fakeClock();
    let resorts = 0;
    const sorter = new DepthSorter(() => resorts++, 100, clock);
    const x = [0, 0, 0];
    const y = [0, 0, 0];
    const z = [1, -1, 0];
    expect([...sorter.sort(x, y, z, 3)]).toEqual([0, 1, 2]);

    const camera = new PerspectiveCamera();
    const object = new Object3D();
    camera.position.set(0, 0, 5);
    camera.updateMatrixWorld();
    sorter.observe(camera, object, IDENTITY_TRANSFORM);
    expect(resorts).toBe(1); // leading edge
    // Camera on +z looking down -z: z = -1 is farthest.
    expect([...sorter.sort(x, y, z, 3)]).toEqual([1, 2, 0]);

    sorter.observe(camera, object, IDENTITY_TRANSFORM);
    expect(resorts).toBe(1); // same view: nothing to do
    camera.position.set(0, 0, -5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    sorter.observe(camera, object, IDENTITY_TRANSFORM);
    expect(resorts).toBe(1); // inside the interval: trailing run pending
    clock.advance(100);
    expect(resorts).toBe(2);
    expect([...sorter.sort(x, y, z, 3)]).toEqual([0, 2, 1]);
    sorter.cancel();
  });
});
