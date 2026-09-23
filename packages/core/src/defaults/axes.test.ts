import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fixtureRegistry } from '../__fixtures__/modules.ts';
import { createRegistry } from '../registry/registry.ts';
import type { TraceModule } from '../registry/types.ts';
import { attr } from '../schema/attr.ts';
import { stripInternal } from '../util/objects.ts';
import { autoType, cleanDtick, cleanTick0 } from './axes.ts';
import { supplyDefaults } from './supply-defaults.ts';
import type { FigureInput, FullAxis } from './types.ts';

const quiet = { onIssue: () => {} };
const run = (figure: FigureInput) => supplyDefaults(figure, fixtureRegistry(), quiet);
const xaxis = (figure: FigureInput): FullAxis => run(figure).fullLayout.xaxis as FullAxis;
const yaxis = (figure: FigureInput): FullAxis => run(figure).fullLayout.yaxis as FullAxis;

describe('autoType (Plotly rules)', () => {
  it('detects multicategory from two-level arrays unless disabled', () => {
    expect(
      autoType([
        ['a', 'a', 'b'],
        ['x', 'y', 'x'],
      ]),
    ).toBe('multicategory');
    // Flattened, the same data is categorical.
    expect(autoType([['a', 'b'], ['c']], { noMultiCategory: true })).toBe('category');
    expect(autoType([[1, 2], 3], { noMultiCategory: true })).toBe('linear');
  });

  it('needs more than twice as many dates as numbers', () => {
    expect(autoType(['2024-01-01', '2024-02-01', 3])).toBe('linear');
    expect(autoType(['2024-01-01', '2024-02-01', '2024-03-01', 3])).toBe('date');
    expect(autoType([new Date(0), new Date(1)])).toBe('date');
  });

  it('counts distinct values only', () => {
    // One distinct number vs. two distinct strings → not "more than twice".
    expect(autoType([1, 1, 1, 'a', 'b'])).toBe('linear');
    expect(autoType(['a', 'a', 'a', 'a', 1])).toBe('linear');
    expect(autoType(['a', 'b', 'c', 1])).toBe('category');
  });

  it('ignores blanks and treats booleans as categories', () => {
    expect(autoType([null, '', undefined])).toBe('linear');
    expect(autoType([true, false, 1])).toBe('linear');
    expect(autoType([true, false, 'x'])).toBe('category');
  });

  it('handles numeric strings per autotypenumbers', () => {
    const data = ['1', '2', '3', '$1,000'];
    expect(autoType(data)).toBe('linear');
    expect(autoType(data, { autotypenumbers: 'convert types' })).toBe('linear');
    expect(autoType(data, { autotypenumbers: 'strict' })).toBe('category');
    expect(autoType([1, 2, '3'], { autotypenumbers: 'strict' })).toBe('linear');
  });

  it('treats typed arrays, empty and non-arrays as linear', () => {
    expect(autoType(new Float32Array([1, 2]))).toBe('linear');
    expect(autoType([])).toBe('linear');
    expect(autoType('abc')).toBe('linear');
  });

  it('samples at most ~1000 values of long arrays', () => {
    const long = Array.from({ length: 50_000 }, (_, i) => `c${i}`);
    expect(autoType(long)).toBe('category');
    const dates = Array.from({ length: 5000 }, (_, i) => new Date(i * 86_400_000));
    expect(autoType(dates)).toBe('date');
  });
});

describe('cleanDtick / cleanTick0 (Plotly cleanTicks)', () => {
  it('validates dtick per axis type', () => {
    expect(cleanDtick(undefined, 'linear')).toBe(1);
    expect(cleanDtick(undefined, 'date')).toBe(86_400_000);
    expect(cleanDtick(-2, 'linear')).toBe(1);
    expect(cleanDtick('2.5', 'linear')).toBe(2.5);
    expect(cleanDtick(2.4, 'category')).toBe(2);
    expect(cleanDtick(0.3, 'multicategory')).toBe(1);
    expect(cleanDtick(0.01, 'date')).toBe(0.1);
    expect(cleanDtick('M3', 'date')).toBe('M3');
    expect(cleanDtick('M1.5', 'date')).toBe(86_400_000);
    expect(cleanDtick('M3', 'linear')).toBe(1);
    expect(cleanDtick('L0.5', 'log')).toBe('L0.5');
    expect(cleanDtick('L-1', 'log')).toBe(1);
    expect(cleanDtick('D1', 'log')).toBe('D1');
    expect(cleanDtick('D2', 'log')).toBe('D2');
    expect(cleanDtick('D3', 'log')).toBe(1);
    expect(cleanDtick('X', 'log')).toBe(1);
    expect(cleanDtick({}, 'linear')).toBe(1);
  });

  it('validates tick0 per axis type', () => {
    expect(cleanTick0(undefined, 'date', 86_400_000)).toBe('2000-01-01');
    expect(cleanTick0(undefined, 'date', 7 * 86_400_000)).toBe('2000-01-02');
    expect(cleanTick0('2024-03-01 12:00', 'date', 'M1')).toBe('2024-03-01 12:00');
    expect(cleanTick0(0, 'date', 'M1')).toBe('1970-01-01');
    expect(cleanTick0(5, 'log', 'D1')).toBeUndefined();
    expect(cleanTick0('3', 'linear', 1)).toBe(3);
    expect(cleanTick0('x', 'linear', 1)).toBe(0);
  });
});

describe('supplyDefaults: axis defaults (E3)', () => {
  it('fills the rendering attributes with Plotly defaults', () => {
    const ax = xaxis({ data: [{ x: [1, 2], y: [1, 2] }] });
    expect(ax).toMatchObject({
      type: 'linear',
      visible: true,
      autorange: true,
      rangemode: 'normal',
      tickmode: 'auto',
      nticks: 0,
      ticks: '',
      ticklen: 5,
      tickwidth: 1,
      showline: false,
      showgrid: true,
      zeroline: true,
      showticklabels: true,
      tickangle: 'auto',
      autotickangles: [0, 30, 90],
      tickformat: '',
      hoverformat: '',
      exponentformat: 'B',
      showexponent: 'all',
      minexponent: 3,
      separatethousands: false,
      ticklabelmode: 'instant',
      ticklabelposition: 'outside',
      ticklabeloverflow: 'hide past div',
      ticklabelstep: 1,
      categoryorder: 'trace',
      mirror: false,
      side: 'bottom',
      layer: 'above traces',
      automargin: false,
      gridcolor: 'rgb(238, 238, 238)',
      griddash: 'solid',
      tickformatstops: [],
      title: { text: '' },
    });
    expect(yaxis({ data: [{ y: [1] }] }).side).toBe('left');
  });

  it('derives line, tick, zero-line and divider colors from `color`', () => {
    const ax = xaxis({
      data: [{ y: [1] }],
      layout: { xaxis: { color: 'red', tickcolor: 'blue' } },
    });
    expect(ax.linecolor).toBe('rgb(255, 0, 0)');
    expect(ax.zerolinecolor).toBe('rgb(255, 0, 0)');
    expect(ax.dividercolor).toBe('rgb(255, 0, 0)');
    expect(ax.tickcolor).toBe('rgb(0, 0, 255)');
    // Minor ticks follow the resolved major tick color.
    expect(ax.minor.tickcolor).toBe('rgb(0, 0, 255)');
  });

  it('inherits tick and title fonts from layout.font', () => {
    const ax = xaxis({
      data: [{ y: [1] }],
      layout: {
        font: { size: 10, family: 'Mono', color: 'green' },
        xaxis: { title: { text: 'T' } },
      },
    });
    expect(ax.tickfont).toEqual({
      family: 'Mono',
      size: 10,
      color: 'rgb(0, 128, 0)',
      weight: 'normal',
      style: 'normal',
    });
    expect(ax.title.font.size).toBe(12);
    // A changed axis color also colors its labels.
    const colored = xaxis({ data: [{ y: [1] }], layout: { xaxis: { color: 'red' } } });
    expect(colored.tickfont.color).toBe('rgb(255, 0, 0)');
    expect(colored.title.font.color).toBe('rgb(255, 0, 0)');
    const own = xaxis({ data: [{ y: [1] }], layout: { xaxis: { tickfont: { size: 20 } } } });
    expect(own.tickfont.size).toBe(20);
  });

  it('picks tickmode from tickvals / dtick', () => {
    expect(xaxis({ layout: { xaxis: { tickvals: [1, 2] } } }).tickmode).toBe('array');
    const lin = xaxis({ layout: { xaxis: { dtick: 2 } } });
    expect(lin).toMatchObject({ tickmode: 'linear', dtick: 2, tick0: 0 });
    expect(xaxis({ layout: { xaxis: { dtick: 2, tickmode: 'auto' } } }).tickmode).toBe('auto');
    expect(xaxis({ layout: { xaxis: { minor: { dtick: 0.5 } } } }).minor.tickmode).toBe('linear');
    expect(xaxis({ layout: { xaxis: { minor: { tickvals: [1] } } } }).minor.tickmode).toBe('array');
    expect(xaxis({}).minor.tickmode).toBe('auto');
  });

  it('cleans dtick and tick0 for linear tick modes by axis type', () => {
    const date = xaxis({ layout: { xaxis: { type: 'date', dtick: 'M1.5' } } });
    expect(date).toMatchObject({ tickmode: 'linear', dtick: 86_400_000, tick0: '2000-01-01' });
    const log = xaxis({ layout: { xaxis: { type: 'log', dtick: 'D2', tick0: 3 } } });
    expect(log.dtick).toBe('D2');
    expect(log.tick0).toBeUndefined();
    const minor = xaxis({
      layout: { xaxis: { type: 'log', minor: { dtick: 'L0.5', tick0: 'x' } } },
    });
    expect(minor.minor).toMatchObject({ dtick: 'L0.5', tick0: 0 });
    const minorD = xaxis({ layout: { xaxis: { type: 'log', minor: { dtick: 'D1', tick0: 1 } } } });
    expect(minorD.minor.tick0).toBeUndefined();
    // Without a minor tick0 the major one applies later.
    expect(xaxis({ layout: { xaxis: { minor: { dtick: 1 } } } }).minor.tick0).toBeUndefined();
  });

  it('defaults minor styles from the major ones', () => {
    const ax = xaxis({
      layout: {
        plot_bgcolor: 'black',
        xaxis: { ticklen: 10, tickwidth: 3, gridcolor: 'white', gridwidth: 2, griddash: 'dot' },
      },
    });
    expect(ax.minor).toMatchObject({
      ticklen: 6,
      tickwidth: 3,
      gridcolor: 'rgb(128, 128, 128)',
      gridwidth: 2,
      griddash: 'dot',
      showgrid: false,
      nticks: 5,
      ticks: '',
    });
  });

  it('defaults categoryorder to array when a categoryarray is given', () => {
    expect(xaxis({ layout: { xaxis: { categoryarray: ['b', 'a'] } } }).categoryorder).toBe('array');
    expect(xaxis({ layout: { xaxis: { categoryarray: [] } } }).categoryorder).toBe('trace');
    expect(
      xaxis({ layout: { xaxis: { categoryarray: ['b'], categoryorder: 'total descending' } } })
        .categoryorder,
    ).toBe('total descending');
  });

  it('defaults ticklabeloverflow from ticklabelposition', () => {
    expect(
      xaxis({ layout: { xaxis: { ticklabelposition: 'inside left' } } }).ticklabeloverflow,
    ).toBe('hide past domain');
  });

  it('derives autorange from full and partial ranges', () => {
    expect(xaxis({ layout: { xaxis: { range: [0, 5] } } }).autorange).toBe(false);
    expect(xaxis({ layout: { xaxis: { range: [null, 5] } } })).toMatchObject({
      autorange: 'min',
      range: [null, 5],
    });
    expect(xaxis({ layout: { xaxis: { range: [0, null] } } }).autorange).toBe('max');
    expect(xaxis({ layout: { xaxis: { range: [null, null] } } }).autorange).toBe(true);
    expect(
      xaxis({ layout: { xaxis: { range: [null, 5], autorange: 'reversed' } } }).autorange,
    ).toBe('max reversed');
    expect(
      xaxis({ layout: { xaxis: { range: [5, null], autorange: 'reversed' } } }).autorange,
    ).toBe('min reversed');
    expect(xaxis({ layout: { xaxis: { autorange: 'reversed' } } }).autorange).toBe('reversed');
    expect(xaxis({ layout: { xaxis: { range: [0, 5], autorange: 'max' } } }).autorange).toBe('max');
  });

  it('auto-types with autotypenumbers and skips empty traces', () => {
    const strings = { data: [{ x: ['1', '2', '3'], y: [1, 2, 3] }] };
    expect(xaxis(strings).type).toBe('linear');
    expect(xaxis({ ...strings, layout: { xaxis: { autotypenumbers: 'strict' } } }).type).toBe(
      'category',
    );
    const skip = {
      data: [
        { x: [], y: [1] },
        { x: ['a', 'b', 'c'], y: [1, 2, 3] },
      ],
    };
    expect(xaxis(skip).type).toBe('category');
    const hidden = { data: [{ x: ['a', 'b'], visible: false }, { x: [1, 2] }] };
    expect(xaxis(hidden).type).toBe('linear');
    const multi = {
      data: [
        {
          x: [
            ['g1', 'g1'],
            ['a', 'b'],
          ],
          y: [1, 2],
        },
      ],
    };
    expect(xaxis(multi).type).toBe('multicategory');
    expect(xaxis({ data: [{ y: [1] }], layout: { xaxis: { type: 'log' } } }).type).toBe('log');
  });

  it('types from x0 and keeps histogram count axes linear', () => {
    const line0: TraceModule = {
      type: 'line0',
      categories: ['cartesian'],
      schema: attr.object({
        y: attr.dataArray(),
        x0: attr.any({ dflt: 0 }),
        orientation: attr.enumerated({ values: ['v', 'h'], dflt: 'v' }),
      }),
      meta: { description: 'Index-positioned test trace.' },
      supplyDefaults(_in, _out, ctx) {
        ctx.coerce('y');
        ctx.coerce('x0');
        ctx.coerce('orientation');
      },
    };
    const histogram: TraceModule = { ...line0, type: 'histogram' };
    const registry = createRegistry().register(line0, histogram);
    const fl = (figure: FigureInput) => supplyDefaults(figure, registry, quiet).fullLayout;
    expect(fl({ data: [{ type: 'line0', y: [1], x0: '2024-01-01' }] }).xaxis?.type).toBe('date');
    // The default x0 (0) does not type the axis.
    expect(fl({ data: [{ type: 'line0', y: ['a', 'b', 'c'] }] }).xaxis?.type).toBe('linear');
    expect(fl({ data: [{ type: 'line0', y: ['a', 'b', 'c'] }] }).yaxis?.type).toBe('category');
    expect(fl({ data: [{ type: 'histogram', y: ['a', 'b', 'c'] }] }).yaxis?.type).toBe('linear');
    expect(
      fl({ data: [{ type: 'histogram', y: ['a', 'b', 'c'], orientation: 'h' }] }).yaxis?.type,
    ).toBe('category');
  });

  it('is idempotent for axes with dependent defaults', () => {
    const layouts = [
      { xaxis: { range: [null, 3], autorange: 'reversed', color: 'red' } },
      { xaxis: { type: 'date', dtick: 'M3', minor: { dtick: 'M1', ticks: 'outside' } } },
      { xaxis: { tickformatstops: [{ dtickrange: [null, 1000], value: '%H:%M' }] } },
      { xaxis: { categoryarray: ['b', 'a'], tickvals: [0, 1], ticktext: ['B', 'A'] } },
      { xaxis: { tickformatstops: [{ templateitemname: 'missing' }] } },
    ];
    for (const layout of layouts) {
      const first = run({ data: [{ y: [1] }], layout }).fullLayout;
      const second = run({ data: [{ y: [1] }], layout: stripInternal(first) }).fullLayout;
      expect(stripInternal(second)).toEqual(stripInternal(first));
    }
  });

  it('is idempotent for arbitrary tick settings (property)', () => {
    const dtick = fc.constantFrom(undefined, 0, -1, 2, 'M3', 'M0', 'L2', 'D1', 'D2', 'x', null);
    const tick0 = fc.constantFrom(undefined, 0, '2024-01-01', 'x', 5);
    const type = fc.constantFrom('-', 'linear', 'log', 'date', 'category');
    const range = fc.constantFrom(undefined, [0, 1], [null, 1], [1, null], [null, null]);
    fc.assert(
      fc.property(type, dtick, tick0, range, (t, d, t0, r) => {
        const layout = {
          xaxis: { type: t, dtick: d, tick0: t0, range: r, minor: { dtick: d, tick0: t0 } },
        };
        const first = run({ data: [{ x: [1, 2] }], layout }).fullLayout;
        const again = run({ data: [{ x: [1, 2] }], layout: stripInternal(first) }).fullLayout;
        expect(stripInternal(again)).toEqual(stripInternal(first));
      }),
      { numRuns: 200 },
    );
  });
});
