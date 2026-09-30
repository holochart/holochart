import { supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { sceneComponent } from '../scene/component.ts';
import { calcMesh3d, derivedTriangles, explicitTriangles, roundIndices } from './calc.ts';
import { traceColorbar } from './colors.ts';
import { cellColored, contourLevel, isoSegments, meshHoverColor } from './hover.ts';
import { mesh3d } from './index.ts';
import { meshColors, meshPositions } from './plot.ts';

const registry = createChartRegistry().register(mesh3d, sceneComponent);

function defaults(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const r = supplyDefaults(
    { data: [{ type: 'mesh3d', ...trace }], layout: { template: 'none', ...layout } },
    registry.core,
  );
  return { trace: r.fullData[0]!, fullLayout: r.fullLayout };
}

function calcOf(trace: Record<string, unknown>, layout?: Record<string, unknown>) {
  const d = defaults(trace, layout);
  return { ...d, calc: calcMesh3d(d.trace, { fullLayout: d.fullLayout } as CalcContext) };
}

const TETRA = { x: [0, 1, 0, 0], y: [0, 0, 1, 0], z: [0, 0, 0, 1] };

describe('mesh3d defaults (plotly.js mesh3d/defaults.js)', () => {
  it('needs x, y, z of one length, and all of i, j, k or none', () => {
    expect(defaults(TETRA).trace.visible).toBe(true);
    expect(defaults({ x: [0, 1], y: [0, 1, 2], z: [0, 1] }).trace.visible).toBe(false);
    expect(defaults({ x: [0], y: [0] }).trace.visible).toBe(false);
    expect(defaults({ ...TETRA, i: [0], j: [1] }).trace.visible).toBe(false);
    expect(defaults({ ...TETRA, i: [0], j: [1], k: [2] }).trace.visible).toBe(true);
  });

  it('coerces one color source, by precedence', () => {
    const intensity = defaults({ ...TETRA, intensity: [1, 2, 3, 4], vertexcolor: ['red'] }).trace;
    expect(intensity['intensitymode']).toBe('vertex');
    expect(intensity['showscale']).toBe(true);
    expect(intensity['autocolorscale']).toBe(true);
    expect(intensity['cauto']).toBe(true);
    expect(intensity['vertexcolor']).toBeUndefined();
    expect(intensity['color']).toBeUndefined();
    const face = defaults({ ...TETRA, facecolor: ['red'], vertexcolor: ['blue'] }).trace;
    expect(face['facecolor']).toEqual(['red']);
    expect(face['vertexcolor']).toBeUndefined();
    expect(face['showscale']).toBe(false);
    const vertex = defaults({ ...TETRA, vertexcolor: ['blue'] }).trace;
    expect(vertex['vertexcolor']).toEqual(['blue']);
    expect(vertex['color']).toBeUndefined();
    expect(defaults(TETRA).trace['color']).toBe('rgb(31, 119, 180)');
  });

  it("defaults Plotly's mesh3d lighting, hull options, contour and legend", () => {
    const t = defaults(TETRA).trace;
    expect(t['lighting']).toEqual({
      ambient: 0.8,
      diffuse: 0.8,
      specular: 0.05,
      roughness: 0.5,
      fresnel: 0.2,
      vertexnormalsepsilon: 1e-12,
      facenormalsepsilon: 1e-6,
    });
    expect(t['lightposition']).toEqual({ x: 1e5, y: 1e5, z: 0 });
    expect(t['alphahull']).toBe(-1);
    expect(t['delaunayaxis']).toBe('z');
    expect(t['flatshading']).toBe(false);
    expect(t['contour']).toEqual({ show: false });
    expect(defaults({ ...TETRA, contour: { show: true } }).trace['contour']).toEqual({
      show: true,
      color: 'rgb(68, 68, 68)',
      width: 2,
    });
    expect(t['showlegend']).toBe(false);
    expect(defaults({ ...TETRA, showlegend: true }).trace['showlegend']).toBe(true);
  });
});

describe('mesh3d triangles (plotly.js mesh3d/convert.js)', () => {
  it('rounds explicit indices and rejects out-of-range ones', () => {
    expect([...roundIndices([0, 0.4, -0.49, 2.4], 3)!]).toEqual([0, 0, 0, 2]);
    expect(roundIndices([2.5], 3)).toBeNull();
    expect(roundIndices([-0.5], 3)).toBeNull();
    expect(explicitTriangles([0], [1], [2, 3], 4)).toBeNull();
    expect([...explicitTriangles([0, 1], [1, 2], [2, 3], 4)!]).toEqual([0, 1, 2, 1, 2, 3]);
  });

  it('hides the whole mesh on one invalid index', () => {
    const { calc } = calcOf({ ...TETRA, i: [0, 0], j: [1, 2], k: [2, 9] });
    expect(calc.triangles).toHaveLength(0);
    expect(calc.sceneExtremes).toEqual({});
  });

  it('derives triangles from alphahull and delaunayaxis', () => {
    const cube = {
      x: [0, 1, 0, 1, 0, 1, 0, 1],
      y: [0, 0, 1, 1, 0, 0, 1, 1],
      z: [0, 0, 0, 0, 1, 1, 1, 1],
    };
    expect(calcOf({ ...cube, alphahull: 0 }).calc.triangles.length / 3).toBe(12);
    expect(calcOf({ ...cube, alphahull: 0.5 }).calc.triangles.length / 3).toBe(12);
    // Delaunay along z: the x–y square, 2 triangles per duplicate layer... the duplicates drop.
    expect(calcOf(cube).calc.triangles.length / 3).toBe(2);
    // Along y: the (z, x) square.
    const p = derivedTriangles(-1, 'y', [
      [0, 1, 0, 1],
      [5, 5, 5, 5],
      [0, 0, 1, 1],
    ]);
    expect(p.length / 3).toBe(2);
  });

  it("scales coordinates per axis (Plotly's dataScale) before triangulating", () => {
    // A long, flat grid: unscaled, its Delaunay triangulation would differ.
    const x: number[] = [];
    const y: number[] = [];
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 4; i++) {
        x.push(i * 1000);
        y.push(j);
      }
    }
    const { calc } = calcOf({ x, y, z: x.map(() => 0) });
    expect([...calc.dataScale]).toEqual([1 / 3000, 1 / 2, 1]);
    expect(calc.triangles.length / 3).toBe(12);
  });
});

describe('mesh3d colors', () => {
  it('maps intensity through the colorscale (cmin / cmax), per vertex or per cell', () => {
    const { trace, fullLayout, calc } = calcOf({
      ...TETRA,
      i: [0, 0],
      j: [1, 2],
      k: [2, 3],
      intensity: [0, 1, 2, 3],
      colorscale: 'Viridis',
      cmin: -1,
      cmax: 5,
    });
    const c = meshColors({ trace, fullLayout }, calc);
    expect(c.intensityMode).toBe('vertex');
    expect([...(c.intensity as Float64Array)]).toEqual([0, 1, 2, 3]);
    expect(c.cmin).toBe(-1);
    expect(c.cmax).toBe(5);
    expect(c.faceColor).toBeNull();
    const cell = calcOf({
      ...TETRA,
      i: [0, 0],
      j: [1, 2],
      k: [2, 3],
      intensity: [7, 9],
      intensitymode: 'cell',
    });
    const cc = meshColors(cell, cell.calc);
    expect(cc.intensityMode).toBe('cell');
    expect([...(cc.intensity as Float64Array)]).toEqual([7, 9]);
    expect([cc.cmin, cc.cmax]).toEqual([7, 9]);
    expect(cellColored(cell.trace)).toBe(true);
  });

  it('uses vertex colors, face colors or one color otherwise', () => {
    const v = calcOf({ ...TETRA, vertexcolor: ['red', 'lime', 'blue'] });
    const vc = meshColors(v, v.calc);
    expect([...(vc.color as Float32Array)]).toEqual([
      1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0.5, 0.5, 0.5, 1,
    ]);
    expect(meshHoverColor(v.trace)).toBe('red');
    expect(cellColored(v.trace)).toBe(false);
    const f = calcOf({ ...TETRA, i: [0], j: [1], k: [2], facecolor: ['rgba(255, 0, 0, 0.5)'] });
    const fc = meshColors(f, f.calc);
    expect([...fc.faceColor!]).toEqual([1, 0, 0, 0.5]);
    expect(cellColored(f.trace)).toBe(true);
    const one = calcOf({ ...TETRA, color: '#ff0000' });
    expect(meshColors(one, one.calc).color).toEqual([1, 0, 0, 1]);
    expect(meshHoverColor(one.trace)).toBe('rgb(255, 0, 0)');
  });

  it('gives a colorbar only with intensity', () => {
    const a = calcOf({ ...TETRA, intensity: [0, 1, 2, 3] });
    const bar = traceColorbar(a.trace, a.fullLayout, [0, 1, 2, 3]);
    expect(bar).toMatchObject({ cmin: 0, cmax: 3 });
    // Plotly's automatic scale for a non-negative domain: Reds.
    expect(bar!.colorscale[0]).toEqual([0, 'rgb(220, 220, 220)']);
    const b = calcOf(TETRA);
    expect(mesh3d.colorbar!(b.trace as FullTrace, { fullLayout: b.fullLayout })).toBeNull();
  });

  it('shares a color axis domain across meshes', () => {
    const r = supplyDefaults(
      {
        data: [
          { type: 'mesh3d', ...TETRA, intensity: [0, 1, 2, 3], coloraxis: 'coloraxis' },
          { type: 'mesh3d', ...TETRA, intensity: [10, 11, 12, 13], coloraxis: 'coloraxis' },
        ],
        layout: { template: 'none' },
      },
      registry.core,
    );
    const axis = r.fullLayout['coloraxis'] as Record<string, unknown>;
    expect([axis['_min'], axis['_max']]).toEqual([0, 13]);
    const bar = traceColorbar(r.fullData[0]!, r.fullLayout, [0, 1, 2, 3]);
    expect(bar).toMatchObject({ cmin: 0, cmax: 13, coloraxis: 'coloraxis' });
  });

  it('stores positions relative to the center of the box', () => {
    const { calc } = calcOf({
      x: [10, 12, 11],
      y: [0, 0, 1],
      z: [5, 5, 5],
      i: [0],
      j: [1],
      k: [2],
    });
    const { positions, origin } = meshPositions(calc);
    expect(origin).toEqual([11, 0.5, 5]);
    expect([...positions]).toEqual([-1, -0.5, 0, 1, -0.5, 0, 0, 0.5, 0]);
  });
});

describe('mesh3d hover contour', () => {
  it('cuts the level set through the triangles', () => {
    const { calc } = calcOf({ x: [0, 1, 0], y: [0, 0, 1], z: [0, 0, 2], i: [0], j: [1], k: [2] });
    const seg = isoSegments(calc, calc.z, 1);
    // One segment (two ends and a gap), from the middle of edge 1–2 to the middle of edge 2–0.
    expect([...seg.x]).toEqual([0.5, 0, NaN]);
    expect([...seg.y]).toEqual([0.5, 0.5, NaN]);
    expect([...seg.z]).toEqual([1, 1, NaN]);
    expect(isoSegments(calc, calc.z, 5).x).toHaveLength(0);
    expect(contourLevel(calc.z, calc, { kind: 'vertex', index: 2 })).toBe(2);
    expect(contourLevel(calc.z, calc, { kind: 'cell', index: 0 })).toBeCloseTo(2 / 3, 12);
  });
});
