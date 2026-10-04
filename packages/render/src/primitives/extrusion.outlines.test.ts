import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { DataTransform, PrimitiveContext } from '../types.ts';
import { createExtrusionPrimitive, type ExtrusionPrimitive } from './extrusion.ts';
import { polygonOutline, sectorOutline, type Outline } from './extrusion-geometry.ts';
import { loadMeshModule } from './mesh-loader.ts';

/**
 * The extrusion primitive's `outlines` (plan E8.9: sectors and polygons given in data space): the
 * prisms it builds for a data → world transform — in world px, facing out whichever axes are
 * flipped, wall normals square to the walls under non-uniform scales — and their pointer boxes.
 */

function context(): PrimitiveContext {
  return { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
}

/** The mesh the prisms were built into (world px). */
function built(p: ExtrusionPrimitive) {
  const d = p.mesh.data;
  const positions = d.positions;
  const normals = d.normals!;
  const indices = d.indices!;
  const axis = (k: number) => [...positions].filter((_, i) => i % 3 === k);
  const range = (k: number) => [Math.min(...axis(k)), Math.max(...axis(k))];
  /** Signed volume (divergence theorem): positive when triangles face outward. */
  let volume = 0;
  /** Whether every triangle faces the way its vertices' normals point. */
  let outward = true;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!].map(
      (v) => new Vector3(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]),
    ) as [Vector3, Vector3, Vector3];
    volume += a.dot(b.clone().cross(c)) / 6;
    const face = b.clone().sub(a).cross(c.clone().sub(a));
    for (const v of [indices[t]!, indices[t + 1]!, indices[t + 2]!]) {
      const n = new Vector3(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]);
      if (face.dot(n) < -1e-6) outward = false;
    }
  }
  return { positions, normals, indices, range, volume, outward };
}

/** Area (data units²) of a quarter disc of radius 1 drawn as a fan of `n` segments. */
const quarterArea = (n: number): number => (n * Math.sin(Math.PI / 2 / n)) / 2;

describe('ExtrusionPrimitive outlines', () => {
  const quarter = sectorOutline(0, 0, 0, 1, 0, Math.PI / 2, 4);

  it('maps sectors to world px, facing out, also with both axes reversed', async () => {
    const mesh = await loadMeshModule();
    const transforms: DataTransform[] = [
      { scaleX: 100, scaleY: 50, offsetX: 10, offsetY: 200 },
      // Both axes reversed: the sector turned by half a turn.
      { scaleX: -100, scaleY: -50, offsetX: 10, offsetY: 200 },
    ];
    for (const t of transforms) {
      const p = createExtrusionPrimitive(context(), { outlines: [quarter], depth: 8 }, mesh);
      p.setTransform(t);
      const b = built(p);
      // Data x and y run 0…1.
      const xs = [10, 10 + t.scaleX].sort((u, v) => u - v);
      const ys = [200, 200 + t.scaleY].sort((u, v) => u - v);
      expect(b.range(0)[0]).toBeCloseTo(xs[0]!, 4);
      expect(b.range(0)[1]).toBeCloseTo(xs[1]!, 4);
      expect(b.range(1)[0]).toBeCloseTo(ys[0]!, 4);
      expect(b.range(1)[1]).toBeCloseTo(ys[1]!, 4);
      expect(b.range(2)).toEqual([0, 8]);
      // A closed prism over the sector, its triangles facing out.
      expect(b.volume).toBeCloseTo(quarterArea(4) * 100 * 50 * 8, 0);
      expect(b.outward).toBe(true);
      expect(p.maxDepth).toBe(8);
      p.dispose();
    }
  });

  it('keeps wall normals square to the walls under different x and y scales', async () => {
    const mesh = await loadMeshModule();
    // A diamond (no cap triangulation: a fan), drawn twice as tall as wide; then with the y axis
    // running down and with the x axis running left (the ring is walked the other way round).
    const diamond = polygonOutline([-1, 0, 0, -1, 1, 0, 0, 1]);
    for (const [scaleX, scaleY] of [
      [10, 20],
      [10, -20],
      [-10, 20],
    ] as const) {
      const p = createExtrusionPrimitive(context(), { outlines: [diamond], depth: 5 }, mesh);
      p.setTransform({ scaleX, scaleY, offsetX: 0, offsetY: 0 });
      const b = built(p);
      // World edges run (±10, ±20): their normals are (±2, ±1) / √5, not the data-space (±1, ±1) / √2.
      let walls = 0;
      for (let i = 0; i < b.normals.length; i += 3) {
        if (b.normals[i + 2] !== 0) continue;
        walls++;
        expect(Math.abs(b.normals[i]!)).toBeCloseTo(2 / Math.sqrt(5), 6);
        expect(Math.abs(b.normals[i + 1]!)).toBeCloseTo(1 / Math.sqrt(5), 6);
      }
      expect(walls).toBeGreaterThan(0);
      expect(b.outward).toBe(true);
      // The diamond's area is 2 · 10 · 20.
      expect(b.volume).toBeCloseTo(400 * 5, 2);
      p.dispose();
    }
  });

  it('gives each outline its own depth and color, and leaves out the ones without depth', async () => {
    const mesh = await loadMeshModule();
    const shifted = (dx: number): Outline => ({ ...quarter, x: quarter.x.map((x) => x + dx) });
    const p = createExtrusionPrimitive(
      context(),
      {
        outlines: [quarter, shifted(2), shifted(4)],
        depth: new Float32Array([6, 0, 12]),
        color: new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]),
      },
      mesh,
    );
    p.setTransform({ scaleX: 10, scaleY: 10, offsetX: 0, offsetY: 0 });
    const b = built(p);
    const color = p.mesh.data.color as Float32Array;
    // Vertices over x 0…10 (the first outline) are red and up to 6 px deep; those over 40…50 (the
    // third) blue and up to 12; nothing stands over 20…30.
    const seen = new Set<string>();
    for (let v = 0; v < b.positions.length / 3; v++) {
      const [x, z] = [b.positions[v * 3]!, b.positions[v * 3 + 2]!];
      const rgba = [...color.slice(v * 4, v * 4 + 4)].join();
      seen.add(rgba);
      expect(rgba).toBe(x < 15 ? '1,0,0,1' : '0,0,1,1');
      expect(z).toBeLessThanOrEqual(x < 15 ? 6 : 12);
      expect(x <= 10.001 || x >= 39.999).toBe(true);
    }
    expect(seen).toEqual(new Set(['1,0,0,1', '0,0,1,1']));
    expect(p.maxDepth).toBe(12);
    p.dispose();
  });

  it("ray-casts each outline's bounding box, skipping flat, empty and broken outlines", async () => {
    const mesh = await loadMeshModule();
    const empty: Outline = { x: [], y: [], nx: [], ny: [], ox: [], oy: [] };
    const broken: Outline = { ...quarter, x: quarter.x.map(() => NaN) };
    const flat: Outline = { ...quarter, x: quarter.x.map((x) => x + 2) };
    const p = createExtrusionPrimitive(
      context(),
      { outlines: [empty, broken, flat, quarter], depth: new Float32Array([8, 8, 0, 8]) },
      mesh,
    );
    // World: the quarter disc spans x 10…110, y 150…200 (y flipped).
    p.setTransform({ scaleX: 100, scaleY: -50, offsetX: 10, offsetY: 200 });
    const down = new Vector3(0, 0, -1);
    // Inside the disc.
    expect(p.raycast(new Vector3(30, 190, 100), down)).toMatchObject({ t: 92, index: 3 });
    // Outside the disc but inside its box (data (0.9, 0.9)): the box is what is tested.
    const corner = p.raycast(new Vector3(100, 155, 100), down)!;
    expect(corner.index).toBe(3);
    expect(corner.t).toBe(92);
    expect(corner.x).toBeCloseTo(100, 6);
    expect(corner.y).toBeCloseTo(155, 6);
    // Outside the box; and over the outline without depth (x 210…310).
    expect(p.raycast(new Vector3(120, 190, 100), down)).toBeUndefined();
    expect(p.raycast(new Vector3(250, 190, 100), down)).toBeUndefined();
    p.dispose();
  });
});
