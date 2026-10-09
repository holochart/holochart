// @vitest-environment jsdom
/**
 * The functional API (plan §7.1) beyond the basics in api.test.ts: `newPlot` without data,
 * `moveTraces`, `Fx.hover` / `Fx.unhover` by element, and `downloadImage` of a figure object.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadImage, Fx, hover, moveTraces, newPlot, purge, unhover } from './api.ts';
import { getChart } from './chart.ts';
import { setup, type TestSetup } from './__testing__/fakes.ts';

const trace = (label: string): Record<string, unknown> => ({
  type: 'dots',
  x: [0, 5, 10],
  y: [0, 50, 100],
  label,
});

let t: TestSetup;

beforeEach(() => {
  t = setup({ width: 400, height: 300 });
});

afterEach(() => {
  purge(t.container);
  t.container.remove();
  vi.restoreAllMocks();
});

describe('newPlot without data', () => {
  it('draws an empty chart at the container size', async () => {
    const chart = await newPlot(t.container, undefined, undefined, undefined, t.options);
    expect(chart.data).toEqual([]);
    expect(chart.layout).toEqual({});
    expect(chart.config).toBeUndefined();
    expect(chart.size).toEqual({ width: 400, height: 300 });
  });

  it('still takes the layout and config arguments', async () => {
    const chart = await newPlot(
      t.container,
      undefined,
      { width: 320, height: 200 },
      { staticPlot: true },
      t.options,
    );
    expect(chart.data).toEqual([]);
    expect(chart.size).toEqual({ width: 320, height: 200 });
    expect(chart.config).toEqual({ staticPlot: true });
    expect(chart.fullConfig?.staticPlot).toBe(true);
  });
});

describe('moveTraces(el, …)', () => {
  it('reorders the traces of the chart in the element', async () => {
    const chart = await newPlot(
      t.container,
      [trace('a'), trace('b'), trace('c')],
      {},
      {},
      t.options,
    );
    await expect(moveTraces(t.container, 0)).resolves.toBe(chart);
    expect(chart.data.map((d) => d['label'])).toEqual(['b', 'c', 'a']);
    await moveTraces(t.container, [2], [0]);
    expect(chart.data.map((d) => d['label'])).toEqual(['a', 'b', 'c']);
  });

  it('rejects for an element without a chart', async () => {
    await expect(moveTraces(t.container, 0)).rejects.toThrow(/moveTraces: no chart/);
  });
});

describe('Fx.hover / Fx.unhover', () => {
  it('hover the given points of the chart in the element, and unhover them', async () => {
    const chart = await newPlot(t.container, [trace('a')], {}, {}, t.options);
    const hovered: Record<string, unknown>[][] = [];
    let unhovered = 0;
    chart.on('hover', (e) => void hovered.push(e.points.map((p) => ({ ...p }))));
    chart.on('unhover', () => unhovered++);

    hover(t.container, [{ curveNumber: 0, pointNumber: 1 }]);
    expect(hovered).toHaveLength(1);
    expect(hovered[0]).toEqual([expect.objectContaining({ curveNumber: 0, pointNumber: 1 })]);

    unhover(t.container);
    expect(unhovered).toBe(1);

    // The `Fx` namespace holds the same functions (Plotly's `Plotly.Fx.hover`).
    Fx.hover(t.container, [{ curveNumber: 0, pointNumber: 2 }]);
    expect(hovered).toHaveLength(2);
    expect(hovered[1]).toEqual([expect.objectContaining({ pointNumber: 2 })]);
    Fx.unhover(t.container);
    expect(unhovered).toBe(2);
  });

  it('hover throws for an element without a chart; unhover has nothing to hide there', () => {
    expect(() => hover(t.container, [{ curveNumber: 0, pointNumber: 0 }])).toThrow(
      /hover: no chart/,
    );
    unhover(t.container);
    expect(getChart(t.container)).toBeUndefined();
  });
});

describe('downloadImage(figure)', () => {
  it('draws a figure object offscreen and saves it, with no chart on the page', async () => {
    // jsdom has no 2D canvas and no canvas encoder (see export/export.test.ts).
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
      (type?: string) => `data:${type ?? 'image/png'};base64,QUJD`,
    );
    let download = '';
    let href = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      download = this.download;
      href = this.href;
    });
    const name = await downloadImage(
      { data: [trace('a')], layout: { width: 500, height: 300 } },
      { filename: 'figure', format: 'webp', scale: 2 },
      t.options,
    );
    expect(name).toBe('figure.webp');
    expect(download).toBe('figure.webp');
    expect(href).toBe('data:image/webp;base64,QUJD');
    // Laid out at the figure's own size, at the requested scale.
    expect(t.renderers).toHaveLength(1);
    expect(t.renderers[0]?.calls).toContain('buffer 1000x600@2');
    expect(getChart(t.container)).toBeUndefined();
    expect(document.querySelector('canvas')).toBeNull();
  });
});
