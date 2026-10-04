import { Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { DataTransform, Primitive } from '../types.ts';
import { UNCLIPPED, type ExtrusionHost } from './extrusion.ts';
import {
  HEATMAP_BEVEL_MAX,
  heatmapColumns,
  raycastSlab,
  slabGeometry,
  syncHeatmapColumns,
} from './extrusion-cartesian.ts';
import { rectPrismVertexCount } from './extrusion-geometry.ts';
import { triangulateFills } from './fill-triangulate.ts';
import { loadMeshModule } from './mesh-loader.ts';

/**
 * Heatmap columns and area slabs (plan E8.9) at their limits: constant grids and one-color scales,
 * `depth` given as an array, empty grids, the cell count above which columns lose their bevel,
 * layers of cell labels; slab triangulations that number shared points twice or hold empty
 * triangles, fills of several polygons, and rays that meet a slab's walls from the side.
 */

type Heatmap = NonNullable<Parameters<typeof syncHeatmapColumns>[2]>;
type Grid = Heatmap['current'];

const GRAY = [
  [0, [0, 0, 0, 1]],
  [1, [1, 1, 1, 1]],
] as const;

/** An `nx` × `ny` grid of unit cells. */
function grid(z: number[], nx: number, ny: number, extra: Partial<Grid> = {}): Grid {
  return {
    z,
    nx,
    ny,
    xEdges: Array.from({ length: nx + 1 }, (_, i) => i),
    yEdges: Array.from({ length: ny + 1 }, (_, j) => j),
    colorscale: GRAY,
    interpolation: 'rgb',
    zmin: Math.min(...z),
    zmax: Math.max(...z),
    reversescale: false,
    smoothing: false,
    xgap: 0,
    ygap: 0,
    opacity: 1,
    ...extra,
  };
}

function heatmapOf(current: Grid): Heatmap & { current: Grid } {
  return { object: new Object3D(), current } as unknown as Heatmap & { current: Grid };
}

function host(trace: Record<string, unknown>) {
  const added: Primitive<unknown>[] = [];
  const h: ExtrusionHost & { added: Primitive<unknown>[] } = {
    primitives: { resources: createResourceManager(), invalidate: vi.fn<() => void>() },
    trace,
    // 10 px per data unit: cells are 10 px wide.
    transform: { scaleX: 10, scaleY: 10, offsetX: 0, offsetY: 0 },
    add: (p) => void added.push(p),
    remove: (p) => void added.splice(added.indexOf(p), 1),
    added,
  };
  return h;
}

describe('heatmapColumns', () => {
  it('stands every cell of a constant grid at the full depth: each is at zmax', () => {
    for (const v of [0, -5]) {
      const c = heatmapColumns(grid([v, v, v], 3, 1), 60);
      expect([...c.depth]).toEqual([60, 60, 60]);
    }
  });

  it('colors every column with the one color of a single-stop colorscale', () => {
    const teal = [0.25, 0.5, 0.75, 1] as const;
    const c = heatmapColumns(grid([1, 2, 3], 3, 1, { colorscale: [[0.5, teal]] }), 10);
    expect([...c.color]).toEqual([...teal, ...teal, ...teal]);
    // Heights still follow z.
    expect(c.depth[0]).toBeLessThan(c.depth[2]!);
  });
});

describe('syncHeatmapColumns', () => {
  it('takes the first number of a depth array as the height at zmax', async () => {
    const mesh = await loadMeshModule();
    const heat = heatmapOf(grid([1, 2, 3, 4], 2, 2));
    const p = syncHeatmapColumns(undefined, host({ depth: [25, 99] }), heat, [], mesh)!;
    expect(p.maxDepth).toBe(25);
    // z from 1 to 4 over a range starting at 0: a quarter of the depth per unit.
    expect([...(p.data.depth as Float32Array)]).toEqual([6.25, 12.5, 18.75, 25]);
  });

  it('removes the columns of a heatmap that has no cells left', async () => {
    const mesh = await loadMeshModule();
    const heat = heatmapOf(grid([1, 2], 2, 1));
    const text = { object: new Object3D(), setTransform: vi.fn<(t: DataTransform) => void>() };
    const h = host({ depth: 30 });
    const p = syncHeatmapColumns(undefined, h, heat, [text], mesh)!;
    expect(h.added).toEqual([p]);
    expect(text.object.userData[UNCLIPPED]).toBe(true);
    heat.current = grid([], 0, 1);
    expect(syncHeatmapColumns(p, h, heat, [text], mesh)).toBeUndefined();
    expect(h.added).toEqual([]);
    // The labels are back in the flat plot: their own transform, clipped again.
    expect(text.setTransform).toHaveBeenLastCalledWith(h.transform);
    expect(UNCLIPPED in text.object.userData).toBe(false);
  });

  it('bevels the columns of small grids only: sharp edges above the cell limit', async () => {
    const mesh = await loadMeshModule();
    const trace = { depth: 40, bevel: { size: 2, segments: 2 } };
    // 2 × 2 cells, 10 to 40 px tall: rounded.
    const small = syncHeatmapColumns(
      undefined,
      host(trace),
      heatmapOf(grid([1, 2, 3, 4], 2, 2)),
      [],
      mesh,
    )!;
    expect(small.data.bevel).toBe(2);
    expect(small.data.segments).toBe(2);
    expect(small.mesh.layout.vertexCount).toBe(4 * rectPrismVertexCount(2));
    small.dispose();
    // Just above the limit: the same trace, every column a plain box.
    const [nx, ny] = [101, 100];
    expect(nx * ny).toBeGreaterThan(HEATMAP_BEVEL_MAX);
    const z = Array.from({ length: nx * ny }, (_, k) => 1 + (k % 4));
    const large = syncHeatmapColumns(undefined, host(trace), heatmapOf(grid(z, nx, ny)), [], mesh)!;
    expect(large.data.bevel).toBe(0);
    expect(large.mesh.layout.vertexCount).toBe(nx * ny * rectPrismVertexCount(0));
    large.dispose();
  });

  it('lifts every primitive of a label layer in front of the tallest column', async () => {
    const mesh = await loadMeshModule();
    const layer = {
      setTransform: vi.fn<(t: DataTransform) => void>(),
      primitives: [{ object: new Object3D() }, { object: new Object3D() }],
    };
    const h = host({ depth: 16 });
    const heat = heatmapOf(grid([1, 2], 2, 1));
    const p = syncHeatmapColumns(undefined, h, heat, [layer, undefined], mesh)!;
    expect(layer.setTransform).toHaveBeenLastCalledWith({ ...h.transform, offsetZ: 16.5 });
    expect(layer.primitives.map((l) => l.object.userData[UNCLIPPED])).toEqual([true, true]);
    syncHeatmapColumns(p, { ...h, trace: {} }, heat, [layer, undefined], mesh);
    expect(layer.setTransform).toHaveBeenLastCalledWith(h.transform);
    expect(layer.primitives.map((l) => UNCLIPPED in l.object.userData)).toEqual([false, false]);
  });
});

const ID: DataTransform = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

describe('slabGeometry', () => {
  it('finds the edge two triangles share when each numbers its own points', () => {
    // A unit square as two triangles with separate vertices (the diagonal twice).
    const g = slabGeometry(
      {
        positions: Float64Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0]),
        indices: Uint32Array.from([0, 1, 2, 3, 4, 5]),
        vertexStarts: Uint32Array.from([0, 6]),
      },
      ID,
    );
    expect(g.tris).toHaveLength(6);
    // Walls on the square's four sides only, none along the diagonal.
    const sides = [];
    for (let k = 0; k < g.edges.length; k += 2) {
      const [a, b] = [g.edges[k]!, g.edges[k + 1]!];
      sides.push([g.x[a], g.y[a], g.x[b], g.y[b]].join());
    }
    expect(sides.sort()).toEqual(['0,0,1,0', '0,1,0,0', '1,0,1,1', '1,1,0,1']);
  });

  it('leaves out triangles without area and turns clockwise ones around', () => {
    const g = slabGeometry(
      {
        // A clockwise triangle, and three points on a line.
        positions: Float64Array.from([0, 0, 0, 0, 2, 0, 2, 0, 0, 5, 5, 0, 6, 6, 0, 7, 7, 0]),
        indices: Uint32Array.from([0, 1, 2, 3, 4, 5]),
        vertexStarts: Uint32Array.from([0, 6]),
      },
      ID,
    );
    expect(g.tris).toEqual([0, 2, 1]);
    // Its three sides, the fill on their left: (0,0) → (2,0) → (0,2) → (0,0).
    const sides = [];
    for (let k = 0; k < g.edges.length; k += 2) sides.push(`${g.edges[k]}>${g.edges[k + 1]}`);
    expect(sides.sort()).toEqual(['0>2', '1>0', '2>1']);
  });

  it('tells the polygons of a fill apart: a ray returns the polygon it hits', () => {
    // Two squares, 100 px each, 300 px apart.
    const tri = triangulateFills({
      x: [0, 1, 1, 0, 4, 5, 5, 4],
      y: [0, 0, 1, 1, 0, 0, 1, 1],
      rings: [0, 4],
    });
    const g = slabGeometry(tri, { scaleX: 100, scaleY: 100, offsetX: 0, offsetY: 0 });
    expect([...g.item]).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    const all = [-Infinity, -Infinity, Infinity, Infinity] as const;
    const down = { x: 0, y: 0, z: -1 };
    expect(raycastSlab(g, 0, 10, { x: 50, y: 50, z: 40 }, down, all)?.index).toBe(0);
    expect(raycastSlab(g, 0, 10, { x: 450, y: 50, z: 40 }, down, all)?.index).toBe(1);
    expect(raycastSlab(g, 0, 10, { x: 250, y: 50, z: 40 }, down, all)).toBeUndefined();
    // From the right, level with the slabs: the right wall of the second square.
    const side = raycastSlab(g, 0, 10, { x: 900, y: 50, z: 5 }, { x: -1, y: 0, z: 0 }, all)!;
    expect(side.index).toBe(1);
    expect(side.t).toBe(400);
  });
});

describe('raycastSlab', () => {
  // A 400 × 200 px fill, 10 px deep.
  const g = slabGeometry(triangulateFills({ x: [0, 4, 4, 0], y: [0, 0, 2, 2] }), {
    scaleX: 100,
    scaleY: 100,
    offsetX: 0,
    offsetY: 0,
  });
  const ALL = [-Infinity, -Infinity, Infinity, Infinity] as const;
  const right = { x: 1, y: 0, z: 0 };

  it('hits a wall from the side with a ray level with the slab, a hair inside the fill', () => {
    const hit = raycastSlab(g, 0, 10, { x: -50, y: 100, z: 5 }, right, ALL)!;
    expect(hit.t).toBe(50);
    expect(hit.index).toBe(0);
    expect(hit.y).toBe(100);
    expect(hit.x).toBeGreaterThan(0);
    expect(hit.x).toBeLessThan(0.01);
  });

  it('misses with a level ray over, under or beside the wall, or from inside the fill', () => {
    // Over the front face and under the back.
    expect(raycastSlab(g, 0, 10, { x: -50, y: 100, z: 15 }, right, ALL)).toBeUndefined();
    expect(raycastSlab(g, 0, 10, { x: -50, y: 100, z: -5 }, right, ALL)).toBeUndefined();
    // Past the ends of the wall (the fill spans y 0…200).
    expect(raycastSlab(g, 0, 10, { x: -50, y: 300, z: 5 }, right, ALL)).toBeUndefined();
    expect(raycastSlab(g, 0, 10, { x: -50, y: -100, z: 5 }, right, ALL)).toBeUndefined();
    // From inside: the wall facing the ray is behind it, the one ahead faces away.
    expect(raycastSlab(g, 0, 10, { x: 200, y: 100, z: 5 }, right, ALL)).toBeUndefined();
  });

  it('ignores a wall outside the clip box', () => {
    const o = { x: -50, y: 100, z: 5 };
    expect(raycastSlab(g, 0, 10, o, right, [50, 0, 400, 200])).toBeUndefined();
    expect(raycastSlab(g, 0, 10, o, right, [0, 0, 400, 200])?.t).toBe(50);
  });

  it('keeps a ray that lands just outside the front face on its plane, not on the wall behind', () => {
    // Down and to the left at 45°: through the front plane (z = 10) 5 px right of the fill's edge,
    // then into the right wall 5 px further on.
    const hit = raycastSlab(g, 0, 10, { x: 455, y: 100, z: 60 }, { x: -1, y: 0, z: -1 }, ALL);
    expect(hit).toEqual({ t: 50, x: 405, y: 100, index: 0 });
    // Through the plane 9 px out (beyond the margin), the same direction reaches the wall, at z = 1.
    const wall = raycastSlab(g, 0, 10, { x: 459, y: 100, z: 60 }, { x: -1, y: 0, z: -1 }, ALL)!;
    expect(wall.t).toBe(59);
    expect(wall.x).toBeCloseTo(400, 2);
    expect(wall.x).toBeLessThan(400);
  });
});
