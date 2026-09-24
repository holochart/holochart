// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createChart, type Chart } from './chart.ts';
import { setup, type TestSetup } from './__testing__/fakes.ts';

/**
 * Axis type changes convert layout coordinates (Plotly's `convertCoords`, core
 * `axisTypeChangeEdits`): relayouting `yaxis.type` between linear and log rewrites a fixed range and
 * data-referenced annotations/images, which are exponents on log axes. The components are not
 * registered here, so the input items are converted.
 */
let t: TestSetup;
let charts: Chart[] = [];

function chart(figure: Parameters<typeof createChart>[1]): Chart {
  const c = createChart(t.container, figure, t.options);
  charts.push(c);
  return c;
}

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
});

describe('axis type change', () => {
  it('converts a fixed range, annotations and images linear → log → linear', async () => {
    const c = chart({
      data: [{ type: 'dots', x: [0, 10], y: [1, 1000] }],
      layout: {
        yaxis: { range: [1, 1000] },
        annotations: [
          { x: 5, y: 100, xref: 'x', yref: 'y', ay: 10, ayref: 'y' },
          { x: 0.5, y: 0.5, xref: 'paper', yref: 'y domain' },
        ],
        images: [{ x: 5, y: 100, sizey: 50, xref: 'x', yref: 'y' }],
      },
    });
    await c.ready;

    await c.relayout({ 'yaxis.type': 'log' });
    const yaxis = c.layout['yaxis'] as Record<string, unknown>;
    expect(yaxis['type']).toBe('log');
    expect(yaxis['range']).toEqual([0, 3]);
    expect(yaxis['autorange']).toBe(false);
    expect(c.fullLayout?.['yaxis']).toMatchObject({ type: 'log', range: [0, 3] });
    const [a0, a1] = c.layout['annotations'] as Record<string, number>[];
    expect(a0).toMatchObject({ x: 5, y: 2, ay: 1 });
    expect(a1).toMatchObject({ x: 0.5, y: 0.5 });
    const im = (c.layout['images'] as Record<string, number>[])[0]!;
    expect(im.y).toBeCloseTo(2);
    expect(im.x).toBe(5);
    const dx = 50 / 100 / 2;
    expect(im['sizey']).toBeCloseTo(2 * Math.log10(dx + Math.sqrt(1 + dx * dx)));

    await c.relayout({ 'yaxis.type': 'linear' });
    const back = c.layout['yaxis'] as { range: number[] };
    expect(back.range[0]).toBeCloseTo(1);
    expect(back.range[1]).toBeCloseTo(1000);
    const b0 = (c.layout['annotations'] as Record<string, number>[])[0]!;
    expect(b0['y']).toBeCloseTo(100);
    expect(b0['ay']).toBeCloseTo(10);
    const bi = (c.layout['images'] as Record<string, number>[])[0]!;
    expect(bi['y']).toBeCloseTo(100);
    expect(bi['sizey']).toBeCloseTo(50);
  });

  it('autoranges on other type changes', async () => {
    const c = chart({
      data: [{ type: 'dots', x: [0, 10], y: [1, 1000] }],
      layout: { xaxis: { range: [0, 10] } },
    });
    await c.ready;
    await c.relayout({ 'xaxis.type': 'category' });
    const xaxis = c.layout['xaxis'] as Record<string, unknown>;
    expect(xaxis).toEqual({ type: 'category', autorange: true });
  });
});
