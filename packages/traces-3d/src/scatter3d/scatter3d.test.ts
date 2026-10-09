import { supplyDefaults, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { resolveSymbol, symbolName, Viewport, type ViewportRect } from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type DomainTraceEntry,
  type SubplotViewportOptions,
} from '@mk7s/holochart-runtime';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scatter3d as scatter3dParts, ORBIT_STEP } from '../a11y.ts';
import { sceneKit } from '../a11y-loader.ts';
import { sceneComponent } from '../scene/component.ts';
import { acquireScene } from '../scene/scene.ts';
import { SCATTER3D_SYMBOLS } from './attributes.ts';
import { calcScatter3d, errorBars3d, markerDiameters3d, type Scatter3dCalc } from './calc.ts';
import { scatter3d, scatter3dHoverPoint } from './index.ts';
import { errorSegments, lineColors, textAnchor3d, textLabels3d } from './plot.ts';
import { surfaceTriangles } from './surface.ts';

const registry = createChartRegistry().register(scatter3d, sceneComponent);
const AREA: ViewportRect = { x: 0, y: 0, width: 600, height: 400 };
const IDENTITY = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

function defaults(data: Record<string, unknown>[], layout: Record<string, unknown> = {}) {
  return supplyDefaults(
    {
      data: data.map((t) => ({ type: 'scatter3d', ...t })),
      layout: { template: 'none', ...layout },
    },
    registry.core,
  );
}

function trace(t: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = defaults([t], layout);
  return { trace: fullData[0]!, fullLayout };
}

/** Defaults, calc and the scene layout, as the runtime runs them. */
function build(data: Record<string, unknown>[], layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = defaults(data, layout);
  const entries: DomainTraceEntry<Scatter3dCalc>[] = fullData.map((t, index) => ({
    trace: t,
    index,
    calc: calcScatter3d(t, { fullLayout, index, xaxis: undefined, yaxis: undefined }),
    domain: { x: [0, 1], y: [0, 1], rect: AREA },
  }));
  scatter3d.crossTraceLayout!(entries, { fullLayout, width: 600, height: 400, plotArea: AREA });
  return { fullLayout, fullData, entries };
}

/** A scene with a real (GL-free) viewport. */
function sceneOf(fullLayout: FullLayout, calc: Scatter3dCalc) {
  const host = { invalidate: () => {}, canvasWidth: 600, canvasHeight: 400, pixelRatio: 1 };
  const ctx = {
    fullLayout,
    plotArea: AREA,
    subplotViewport: (_key: string, o: SubplotViewportOptions) =>
      new Viewport(host, { kind: '3d', rect: o.rect, projection: o.projection ?? 'perspective' }),
  };
  return acquireScene(ctx, 'scene', calc.scene)!;
}

describe('scatter3d defaults', () => {
  it("uses Plotly's 3D defaults", () => {
    const { trace: t } = trace({ x: [1, 2, 3], y: [1, 2, 3], z: [1, 2, 3], text: ['a'] });
    expect(t['mode']).toBe('lines+markers');
    expect((t['marker'] as Record<string, unknown>)['size']).toBe(8);
    expect((t['marker'] as Record<string, unknown>)['symbol']).toBe('circle');
    expect((t['marker'] as Record<string, unknown>)['render']).toBe('sprite');
    expect((t['line'] as Record<string, unknown>)['width']).toBe(2);
    expect((t['line'] as Record<string, unknown>)['dash']).toBe('solid');
    expect(t['_length']).toBe(3);
    expect(t['scene']).toBe('scene');
    expect(t['surfaceaxis']).toBe(-1);
    expect(t['surfacecolor']).toBeUndefined();
    expect(t['textposition']).toBeUndefined();
  });

  it('needs x, y and z; the point count is the shortest', () => {
    expect(trace({ x: [1], y: [1] }).trace.visible).toBe(false);
    expect(trace({ x: [1, 2, 3], y: [1, 2], z: [1, 2, 3, 4] }).trace['_length']).toBe(2);
  });

  it('coerces text, projections and surfacecolor only when used', () => {
    const { trace: t } = trace({
      x: [1],
      y: [1],
      z: [1],
      mode: 'text',
      surfaceaxis: 1,
      line: { color: 'red' },
      projection: { x: { show: true }, y: { opacity: 0.2 } },
    });
    expect(t['textposition']).toBe('top center');
    expect(t['marker']).toBeUndefined();
    expect(t['surfacecolor']).toBeDefined();
    const p = t['projection'] as Record<string, Record<string, unknown>>;
    expect(p['x']).toEqual({ show: true, opacity: 1, scale: 2 / 3 });
    expect(p['y']).toEqual({ show: false });
  });

  it('marker colors follow a line color; bubbles get outlines', () => {
    const { trace: t } = trace({
      x: [1, 2],
      y: [1, 2],
      z: [1, 2],
      line: { color: '#123456' },
      marker: { size: [4, 8] },
    });
    const m = t['marker'] as Record<string, Record<string, unknown> | unknown>;
    expect(m['color']).toBe('rgb(18, 52, 86)');
    expect((m['line'] as Record<string, unknown>)['width']).toBe(1);
    expect(m['opacity']).toBe(0.7);
  });

  it('error bars: z first, x and y copy its style', () => {
    const { trace: t } = trace({
      x: [1, 2],
      y: [1, 2],
      z: [1, 2],
      error_z: { array: [0.1, 0.2], color: 'green' },
      error_x: { value: 5 },
      error_y: { value: 5, color: 'blue' },
    });
    const ez = t['error_z'] as Record<string, unknown>;
    const ex = t['error_x'] as Record<string, unknown>;
    const ey = t['error_y'] as Record<string, unknown>;
    expect(ez).toMatchObject({
      visible: true,
      type: 'data',
      color: 'rgb(0, 128, 0)',
      thickness: 2,
    });
    expect(ex).toMatchObject({ visible: true, type: 'percent', copy_zstyle: true });
    expect(ex['color']).toBeUndefined();
    expect(ey).toMatchObject({ copy_zstyle: false, color: 'rgb(0, 0, 255)' });
  });
});

describe('scatter3d calc', () => {
  it('maps dates, categories and logs to linear coordinates', () => {
    const { entries } = build([{ x: ['2025-01-01', '2025-01-02'], y: ['b', 'a'], z: [10, 1000] }], {
      scene: { zaxis: { type: 'log' } },
    });
    const c = entries[0]!.calc;
    expect(Array.from(c.x)).toEqual([Date.UTC(2025, 0, 1), Date.UTC(2025, 0, 2)]);
    expect(Array.from(c.y)).toEqual([0, 1]);
    expect(Array.from(c.z)).toEqual([1, 3]);
    expect(c.sceneExtremes.z).toEqual([1, 3]);
  });

  it('includes error bar ends in the autorange', () => {
    const { entries } = build([
      { x: [0, 1], y: [0, 1], z: [0, 10], error_z: { type: 'constant', value: 2 } },
    ]);
    expect(entries[0]!.calc.sceneExtremes.z).toEqual([-2, 12]);
  });

  it('computes each error type, asymmetric and on log axes', () => {
    const t = (e: Record<string, unknown>) =>
      ({ error_z: { visible: true, ...e } }) as unknown as FullTrace;
    const l = Float64Array.of(10, -4);
    const lin = { type: 'linear' } as const;
    expect(Array.from(errorBars3d(t({ type: 'percent', value: 10 }), 'z', l, lin)!.plus)).toEqual([
      11, -3.6,
    ]);
    expect(Array.from(errorBars3d(t({ type: 'sqrt' }), 'z', l, lin)!.minus)).toEqual([
      10 - Math.sqrt(10),
      -6,
    ]);
    const asym = errorBars3d(
      t({ type: 'data', symmetric: false, array: [1, 2], arrayminus: [3, 4] }),
      'z',
      l,
      lin,
    )!;
    expect(Array.from(asym.minus)).toEqual([7, -8]);
    expect(Array.from(asym.plus)).toEqual([11, -2]);
    const log = errorBars3d(t({ type: 'constant', value: 200 }), 'z', Float64Array.of(2), {
      type: 'log',
    })!;
    expect(log.plus[0]).toBeCloseTo(Math.log10(300));
    expect(log.minus[0]).toBe(-Infinity);
    expect(errorBars3d(t({ visible: false }), 'z', l, lin)).toBeUndefined();
  });

  it('sizes bubbles like 2D scatter', () => {
    const t = {
      mode: 'markers',
      marker: { size: [4, 16, 'x'], sizeref: 2, sizemode: 'area', sizemin: 1 },
    } as unknown as FullTrace;
    const d = markerDiameters3d(t, 3) as Float32Array;
    expect(d[0]).toBeCloseTo(2 * Math.max(Math.sqrt(4 / 2 / 2), 1));
    expect(d[1]).toBeCloseTo(2 * Math.sqrt(16 / 2 / 2));
    expect(d[2]).toBe(0);
    expect(markerDiameters3d({ mode: 'lines' } as unknown as FullTrace, 3)).toBe(0);
  });

  it('keeps linear coordinates of linear axes (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.double({ noNaN: true, min: -1e9, max: 1e9 }), fc.integer()), {
          minLength: 1,
          maxLength: 30,
        }),
        (pts) => {
          const x = pts.map((p) => p[0]);
          const { entries } = build([{ x, y: x, z: pts.map((p) => p[1]) }]);
          const c = entries[0]!.calc;
          expect(Array.from(c.x)).toEqual(x);
          const e = c.sceneExtremes.x!;
          expect(e[0]).toBe(Math.min(...x));
          expect(e[1]).toBe(Math.max(...x));
        },
      ),
    );
  });
});

describe('scatter3d drawing data', () => {
  it("draws Plotly's 3D symbols with the 2D symbols of the same names", () => {
    for (const s of SCATTER3D_SYMBOLS) expect(symbolName(resolveSymbol(s))).toBe(s);
  });

  it('places text around the marker', () => {
    expect(textAnchor3d('top center', 4)).toEqual({
      anchorX: 'center',
      anchorY: 'bottom',
      offset: [0, -6],
    });
    expect(textAnchor3d('bottom left', 0)).toEqual({
      anchorX: 'right',
      anchorY: 'top',
      offset: [-2, 2],
    });
    expect(textAnchor3d('middle right', 3)).toMatchObject({ anchorX: 'left', anchorY: 'middle' });
  });

  it('builds text labels from texttemplate at the points', () => {
    const { entries, fullData } = build([
      {
        x: [1, 2],
        y: [3, 4],
        z: [5, NaN],
        mode: 'text',
        texttemplate: '%{x}/%{z}',
        textfont: { size: 14, color: 'red' },
      },
    ]);
    const labels = textLabels3d(fullData[0]!, entries[0]!.calc);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ text: '1/5', x: 1, y: 3, z: 5, anchorY: 'bottom' });
    expect(labels[0]!.color).toEqual([1, 0, 0, 1]);
    expect(labels[0]!.font?.size).toBe(14);
  });

  it('maps line colors through a colorscale', () => {
    const { fullData, fullLayout } = build([
      {
        x: [0, 1, 2],
        y: [0, 1, 2],
        z: [0, 1, 2],
        line: {
          color: [0, 1, 2],
          colorscale: [
            [0, 'black'],
            [1, 'white'],
          ],
        },
      },
    ]);
    const c = lineColors(fullData[0]!, 3, fullLayout) as Float32Array;
    expect(Array.from(c.subarray(0, 4))).toEqual([0, 0, 0, 1]);
    expect(c[4]).toBeCloseTo(0.5, 1);
    expect(Array.from(c.subarray(8, 12))).toEqual([1, 1, 1, 1]);
  });

  it('draws error bars as segments along their axes, gapped', () => {
    const { entries, fullData } = build([
      {
        x: [1, 2],
        y: [1, 2],
        z: [1, 2],
        error_z: { array: [0.5, 1], color: 'red', thickness: 3 },
        error_x: { type: 'constant', value: 0.25 },
      },
    ]);
    const seg = errorSegments(fullData[0]!, entries[0]!.calc)!;
    // Two bars per axis, three vertices each (low, high, gap).
    expect(seg.x).toHaveLength(12);
    const zBars = entries[0]!.calc.errors.find((e) => e.letter === 'z')!;
    const k = entries[0]!.calc.errors.indexOf(zBars) * 6;
    expect([seg.x[k], seg.y[k], seg.z[k]]).toEqual([1, 1, 0.5]);
    expect([seg.x[k + 1], seg.y[k + 1], seg.z[k + 1]]).toEqual([1, 1, 1.5]);
    expect(Number.isNaN(seg.x[k + 2])).toBe(true);
    // error_x copies error_z's color and thickness.
    const xk = (1 - entries[0]!.calc.errors.indexOf(zBars)) * 6;
    expect(Array.from(seg.color.subarray(xk * 4, xk * 4 + 4))).toEqual([1, 0, 0, 1]);
    expect(seg.width[xk]).toBe(3);
    expect(seg.x[xk]).toBe(0.75);
  });

  it('triangulates the surfaceaxis plane in scene units', () => {
    const id = { scaleX: 1, offsetX: 0, scaleY: 1, offsetY: 0, scaleZ: 1, offsetZ: 0 };
    const s = surfaceTriangles([0, 1, 1, 0, NaN], [0, 0, 1, 1, 0], [5, 6, 7, 8, 9], 2, id);
    expect(s.index).toHaveLength(6);
    expect(Math.max(...s.index)).toBeLessThan(4);
    expect(Array.from(s.positions.subarray(0, 3))).toEqual([0, 0, 5]);
    // Axis 0 triangulates (y, z): a vertical square.
    const v = surfaceTriangles([3, 3, 3, 3], [0, 1, 1, 0], [0, 0, 1, 1], 0, id);
    expect(v.index).toHaveLength(6);
  });

  it('surface triangles index valid points only (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.oneof(fc.double({ min: -10, max: 10, noNaN: true }), fc.constant(NaN)),
            fc.double({ min: -10, max: 10, noNaN: true }),
            fc.double({ min: -10, max: 10, noNaN: true }),
          ),
          { maxLength: 40 },
        ),
        fc.integer({ min: 0, max: 2 }),
        (pts, axis) => {
          const id = { scaleX: 2, offsetX: 1, scaleY: 1, offsetY: 0, scaleZ: 0.5, offsetZ: 0 };
          const s = surfaceTriangles(
            pts.map((p) => p[0]),
            pts.map((p) => p[1]),
            pts.map((p) => p[2]),
            axis,
            id,
          );
          expect(s.index.length % 3).toBe(0);
          for (const i of s.index) {
            expect(i).toBeLessThan(pts.length);
            expect(Number.isFinite(pts[i]![0])).toBe(true);
          }
        },
      ),
    );
  });
});

describe('scatter3d module', () => {
  /** The lazily loaded accessibility parts of scatter3d (`../a11y.ts`), as its loader builds them. */
  const parts = scatter3dParts(scatter3dHoverPoint, ...sceneKit)['scatter3d']!;

  it('describes the trace with its point count and ranges', () => {
    const { entries, fullData, fullLayout } = build([{ x: [1, 2], y: [3, 4], z: [5, 6] }]);
    sceneOf(fullLayout, entries[0]!.calc);
    const d = parts.describe!({
      trace: fullData[0]!,
      calc: entries[0]!.calc as never,
      index: 0,
      fullLayout,
      xaxis: undefined,
      yaxis: undefined,
      maxRows: 100,
    })!;
    expect(d.kind).toBe('3D scatter');
    expect(d.summary).toMatch(/^3D scatter 'trace 0': 2 points; x 1–2; y 3–4; z 5–6\.$/);
  });

  it('describes the points without their error bars', () => {
    const { entries, fullData, fullLayout } = build([
      { x: [1, 2], y: [3, 4], z: [5, 6], error_z: { type: 'constant', value: 10 } },
    ]);
    sceneOf(fullLayout, entries[0]!.calc);
    const d = parts.describe!({
      trace: fullData[0]!,
      calc: entries[0]!.calc as never,
      index: 0,
      fullLayout,
      xaxis: undefined,
      yaxis: undefined,
      maxRows: 100,
    })!;
    expect(d.summary).toMatch(/z 5–6\.$/);
  });

  it('lists its points with a position as keyboard stops, in data order', () => {
    const { entries, fullData, fullLayout } = build([
      { x: [1, 2, null, 4], y: [3, 4, 5, 6], z: [5, 6, 7, 8], text: ['a', 'b', 'c', 'd'] },
    ]);
    const calc = entries[0]!.calc;
    const live = sceneOf(fullLayout, calc);
    const ctx = {
      fullLayout,
      xaxis: undefined,
      yaxis: undefined,
      transform: IDENTITY,
      height: 400,
    };
    const stops = parts.keyboardPoints!(calc as never, fullData[0]!, ctx)!;
    expect(stops.length).toBe(3);
    expect([0, 1, 2].map((k) => stops.at(k)?.pointIndex)).toEqual([0, 1, 3]);
    expect(stops.at(3)).toBeUndefined();
    const p = stops.at(2)!;
    // The label reads like the hover label and sits where the point is drawn.
    expect(p.hoverText).toBe('x: 4<br>y: 6<br>z: 8<br>d');
    const world = live.toWorld(calc.x[3]!, calc.y[3]!, calc.z[3]!);
    const at = live.project(world[0], world[1], world[2]);
    expect(p.px).toBeCloseTo(at.x, 6);
    expect(p.py).toBeCloseTo(400 - at.y, 6);
  });

  it('orbits, dollies and resets the camera for the view keys', () => {
    const { entries, fullData, fullLayout } = build([{ x: [1, 2], y: [3, 4], z: [5, 6] }]);
    const live = sceneOf(fullLayout, entries[0]!.calc);
    const ctx = { fullLayout, xaxis: undefined, yaxis: undefined, transform: IDENTITY };
    const key = (action: string) =>
      parts.keyboardView!(fullData[0]!, ctx, action) as
        Record<string, { eye: { x: number; y: number; z: number } }> | undefined;
    const eye = live.camera.eye;
    const azimuth = (e: { x: number; y: number }) => Math.atan2(e.y, e.x);
    const distance = (e: { x: number; y: number; z: number }) => Math.hypot(e.x, e.y, e.z);
    // Turntable (the default): Shift + ↑ lifts the camera, Shift + → takes it around to the right.
    const up = key('panUp')!['scene.camera']!.eye;
    expect(up.z).toBeGreaterThan(eye[2]);
    expect(distance(up)).toBeCloseTo(Math.hypot(...eye), 9);
    const right = key('panRight')!['scene.camera']!.eye;
    expect(azimuth(right) - Math.atan2(eye[1], eye[0])).toBeCloseTo(ORBIT_STEP, 9);
    expect(right.z).toBeCloseTo(eye[2], 9);
    const left = key('panLeft')!['scene.camera']!.eye;
    expect(azimuth(left) - Math.atan2(eye[1], eye[0])).toBeCloseTo(-ORBIT_STEP, 9);
    // + moves in, - moves out.
    expect(distance(key('zoomIn')!['scene.camera']!.eye)).toBeLessThan(Math.hypot(...eye));
    expect(distance(key('zoomOut')!['scene.camera']!.eye)).toBeGreaterThan(Math.hypot(...eye));
    // 0: the first drawn view, with its aspect ratio.
    const reset = key('reset') as unknown as Record<string, unknown>;
    expect(reset['scene.camera']).toMatchObject({
      eye: { x: eye[0], y: eye[1], z: eye[2] },
      projection: { type: 'perspective' },
    });
    expect(reset['scene.aspectmode']).toBe(live.initial.aspectmode);
    // Keys that are not view keys are not the scene's.
    expect(key('left')).toBeUndefined();
  });

  it('shows a colorscaled line in the legend with one color', () => {
    const { fullData, fullLayout } = build([
      {
        x: [0, 1],
        y: [0, 1],
        z: [0, 1],
        mode: 'lines',
        line: { color: [0, 1], colorscale: 'Greys' },
      },
    ]);
    const glyph = scatter3d.legendIcon!(fullData[0]!, { fullLayout });
    expect(JSON.stringify(glyph)).toMatch(/rgb/);
  });

  it('reports a colorbar for colorscaled markers', () => {
    const { fullData, fullLayout } = build([
      { x: [0, 1], y: [0, 1], z: [0, 1], marker: { color: [0, 1], showscale: true } },
    ]);
    expect(scatter3d.colorbar!(fullData[0]!, { fullLayout })).toMatchObject({ cmin: 0, cmax: 1 });
  });
});
