import { createScale, supplyDefaults, type FullAxis, type FullLayout } from '@mk7s/holochart-core';
import { triangulateFills, type FillTriangulation } from '@mk7s/holochart-render';
import { createChartRegistry, type AxisInfo, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { histogram2dcontour } from '../histogram2dcontour/index.ts';
import { presenceField, regionArea } from '../shared/contour.ts';
import { contourField, type ContourField } from './field.ts';
import { constraintFillData, fillData, showsLines, type ContourCalc } from './plot.ts';
import { contourColorbar, contourLegendIcon, contourMapping } from './style.ts';

const registry = createChartRegistry().register(histogram2dcontour);

function axis(fullLayout: FullLayout, id: 'x' | 'y'): AxisInfo {
  const scale = createScale({ type: 'linear', range: [-5, 5], length: 400 });
  const full = { ...(fullLayout[`${id}axis`] as FullAxis), type: 'linear' } as FullAxis;
  return { id, name: `${id}axis`, letter: id, type: 'linear', scale, full } as unknown as AxisInfo;
}

function area(tri: FillTriangulation): number {
  const P = tri.positions;
  const I = tri.indices;
  let sum = 0;
  for (let t = 0; t < I.length; t += 3) {
    const i = I[t]! * 3;
    const j = I[t + 1]! * 3;
    const k = I[t + 2]! * 3;
    sum +=
      Math.abs(
        (P[j]! - P[i]!) * (P[k + 1]! - P[i + 1]!) - (P[j + 1]! - P[i + 1]!) * (P[k]! - P[i]!),
      ) / 2;
  }
  return sum;
}

/** A contour calc over z = x on columns 0…4, 3 rows (row spacing 1). */
function rampCalc(trace: Record<string, unknown>, gap?: [number, number]): ContourCalc {
  const nx = 5;
  const ny = 3;
  const z = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z[j * nx + i] = i;
  const presence = gap ? presenceField(z) : undefined;
  if (gap && presence) presence[gap[1] * nx + gap[0]] = 0;
  const xc = Float64Array.of(0, 1, 2, 3, 4);
  const yc = Float64Array.of(0, 1, 2);
  const field: ContourField = contourField({ z, nx, ny, xc, yc, zExtent: [0, 4], presence }, {
    type: 'contour',
    visible: true,
    _index: 0,
    ...trace,
  } as never);
  const edges = (c: Float64Array) => Float64Array.from({ length: c.length + 1 }, (_, k) => k - 0.5);
  return {
    ...field,
    nx,
    ny,
    x: { centers: xc, edges: edges(xc) },
    y: { centers: yc, edges: edges(yc) },
    z,
    zExtent: [0, 4],
  };
}

describe('contour fills', () => {
  it('fills a constraint region in fillcolor with the nonzero rule', () => {
    const trace = {
      contours: { type: 'constraint', operation: '[]', value: [1.5, 3] },
      fillcolor: 'rgba(0, 128, 255, 0.5)',
      opacity: 0.8,
    };
    const calc = rampCalc(trace);
    const data = constraintFillData(calc, trace as never)!;
    expect(data.fillRule).toBe('nonzero');
    expect(data.opacity).toBe(0.8);
    expect(Array.from(data.color as ArrayLike<number>)).toEqual([0, 128 / 255, 1, 0.5]);
    expect(area(triangulateFills(data))).toBeCloseTo((3 - 1.5) * 2, 9);
    expect(
      constraintFillData(rampCalc({ ...trace, fillcolor: 'rgba(0,0,0,0)' }), {
        ...trace,
        fillcolor: 'rgba(0,0,0,0)',
      } as never),
    ).toBeUndefined();
  });

  it('clips fills to the data mask with the intersect rule', () => {
    const trace = {
      contours: { type: 'constraint', operation: '>', value: 1.5 },
      fillcolor: '#f00',
    };
    // Without a gap: x ≥ 1.5 over height 2.
    expect(
      area(triangulateFills(constraintFillData(rampCalc(trace), trace as never)!)),
    ).toBeCloseTo(5, 9);
    // A gap at (3, 1) cuts a diamond of half-diagonal 0.9 out of the region.
    const masked = rampCalc(trace, [3, 1]);
    expect(masked.mask).toBeDefined();
    expect(regionArea(masked.mask!)).toBeCloseTo(8 - 2 * 0.81, 9);
    const data = constraintFillData(masked, trace as never)!;
    expect(data.fillRule).toBe('intersect');
    expect(area(triangulateFills(data))).toBeCloseTo(5 - 2 * 0.81, 9);
  });

  it('adds the mask to every band of a filled contour', () => {
    const trace = {
      contours: { start: 0.5, end: 3.5, size: 1, coloring: 'fill' },
      autocontour: false,
    };
    const plain = rampCalc(trace);
    const mapping = {
      colorscale: [
        [0, [0, 0, 0, 1]],
        [1, [1, 1, 1, 1]],
      ] as never,
      zmin: 0,
      zmax: 4,
      reversescale: false,
    };
    const full = fillData(plain, mapping, 1);
    expect(full.polygons).toHaveLength(5);
    const masked = fillData(rampCalc(trace, [0, 0]), mapping, 1);
    expect(masked.fillRule).toBe('intersect');
    expect(masked.polygons).toHaveLength(5);
    // The background loses the gap's corner triangle (legs 0.9).
    const r1 = masked.polygons![1]!;
    const v1 = masked.rings![r1]!;
    const tri = triangulateFills({
      ...masked,
      x: Array.from(masked.x).slice(0, v1),
      y: Array.from(masked.y).slice(0, v1),
      rings: Array.from(masked.rings!).slice(0, r1),
      polygons: [0],
    });
    expect(area(tri)).toBeCloseTo(8 - 0.81 / 2, 9);
  });
});

describe('histogram2dcontour constraint contours (beyond Plotly)', () => {
  function setup(trace: Record<string, unknown>) {
    const { fullData, fullLayout } = supplyDefaults(
      { data: [{ type: 'histogram2dcontour', ...trace }] },
      registry.core,
    );
    const ctx: CalcContext = {
      fullLayout,
      index: 0,
      xaxis: axis(fullLayout, 'x'),
      yaxis: axis(fullLayout, 'y'),
    };
    const t = fullData[0]!;
    return { trace: t, fullLayout, calc: histogram2dcontour.calc!(t, ctx) };
  }

  const x = [0, 0, 1, 1, 1, 1, 2, 2, 2, 3];
  const y = [0, 1, 0, 1, 1, 2, 1, 2, 2, 3];

  it('shades bins satisfying the constraint, without colorscale or colorbar', () => {
    const { trace, calc, fullLayout } = setup({
      x,
      y,
      contours: { type: 'constraint', operation: '>=', value: 1.5 },
    });
    expect(trace['fillcolor']).toMatch(/^rgba\(.*, 0\.5\)$/);
    expect((trace['line'] as Record<string, unknown>)['width']).toBe(2);
    expect(calc.constraint).toEqual({ operation: '>=', value: 1.5 });
    expect(calc.regions).toHaveLength(1);
    expect(regionArea(calc.regions![0]!)).toBeGreaterThan(0);
    expect(contourMapping(trace, fullLayout)).toBeUndefined();
    expect(contourColorbar(trace, fullLayout)).toBeNull();
    expect(showsLines(trace)).toBe(true);
    expect(contourLegendIcon(trace)).toMatchObject({ kind: 'fill' });
  });

  it('draws an = constraint as its line only', () => {
    const { trace, calc } = setup({ x, y, contours: { type: 'constraint', value: 1 } });
    expect(trace['fillcolor']).toBeUndefined();
    expect(calc.regions).toBeUndefined();
    expect(calc.paths[0]!.length).toBeGreaterThan(0);
    expect(contourLegendIcon(trace)).toMatchObject({ kind: 'line' });
  });
});
