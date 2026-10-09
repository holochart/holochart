/**
 * Type tests of the public figure types (backlog S1.6), checked by the package's `tsc` (`pnpm
 * typecheck`): `expectTypeOf` assertions and `@ts-expect-error` cases. Nothing here runs.
 */
import type { FigureInput, TraceInput } from '@mk7s/holochart-core';
import type {
  BaseScatterTrace as BasicScatterTrace,
  TracesBasic,
} from '@mk7s/holochart-traces-basic';
import { describe, expectTypeOf, it } from 'vitest';
import {
  addTraces,
  createChart,
  express,
  newPlot,
  react,
  relayout,
  restyle,
  toImage,
  type BarTrace,
  type Chart,
  type Data,
  type Figure,
  type Frame,
  type Layout,
  type ScatterTrace,
  type TraceTypes,
} from './index.ts';

declare const el: HTMLElement;

describe('Figure', () => {
  it('types scatter attributes: marker.color takes a color, an array or a function', () => {
    const figure: Figure = {
      data: [
        { x: [1, 2, 3], y: [3, 1, 2], mode: 'lines+markers', marker: { color: 'crimson' } },
        {
          type: 'scatter',
          y: [1, 2],
          marker: { color: ['red', 'blue'], size: Float64Array.of(4, 8) },
        },
        { y: [1, 2], marker: { color: [0.2, 0.8], colorscale: 'Viridis' } },
        { y: [1, 2], marker: { color: (p: { y: number }) => (p.y > 1 ? 'gold' : 'gray') } },
      ],
    };
    expectTypeOf(figure.data).toEqualTypeOf<readonly Data[] | undefined>();
    expectTypeOf<ScatterTrace['mode']>().toExtend<string | undefined>();
    expectTypeOf<'lines+markers'>().toExtend<NonNullable<ScatterTrace['mode']>>();
    expectTypeOf<'markers+text'>().toExtend<NonNullable<ScatterTrace['mode']>>();
  });

  it('rejects unknown trace types, attributes and values', () => {
    // @ts-expect-error — 'scater' is not a trace type.
    const typo: Data = { type: 'scater', y: [1] };
    // @ts-expect-error — a bar's orientation is 'v' or 'h'.
    const orientation: Data = { type: 'bar', orientation: 'x' };
    // @ts-expect-error — `colr` is not a marker attribute.
    const attribute: Data = { type: 'bar', marker: { colr: 'red' } };
    // @ts-expect-error — not a mode.
    const mode: Data = { mode: 'lines+dots' };
    void [typo, orientation, attribute, mode];
  });

  it('narrows on `type`, and a trace without `type` is a scatter trace', () => {
    const describe = (trace: Data): string => {
      if (trace.type === 'bar') {
        expectTypeOf(trace).toEqualTypeOf<BarTrace>();
        return String(trace.orientation);
      }
      if (trace.type === undefined || trace.type === 'scatter') {
        expectTypeOf(trace).toEqualTypeOf<ScatterTrace>();
        return String(trace.mode);
      }
      return trace.type;
    };
    expectTypeOf(describe).toBeFunction();
    expectTypeOf<Extract<Data, { type: 'pie' }>['hole']>().toEqualTypeOf<number | undefined>();
  });

  it("includes the full bundle's extensions: 2.5D bar depth, bar3d", () => {
    expectTypeOf<BarTrace>().toHaveProperty('depth');
    expectTypeOf<BarTrace>().toHaveProperty('material');
    // traces-basic's own bar has no 2.5D attributes: the full bundle extends the module.
    expectTypeOf<BasicScatterTrace>().not.toHaveProperty('depth');
    expectTypeOf<ScatterTrace>().toHaveProperty('depth');
    const bar3d: Data = { type: 'bar3d', x: [0], y: [0], z: [1] };
    void bar3d;
  });

  it('types layout attributes: numbered axes, 3D scenes, legends, components', () => {
    const layout: Layout = {
      title: { text: 'Sales', subtitle: { text: '2025' } },
      xaxis2: { range: [0, 10], type: 'log' },
      yaxis3: { anchor: 'x2', overlaying: 'y' },
      scene: { camera: { eye: { x: 1.5, y: 1.5, z: 1 } } },
      scene2: { aspectmode: 'cube' },
      legend2: { orientation: 'h' },
      barmode: 'stack',
      annotations: [{ text: 'Note', x: 1, y: 2, showarrow: false }],
      xaxis14: { anything: 'numbered past 9: accepted, untyped' },
    };
    expectTypeOf(layout.scene?.camera?.eye?.x).toEqualTypeOf<number | undefined>();
    // @ts-expect-error — an axis range is an array.
    const range: Layout = { xaxis2: { range: 'auto' } };
    // @ts-expect-error — not a barmode.
    const barmode: Layout = { barmode: 'stacked' };
    void [range, barmode];
  });

  it('types frames as partial traces', () => {
    const frame: Frame = {
      name: 'step 1',
      data: [{ y: [2, 3] }],
      layout: { 'xaxis.range': [0, 2] },
    };
    const figure: Figure = { data: [{ y: [1, 2] }], frames: [frame] };
    void figure;
  });
});

describe('the Plotly-style API', () => {
  it('checks figures passed to createChart, newPlot and react', () => {
    expectTypeOf(createChart).parameter(1).toEqualTypeOf<Figure | undefined>();
    expectTypeOf(createChart(el, { data: [{ type: 'bar', y: [1] }] })).toEqualTypeOf<Chart>();
    // @ts-expect-error — 'scater' is not a trace type.
    void createChart(el, { data: [{ type: 'scater' }] });
    void newPlot(
      el,
      [{ type: 'pie', values: [1, 2] }],
      { showlegend: false },
      { responsive: true },
    );
    // @ts-expect-error — a pie's hole is a number.
    void react(el, [{ type: 'pie', hole: 'big' }]);
    void addTraces(el, { type: 'histogram', x: [1, 2, 2] });
    void toImage({ data: [{ y: [1] }] }, { format: 'png' });
  });

  it('accepts figures from untyped sources: Express, chart.data, JSON', () => {
    const fig = express.scatter([{ a: 1, b: 2 }], { x: 'a', y: 'b' });
    fig.layout['barmode'] = 'stack';
    void createChart(el, fig);
    const chart = createChart(el);
    void react(el, { data: chart.data, layout: chart.layout });
  });

  it('takes attribute paths in restyle and relayout (untyped), whole attributes typed', () => {
    void restyle(el, { 'marker.color': 'red', opacity: [0.5, 1] }, [0, 1]);
    void relayout(el, { 'xaxis.range[0]': 2, title: { text: 'Zoomed' }, xaxis: null });
    // @ts-expect-error — a whole layout attribute is typed: a title is an object.
    void relayout(el, { title: 42 });
    // @ts-expect-error — numbered axes too: a range is an array.
    void relayout(el, { xaxis2: { range: 'auto' } });
  });

  it('types event payloads, Plotly aliases included', () => {
    const chart = createChart(el);
    chart.on('plotly_click', (event) => {
      expectTypeOf(event.points[0]?.curveNumber).toEqualTypeOf<number | undefined>();
    });
    chart.on('relayout', (update) =>
      expectTypeOf(update).toEqualTypeOf<Readonly<Record<string, unknown>>>(),
    );
    // @ts-expect-error — not an event.
    chart.on('plotly_clik', () => undefined);
  });
});

describe('partial bundles and plugins', () => {
  it('accepts any trace in the loose FigureInput', () => {
    const figure: FigureInput = {
      data: [{ type: 'my-plugin-trace', anything: [1, 2] }],
      layout: { xaxis: { type: 'log' }, legend: { anything: true } },
    };
    expectTypeOf<Figure>().toExtend<FigureInput>();
    expectTypeOf<Data>().toExtend<TraceInput>();
    void figure;
  });

  it("types a partial bundle's figures with its packages' unions", () => {
    const figure: FigureInput<TracesBasic> = { data: [{ type: 'bar', y: [1] }, { type: 'table' }] };
    // @ts-expect-error — traces-basic has no histogram trace.
    const missing: FigureInput<TracesBasic> = { data: [{ type: 'histogram' }] };
    void [figure, missing];
  });

  it('lets plugins add trace types to TraceTypes', () => {
    expectTypeOf<keyof TraceTypes>().toExtend<string>();
    expectTypeOf<'bar' | 'scatter' | 'bar3d'>().toExtend<keyof TraceTypes>();
  });
});
