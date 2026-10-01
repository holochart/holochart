import fc from 'fast-check';
import { Object3D, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { sampleColorscale } from '../colorscale/lut.ts';
import { createResourceManager } from '../resources.ts';
import type { DataTransform, Primitive } from '../types.ts';
import { ExtrusionPrimitive, UNCLIPPED, type ExtrusionHost } from './extrusion.ts';
import {
  HEATMAP_COLUMNS_MAX,
  heatmapColumns,
  raycastSlab,
  slabGeometry,
  syncExtrudedFills,
  syncHeatmapColumns,
  writeSlab,
} from './extrusion-cartesian.ts';
import { PrismBuffers } from './extrusion-geometry.ts';
import { triangulateFills } from './fill-triangulate.ts';
import type { LazyFillPrimitive } from './fill-loader.ts';
import type { HeatmapData, HeatmapPrimitive } from './heatmap.ts';
import { loadMeshModule } from './mesh-loader.ts';

/**
 * Heatmap columns and area slabs (plan E8.9): column heights and colors from z, slab geometry from
 * fill triangulations (holes, self-intersecting rings), the exact slab ray test, and the syncs
 * that create, update, skip and remove the extrusion primitive.
 */

const GRAY = [
  [0, [0, 0, 0, 1]],
  [1, [1, 1, 1, 1]],
] as const;

function grid(z: number[], nx: number, ny: number): HeatmapData {
  return {
    z,
    nx,
    ny,
    xEdges: Array.from({ length: nx + 1 }, (_, i) => i),
    yEdges: Array.from({ length: ny + 1 }, (_, j) => j),
    colorscale: GRAY,
    interpolation: 'rgb',
    zmin: Math.min(...z.filter(Number.isFinite)),
    zmax: Math.max(...z.filter(Number.isFinite)),
    reversescale: false,
    smoothing: false,
    xgap: 0,
    ygap: 0,
    opacity: 1,
  };
}

describe('heatmapColumns', () => {
  it('grows heights from 0 to depth at zmax, colored like the cells', () => {
    const c = heatmapColumns(grid([0, 5, 10, NaN], 2, 2), 100);
    expect([...c.depth]).toEqual([0, 50, 100, 0]);
    expect([...c.x0]).toEqual([0, 1, 0, NaN]);
    expect([...c.y1]).toEqual([1, 1, 2, 2]);
    // Black at zmin, white at zmax, as the colorscale.
    expect([...c.color.slice(0, 4)]).toEqual([0, 0, 0, 1]);
    expect([...c.color.slice(8, 12)]).toEqual([1, 1, 1, 1]);
    expect(c.color[4]).toBeCloseTo(sampleColorscale(GRAY, 0.5)[0], 6);
  });

  it('starts from 0 for positive ranges, from zmin with negative values; clamps', () => {
    const pos = heatmapColumns({ ...grid([4, 8], 2, 1), zmin: 4, zmax: 8 }, 80);
    expect([...pos.depth]).toEqual([40, 80]);
    const neg = heatmapColumns({ ...grid([-10, 0, 10, 30], 4, 1), zmax: 10 }, 20);
    expect([...neg.depth]).toEqual([0, 10, 20, 20]);
    // Reversed scales flip colors, not heights.
    const rev = heatmapColumns({ ...grid([0, 1], 2, 1), reversescale: true }, 10);
    expect([...rev.depth]).toEqual([0, 10]);
    expect(rev.color[0]).toBe(1);
  });

  it('insets cells by the gaps, either edge direction; drops cells the gaps swallow', () => {
    const d = { ...grid([1, 1], 2, 1), xEdges: [2, 1, 0], yEdges: [0, 0.1] };
    const c = heatmapColumns(d, 10, 0.25, 0.1);
    expect([...c.x0]).toEqual([1.75, 0.75]);
    expect([...c.x1]).toEqual([1.25, 0.25]);
    expect([...c.y0]).toEqual([NaN, NaN]);
  });

  it('keeps heights within [0, depth], monotonic in z', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1e3, max: 1e3, noNaN: true }), { minLength: 2, maxLength: 30 }),
        fc.double({ min: 1, max: 500, noNaN: true }),
        (z, top) => {
          const c = heatmapColumns(grid(z, z.length, 1), top);
          const order = [...z.keys()].sort((a, b) => z[a]! - z[b]!);
          for (let k = 0; k < z.length; k++) {
            expect(c.depth[k]).toBeGreaterThanOrEqual(0);
            expect(c.depth[k]).toBeLessThanOrEqual(Math.fround(top));
          }
          for (let k = 1; k < order.length; k++) {
            expect(c.depth[order[k]!]).toBeGreaterThanOrEqual(c.depth[order[k - 1]!]!);
          }
        },
      ),
    );
  });
});

const ID: DataTransform = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

/** Signed area of the front triangles and the boundary loop (edges chain end to start). */
function check(g: ReturnType<typeof slabGeometry>): { area: number; closed: boolean } {
  let area = 0;
  for (let k = 0; k < g.tris.length; k += 3) {
    const [a, b, c] = [g.tris[k]!, g.tris[k + 1]!, g.tris[k + 2]!];
    const cross =
      (g.x[b]! - g.x[a]!) * (g.y[c]! - g.y[a]!) - (g.y[b]! - g.y[a]!) * (g.x[c]! - g.x[a]!);
    expect(cross).toBeGreaterThan(0);
    area += cross / 2;
  }
  // Every boundary point is left as often as it is reached: closed loops.
  const degree = new Map<string, number>();
  const at = (v: number) => `${g.x[v]},${g.y[v]}`;
  for (let k = 0; k < g.edges.length; k += 2) {
    degree.set(at(g.edges[k]!), (degree.get(at(g.edges[k]!)) ?? 0) + 1);
    degree.set(at(g.edges[k + 1]!), (degree.get(at(g.edges[k + 1]!)) ?? 0) - 1);
  }
  return { area, closed: [...degree.values()].every((d) => d === 0) };
}

describe('slabGeometry', () => {
  it('turns triangles counter-clockwise and finds the boundary of a polygon with a hole', () => {
    // A 4×4 square with a 2×2 hole (nonzero: the inner ring runs the other way).
    const tri = triangulateFills({
      x: [0, 4, 4, 0, 1, 1, 3, 3],
      y: [0, 0, 4, 4, 1, 3, 3, 1],
      rings: [0, 4],
      polygons: [0],
      fillRule: 'nonzero',
    });
    const g = slabGeometry(tri, { scaleX: 10, scaleY: -10, offsetX: 5, offsetY: 100 });
    const { area, closed } = check(g);
    expect(area).toBeCloseTo(1200, 6);
    expect(closed).toBe(true);
    // Outer 4 edges and the hole's 4, in world px (the y flip keeps them counter-clockwise).
    expect(g.edges.length / 2).toBe(8);
  });

  it('covers a self-intersecting ring by the nonzero rule, walls on its outline only', () => {
    // A pentagram: nonzero fills the five points and the pentagon in the middle.
    const x: number[] = [];
    const y: number[] = [];
    for (let k = 0; k < 5; k++) {
      const a = Math.PI / 2 + (k * 4 * Math.PI) / 5;
      x.push(Math.cos(a));
      y.push(Math.sin(a));
    }
    const g = slabGeometry(triangulateFills({ x, y, fillRule: 'nonzero' }), ID);
    const { area, closed } = check(g);
    expect(closed).toBe(true);
    // The star's outline: 10 edges (none through the filled middle).
    expect(g.edges.length / 2).toBe(10);
    // Its area: 10 triangles from the center to the outline (outer radius 1, inner r, 36° apart).
    const r = Math.cos((2 * Math.PI) / 5) / Math.cos(Math.PI / 5);
    expect(area).toBeCloseTo(5 * r * Math.sin(Math.PI / 5), 6);
  });

  it('gives stacked areas (adjacent fills) a shared boundary, walls facing away', () => {
    const lower = slabGeometry(triangulateFills({ x: [0, 2, 2, 0], y: [0, 0, 1, 1] }), ID);
    const upper = slabGeometry(triangulateFills({ x: [0, 2, 2, 0], y: [1, 1, 2, 2] }), ID);
    const wall = (g: typeof lower, y: number) => {
      for (let k = 0; k < g.edges.length; k += 2) {
        const [a, b] = [g.edges[k]!, g.edges[k + 1]!];
        if (g.y[a] === y && g.y[b] === y) return Math.sign(g.x[b]! - g.x[a]!);
      }
      return 0;
    };
    // The lower one's top runs right to left (normal up), the upper one's bottom left to right.
    expect(wall(lower, 1)).toBe(-1);
    expect(wall(upper, 1)).toBe(1);
  });
});

describe('writeSlab', () => {
  it('writes the front face at z1 and one outward quad per boundary edge', () => {
    const g = slabGeometry(triangulateFills({ x: [0, 2, 2, 0], y: [0, 0, 1, 1] }), ID);
    const out = new PrismBuffers();
    writeSlab(out, g, 0, 5);
    expect(out.vertexCount).toBe(4 + 4 * 4);
    expect(out.indices.length).toBe(2 * 3 + 4 * 6);
    // Every triangle faces along its vertices' normal.
    const p = out.positions;
    const n = out.normals;
    for (let k = 0; k < out.indices.length; k += 3) {
      const [a, b, c] = [out.indices[k]!, out.indices[k + 1]!, out.indices[k + 2]!];
      const u = new Vector3(
        p[b * 3]! - p[a * 3]!,
        p[b * 3 + 1]! - p[a * 3 + 1]!,
        p[b * 3 + 2]! - p[a * 3 + 2]!,
      );
      const v = new Vector3(
        p[c * 3]! - p[a * 3]!,
        p[c * 3 + 1]! - p[a * 3 + 1]!,
        p[c * 3 + 2]! - p[a * 3 + 2]!,
      );
      const face = u.cross(v).normalize();
      expect(face.dot(new Vector3(n[a * 3], n[a * 3 + 1], n[a * 3 + 2]))).toBeCloseTo(1, 9);
    }
    expect(Math.max(...p.filter((_, i) => i % 3 === 2))).toBe(5);
  });
});

describe('raycastSlab', () => {
  // A 400 × 200 px fill.
  const g = slabGeometry(triangulateFills({ x: [0, 4, 4, 0], y: [0, 0, 2, 2] }), {
    scaleX: 100,
    scaleY: 100,
    offsetX: 0,
    offsetY: 0,
  });
  const ALL = [-Infinity, -Infinity, Infinity, Infinity] as const;
  const down = { x: 0, y: 0, z: -1 };

  it('hits the front face inside the fill (and its plane just outside), nothing further out', () => {
    expect(raycastSlab(g, 0, 10, { x: 100, y: 100, z: 100 }, down, ALL)).toEqual({
      t: 90,
      x: 100,
      y: 100,
      index: 0,
    });
    // 5 px off the right edge: on the front plane, where the lines along the edge are drawn.
    expect(raycastSlab(g, 0, 10, { x: 405, y: 100, z: 100 }, down, ALL)).toEqual({
      t: 90,
      x: 405,
      y: 100,
      index: 0,
    });
    expect(raycastSlab(g, 0, 10, { x: 420, y: 100, z: 100 }, down, ALL)).toBe(undefined);
    // Clipped away.
    expect(raycastSlab(g, 0, 10, { x: 100, y: 100, z: 100 }, down, [200, 0, 400, 200])).toBe(
      undefined,
    );
  });

  it('hits a wall facing the ray, the point moved inside the fill', () => {
    // From above the fill, down and toward it: through the top wall (y = 200) at z = 5, 100 px
    // from the front plane's margin.
    const o = { x: 200, y: 1200, z: 105 };
    const d = new Vector3(0, -10, -1).normalize();
    const hit = raycastSlab(g, 0, 10, o, d, ALL)!;
    expect(hit.x).toBeCloseTo(200, 9);
    expect(hit.y).toBeLessThan(200);
    expect(hit.y).toBeGreaterThan(199.99);
    expect(o.z + hit.t * d.z).toBeCloseTo(5, 6);
  });

  it('agrees with the flat fill for any vertical ray, give or take the margin', () => {
    // Points on a grid off the fill's edges and its margin (where rounding may go either way).
    const at = (i: number) => (i + 0.5) * 3;
    fc.assert(
      fc.property(fc.integer({ min: -20, max: 150 }), fc.integer({ min: -20, max: 80 }), (i, j) => {
        const [x, y] = [at(i), at(j)];
        const hit = raycastSlab(g, 0, 10, { x, y, z: 50 }, down, ALL);
        const dx = Math.max(0, -x, x - 400);
        const dy = Math.max(0, -y, y - 200);
        expect(hit !== undefined).toBe(Math.hypot(dx, dy) <= 8);
      }),
    );
  });
});

function host(trace: Record<string, unknown>, extra: Partial<ExtrusionHost> = {}) {
  const added: Primitive<unknown>[] = [];
  const h = {
    primitives: { resources: createResourceManager(), invalidate: vi.fn<() => void>() },
    trace,
    transform: { scaleX: 10, scaleY: 10, offsetX: 0, offsetY: 0 },
    xaxis: { scale: { range: [0, 4] as [number, number] } },
    yaxis: { scale: { range: [0, 4] as [number, number] } },
    add: (p: Primitive<unknown>) => void added.push(p),
    remove: (p: Primitive<unknown>) => void added.splice(added.indexOf(p), 1),
    added,
    ...extra,
  };
  return h;
}

/** A text-like primitive to lift. */
function label() {
  return { object: new Object3D(), setTransform: vi.fn<(t: DataTransform) => void>() };
}

describe('syncHeatmapColumns', () => {
  it('draws columns, rebuilds only when something changed, lifts labels; removes at depth 0', async () => {
    const mesh = await loadMeshModule();
    const heat = { object: new Object3D(), current: grid([1, 2, 3, 4], 2, 2) };
    heat.object.renderOrder = 7;
    const text = label();
    const h = host({ depth: 40 });
    const p = syncHeatmapColumns(undefined, h, heat as unknown as HeatmapPrimitive, [text], mesh)!;
    expect(p).toBeInstanceOf(ExtrusionPrimitive);
    expect(h.added).toEqual([p]);
    expect(p.maxDepth).toBe(40);
    expect(p.object.renderOrder).toBe(7);
    // The flat heatmap stays (the floor).
    expect(heat.object.visible).toBe(true);
    expect(text.setTransform).toHaveBeenLastCalledWith(expect.objectContaining({ offsetZ: 40.5 }));
    expect(text.object.userData[UNCLIPPED]).toBe(true);
    // A pan: the same columns.
    const update = vi.spyOn(p, 'update');
    const panned = { ...h, transform: { ...h.transform, offsetX: 30 } };
    expect(syncHeatmapColumns(p, panned, heat as unknown as HeatmapPrimitive, [text], mesh)).toBe(
      p,
    );
    expect(update).not.toHaveBeenCalled();
    // New values: rebuilt.
    heat.current = grid([4, 3, 2, 1], 2, 2);
    syncHeatmapColumns(p, panned, heat as unknown as HeatmapPrimitive, [text], mesh);
    expect(update).toHaveBeenCalledTimes(1);
    // Flat again.
    const flat = { ...h, trace: { depth: 0 } };
    expect(syncHeatmapColumns(p, flat, heat as unknown as HeatmapPrimitive, [text], mesh)).toBe(
      undefined,
    );
    expect(h.added).toEqual([]);
    expect(text.object.userData[UNCLIPPED]).toBeUndefined();
  });

  it('reads percentages of the mean cell width; stays flat beyond the cell limit, warning once', async () => {
    const mesh = await loadMeshModule();
    const heat = { object: new Object3D(), current: grid([1, 2], 2, 1) };
    const h = host({ depth: '150%' });
    const p = syncHeatmapColumns(undefined, h, heat as unknown as HeatmapPrimitive, [], mesh)!;
    // Cells are 10 px wide.
    expect(p.maxDepth).toBe(15);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const nx = HEATMAP_COLUMNS_MAX + 1;
    const big = { object: new Object3D(), current: { ...grid([1, 2], 2, 1), nx, xEdges: [0, 1] } };
    const px = { ...h, trace: { depth: 40 } };
    expect(syncHeatmapColumns(p, px, big as unknown as HeatmapPrimitive, [], mesh)).toBe(undefined);
    syncHeatmapColumns(undefined, px, big as unknown as HeatmapPrimitive, [], mesh);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('syncExtrudedFills', () => {
  function fill() {
    const tri = triangulateFills({ x: [0, 2, 2, 0], y: [0, 0, 1, 1] });
    const object = new Object3D();
    return {
      object,
      fill: { object, triangulation: tri, current: { x: [], y: [], color: [1, 0, 0, 0.5] } },
    } as unknown as LazyFillPrimitive;
  }

  it('draws the fill as a slab, hides the flat fill and lifts the lines onto its front', async () => {
    const mesh = await loadMeshModule();
    const f = fill();
    // The line is drawn; a removed primitive (no parent) is left alone.
    const line = label();
    new Object3D().add(line.object);
    const removed = label();
    const added = [f, line, removed] as unknown as Primitive<unknown>[];
    const h = host({ depth: 20 }, { index: 3 } as Partial<ExtrusionHost>);
    const p = syncExtrudedFills(undefined, h, f, added, mesh)!;
    expect(removed.setTransform).not.toHaveBeenCalled();
    // Later traces a fraction of a px in front.
    expect(p.maxDepth).toBeCloseTo(20.6, 6);
    expect(f.object.visible).toBe(false);
    expect(p.data.color).toEqual([1, 0, 0, 0.5]);
    expect(line.setTransform).toHaveBeenLastCalledWith(
      expect.objectContaining({ offsetZ: expect.closeTo(21.1, 6) as number }),
    );
    // A ray straight down onto the slab (world px: the fill spans 0…20 × 0…10).
    const hit = p.raycast(new Vector3(5, 5, 100), new Vector3(0, 0, -1));
    expect(hit?.x).toBe(5);
    expect(hit?.t).toBeCloseTo(100 - 20.6, 6);
    // Panned: the ray test follows the moved slab.
    p.setTransform({ ...h.transform, offsetX: 100 });
    expect(p.raycast(new Vector3(5, 5, 100), new Vector3(0, 0, -1))).toBe(undefined);
    expect(p.raycast(new Vector3(105, 5, 100), new Vector3(0, 0, -1))?.x).toBe(105);
    // Flat again: the flat fill shows.
    expect(syncExtrudedFills(p, { ...h, trace: {} }, f, added, mesh)).toBe(undefined);
    expect(f.object.visible).toBe(true);
    expect(h.added).toEqual([]);
  });

  it('draws nothing until the fill code has loaded', async () => {
    const mesh = await loadMeshModule();
    const f = { object: new Object3D(), fill: null } as unknown as LazyFillPrimitive;
    const h = host({ depth: 20 });
    expect(syncExtrudedFills(undefined, h, f, [], mesh)).toBe(undefined);
    expect(h.added).toEqual([]);
  });
});
