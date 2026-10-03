import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  computeFaceNormals,
  computeVertexNormals,
  defaultNormalScale,
  gatherVertices,
  HIDDEN_INTENSITY,
  intensityOrigin,
  meshColorSource,
  needsColorAttribute,
  srgbToLinear,
  writeColors,
  writeIntensity,
  type MeshLayout,
} from './mesh-geometry.ts';
import { buildColorscaleLUT } from '../colorscale/lut.ts';

/** A unit square in the z = 0 plane: two CCW triangles (normals +z). */
const SQUARE = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
const SQUARE_INDEX = new Uint16Array([0, 1, 2, 0, 2, 3]);

function layout(expanded: boolean, vertexCount: number, indices: ArrayLike<number> | null) {
  const triangleCount = Math.floor((indices ? indices.length : vertexCount) / 3);
  return {
    expanded,
    vertexCount,
    triangleCount,
    itemCount: expanded ? triangleCount * 3 : vertexCount,
    indices,
  } satisfies MeshLayout;
}

describe('computeFaceNormals (Plotly `faceNormals`)', () => {
  it('gives unit right-hand normals', () => {
    const n = computeFaceNormals(SQUARE, SQUARE_INDEX);
    expect([...n]).toEqual([0, 0, 1, 0, 0, 1]);
    // Reversed winding flips the normal.
    const flipped = computeFaceNormals(SQUARE, new Uint16Array([0, 2, 1]));
    expect([...flipped]).toEqual([0, 0, -1]);
  });

  it('zeroes faces at or below facenormalsepsilon (squared cross length)', () => {
    // Legs 1e-3: |cross|² = 1e-12.
    const tiny = new Float32Array([0, 0, 0, 1e-3, 0, 0, 0, 1e-3, 0]);
    expect([...computeFaceNormals(tiny, null, 1e-6)]).toEqual([0, 0, 0]);
    const n = computeFaceNormals(tiny, null, 1e-13);
    expect(n[2]).toBeCloseTo(1, 6);
  });

  it('applies the normal scale and maps normals back to data space', () => {
    // A slanted triangle: z rises 1 over x 1000. In data space the normal is almost +z; the
    // normals are the same whatever scale is used, only the epsilons see the scale.
    const p = new Float32Array([0, 0, 0, 1000, 0, 1, 0, 1, 0]);
    const plain = computeFaceNormals(p, null, 0);
    const scaled = computeFaceNormals(p, null, 0, [0.002, 2, 2]);
    for (let i = 0; i < 3; i++) expect(scaled[i]).toBeCloseTo(plain[i]!, 5);
    // …but a face that is tiny in data units passes the epsilon once scaled up.
    const small = new Float32Array([0, 0, 0, 1e-3, 0, 0, 0, 1e-3, 0]);
    expect(computeFaceNormals(small, null, 1e-6, [2000, 2000, 1])[2]).toBeCloseTo(1, 6);
  });

  it('skips triangles with hidden or non-finite vertices', () => {
    const p = new Float32Array([0, 0, 0, 1, 0, 0, NaN, 1, 0]);
    expect([...computeFaceNormals(p, null)]).toEqual([0, 0, 0]);
    const hidden = new Float32Array([0, 0, 0, 1, 0, 0, 3e38, 3e38, 3e38]);
    expect([...computeFaceNormals(hidden, null)]).toEqual([0, 0, 0]);
  });
});

describe('computeVertexNormals (Plotly `vertexNormals`)', () => {
  it('averages angle-weighted face normals', () => {
    const n = computeVertexNormals(SQUARE, SQUARE_INDEX);
    for (let v = 0; v < 4; v++) expect([n[v * 3], n[v * 3 + 1], n[v * 3 + 2]]).toEqual([0, 0, 1]);
  });

  it('weights a corner by the sine of its angle', () => {
    // A "roof": two faces meeting at the x axis, tilted ±45° about it, sharing vertices 0 and 1.
    const p = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 1, 0, -1, 1]);
    const idx = new Uint16Array([0, 1, 2, 1, 0, 3]);
    const n = computeVertexNormals(p, idx);
    // The shared edge's vertices point straight between the two faces.
    expect(n[0]).toBeCloseTo(0, 6);
    expect(n[1]).toBeCloseTo(0, 6);
    expect(Math.abs(n[2]!)).toBeCloseTo(1, 6);
    // A vertex used by one face gets that face's normal.
    const face = computeFaceNormals(p, idx);
    for (let c = 0; c < 3; c++) expect(n[6 + c]).toBeCloseTo(face[c]!, 6);
  });

  it('drops contributions and sums at or below vertexnormalsepsilon', () => {
    const tiny = new Float32Array([0, 0, 0, 1e-4, 0, 0, 0, 1e-4, 0]);
    // m01 · m21 = 1e-16 for the right-angle corner.
    expect([...computeVertexNormals(tiny, null, 1e-12)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(computeVertexNormals(tiny, null, 1e-20)[2]).toBeCloseTo(1, 6);
  });

  it('property: normals are unit or zero, and agree with face normals on planar meshes', () => {
    // Coordinates on a grid and slopes in eighths, so every float32 position is exact and lies
    // exactly on the plane: a fan triangle is then either degenerate (it contributes nothing) or
    // well conditioned. Arbitrary floats produce slivers thinner than float32's rounding of
    // `slope · x`, whose normals are noise (a commit-seeded run found one and shrank for 15 min).
    const coordinate = fc.integer({ min: -40, max: 40 }).map((n) => n / 4);
    fc.assert(
      fc.property(
        fc.array(fc.tuple(coordinate, coordinate), { minLength: 3, maxLength: 12 }),
        fc.integer({ min: -8, max: 8 }).map((n) => n / 8),
        (points, slope) => {
          // Planar: z = slope · x; a fan from vertex 0.
          const p = new Float32Array(points.length * 3);
          points.forEach(([x, y], i) => p.set([x, y, slope * x], i * 3));
          const idx: number[] = [];
          for (let i = 1; i + 1 < points.length; i++) idx.push(0, i, i + 1);
          const n = computeVertexNormals(p, new Uint32Array(idx), 1e-9);
          const plane = [-slope, 0, 1].map((c) => c / Math.hypot(slope, 1));
          for (let v = 0; v < points.length; v++) {
            const x = n[v * 3]!;
            const y = n[v * 3 + 1]!;
            const z = n[v * 3 + 2]!;
            const len = Math.hypot(x, y, z);
            if (len === 0) continue;
            expect(len).toBeCloseTo(1, 4);
            // Parallel to the plane normal (either side: fan triangles may flip).
            expect(Math.abs(x * plane[0]! + y * plane[1]! + z * plane[2]!)).toBeCloseTo(1, 3);
          }
        },
      ),
    );
  });
});

describe('layout helpers', () => {
  it('defaultNormalScale maps each extent to 2', () => {
    const p = new Float32Array([0, 0, 5, 10, 4, 5, NaN, 0, 0]);
    expect(defaultNormalScale(p)).toEqual([0.2, 0.5, 1]);
  });

  it('gathers vertex values per drawn corner when expanded', () => {
    const l = layout(true, 4, SQUARE_INDEX);
    const pos = gatherVertices(SQUARE, 3, l);
    expect(pos.length).toBe(18);
    expect([...pos.subarray(9, 12)]).toEqual([0, 0, 0]); // corner 3 = vertex 0
    expect([...gatherVertices(SQUARE, 3, layout(false, 4, SQUARE_INDEX))]).toEqual([...SQUARE]);
  });

  it('meshColorSource follows Plotly precedence', () => {
    const colors = new Float32Array(16);
    expect(meshColorSource({ intensity: [1], color: colors })).toBe('intensity-vertex');
    expect(meshColorSource({ intensity: [1], intensityMode: 'cell' })).toBe('intensity-cell');
    expect(meshColorSource({ color: colors, faceColor: colors })).toBe('vertex');
    expect(meshColorSource({ color: [1, 0, 0, 1], faceColor: colors })).toBe('face');
    expect(meshColorSource({ color: [1, 0, 0, 1] })).toBe('uniform');
  });
});

describe('intensity', () => {
  it('stores values relative to the center of their range, per vertex or per cell', () => {
    const values = [1e12, 1e12 + 2, NaN, 1e12 + 1];
    const o = intensityOrigin(values);
    expect(o).toBe(1e12 + 1);
    const perVertex = writeIntensity(values, false, o, layout(false, 4, SQUARE_INDEX));
    expect([...perVertex]).toEqual([-1, 1, Math.fround(HIDDEN_INTENSITY), 0]);
    // Cell mode on the expanded square: triangle 0 gets value 0, triangle 1 value 1.
    const cells = writeIntensity([5, 7], true, 6, layout(true, 4, SQUARE_INDEX));
    expect([...cells]).toEqual([-1, -1, -1, 1, 1, 1]);
  });

  it('maps intensity through the LUT on the CPU for three.js materials (vertex vs cell)', () => {
    const lut = buildColorscaleLUT([
      [0, [0, 0, 1, 1]],
      [1, [1, 0, 0, 1]],
    ]);
    const common = {
      color: [1, 1, 1, 1] as const,
      faceColor: null,
      alpha: null,
      lut,
      domain: [0, 10] as const,
      linear: true,
    };
    const v = writeColors(
      { ...common, source: 'intensity-vertex', intensity: [0, 10, 5, 0] },
      layout(false, 4, SQUARE_INDEX),
    );
    expect([...v.subarray(0, 4)]).toEqual([0, 0, 1, 1]);
    expect([...v.subarray(4, 8)]).toEqual([1, 0, 0, 1]);
    // Middle: halfway between texels 127 and 128 (0.5 in sRGB), linearized.
    expect(v[8]).toBeCloseTo(srgbToLinear(0.5), 4);
    const c = writeColors(
      { ...common, source: 'intensity-cell', intensity: [10, 0], reverse: true },
      layout(true, 4, SQUARE_INDEX),
    );
    // reversescale: 10 → blue, 0 → red; the three corners of a cell agree.
    expect([...c.subarray(0, 4)]).toEqual([0, 0, 1, 1]);
    expect([...c.subarray(8, 12)]).toEqual([0, 0, 1, 1]);
    expect([...c.subarray(12, 16)]).toEqual([1, 0, 0, 1]);
  });
});

describe('writeColors', () => {
  it('writes per-vertex, per-face and uniform colors with per-vertex alpha', () => {
    const faces = new Float32Array([1, 0, 0, 1, 0, 1, 0, 1]);
    const out = writeColors(
      {
        source: 'face',
        color: [0, 0, 0, 1],
        faceColor: faces,
        alpha: [1, 0.5, 1, 1],
        intensity: null,
      },
      layout(true, 4, SQUARE_INDEX),
    );
    expect([...out.subarray(0, 8)]).toEqual([1, 0, 0, 1, 1, 0, 0, 0.5]);
    expect([...out.subarray(12, 16)]).toEqual([0, 1, 0, 1]);
    expect(needsColorAttribute({ source: 'uniform', alpha: null, linear: false })).toBe(false);
    expect(needsColorAttribute({ source: 'uniform', alpha: [1], linear: false })).toBe(true);
    expect(needsColorAttribute({ source: 'intensity-vertex', alpha: null, linear: true })).toBe(
      true,
    );
    expect(needsColorAttribute({ source: 'intensity-vertex', alpha: null, linear: false })).toBe(
      false,
    );
  });

  it('linearizes for three.js materials', () => {
    const out = writeColors(
      {
        source: 'uniform',
        color: [0.5, 1, 0, 0.25],
        faceColor: null,
        alpha: null,
        intensity: null,
        linear: true,
      },
      layout(false, 1, null),
    );
    expect(out[0]).toBeCloseTo(0.214, 3);
    expect([out[1], out[2], out[3]]).toEqual([1, 0, 0.25]);
  });
});
