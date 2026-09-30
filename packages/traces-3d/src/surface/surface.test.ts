import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry } from '@mk7s/holochart-runtime';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sceneComponent } from '../scene/component.ts';
import { calcSurface } from './calc.ts';
import { surfaceColorbar, surfaceColorMapping } from './colors.ts';
import { contourLevels, contourLines, levelValues } from './contours.ts';
import { opacityscaleStops } from './defaults.ts';
import {
  buildSurfaceGrid,
  fillGaps,
  gridShape,
  gridX,
  gridY,
  matrixValues,
  surfaceColorExtent,
  vectorValues,
  type SurfaceGrid,
} from './grid.ts';
import { surface } from './index.ts';
import { gridNormals } from './normals.ts';
import { intersectTriangle, SurfacePicker } from './pick.ts';
import { HIDDEN_VALUE, opacityscaleTable, packGrid, packRelative } from './primitive.ts';

const registry = createChartRegistry().register(surface, sceneComponent);

function full(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'surface', ...trace }], layout: { template: 'none', ...layout } },
    registry.core,
  );
  return { trace: fullData[0] as FullTrace, fullLayout };
}

/** A regular grid of `f(x, y)` on integer coordinates. */
function regular(nx: number, ny: number, f: (x: number, y: number) => number): SurfaceGrid {
  const z = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z[j * nx + i] = f(i, j);
  return {
    nx,
    ny,
    x: Float64Array.from({ length: nx }, (_, i) => i),
    xMatrix: false,
    y: Float64Array.from({ length: ny }, (_, j) => j),
    yMatrix: false,
    z,
  };
}

describe('surface grid', () => {
  it('reads the shape from the longest row, gaps elsewhere', () => {
    const z = [
      [1, 2, 3],
      [4, 5],
      ['a', null, 9],
    ];
    expect(gridShape(z)).toEqual({ nx: 3, ny: 3 });
    expect(Array.from(matrixValues(z, 3, 3))).toEqual([1, 2, 3, 4, 5, NaN, NaN, NaN, 9]);
  });

  it('places vectors, indices without them, and gaps past their end', () => {
    expect(Array.from(vectorValues(undefined, 3))).toEqual([0, 1, 2]);
    expect(Array.from(vectorValues([10, 20], 3))).toEqual([10, 20, NaN]);
    const date = createScale({ type: 'date', length: 100 });
    expect(vectorValues(['2026-01-01'], 1, date)[0]).toBe(Date.UTC(2026, 0, 1));
  });

  it('takes x / y as vectors or matrices', () => {
    const vec = buildSurfaceGrid({
      z: [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      x: [10, 20],
      y: [0, 1, 2],
    })!;
    expect(vec).toMatchObject({ nx: 2, ny: 3, xMatrix: false, yMatrix: false });
    expect([gridX(vec, 1, 2), gridY(vec, 1, 2)]).toEqual([20, 2]);
    const mat = buildSurfaceGrid({
      z: [
        [1, 2],
        [3, 4],
      ],
      x: [
        [0, 1],
        [0.5, 1.5],
      ],
      y: [
        [0, 0],
        [1, 1.2],
      ],
    })!;
    expect(mat).toMatchObject({ xMatrix: true, yMatrix: true });
    expect([gridX(mat, 1, 1), gridY(mat, 1, 1)]).toEqual([1.5, 1.2]);
    expect(buildSurfaceGrid({ z: [1, 2, 3] })).toBeNull();
  });

  it('fills gaps with connectgaps (Laplace fill)', () => {
    const g = buildSurfaceGrid({
      z: [
        [1, 2, 3],
        [4, null, 6],
        [7, 8, 9],
      ],
      connectgaps: true,
    })!;
    expect(g.z[4]).toBeCloseTo(5, 10);
    const open = buildSurfaceGrid({
      z: [
        [1, 2, 3],
        [4, null, 6],
        [7, 8, 9],
      ],
    })!;
    expect(open.z[4]).toBeNaN();
    // Filled values stay within the data's range.
    fc.assert(
      fc.property(
        fc.array(fc.option(fc.double({ min: -100, max: 100, noNaN: true }), { nil: null }), {
          minLength: 16,
          maxLength: 16,
        }),
        (values) => {
          const z = values.map((v) => v ?? NaN);
          const finite = z.filter(Number.isFinite);
          const out = fillGaps(z, 4, 4);
          if (finite.length === 0) return out.every(Number.isNaN);
          const lo = Math.min(...finite);
          const hi = Math.max(...finite);
          return out.every((v) => v >= lo - 1e-9 && v <= hi + 1e-9);
        },
      ),
    );
  });

  it('caches the color extent per array (surfacecolor, else z)', () => {
    const z = [
      [1, 5],
      [3, -2],
    ];
    expect(surfaceColorExtent({ z })).toEqual([-2, 5]);
    expect(
      surfaceColorExtent({
        z,
        surfacecolor: [
          [10, 20],
          [30, 40],
        ],
      }),
    ).toEqual([10, 40]);
    expect(surfaceColorExtent({ z: [[null]] })).toBeUndefined();
  });
});

describe('surface defaults', () => {
  it('matches Plotly: lighting, light position, colorscale, legend, highlights', () => {
    const { trace } = full({
      z: [
        [1, 2],
        [3, 4],
      ],
    });
    expect(trace['lighting']).toMatchObject({
      ambient: 0.8,
      diffuse: 0.8,
      specular: 0.05,
      roughness: 0.5,
      fresnel: 0.2,
    });
    expect(trace['lightposition']).toEqual({ x: 10, y: 1e4, z: 0 });
    expect(trace['colorscale']).toBe('RdBu');
    expect(trace['autocolorscale']).toBe(false);
    expect(trace['showscale']).toBe(true);
    expect(trace['showlegend']).toBe(false);
    const c = trace['contours'] as Record<string, Record<string, unknown>>;
    // `highlight` is on by default, so `project` and the highlight style are coerced.
    expect(c['z']).toMatchObject({ show: false, highlight: true, highlightwidth: 2 });
    expect(c['z']!['project']).toEqual({ x: false, y: false, z: false });
    expect(c['z']!['color']).toBeUndefined();
  });

  it('coerces the contour style only when shown, and the wireframe only when on', () => {
    const { trace } = full({
      z: [
        [1, 2],
        [3, 4],
      ],
      contours: { x: { show: true, highlight: false, width: 4 } },
      wireframe: { show: true, step: 3 },
    });
    const x = (trace['contours'] as Record<string, Record<string, unknown>>)['x']!;
    expect(x).toMatchObject({ show: true, width: 4, color: 'rgb(68, 68, 68)', usecolormap: false });
    expect(x['highlightcolor']).toBeUndefined();
    expect(trace['wireframe']).toEqual({ show: true, color: 'rgb(68, 68, 68)', width: 1, step: 3 });
  });

  it('hides traces without a usable z', () => {
    expect(full({ z: [1, 2] }).trace.visible).toBe(false);
    expect(full({ z: [[1]], x: [] }).trace.visible).toBe(false);
  });

  it('expands named opacity scales and drops invalid ones', () => {
    expect(opacityscaleStops('max')).toEqual([
      [0, 0.1],
      [1, 1],
    ]);
    expect(opacityscaleStops('min')).toEqual([
      [0, 1],
      [1, 0.1],
    ]);
    const ext = opacityscaleStops('extremes')!;
    expect(ext).toHaveLength(32);
    expect(ext[0]![1]).toBeCloseTo(1);
    expect(ext[31]![1]).toBeCloseTo(1);
    expect(Math.min(...ext.map((s) => s[1]))).toBeLessThan(0.15);
    expect(
      opacityscaleStops([
        [0, 0.2],
        [1, 2],
      ]),
    ).toEqual([
      [0, 0.2],
      [1, 1],
    ]);
    expect(
      opacityscaleStops([
        [0.1, 1],
        [1, 1],
      ]),
    ).toBeUndefined();
    expect(
      opacityscaleStops([
        [0, 1],
        [0.8, 1],
        [0.5, 1],
        [1, 1],
      ]),
    ).toBeUndefined();
    expect(
      full({
        z: [
          [1, 2],
          [3, 4],
        ],
        opacityscale: 'max',
      }).trace['opacityscale'],
    ).toEqual([
      [0, 0.1],
      [1, 1],
    ]);
  });

  it('maps z, or surfacecolor, through the c colorscale and draws a colorbar', () => {
    const { trace, fullLayout } = full({
      z: [
        [1, 2],
        [3, 4],
      ],
      cmid: 0,
    });
    expect(surfaceColorMapping(trace, fullLayout)).toMatchObject({ cmin: -4, cmax: 4 });
    const withColor = full({
      z: [
        [1, 2],
        [3, 4],
      ],
      surfacecolor: [
        [0, 10],
        [20, 30],
      ],
    });
    const bar = surfaceColorbar(withColor.trace, withColor.fullLayout)!;
    expect([bar.cmin, bar.cmax]).toEqual([0, 30]);
    expect(surfaceColorbar(full({ z: [[1]], showscale: false }).trace, fullLayout)).toBeNull();
  });

  it('takes the legacy zmin / zmax without surfacecolor', () => {
    const { trace } = full({
      z: [
        [1, 2],
        [3, 4],
      ],
      zmin: 0,
      zmax: 10,
    });
    expect([trace['cauto'], trace['cmin'], trace['cmax']]).toEqual([false, 0, 10]);
    const colored = full({
      z: [
        [1, 2],
        [3, 4],
      ],
      zmin: 0,
      zmax: 10,
      surfacecolor: [
        [1, 2],
        [3, 4],
      ],
    });
    expect(colored.trace['cauto']).toBe(true);
  });

  it('shares a color axis', () => {
    const { fullData, fullLayout } = supplyDefaults(
      {
        data: [
          { type: 'surface', z: [[1, 2]], coloraxis: 'coloraxis' },
          { type: 'surface', z: [[5, 9]], coloraxis: 'coloraxis' },
        ],
        layout: { template: 'none' },
      },
      registry.core,
    );
    expect(surfaceColorMapping(fullData[0]!, fullLayout)).toMatchObject({ cmin: 1, cmax: 9 });
  });
});

describe('surface calc', () => {
  it('computes the grid, surfacecolor and the scene extremes', () => {
    const { trace, fullLayout } = full({
      z: [
        [1, 2],
        [3, 4],
      ],
      x: [10, 20],
      y: [5, 6],
      surfacecolor: [
        [0, 1],
        [2, 3],
      ],
    });
    const calc = calcSurface(trace, { fullLayout });
    expect(calc.sceneExtremes).toEqual({ x: [10, 20], y: [5, 6], z: [1, 4] });
    expect(calc.surfacecolor).toBe(true);
    expect(Array.from(calc.color!)).toEqual([0, 1, 2, 3]);
  });
});

describe('surface contour levels', () => {
  it('uses start / end / size (end excluded, as Plotly), else the axis ticks', () => {
    expect(contourLevels({ start: 0, end: 1, size: 0.25 }, [])).toEqual({
      start: 0,
      size: 0.25,
      count: 4,
    });
    expect(levelValues(contourLevels({ start: 0, end: 1, size: 0.3 }, [])!)).toEqual([
      0, 0.3, 0.6, 0.8999999999999999,
    ]);
    // Incomplete: the ticks.
    expect(contourLevels({ size: 0.5 }, [0, 2, 4, 6])).toEqual({ start: 0, size: 2, count: 4 });
    expect(contourLevels({ start: 1, end: 0, size: 1 }, [3])).toEqual({
      start: 3,
      size: 1,
      count: 1,
    });
    expect(contourLevels({}, [])).toBeNull();
  });
});

describe('surface contour lines', () => {
  it('traces straight lines on a plane', () => {
    const g = regular(5, 4, (x) => x);
    const x = Float64Array.from({ length: 20 }, (_, k) => k % 5);
    const y = Float64Array.from({ length: 20 }, (_, k) => Math.floor(k / 5));
    const lines = contourLines({ nx: 5, ny: 4, x, y, z: g.z, field: g.z }, [1.5]);
    expect(lines.x.length).toBeGreaterThan(1);
    // One polyline from y = 0 to y = 3 at x = 1.5.
    expect(lines.x.every((v) => v === 1.5)).toBe(true);
    expect(Math.min(...lines.y)).toBe(0);
    expect(Math.max(...lines.y)).toBe(3);
    expect(lines.x.some(Number.isNaN)).toBe(false);
  });

  it('keeps lines through grid points joined (levels exactly on a row)', () => {
    const x = Float64Array.from({ length: 20 }, (_, k) => k % 5);
    const y = Float64Array.from({ length: 20 }, (_, k) => Math.floor(k / 5));
    const lines = contourLines({ nx: 5, ny: 4, x, y, z: y, field: y }, [2]);
    expect(lines.x.some(Number.isNaN)).toBe(false);
    expect([...lines.x].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(lines.y.every((v) => v === 2)).toBe(true);
  });

  it('closes loops and puts every point on its level', () => {
    const f = (x: number, y: number) => Math.hypot(x - 5, y - 5);
    const g = regular(11, 11, f);
    const x = Float64Array.from({ length: 121 }, (_, k) => k % 11);
    const y = Float64Array.from({ length: 121 }, (_, k) => Math.floor(k / 11));
    const lines = contourLines({ nx: 11, ny: 11, x, y, z: g.z, field: g.z, value: g.z }, [3]);
    expect(lines.x[0]).toBeCloseTo(lines.x[lines.x.length - 1]!, 12);
    expect(lines.y[0]).toBeCloseTo(lines.y[lines.y.length - 1]!, 12);
    for (const v of lines.v!) expect(v).toBeCloseTo(3, 12);
  });

  it('skips triangles with gaps, and puts every point between its edge ends (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1, max: 1, noNaN: true }), { minLength: 20, maxLength: 20 }),
        fc.double({ min: -0.9, max: 0.9, noNaN: true }),
        (values, level) => {
          const z = Float64Array.from(values);
          z[7] = NaN;
          const x = Float64Array.from({ length: 20 }, (_, k) => k % 5);
          const y = Float64Array.from({ length: 20 }, (_, k) => Math.floor(k / 5));
          const lines = contourLines({ nx: 5, ny: 4, x, y, z, field: z, value: z }, [level]);
          return lines.v!.every((v, k) =>
            Number.isNaN(lines.x[k]!) ? Number.isNaN(v) : Math.abs(v - level) < 1e-9,
          );
        },
      ),
    );
  });
});

describe('surface packing', () => {
  it('stores values relative to their center, gaps hidden', () => {
    expect(Array.from(packRelative([1, NaN, 3], 2))).toEqual([-1, Math.fround(HIDDEN_VALUE), 1]);
    const g = buildSurfaceGrid({
      z: [
        [1, 2, 3],
        [4, 5, 6],
      ],
      x: [1e12, 1e12 + 1000, 1e12 + 2000],
    })!;
    const p = packGrid(g, null);
    expect(p.origin).toEqual([1e12 + 1000, 0.5, 3.5]);
    expect(Array.from(p.x.data)).toEqual([-1000, 0, 1000]);
    expect([p.x.width, p.x.height, p.y.width, p.y.height]).toEqual([3, 1, 2, 1]);
    expect([p.height.width, p.height.height]).toEqual([3, 2]);
    expect(p.value.data).toHaveLength(1);
    const m = packGrid(
      buildSurfaceGrid({
        z: [
          [1, 2],
          [3, 4],
        ],
        y: [
          [0, 0],
          [1, 1],
        ],
      })!,
      new Float64Array([10, 20, 30, 40]),
    );
    expect([m.y.width, m.y.height]).toEqual([2, 2]);
    expect(m.colorOrigin).toBe(25);
    expect(Array.from(m.value.data)).toEqual([-15, -5, 5, 15]);
  });

  it('samples opacity scales linearly', () => {
    const t = opacityscaleTable([
      [0, 0],
      [0.5, 1],
      [1, 0.5],
    ]);
    expect(t[0]).toBe(0);
    expect(t[255]).toBeCloseTo(0.5);
    expect(t[64]).toBeCloseTo(64 / 255 / 0.5, 5);
  });
});

describe('surface normals', () => {
  it('points along (-a, -b, 1) on a plane z = a x + b y, at edges too', () => {
    const g = regular(4, 3, (x, y) => 2 * x - y);
    const n = gridNormals(g);
    const l = Math.hypot(2, 1, 1);
    for (let k = 0; k < 12; k++) {
      expect(n[k * 3]).toBeCloseTo(-2 / l, 6);
      expect(n[k * 3 + 1]).toBeCloseTo(1 / l, 6);
      expect(n[k * 3 + 2]).toBeCloseTo(1 / l, 6);
    }
  });

  it('follows the world scale, and is zero at gaps', () => {
    const g = regular(3, 3, (x) => x);
    // x drawn 10 × longer: the slope is 10 × flatter.
    const n = gridNormals(g, [10, 1, 1]);
    expect(n[2]! / -n[0]!).toBeCloseTo(10, 6);
    const back = gridNormals(g, [10, 1, 1], true);
    expect(back[2]! / -back[0]!).toBeCloseTo(1, 6);
    const gap = { ...g, z: Float64Array.from(g.z, (v, k) => (k === 4 ? NaN : v)) };
    expect(Array.from(gridNormals(gap).subarray(12, 15))).toEqual([0, 0, 0]);
  });
});

describe('surface picking', () => {
  it('intersects triangles from both sides', () => {
    const tri = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ] as const;
    const down = { origin: [0.25, 0.25, 1] as const, dir: [0, 0, -1] as const };
    const up = { origin: [0.25, 0.25, -1] as const, dir: [0, 0, 1] as const };
    expect(intersectTriangle(down, ...tri)![0]).toBeCloseTo(1);
    expect(intersectTriangle(up, ...tri)![0]).toBeCloseTo(1);
    expect(intersectTriangle({ origin: [2, 2, 1], dir: [0, 0, -1] }, ...tri)).toBeNull();
  });

  it('hits the drawn surface and snaps to the nearest grid point (property)', () => {
    const g = regular(40, 30, (x, y) => Math.sin(x / 4) * Math.cos(y / 5));
    const picker = new SurfacePicker(g);
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 38.99, noNaN: true }),
        fc.double({ min: 0.01, max: 28.99, noNaN: true }),
        (x, y) => {
          const hit = picker.intersect({ origin: [x, y, 10], dir: [0, 0, -1] });
          if (!hit) return false;
          // The height of the drawn triangle at (x, y), split like the shader.
          const i = Math.floor(x);
          const j = Math.floor(y);
          const u = x - i;
          const v = y - j;
          const z = (a: number, b: number) => g.z[b * 40 + a]!;
          const h =
            u >= v
              ? z(i, j) + u * (z(i + 1, j) - z(i, j)) + v * (z(i + 1, j + 1) - z(i + 1, j))
              : z(i, j) + v * (z(i, j + 1) - z(i, j)) + u * (z(i + 1, j + 1) - z(i, j + 1));
          return (
            Math.abs(hit.point[2] - h) < 1e-9 &&
            hit.i === Math.round(x) &&
            hit.j === Math.round(y) &&
            Math.abs(hit.fi - x) < 1e-9 &&
            Math.abs(hit.fj - y) < 1e-9
          );
        },
      ),
    );
  });

  it('takes the nearest hit, skips gaps and hits outside the clip box', () => {
    const g = regular(20, 20, (x) => x / 2);
    const picker = new SurfacePicker(g);
    // A grazing ray along x crosses the slope once.
    const ray = { origin: [-5, 3.2, 2] as const, dir: [1, 0, 0] as const };
    expect(picker.intersect(ray)!.i).toBe(4);
    const clip = { min: [5, 0, 0] as const, max: [19, 19, 10] as const };
    expect(picker.intersect({ origin: [2, 2, 5], dir: [0, 0, -1] }, clip)).toBeNull();
    const holed = new SurfacePicker({
      ...g,
      z: Float64Array.from(g.z, (v, k) => (k === 5 * 20 + 5 ? NaN : v)),
    });
    expect(holed.intersect({ origin: [5.1, 5.1, 9], dir: [0, 0, -1] })).toBeNull();
  });
});
