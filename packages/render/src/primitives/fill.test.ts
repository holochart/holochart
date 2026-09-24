import { describe, expect, it } from 'vitest';
import type { BufferAttribute } from 'three';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { computeOrigin, effectiveTransform } from './common.ts';
import {
  FillPrimitive,
  encodeFillPositions,
  fillProjectionAxes,
  triangulateFills,
  writeFillColors,
  writeFillGradient,
  type FillGeometryInput,
  type FillTriangulation,
} from './fill.ts';
import { triangulateArrangement } from './fill-arrangement.ts';

// ---------------------------------------------------------------------------------------------
// Helpers

/** Total triangle area in the plane of axes (a, b). */
function area(tri: FillTriangulation, a = 0, b = 1): number {
  const P = tri.positions;
  const I = tri.indices;
  let sum = 0;
  for (let t = 0; t < I.length; t += 3) {
    const i = I[t]! * 3;
    const j = I[t + 1]! * 3;
    const k = I[t + 2]! * 3;
    const cross =
      (P[j + a]! - P[i + a]!) * (P[k + b]! - P[i + b]!) -
      (P[j + b]! - P[i + b]!) * (P[k + a]! - P[i + a]!);
    sum += Math.abs(cross) / 2;
  }
  return sum;
}

/** Number of triangles covering (px, py) (strict interior). */
function coverage(tri: FillTriangulation, px: number, py: number): number {
  const P = tri.positions;
  const I = tri.indices;
  let hits = 0;
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t]!, I[t + 1]!, I[t + 2]!].map((i) => [P[i * 3]!, P[i * 3 + 1]!] as const);
    const s = [0, 1, 2].map((e) => {
      const [x0, y0] = v[e]!;
      const [x1, y1] = v[(e + 1) % 3]!;
      return Math.sign((x1 - x0) * (py - y0) - (y1 - y0) * (px - x0));
    });
    if (s.every((d) => d > 0) || s.every((d) => d < 0)) hits++;
  }
  return hits;
}

/** Build a FillGeometryInput from nested rings: polygons → rings → [x, y] points. */
function fromRings(polys: [number, number][][][], rule?: FillGeometryInput['fillRule']) {
  const x: number[] = [];
  const y: number[] = [];
  const rings: number[] = [];
  const polygons: number[] = [];
  for (const poly of polys) {
    polygons.push(rings.length);
    for (const ring of poly) {
      rings.push(x.length);
      for (const [px, py] of ring) {
        x.push(px);
        y.push(py);
      }
    }
  }
  const input: FillGeometryInput = {
    x: new Float64Array(x),
    y: new Float64Array(y),
    rings,
    polygons,
  };
  if (rule) input.fillRule = rule;
  return input;
}

const square = (x0: number, y0: number, s: number, ccw = true): [number, number][] => {
  const pts: [number, number][] = [
    [x0, y0],
    [x0 + s, y0],
    [x0 + s, y0 + s],
    [x0, y0 + s],
  ];
  return ccw ? pts : pts.reverse();
};

/** Pentagram drawn as one ring (vertex order 0, 2, 4, 1, 3 of a regular pentagon). */
function pentagram(R = 1): [number, number][] {
  const pts: [number, number][] = [];
  for (let k = 0; k < 5; k++) {
    const a = Math.PI / 2 + (k * 4 * Math.PI) / 5;
    pts.push([R * Math.cos(a), R * Math.sin(a)]);
  }
  return pts;
}

// Pentagram geometry: inner (pentagon) circumradius r, star outline area, inner pentagon area.
const R = 1;
const r = (R * Math.cos((2 * Math.PI) / 5)) / Math.cos(Math.PI / 5);
const starArea = 5 * R * r * Math.sin(Math.PI / 5);
const pentagonArea = 2.5 * r * r * Math.sin((2 * Math.PI) / 5);

// ---------------------------------------------------------------------------------------------

describe('triangulateFills — simple (earcut) path', () => {
  it('triangulates a square', () => {
    const tri = triangulateFills(fromRings([[square(0, 0, 1)]]));
    expect(tri.polygonCount).toBe(1);
    expect(tri.indices.length).toBe(6);
    expect(area(tri)).toBeCloseTo(1, 12);
  });

  it('cuts holes (first ring outer, rest holes, orientation ignored)', () => {
    const tri = triangulateFills(
      fromRings([[square(0, 0, 4), square(1, 1, 1), square(2.5, 2.5, 1, false)]]),
    );
    expect(area(tri)).toBeCloseTo(16 - 2, 12);
    expect(coverage(tri, 1.5, 1.5)).toBe(0);
    expect(coverage(tri, 3, 3)).toBe(0);
    expect(coverage(tri, 0.5, 3.5)).toBe(1);
  });

  it('batches polygons into one index list with correct per-polygon offsets', () => {
    const input = fromRings([
      [square(0, 0, 1)],
      [square(10, 0, 2), square(10.5, 0.5, 1)],
      [square(20, 0, 3)],
    ]);
    const tri = triangulateFills(input);
    expect(tri.polygonCount).toBe(3);
    expect([...tri.vertexStarts]).toEqual([0, 4, 12, 16]);
    expect(tri.indexStarts[0]).toBe(0);
    expect(tri.indexStarts[3]).toBe(tri.indices.length);
    for (let p = 0; p < 3; p++) {
      for (let i = tri.indexStarts[p]!; i < tri.indexStarts[p + 1]!; i++) {
        expect(tri.indices[i]!).toBeGreaterThanOrEqual(tri.vertexStarts[p]!);
        expect(tri.indices[i]!).toBeLessThan(tri.vertexStarts[p + 1]!);
      }
    }
    expect(area(tri)).toBeCloseTo(1 + 3 + 9, 10);
  });

  it('defaults: no rings → one ring; rings without polygons → one polygon per ring', () => {
    const one = triangulateFills({ x: [0, 1, 1, 0], y: [0, 0, 1, 1] });
    expect(one.polygonCount).toBe(1);
    expect(area(one)).toBeCloseTo(1, 12);
    const two = triangulateFills({ x: [0, 1, 0, 5, 6, 5], y: [0, 0, 1, 0, 0, 1], rings: [0, 3] });
    expect(two.polygonCount).toBe(2);
    expect(area(two)).toBeCloseTo(1, 12);
  });

  it('skips non-finite vertices and degenerate rings/polygons', () => {
    const tri = triangulateFills({
      x: [0, NaN, 1, 1, 0, 5, 6],
      y: [0, 3, 0, 1, 1, 5, 5],
      rings: [0, 5],
    });
    expect(tri.polygonCount).toBe(2);
    expect(area(tri)).toBeCloseTo(1, 12);
    // The 2-vertex second polygon produces no vertices but keeps its slot.
    expect(tri.vertexStarts[1]).toBe(tri.vertexStarts[2]);
  });

  it('keeps precision with an RTC origin for ms timestamps', () => {
    const t0 = 1_700_000_000_000;
    const x = new Float64Array([t0, t0 + 1000, t0 + 1000, t0]);
    const y = new Float64Array([0, 0, 1, 1]);
    const origin = computeOrigin(x, y);
    const tri = triangulateFills({ x, y }, origin);
    expect(tri.positions[3]).toBe(t0 + 1000);
    const local = encodeFillPositions(tri.positions, origin);
    expect(local[0]).toBe(-500);
    expect(local[3]).toBe(500);
    // Shader emulation: world = local * scale + (offset + origin * scale), float32.
    const { scale, offset } = effectiveTransform(
      { scaleX: 0.5, scaleY: 1, offsetX: -t0 * 0.5, offsetY: 0 },
      origin,
    );
    const world = Math.fround(Math.fround(local[3]! * scale[0]) + Math.fround(offset[0]));
    expect(world).toBeCloseTo(500, 3);
  });
});

describe('triangulateFills — 3D', () => {
  it('projects vertical polygons on their dominant plane and keeps world z', () => {
    // A 2×3 rectangle in the x–z plane at y = 5.
    const tri = triangulateFills({
      x: [0, 2, 2, 0],
      y: [5, 5, 5, 5],
      z: [0, 0, 3, 3],
    });
    expect(tri.indices.length).toBe(6);
    expect(area(tri, 0, 2)).toBeCloseTo(6, 12);
    for (let i = 1; i < tri.positions.length; i += 3) expect(tri.positions[i]).toBe(5);
  });

  it('picks projection axes from the Newell normal', () => {
    expect(fillProjectionAxes([0, 0, 0, 1, 0, 0, 1, 1, 0], 3)).toEqual([0, 1]);
    expect(fillProjectionAxes([0, 0, 0, 0, 1, 0, 0, 1, 1], 3)).toEqual([1, 2]);
    expect(fillProjectionAxes([0, 0, 0, 1, 0, 0, 1, 0, 1], 3)).toEqual([2, 0]);
  });
});

describe('triangulateFills — even-odd / nonzero (planar arrangement)', () => {
  it('bowtie: two triangles meeting at the crossing', () => {
    const bowtie: [number, number][] = [
      [0, 0],
      [2, 2],
      [2, 0],
      [0, 2],
    ];
    const tri = triangulateFills(fromRings([[bowtie]], 'evenodd'));
    expect(area(tri)).toBeCloseTo(2, 10);
    expect(tri.indices.length).toBe(6);
    expect(coverage(tri, 0.3, 1)).toBe(1);
    expect(coverage(tri, 1.7, 1)).toBe(1);
    expect(coverage(tri, 1, 0.3)).toBe(0);
    expect(coverage(tri, 1, 1.7)).toBe(0);
    // The crossing (1, 1) is a new vertex.
    let found = false;
    for (let i = 0; i < tri.positions.length; i += 3) {
      if (Math.abs(tri.positions[i]! - 1) < 1e-12 && Math.abs(tri.positions[i + 1]! - 1) < 1e-12) {
        found = true;
      }
    }
    expect(found).toBe(true);
    // Nonzero agrees for a bowtie (windings +1 / -1).
    expect(area(triangulateFills(fromRings([[bowtie]], 'nonzero')))).toBeCloseTo(2, 10);
  });

  it('pentagram even-odd: five points filled, center pentagon empty', () => {
    const tri = triangulateFills(fromRings([[pentagram(R)]], 'evenodd'));
    expect(area(tri)).toBeCloseTo(starArea - pentagonArea, 10);
    expect(coverage(tri, 0, 0)).toBe(0);
    expect(coverage(tri, 0, 0.9)).toBe(1); // top point
    // Each covered point is covered exactly once (no overlapping triangles).
    expect(coverage(tri, 0.8, 0.25)).toBe(1);
  });

  it('pentagram nonzero: fully filled (center winding 2)', () => {
    const tri = triangulateFills(fromRings([[pentagram(R)]], 'nonzero'));
    expect(area(tri)).toBeCloseTo(starArea, 10);
    expect(coverage(tri, 0, 0)).toBe(1);
  });

  it('reports face windings for the pentagram', () => {
    const pts = pentagram(R);
    const uv = pts.flat();
    const xyz = pts.flatMap(([x, y]) => [x, y, 0]);
    const nz = triangulateArrangement({ uv, xyz, ringStarts: [0] }, 'nonzero');
    const windings = nz.faces.map((f) => Math.abs(f.winding)).sort();
    expect(windings).toEqual([1, 1, 1, 1, 1, 2]);
    const eo = triangulateArrangement({ uv, xyz, ringStarts: [0] }, 'evenodd');
    expect(eo.faces.length).toBe(5);
  });

  it('nested rings: even-odd alternates, nonzero depends on orientation', () => {
    const same = [square(0, 0, 6), square(1, 1, 4), square(2, 2, 2)];
    expect(area(triangulateFills(fromRings([same], 'evenodd')))).toBeCloseTo(36 - 16 + 4, 10);
    expect(area(triangulateFills(fromRings([same], 'nonzero')))).toBeCloseTo(36, 10);
    const opposite = [square(0, 0, 6), square(1, 1, 4, false)];
    expect(area(triangulateFills(fromRings([opposite], 'nonzero')))).toBeCloseTo(20, 10);
    const eo = triangulateFills(fromRings([same], 'evenodd'));
    expect(coverage(eo, 0.5, 0.2)).toBe(1);
    expect(coverage(eo, 1.5, 1.3)).toBe(0);
    expect(coverage(eo, 3.1, 2.9)).toBe(1);
  });

  it('overlapping and edge-sharing rings (collinear overlaps)', () => {
    // Overlapping squares: XOR under even-odd, union under nonzero (same orientation).
    const overlap = [square(0, 0, 2), square(1, 1, 2)];
    expect(area(triangulateFills(fromRings([overlap], 'evenodd')))).toBeCloseTo(8 - 2, 10);
    expect(area(triangulateFills(fromRings([overlap], 'nonzero')))).toBeCloseTo(7, 10);
    // Squares sharing a full edge: the shared edge cancels, union area 2.
    const adjacent = [square(0, 0, 1), square(1, 0, 1)];
    const tri = triangulateFills(fromRings([adjacent], 'evenodd'));
    expect(area(tri)).toBeCloseTo(2, 10);
    // Partially shared (collinear, offset) edge: T-junctions are split.
    const offset = [square(0, 0, 2), square(2, 1, 2)];
    expect(area(triangulateFills(fromRings([offset], 'evenodd')))).toBeCloseTo(8, 10);
  });

  it('is scale-free (anisotropic ms-timestamp x axis)', () => {
    const t0 = 1_700_000_000_000;
    const pts = pentagram(R);
    const x = new Float64Array(pts.map(([px]) => t0 + px * 3_600_000));
    const y = new Float64Array(pts.map(([, py]) => py * 1e-3));
    const tri = triangulateFills({ x, y, fillRule: 'evenodd' }, computeOrigin(x, y));
    expect(area(tri) / (3_600_000 * 1e-3)).toBeCloseTo(starArea - pentagonArea, 6);
  });

  it('handles a self-intersecting polygon with a separate hole ring', () => {
    // A figure-eight-like loop around a square hole: hole lies inside one lobe.
    const lobe: [number, number][] = [
      [0, 0],
      [4, 4],
      [4, 0],
      [0, 4],
    ];
    const hole: [number, number][] = [
      [0.4, 1.8],
      [0.8, 1.8],
      [0.8, 2.2],
      [0.4, 2.2],
    ];
    const tri = triangulateFills(fromRings([[lobe, hole]], 'evenodd'));
    expect(area(tri)).toBeCloseTo(8 - 0.16, 10);
    expect(coverage(tri, 0.6, 2)).toBe(0);
  });
});

describe('writeFillColors', () => {
  it('expands per-polygon colors to per-vertex, skipping empty polygons', () => {
    const starts = new Uint32Array([0, 2, 2, 3]);
    const out = writeFillColors(new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0.5]), starts);
    expect([...out]).toEqual([1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0.5]);
    expect([...writeFillColors([0.5, 0.5, 0.5, 1], new Uint32Array([0, 1]))]).toEqual([
      0.5, 0.5, 0.5, 1,
    ]);
  });
});

describe('FillPrimitive (CPU side)', () => {
  const makeContext = (): PrimitiveContext & { invalidations: number } => {
    const ctx = {
      resources: createResourceManager(),
      invalidations: 0,
      invalidate() {
        ctx.invalidations++;
      },
    };
    return ctx;
  };

  it('batches into one mesh; color-only updates skip re-triangulation', () => {
    const ctx = makeContext();
    const prim = new FillPrimitive(ctx, {
      ...fromRings([[square(0, 0, 1)], [square(2, 0, 1)]]),
      color: new Float32Array([1, 0, 0, 1, 0, 0, 1, 1]),
    });
    const geometry = prim.object.geometry;
    expect(geometry.drawRange.count).toBe(12);
    const position = geometry.getAttribute('position') as BufferAttribute;
    const index = geometry.getIndex()!;
    const tri = prim.triangulation;
    const pv = position.version;
    const iv = index.version;

    prim.update({ color: [0, 1, 0, 1] });
    expect(prim.triangulation).toBe(tri);
    expect(position.version).toBe(pv);
    expect(index.version).toBe(iv);
    expect([...geometry.getAttribute('aColor').array.slice(0, 4)]).toEqual([0, 1, 0, 1]);

    prim.setTransform({ scaleX: 2, scaleY: 2, offsetX: 10, offsetY: 0 });
    expect(position.version).toBe(pv);
    expect(ctx.invalidations).toBeGreaterThan(0);

    prim.update({ opacity: 0.5 });
    expect(prim.object.material.uniforms.uOpacity!.value).toBe(0.5);
    expect(position.version).toBe(pv);
  });

  it('re-triangulates on geometry updates, growing buffers when needed, and disposes', () => {
    const ctx = makeContext();
    const prim = new FillPrimitive(ctx, { x: [0, 1, 1, 0], y: [0, 0, 1, 1], color: [1, 0, 0, 1] });
    const first = prim.object.geometry;
    let disposed = 0;
    first.addEventListener('dispose', () => disposed++);
    const n = 100;
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < n; i++) {
      x.push(Math.cos((2 * Math.PI * i) / n));
      y.push(Math.sin((2 * Math.PI * i) / n));
    }
    prim.update({ x, y });
    expect(prim.object.geometry).not.toBe(first);
    expect(disposed).toBe(1);
    expect(prim.object.geometry.drawRange.count).toBe((n - 2) * 3);

    // The RTC origin moves with the data; the transform uniform compensates.
    prim.setTransform({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
    prim.update({ x: x.map((v) => v + 1000) });
    expect(prim.object.material.uniforms.uOffset!.value.x).toBeCloseTo(1000, 9);

    let materialDisposed = false;
    prim.object.material.addEventListener('dispose', () => (materialDisposed = true));
    prim.dispose();
    expect(materialDisposed).toBe(true);
  });
});

describe('writeFillGradient (fillgradient)', () => {
  // A 2 × 4 box from (1, 0) to (3, 4): xyz per vertex.
  const box = Float64Array.from([1, 0, 0, 3, 0, 0, 3, 4, 0, 1, 4, 0]);
  const pairs = (a: Float32Array): number[][] =>
    Array.from({ length: a.length / 2 }, (_, i) => [a[2 * i]!, a[2 * i + 1]!]);

  it('linear gradients run from the lowest to the highest coordinate by default', () => {
    expect(pairs(writeFillGradient(box, 4, { direction: 'horizontal' }))).toEqual([
      [0, 0],
      [1, 0],
      [1, 0],
      [0, 0],
    ]);
    expect(pairs(writeFillGradient(box, 4, { direction: 'vertical' })).map(([t]) => t)).toEqual([
      0, 0, 1, 1,
    ]);
  });

  it('honors start / stop (data coordinates, extrapolated beyond)', () => {
    const t = writeFillGradient(box, 4, { direction: 'vertical', start: 2, stop: 4 });
    expect(pairs(t).map(([v]) => v)).toEqual([-1, -1, 1, 1]);
    // A zero span paints the start color.
    const flat = writeFillGradient(box, 4, { direction: 'vertical', start: 2, stop: 2 });
    expect(pairs(flat).map(([v]) => v)).toEqual([0, 0, 0, 0]);
  });

  it('radial gradients use bounding-box coordinates (the shader measures from the center)', () => {
    expect(pairs(writeFillGradient(box, 4, { direction: 'radial' }))).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
  });

  it('a gradient paint acquires a shared LUT and releases it when switched back to solid', () => {
    const resources = createResourceManager();
    const ctx: PrimitiveContext = { resources, invalidate: () => {} };
    const colorscale = [
      [0, [1, 0, 0, 1]],
      [1, [0, 0, 1, 1]],
    ] as const;
    const prim = new FillPrimitive(ctx, {
      x: [0, 1, 1, 0],
      y: [0, 0, 1, 1],
      color: [1, 0, 0, 1],
      paint: { kind: 'gradient', direction: 'radial', colorscale },
    });
    const uniforms = prim.object.material.uniforms;
    expect(uniforms['uGradient']!.value).toBe(2);
    expect(uniforms['uLut']!.value).not.toBeNull();
    const position = prim.object.geometry.getAttribute('position') as BufferAttribute;
    const pv = position.version;
    prim.update({ paint: { kind: 'gradient', direction: 'horizontal', colorscale } });
    expect(uniforms['uGradient']!.value).toBe(1);
    // Paint changes never re-triangulate.
    expect(position.version).toBe(pv);
    prim.update({ paint: { kind: 'solid' } });
    expect(uniforms['uGradient']!.value).toBe(0);
    expect(uniforms['uLut']!.value).toBeNull();
    prim.dispose();
  });
});
