import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { fixtureRegistry } from '../__fixtures__/modules.ts';
import { DEFAULT_COLORWAY } from '../layout/schema.ts';
import { stripInternal } from '../util/objects.ts';
import { ValidationError } from '../validate/issues.ts';
import { autoType } from './axes.ts';
import { supplyDefaults } from './supply-defaults.ts';
import type { FigureInput } from './types.ts';

const quiet = { onIssue: () => {} };
const run = (figure: FigureInput) => supplyDefaults(figure, fixtureRegistry(), quiet);

describe('supplyDefaults: layout', () => {
  it('fills every base layout attribute with canonical defaults', () => {
    const { fullLayout } = run({});
    expect(fullLayout.width).toBe(700);
    expect(fullLayout.height).toBe(450);
    expect(fullLayout.margin).toEqual({ l: 80, r: 80, t: 100, b: 80, pad: 0, autoexpand: true });
    expect(fullLayout.paper_bgcolor).toBe('rgb(255, 255, 255)');
    expect(fullLayout.font.color).toBe('rgb(68, 68, 68)');
    expect(fullLayout.colorway).toHaveLength(10);
    expect(fullLayout.hovermode).toBe('closest');
    expect(fullLayout.transition).toEqual({
      duration: 500,
      easing: 'cubic-in-out',
      ordering: 'layout first',
    });
    expect(fullLayout.template).toBeNull();
    expect(fullLayout.showlegend).toBe(false);
  });

  it('title.font inherits from layout.font with 1.4× size', () => {
    const { fullLayout } = run({
      layout: { font: { size: 10, color: 'red' }, title: { text: 'T' } },
    });
    expect(fullLayout.title.font).toEqual({
      family: fullLayout.font.family,
      size: 14,
      color: 'rgb(255, 0, 0)',
      weight: 'normal',
      style: 'normal',
      variant: 'normal',
      textcase: 'normal',
      lineposition: 'none',
      shadow: 'none',
    });
    const own = run({ layout: { title: { font: { size: 30 } } } }).fullLayout;
    expect(own.title.font.size).toBe(30);
  });

  it('invalid values fall back to defaults; numeric strings are coerced', () => {
    const { fullLayout } = run({ layout: { width: 'wide', height: '300', hovermode: 'nearest' } });
    expect(fullLayout.width).toBe(700);
    expect(fullLayout.height).toBe(300);
    expect(fullLayout.hovermode).toBe('closest');
  });

  it('does not mutate the input', () => {
    const layout = { title: { text: 'x' }, xaxis: { range: [0, 1] } };
    const data = [{ y: [1, 2], marker: { color: 'red' } }];
    const snapshot = JSON.stringify({ layout, data });
    run({ data, layout });
    expect(JSON.stringify({ layout, data })).toBe(snapshot);
  });
});

describe('supplyDefaults: traces', () => {
  it('applies conditional defaults based on mode', () => {
    const { fullData } = run({
      data: [
        { y: [1, 2, 3], mode: 'lines' },
        { y: [1, 2, 3], mode: 'markers' },
        { y: [1, 2, 3], mode: 'text', text: 'hi' },
      ],
    });
    const [lines, markers, text] = fullData;
    expect(lines?.['marker']).toBeUndefined();
    expect(lines?.['line']).toEqual({ color: 'rgb(31, 119, 180)', width: 2, dash: 'solid' });
    expect(markers?.['line']).toBeUndefined();
    expect(markers?.['marker']).toMatchObject({
      size: 6,
      symbol: 'circle',
      color: 'rgb(255, 127, 14)',
    });
    expect(markers?.['marker']).toHaveProperty('line', { width: 0 });
    expect(text?.['text']).toBe('hi');
    expect(text?.['textfont']).toMatchObject({ size: 12, color: 'rgb(68, 68, 68)' });
  });

  it('derives mode from data length', () => {
    const short = run({ data: [{ y: [1, 2] }] }).fullData[0];
    const long = run({ data: [{ y: Array.from({ length: 30 }, (_, i) => i) }] }).fullData[0];
    expect(short?.['mode']).toBe('lines+markers');
    expect(long?.['mode']).toBe('lines');
  });

  it('cycles the colorway by trace index, across types', () => {
    const data = Array.from({ length: 12 }, (_, i) => ({
      type: i % 2 ? 'bar' : 'scatter',
      y: [i],
    }));
    const { fullData } = run({ data });
    const colors = fullData.map(
      (t) =>
        (t['marker'] as { color: string } | undefined)?.color ??
        (t['line'] as { color: string }).color,
    );
    const expected = DEFAULT_COLORWAY.map(
      (c) => run({ layout: { colorway: [c] } }).fullLayout.colorway[0],
    );
    expect(colors.slice(0, 10)).toEqual(expected);
    expect(colors[10]).toBe(expected[0]);
    expect(colors[11]).toBe(expected[1]);
  });

  it('respects a custom colorway and explicit colors', () => {
    const { fullData } = run({
      data: [
        { y: [1], mode: 'markers' },
        { y: [1], mode: 'markers', marker: { color: 'gold' } },
      ],
      layout: { colorway: ['#000', '#fff'] },
    });
    expect((fullData[0]?.['marker'] as { color: string }).color).toBe('rgb(0, 0, 0)');
    expect((fullData[1]?.['marker'] as { color: string }).color).toBe('rgb(255, 215, 0)');
  });

  it('keeps per-point arrays by reference', () => {
    const sizes = new Float32Array([1, 2, 3]);
    const colors = ['red', 'green', 'blue'];
    const y = [1, 2, 3];
    const { fullData } = run({
      data: [{ y, mode: 'markers', marker: { size: sizes, color: colors } }],
    });
    const marker = fullData[0]?.['marker'] as { size: unknown; color: unknown };
    expect(marker.size).toBe(sizes);
    expect(marker.color).toBe(colors);
    expect(fullData[0]?.['y']).toBe(y);
  });

  it('keeps back-references and common attributes', () => {
    const input = { y: [1], name: 'A', uid: 'a1' };
    const { fullData } = run({ data: [input, { y: [2] }] });
    expect(fullData[0]).toMatchObject({
      _index: 0,
      name: 'A',
      uid: 'a1',
      visible: true,
      opacity: 1,
    });
    expect(fullData[0]?._input).toBe(input);
    expect(fullData[0]?._module?.type).toBe('scatter');
    expect(fullData[1]?.name).toBe('trace 1');
    expect(fullData[1]?.uid).toBeUndefined();
  });

  it('defaults type to scatter and hides unknown types', () => {
    const { fullData } = run({ data: [{ y: [1] }, { type: 'scater', y: [1] }, 'junk' as never] });
    expect(fullData[0]?.type).toBe('scatter');
    expect(fullData[1]).toMatchObject({ type: 'scater', visible: false, _module: undefined });
    expect(fullData[2]?.type).toBe('scatter');
  });

  it('skips module defaults for invisible traces', () => {
    const { fullData } = run({ data: [{ y: [1], visible: false, mode: 'markers' }] });
    expect(fullData[0]?.visible).toBe(false);
    expect(fullData[0]?.['marker']).toBeUndefined();
    expect(fullData[0]?.['xaxis']).toBe('x');
  });

  it('coerces module-owned layout attributes only when that trace type is present', () => {
    expect(run({ data: [{ y: [1] }] }).fullLayout['barmode']).toBeUndefined();
    const withBar = run({ data: [{ type: 'bar', y: [1] }], layout: { barmode: 'stack' } });
    expect(withBar.fullLayout['barmode']).toBe('stack');
    expect(withBar.fullLayout['bargap']).toBe(0.2);
  });

  it('showlegend defaults to true only with more than one legend entry', () => {
    expect(run({ data: [{ y: [1] }] }).fullLayout.showlegend).toBe(false);
    expect(run({ data: [{ y: [1] }, { y: [2] }] }).fullLayout.showlegend).toBe(true);
    expect(run({ data: [{ y: [1] }, { type: 'gauge' }] }).fullLayout.showlegend).toBe(false);
    expect(run({ data: [{ y: [1] }, { y: [2], showlegend: false }] }).fullLayout.showlegend).toBe(
      false,
    );
    expect(run({ data: [{ y: [1] }], layout: { showlegend: true } }).fullLayout.showlegend).toBe(
      true,
    );
  });
});

describe('supplyDefaults: subplot discovery', () => {
  it('creates axes for referenced subplots and records _subplots', () => {
    const { fullLayout } = run({
      data: [{ y: [1] }, { y: [1], xaxis: 'x2', yaxis: 'y2' }, { y: [1], yaxis: 'y3' }],
      layout: { xaxis2: { domain: [0.5, 1] } },
    });
    expect(fullLayout._subplots).toEqual({
      cartesian: ['xy', 'x2y2', 'xy3'],
      xaxis: ['x', 'x2'],
      yaxis: ['y', 'y2', 'y3'],
    });
    expect(fullLayout['xaxis2']).toMatchObject({
      type: 'linear',
      autorange: true,
      domain: [0.5, 1],
      anchor: 'y2',
      _id: 'x2',
      _name: 'xaxis2',
    });
    expect(fullLayout['yaxis3']).toMatchObject({ anchor: 'x', domain: [0, 1] });
    expect(fullLayout['xaxis3']).toBeUndefined();
  });

  it('keeps layout-declared axes and shows blank axes for an empty figure', () => {
    const { fullLayout } = run({ data: [], layout: { yaxis4: { type: 'log' } } });
    expect(fullLayout._subplots.cartesian).toEqual(['xy']);
    expect(fullLayout._subplots.yaxis).toEqual(['y', 'y4']);
    expect(fullLayout['yaxis4']).toMatchObject({ type: 'log', anchor: 'x' });
  });

  it('has no cartesian axes when only non-cartesian traces are shown', () => {
    const { fullLayout } = run({ data: [{ type: 'gauge', value: 3 }] });
    expect(fullLayout._subplots).toEqual({ cartesian: [], xaxis: [], yaxis: [] });
    expect(fullLayout.xaxis).toBeUndefined();
  });

  it('a given range turns autorange off unless autorange is set', () => {
    const { fullLayout } = run({
      data: [{ y: [1] }],
      layout: { xaxis: { range: [0, 5] }, yaxis: { range: [0, 5], autorange: true } },
    });
    expect(fullLayout.xaxis).toMatchObject({ range: [0, 5], autorange: false });
    expect(fullLayout.yaxis).toMatchObject({ range: [0, 5], autorange: true });
  });

  it('auto-types axes from the first trace data', () => {
    const { fullLayout } = run({
      data: [{ x: ['a', 'b'], y: ['2024-01-01', '2024-02-01'] }],
    });
    expect(fullLayout.xaxis?.type).toBe('category');
    expect(fullLayout.yaxis?.type).toBe('date');
    expect(autoType(new Float64Array(2))).toBe('linear');
    expect(autoType([1, 2, 'x'])).toBe('linear');
    // Plotly: more than twice as many distinct strings as numbers.
    expect(autoType([1, 'x', 'y'])).toBe('linear');
    expect(autoType([1, 'x', 'y', 'z'])).toBe('category');
    expect(autoType([new Date(0), null])).toBe('date');
    expect(autoType(undefined)).toBe('linear');
  });
});

describe('supplyDefaults: datasets (E1.6)', () => {
  it('resolves @column references by reference and keeps _input untouched', () => {
    const revenue = new Float64Array([3, 4]);
    const input = { dataset: 'sales', x: '@date', y: '@revenue', mode: 'markers' };
    const { fullData, issues } = run({
      data: [input],
      datasets: { sales: { date: ['2024-01-01', '2024-02-01'], revenue } },
    });
    expect(issues).toEqual([]);
    expect(fullData[0]?.['y']).toBe(revenue);
    expect(fullData[0]?.['x']).toEqual(['2024-01-01', '2024-02-01']);
    expect(fullData[0]?._input).toBe(input);
  });

  it('reports unknown columns through validation', () => {
    const { issues, fullData } = run({
      data: [{ dataset: 'sales', y: '@revenu' }],
      datasets: { sales: { revenue: [1] } },
    });
    expect(issues.map((i) => i.path)).toEqual(['data[0].y']);
    expect(fullData[0]?.['y']).toBeUndefined();
  });
});

describe('supplyDefaults: config & validation', () => {
  it('fills config defaults', () => {
    const { fullConfig } = run({ config: { responsive: true } });
    expect(fullConfig.responsive).toBe(true);
    expect(fullConfig.displayModeBar).toBe('hover');
    expect(fullConfig.scrollZoom).toBe('scene+geo+map');
    expect(fullConfig.edits.titleText).toBe(false);
    expect(fullConfig.toImageButtonOptions).toEqual({
      format: 'png',
      filename: 'newplot',
      scale: 1,
    });
    expect(fullConfig.strict).toBe(false);
  });

  it('reports issues; warns once per path by default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const registry = fixtureRegistry();
    const figure = { data: [{ y: [1], mode: 'line', marker: { colr: 'red' } }] };
    const { issues } = supplyDefaults(figure, registry);
    supplyDefaults(figure, registry);
    expect(issues.map((i) => i.path)).toEqual(['data[0].mode', 'data[0].marker.colr']);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]?.[0]).toContain("did you mean 'color'?");
    warn.mockRestore();
  });

  it('strict mode throws on the first error', () => {
    const figure = { data: [{ y: [1], opacity: 7 }], config: { strict: true } };
    expect(() => supplyDefaults(figure, fixtureRegistry())).toThrow(ValidationError);
    try {
      supplyDefaults(figure, fixtureRegistry());
    } catch (e) {
      expect((e as ValidationError).issue.path).toBe('data[0].opacity');
    }
    // Deprecation notices alone don't throw.
    const deprecated = { data: [{ y: [1], legacy: 3 }], config: { strict: true } };
    expect(() => supplyDefaults(deprecated, fixtureRegistry(), quiet)).not.toThrow();
  });
});

describe('supplyDefaults: idempotency (E20.2 property test)', () => {
  const color = fc.constantFrom('red', '#123', 'rgba(1,2,3,0.5)', 'nope', 7);
  const trace = fc.record(
    {
      type: fc.constantFrom('scatter', 'bar', 'gauge', 'nope'),
      y: fc.array(fc.oneof(fc.integer(), fc.constantFrom('a', '2024-01-01')), { maxLength: 25 }),
      mode: fc.constantFrom('lines', 'markers', 'lines+markers+text', 'none', 'bad'),
      name: fc.string({ maxLength: 5 }),
      opacity: fc.oneof(fc.double({ min: -1, max: 2, noNaN: true }), fc.constant('0.5')),
      xaxis: fc.constantFrom('x', 'x2', 'x1', 'bad'),
      yaxis: fc.constantFrom('y', 'y3'),
      visible: fc.constantFrom(true, false, 'legendonly'),
      marker: fc.record(
        { color, size: fc.oneof(fc.nat(20), fc.constant(-1)) },
        { requiredKeys: [] },
      ),
      line: fc.record({ color, width: fc.nat(5) }, { requiredKeys: [] }),
      textfont: fc.record({ size: fc.nat(30) }, { requiredKeys: [] }),
    },
    { requiredKeys: [] },
  );
  const layout = fc.record(
    {
      width: fc.oneof(fc.nat(2000), fc.constant('x')),
      font: fc.record({ size: fc.nat(40), color }, { requiredKeys: [] }),
      title: fc.record(
        { text: fc.string(), y: fc.constantFrom('auto', 0.9, 2) },
        { requiredKeys: [] },
      ),
      colorway: fc.constantFrom(['red', 'blue'], ['#000'], 'bad'),
      xaxis: fc.record({ range: fc.constantFrom([0, 1], ['a', 'b'], 'bad') }, { requiredKeys: [] }),
      yaxis2: fc.record({ domain: fc.constantFrom([0, 0.5], [0.2]) }, { requiredKeys: [] }),
      barmode: fc.constantFrom('stack', 'bad'),
      annotations: fc.array(fc.record({ text: fc.string(), x: fc.nat() }, { requiredKeys: [] }), {
        maxLength: 3,
      }),
      template: fc.constantFrom(undefined, {
        layout: { font: { size: 20 }, annotations: [{ name: 'wm', text: 'W' }] },
        data: { scatter: [{ marker: { size: 9 } }, { mode: 'markers' }] },
      }),
    },
    { requiredKeys: [] },
  );

  it('running defaults on the (stripped) output reproduces the output', () => {
    fc.assert(
      fc.property(fc.array(trace, { maxLength: 5 }), layout, (data, layoutIn) => {
        const registry = fixtureRegistry();
        const first = supplyDefaults({ data, layout: layoutIn }, registry, quiet);
        const again = supplyDefaults(
          {
            data: stripInternal(first.fullData) as unknown[],
            layout: stripInternal(first.fullLayout),
          },
          registry,
          quiet,
        );
        expect(stripInternal(again.fullData)).toEqual(stripInternal(first.fullData));
        expect(stripInternal(again.fullLayout)).toEqual(stripInternal(first.fullLayout));
      }),
      { numRuns: 200 },
    );
  });

  it('is deterministic and never throws on arbitrary input (non-strict)', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), fc.anything(), (data, layoutIn, config) => {
        const fig = { data: data as unknown[], layout: layoutIn, config };
        let a;
        try {
          a = supplyDefaults(fig, fixtureRegistry(), quiet);
        } catch (e) {
          // Only strict mode may throw.
          expect(e).toBeInstanceOf(ValidationError);
          return;
        }
        const b = supplyDefaults(fig, fixtureRegistry(), quiet);
        expect(stripInternal(b.fullLayout)).toEqual(stripInternal(a.fullLayout));
      }),
      { numRuns: 300 },
    );
  });
});
