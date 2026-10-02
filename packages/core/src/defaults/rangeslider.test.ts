import { describe, expect, it } from 'vitest';
import { fixtureRegistry } from '../__fixtures__/modules.ts';
import { stripInternal } from '../util/objects.ts';
import { contrastShade, isFullRange, requestRangeslider } from './rangeslider.ts';
import { supplyDefaults } from './supply-defaults.ts';
import type { AnyFigure } from './types.ts';

const quiet = { onIssue: () => {} };
const run = (figure: AnyFigure) => supplyDefaults(figure, fixtureRegistry(), quiet).fullLayout;
const DATES = { type: 'scatter', x: ['2024-01-01', '2024-02-01', '2024-03-01'], y: [1, 2, 3] };

/** Stripped full output fed back in gives the same output (supply-defaults idempotence). */
function idempotent(figure: AnyFigure): void {
  const once = supplyDefaults(figure, fixtureRegistry(), quiet);
  const again = supplyDefaults(
    {
      data: stripInternal(once.fullData) as unknown[],
      layout: stripInternal(once.fullLayout) as Record<string, unknown>,
    },
    fixtureRegistry(),
    quiet,
  );
  expect(stripInternal(again.fullLayout)).toEqual(stripInternal(once.fullLayout));
}

describe('range slider defaults (E5.9)', () => {
  it('shows only when the input asks for it, and leaves other figures unchanged', () => {
    expect(run({ data: [DATES] }).xaxis).not.toHaveProperty('rangeslider');
    const rs = run({ data: [DATES], layout: { xaxis: { rangeslider: {} } } }).xaxis?.[
      'rangeslider'
    ] as Record<string, unknown>;
    expect(rs).toMatchObject({
      visible: true,
      thickness: 0.15,
      bgcolor: 'rgb(255, 255, 255)',
      bordercolor: 'rgb(68, 68, 68)',
      borderwidth: 0,
      autorange: true,
      yaxis: { rangemode: 'match' },
    });
    // A template cannot turn it on; an explicit `visible: false` stays in the output.
    const off = run({
      data: [DATES],
      layout: {
        template: { layout: { xaxis: { rangeslider: { visible: true } } } },
        xaxis: { rangeslider: { visible: false } },
      },
    }).xaxis;
    expect(off?.['rangeslider']).toEqual({ visible: false });
    expect(
      run({ data: [DATES], layout: { template: { layout: { xaxis: { rangeslider: {} } } } } })
        .xaxis,
    ).not.toHaveProperty('rangeslider');
  });

  it('turns autorange off for a full range and fixes y axes anchored to it', () => {
    const fl = run({
      data: [DATES],
      layout: {
        plot_bgcolor: '#101010',
        xaxis: { rangeslider: { range: ['2024-01-01', '2024-06-01'] } },
      },
    });
    expect(fl.xaxis?.['rangeslider']).toMatchObject({
      autorange: false,
      bgcolor: 'rgb(16, 16, 16)',
    });
    expect(fl.yaxis?.fixedrange).toBe(true);
    expect(
      run({ data: [DATES], layout: { xaxis: { rangeslider: {} }, yaxis: { fixedrange: false } } })
        .yaxis?.fixedrange,
    ).toBe(false);
    expect(run({ data: [DATES] }).yaxis?.fixedrange).toBe(false);
  });

  it('adds one thumbnail y container per subplot on the axis', () => {
    const fl = run({
      data: [DATES, { ...DATES, yaxis: 'y2' }, { ...DATES, xaxis: 'x2', yaxis: 'y3' }],
      layout: {
        xaxis: { rangeslider: { yaxis2: { range: [0, 5] }, yaxis3: { rangemode: 'auto' } } },
        yaxis2: { overlaying: 'y' },
      },
    });
    const rs = fl.xaxis?.['rangeslider'] as Record<string, unknown>;
    expect(rs['yaxis']).toEqual({ rangemode: 'match' });
    expect(rs['yaxis2']).toEqual({ rangemode: 'fixed', range: [0, 5] });
    // y3 is not on x: dropped.
    expect(rs).not.toHaveProperty('yaxis3');
  });

  it('shows by default on the x axis of a trace that requests it (ohlc, candlestick)', () => {
    // A trace type whose defaults ask for a range slider, as Plotly's financial traces do.
    const registry = fixtureRegistry();
    const scatter = registry.getModule('scatter')!;
    registry.register({
      ...scatter,
      type: 'finance',
      supplyDefaults(traceIn, traceOut, ctx) {
        scatter.supplyDefaults(traceIn, traceOut, ctx);
        requestRangeslider(ctx.fullLayout, String(traceOut['xaxis']));
      },
    });
    const finance = { ...DATES, type: 'finance', xaxis: 'x2', yaxis: 'y2' };
    const layout = (figure: AnyFigure) => supplyDefaults(figure, registry, quiet).fullLayout;
    const fl = layout({ data: [DATES, finance] });
    expect(fl.xaxis).not.toHaveProperty('rangeslider');
    expect(fl['xaxis2']).toMatchObject({ rangeslider: { visible: true, autorange: true } });
    // Its y axis is fixed, as under any range slider (Plotly).
    expect(fl['yaxis2']).toMatchObject({ fixedrange: true });
    expect(fl['yaxis']).toMatchObject({ fixedrange: false });
    // The input still decides.
    const off = layout({
      data: [finance],
      layout: { xaxis2: { rangeslider: { visible: false } } },
    });
    expect(off['xaxis2']).toMatchObject({ rangeslider: { visible: false } });
    // A hidden trace asks for nothing (its defaults don't run).
    expect(layout({ data: [{ ...finance, visible: false }] })['xaxis2']).not.toHaveProperty(
      'rangeslider',
    );
  });

  it('is idempotent', () => {
    idempotent({
      data: [DATES, { ...DATES, yaxis: 'y2' }],
      layout: { xaxis: { rangeslider: { thickness: 0.2, yaxis2: { rangemode: 'auto' } } } },
    });
  });

  it("does not let a partial thumbnail range hide the template's full one", () => {
    // Nightly regression (seed 360598440): `range: []` shadowed the template's range, then was
    // dropped, so the output fed back in took the template's.
    const figure: AnyFigure = {
      data: [DATES],
      layout: {
        template: { layout: { xaxis: { rangeslider: { yaxis: { range: [0, 9] } } } } },
        xaxis: { rangeslider: { yaxis: { rangemode: 'auto', range: [] } } },
      },
    };
    const rs = run(figure).xaxis?.['rangeslider'] as Record<string, unknown>;
    expect(rs['yaxis']).toEqual({ rangemode: 'auto', range: [0, 9] });
    idempotent(figure);
  });
});

describe('range selector defaults (E5.9)', () => {
  const buttons = [{ count: 1, step: 'month' }, { step: 'all' }];

  it('shows on date axes with buttons, placed above the highest subplot on the axis', () => {
    const fl = run({
      data: [DATES],
      layout: {
        font: { size: 14, color: '#123456' },
        xaxis: { domain: [0.1, 0.9], rangeselector: { buttons } },
        yaxis: { domain: [0, 0.8] },
      },
    });
    const sel = fl.xaxis?.['rangeselector'] as Record<string, unknown>;
    expect(sel).toMatchObject({
      visible: true,
      x: 0.1,
      xanchor: 'left',
      yanchor: 'bottom',
      bgcolor: 'rgb(238, 238, 238)',
      activecolor: 'rgb(213, 213, 213)',
      borderwidth: 0,
      font: { size: 14, color: 'rgb(18, 52, 86)' },
    });
    expect(sel['y']).toBeCloseTo(0.82, 12);
    expect((sel['buttons'] as Record<string, unknown>[])[0]).toMatchObject({
      visible: true,
      step: 'month',
      stepmode: 'backward',
      count: 1,
    });
    // Not on numeric axes, and not without buttons.
    expect(
      run({
        data: [{ type: 'scatter', x: [1, 2], y: [1, 2] }],
        layout: { xaxis: { rangeselector: { buttons } } },
      }).xaxis,
    ).not.toHaveProperty('rangeselector');
    expect(
      run({ data: [DATES], layout: { xaxis: { rangeselector: {} } } }).xaxis,
    ).not.toHaveProperty('rangeselector');
  });

  it('takes x and y together (Plotly noneOrAll), or a template position without either', () => {
    const lone = run({ data: [DATES], layout: { xaxis: { rangeselector: { buttons, x: 0.5 } } } });
    expect(lone.xaxis?.['rangeselector']).toMatchObject({ x: 0, y: 1.02 });
    const both = run({
      data: [DATES],
      layout: { xaxis: { rangeselector: { buttons, x: 0.5, y: 1.1 } } },
    });
    expect(both.xaxis?.['rangeselector']).toMatchObject({ x: 0.5, y: 1.1 });
    const templated = run({
      data: [DATES],
      layout: {
        template: { layout: { xaxis: { rangeselector: { x: 1, xanchor: 'right' } } } },
        xaxis: { rangeselector: { buttons } },
      },
    });
    expect(templated.xaxis?.['rangeselector']).toMatchObject({ x: 1, y: 1.02, xanchor: 'right' });
  });

  it('is idempotent', () => {
    idempotent({
      data: [DATES],
      layout: { xaxis: { rangeselector: { buttons, bgcolor: '#222' } } },
    });
  });
});

describe('helpers', () => {
  it("contrastShade follows Plotly's Color.contrast(color, 25, 10)", () => {
    expect(contrastShade('#eee', 25, 10)).toBe('rgb(213, 213, 213)');
    expect(contrastShade('#000', 25, 10)).toBe('rgb(64, 64, 64)');
  });

  it('isFullRange needs two set values', () => {
    expect(isFullRange([0, 1])).toBe(true);
    expect(isFullRange([0, null])).toBe(false);
    expect(isFullRange(undefined)).toBe(false);
  });
});

describe('selections defaults (E5.12)', () => {
  it('default the type from path and drop an empty list', () => {
    expect(run({ data: [DATES] })).not.toHaveProperty('selections');
    expect(run({ data: [DATES], layout: { selections: [] } })).not.toHaveProperty('selections');
    const list = run({
      data: [DATES],
      layout: {
        selections: [
          { x0: 1, x1: 2, y0: 3, y1: 4, path: '' },
          { path: 'M0,0L1,0L1,1Z' },
          { type: 'rect', path: 'M0,0L1,0L1,1Z', x0: 0 },
        ],
      },
    })['selections'] as Record<string, unknown>[];
    expect(list[0]).toMatchObject({ type: 'rect', xref: 'x', yref: 'y', opacity: 0.7 });
    expect(list[0]?.['line']).toEqual({ width: 1, dash: 'dot' });
    expect(list[1]).toMatchObject({ type: 'path', path: 'M0,0L1,0L1,1Z' });
    expect(list[2]).not.toHaveProperty('path');
  });

  it('is idempotent', () => {
    idempotent({
      data: [DATES],
      layout: { selections: [{ x0: 1, x1: 2, y0: 3, y1: 4 }, { path: 'M0,0L1,0L1,1Z' }] },
    });
  });
});
