import fc from 'fast-check';
import { BoxGeometry, Mesh, MeshBasicMaterial, Matrix4, PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import {
  orderTranslucent,
  reorderTriangles,
  sortTrianglesByDepth,
  triangleCentroids,
} from './transparency.ts';

/** A camera at +z looking down −z: view z = world z − 5. */
function viewOf(position: [number, number, number]): Matrix4 {
  const c = new PerspectiveCamera();
  c.position.set(...position);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c.matrixWorldInverse;
}

describe('sortTrianglesByDepth', () => {
  it('orders triangles farthest first', () => {
    // Centroids at z = 0, 2, −3, 1.
    const centroids = new Float32Array([0, 0, 0, 0, 0, 2, 0, 0, -3, 0, 0, 1]);
    const order = sortTrianglesByDepth(centroids, viewOf([0, 0, 5]).elements);
    expect([...order]).toEqual([2, 0, 3, 1]);
    // From the other side the order reverses.
    expect([...sortTrianglesByDepth(centroids, viewOf([0, 0, -5]).elements)]).toEqual([1, 3, 0, 2]);
  });

  it('is stable for equal depths and draws invalid (NaN) triangles first', () => {
    const centroids = new Float32Array([1, 0, 0, NaN, NaN, NaN, -1, 0, 0, 0, 0, 1]);
    expect([...sortTrianglesByDepth(centroids, viewOf([0, 0, 5]).elements)]).toEqual([0, 1, 2, 3]);
  });

  it('property: view depths are non-decreasing along the order (up to bucket width)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 1, maxLength: 60 }),
        fc.float({ min: -3, max: 3, noNaN: true }),
        (zs, angle) => {
          const centroids = new Float32Array(zs.length * 3);
          zs.forEach((z, i) => centroids.set([i % 7, (i * 3) % 5, z], i * 3));
          const view = viewOf([10 * Math.sin(angle), 3, 10 * Math.cos(angle)]).elements;
          const order = sortTrianglesByDepth(centroids, view);
          expect([...order].sort((a, b) => a - b)).toEqual(zs.map((_, i) => i));
          const depth = (t: number) =>
            view[2]! * centroids[t * 3]! +
            view[6]! * centroids[t * 3 + 1]! +
            view[10]! * centroids[t * 3 + 2]! +
            view[14]!;
          const ds = [...order].map(depth);
          const span = Math.max(...ds) - Math.min(...ds);
          // The sort keeps depths as Float32 keys: triangles closer than float32 resolution at
          // their depth (~|d|·2⁻²³, e.g. 1e-6 at depth 10) may come in either order.
          const f32 = (d: number) => Math.abs(d) * 2 ** -22;
          for (let i = 1; i < ds.length; i++) {
            const tolerance = span / 65535 + f32(ds[i - 1]!) + 1e-9;
            expect(ds[i]!).toBeGreaterThanOrEqual(ds[i - 1]! - tolerance);
          }
        },
      ),
    );
  });

  it('reorders an index buffer by triangle order; centroids skip invalid triangles', () => {
    const positions = new Float32Array([0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0, 3]);
    const index = new Uint16Array([0, 1, 2, 0, 1, 3]);
    const centroids = triangleCentroids(positions, index, (t) => t === 0);
    expect([...centroids.subarray(0, 3)]).toEqual([1, 1, 0]);
    expect(Number.isNaN(centroids[3])).toBe(true);
    const out = new Uint16Array(6);
    reorderTriangles(index, [1, 0], out);
    expect([...out]).toEqual([0, 1, 3, 0, 1, 2]);
  });
});

describe('orderTranslucent', () => {
  it('gives translucent meshes render orders from far to near, skipping opaque ones', () => {
    const scene = new Scene();
    const mk = (z: number, transparent: boolean) => {
      const m = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ transparent }));
      m.position.z = z;
      scene.add(m);
      return m;
    };
    const near = mk(2, true);
    const far = mk(-4, true);
    const opaque = mk(0, false);
    const mid = mk(0, true);
    scene.updateMatrixWorld();
    const c = new PerspectiveCamera();
    c.position.set(0, 0, 10);
    c.updateMatrixWorld();
    const next = orderTranslucent([scene], c, 5, 1);
    expect([far.renderOrder, mid.renderOrder, near.renderOrder]).toEqual([5, 6, 7]);
    expect(opaque.renderOrder).toBe(0);
    expect(next).toBe(8);
  });
});
