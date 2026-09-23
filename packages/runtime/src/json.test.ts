// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attr, createRegistry } from '@mk7s/holochart-core';
import type { Chart } from './chart.ts';
import type { TraceModule } from './contracts.ts';
import { chartToJSON, figureFromJSON, fromJSON, type ChartFigureSource } from './json.ts';
import { createChartRegistry } from './registry.ts';
import { setup, type TestSetup } from './__testing__/fakes.ts';

/** A trace type with a per-point (`arrayOk`) attribute, for style-function evaluation. */
const blobs: TraceModule = {
  type: 'blobs',
  categories: ['cartesian'],
  schema: attr.object({
    x: attr.dataArray({ editType: 'calc' }),
    y: attr.dataArray({ editType: 'calc' }),
    size: attr.number({ min: 0, dflt: 4, arrayOk: true, editType: 'calc' }),
  }),
  meta: { description: 'Test blobs.' },
  supplyDefaults(_in, _out, ctx) {
    ctx.coerce('x');
    ctx.coerce('y');
    ctx.coerce('size');
  },
};

const size = (p: { y: number }): number => p.y * 2;

function chartLike(extra: Partial<ChartFigureSource> = {}): ChartFigureSource {
  return {
    data: [{ type: 'blobs', x: Float64Array.of(1, 2, 3), y: [1, 5, 9], size }],
    layout: { title: { text: 'hi' }, when: new Date(Date.UTC(2024, 0, 1)) },
    config: undefined,
    ...extra,
  };
}

describe('chartToJSON (chart-like objects)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('encodes the input figure, evaluating style functions with the given registry', () => {
    const onWarning = vi.fn();
    const json = chartToJSON(
      chartLike({
        frames: [{ name: 'a', data: [{ size }] }],
        datasets: { d: { v: Int16Array.of(-1, 2) } },
      }),
      { registry: createChartRegistry().register(blobs), onWarning },
    );
    expect(json).toEqual({
      data: [
        {
          type: 'blobs',
          x: { dtype: 'f8', bdata: 'AAAAAAAA8D8AAAAAAAAAQAAAAAAAAAhA' },
          y: [1, 5, 9],
          size: [2, 10, 18],
        },
      ],
      layout: { title: { text: 'hi' }, when: '2024-01-01T00:00:00.000Z' },
      frames: [{ name: 'a', data: [{ size: [2, 10, 18] }] }],
      datasets: { d: { v: { dtype: 'i2', bdata: '//8CAA==' } } },
    });
    expect(json).not.toHaveProperty('config');
    expect(onWarning.mock.calls.map(([w]) => (w as { path: string }).path)).toEqual([
      'data[0].size',
      'frames[0].data[0].size',
    ]);
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });

  it('accepts a core registry', () => {
    const json = chartToJSON(chartLike(), {
      registry: createRegistry().register(blobs),
      onWarning: () => undefined,
    });
    expect((json.data as Record<string, unknown>[])[0]?.['size']).toEqual([2, 10, 18]);
  });

  it('uses the shared registry by default (unknown types: functions dropped)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const json = chartToJSON(chartLike({ config: { responsive: false } }));
    expect((json.data as Record<string, unknown>[])[0]).not.toHaveProperty('size');
    expect(json.config).toEqual({ responsive: false });
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/data\[0\]\.size: function dropped/));
  });

  it('round-trips through figureFromJSON', () => {
    const json = chartToJSON(chartLike(), { registry: createRegistry().register(blobs) });
    const fig = figureFromJSON(JSON.stringify(json));
    const t = fig.data?.[0] as Record<string, unknown>;
    expect(t['x']).toEqual(Float64Array.of(1, 2, 3));
    expect(t['size']).toEqual([2, 10, 18]);
    expect(fig.layout).toEqual({ title: { text: 'hi' }, when: '2024-01-01T00:00:00.000Z' });
  });
});

describe('real charts', () => {
  let t: TestSetup;
  const charts: Chart[] = [];

  beforeEach(() => {
    t = setup({ width: 320, height: 200 });
  });

  afterEach(() => {
    for (const c of charts.splice(0)) c.destroy();
  });

  it('serializes a chart and rebuilds it with fromJSON', async () => {
    const figure = {
      data: [{ type: 'dots', x: Float32Array.of(0, 0.5, 10), y: Int32Array.of(-1, 0, 100) }],
      layout: { title: { text: 'Saved' } },
      config: { responsive: false },
    };
    const original = fromJSON(t.container, figure, t.options);
    charts.push(original);
    await original.ready;
    const json = chartToJSON(original, { registry: t.registry });
    expect(json).toEqual({
      data: [
        {
          type: 'dots',
          x: { dtype: 'f4', bdata: expect.any(String) as unknown },
          y: { dtype: 'i4', bdata: expect.any(String) as unknown },
        },
      ],
      layout: { title: { text: 'Saved' } },
      config: { responsive: false },
    });

    const el = document.createElement('div');
    document.body.appendChild(el);
    const copy = fromJSON(el, JSON.stringify(json), t.options);
    charts.push(copy);
    await copy.ready;
    const trace = copy.data[0] as Record<string, unknown>;
    expect(trace['x']).toEqual(Float32Array.of(0, 0.5, 10));
    expect(trace['y']).toEqual(Int32Array.of(-1, 0, 100));
    expect(copy.layout).toEqual({ title: { text: 'Saved' } });
    expect(copy.fullData).toHaveLength(1);
    expect(chartToJSON(copy, { registry: t.registry })).toEqual(json);
  });

  it('chart.toJSON() uses the chart registry, includes frames and datasets, and serves JSON.stringify', async () => {
    const figure = {
      data: [{ type: 'dots', x: [1, 2], y: Float64Array.of(3, 4) }],
      layout: {},
      frames: [{ name: 'f0', data: [] }],
      datasets: { d: { a: [1, 2] } },
    };
    const chart = fromJSON(t.container, figure, t.options);
    charts.push(chart);
    await chart.ready;
    expect(chart.frames).toEqual(figure.frames);
    expect(chart.datasets).toEqual(figure.datasets);
    const json = chart.toJSON();
    expect(json).toEqual(chartToJSON(chart, { registry: t.registry }));
    expect(json).toMatchObject({ frames: figure.frames, datasets: figure.datasets });
    // JSON.stringify calls toJSON(key); the key must not be read as options.
    expect(JSON.parse(JSON.stringify(chart))).toEqual(JSON.parse(JSON.stringify(json)));
    expect(JSON.parse(JSON.stringify({ c: chart }))).toEqual({
      c: JSON.parse(JSON.stringify(json)),
    });
  });
});
