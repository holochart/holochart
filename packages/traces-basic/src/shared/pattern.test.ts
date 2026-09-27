import { supplyDefaults, toRGBA } from '@mk7s/holochart-core';
import {
  createResourceManager,
  IDENTITY_TRANSFORM,
  type RectPrimitive,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type CalcContext,
  type TracePlotContext,
} from '@mk7s/holochart-runtime';
import { describe, expect, it, vi } from 'vitest';
import { bar, type BarCalc } from '../bar/index.ts';
import { barStyle } from '../bar/style.ts';
import { pie } from '../pie/index.ts';
import { build } from '../pie/__testing__/build.ts';
import { pieArcs } from '../pie/plot.ts';
import { scatter } from '../scatter/index.ts';
import { fillPaint } from '../scatter/fill-trace.ts';
import { patternFill } from './pattern.ts';

/**
 * Pattern fills (plan E8.10) on the trace side: the attributes and Plotly's `coercePattern`
 * defaults, and the render layer's `PatternFill` of bars, pie slices, scatter fills and legend
 * glyphs (render resolves the colors per item; see `render/src/primitives/pattern.test.ts`).
 */

const registry = createChartRegistry().register(bar, pie, scatter);

function defaults(data: unknown[], layout: Record<string, unknown> = {}) {
  return supplyDefaults({ data, layout }, registry.core);
}

describe('pattern defaults (Plotly coercePattern)', () => {
  it('coerces the rest of the pattern only with a shape', () => {
    const { fullData } = defaults([
      { type: 'bar', y: [1, 2], marker: { pattern: { shape: '/' } } },
      { type: 'bar', y: [1, 2], marker: { pattern: { shape: '', size: 20 } } },
      { type: 'bar', y: [1, 2] },
    ]);
    const pattern = (i: number) =>
      (fullData[i]!['marker'] as { pattern?: Record<string, unknown> }).pattern;
    expect(pattern(0)).toEqual({ shape: '/', fillmode: 'replace', size: 8, solidity: 0.3 });
    expect(pattern(1)).toEqual({ shape: '' });
    expect(pattern(2)).toBeUndefined();
  });

  it('keeps arrayOk values and validates the rest', () => {
    const { fullData } = defaults([
      {
        type: 'bar',
        y: [1, 2],
        marker: {
          pattern: {
            shape: ['x', '.'],
            size: [4, 12],
            solidity: 2,
            fillmode: 'overlay',
            fgcolor: 'red',
            fgopacity: 0.8,
          },
        },
      },
    ]);
    expect((fullData[0]!['marker'] as { pattern: unknown }).pattern).toEqual({
      shape: ['x', '.'],
      size: [4, 12],
      solidity: 0.3,
      fillmode: 'overlay',
      fgcolor: 'rgb(255, 0, 0)',
      fgopacity: 0.8,
    });
  });

  it('takes pattern defaults from templates (Plotly templates overlay patterns)', () => {
    const template = {
      data: { bar: [{ marker: { pattern: { fillmode: 'overlay', size: 10, solidity: 0.2 } } }] },
    };
    const { fullData } = defaults([{ type: 'bar', y: [1], marker: { pattern: { shape: '+' } } }], {
      template,
    });
    expect((fullData[0]!['marker'] as { pattern: unknown }).pattern).toEqual({
      shape: '+',
      fillmode: 'overlay',
      size: 10,
      solidity: 0.2,
    });
  });

  it('coerces fillpattern on filled scatter traces only, and pie marker.pattern', () => {
    const { fullData } = defaults([
      { type: 'scatter', y: [1, 2], fill: 'tozeroy', fillpattern: { shape: '|' } },
      { type: 'scatter', y: [1, 2], fillpattern: { shape: '|' } },
      { type: 'pie', values: [1, 2], marker: { pattern: { shape: '.', solidity: 0.5 } } },
    ]);
    expect(fullData[0]!['fillpattern']).toEqual({
      shape: '|',
      fillmode: 'replace',
      size: 8,
      solidity: 0.3,
    });
    expect(fullData[1]!['fillpattern']).toBeUndefined();
    expect((fullData[2]!['marker'] as { pattern: unknown }).pattern).toEqual({
      shape: '.',
      fillmode: 'replace',
      size: 8,
      solidity: 0.5,
    });
  });
});

describe('patternFill', () => {
  it('is null without a shape (primitives keep their plain shaders)', () => {
    expect(patternFill(undefined, [1, 0, 0, 1])).toBeNull();
    expect(patternFill({ shape: '' }, [1, 0, 0, 1])).toBeNull();
    const fill = patternFill({ shape: '/' }, [1, 0, 0, 1], 0.5, '#000');
    expect(fill).toMatchObject({ color: [1, 0, 0, 1], opacity: 0.5, background: '#000' });
    expect(fill!.parse('red')).toEqual([1, 0, 0, 1]);
  });
});

describe('bar patterns', () => {
  it('passes the pattern with the bar colors before opacity and each bar opacity', () => {
    const { fullData, fullLayout } = defaults([
      {
        type: 'bar',
        y: [1, 2],
        marker: { color: ['red', 'blue'], opacity: [1, 0.5], pattern: { shape: ['/', ''] } },
      },
    ]);
    const style = barStyle(fullData[0]!, 2, new Set([0]), fullLayout);
    const pattern = style.pattern!;
    expect(pattern.pattern).toBe((fullData[0]!['marker'] as { pattern: unknown }).pattern);
    expect([...(pattern.color as Float32Array)]).toEqual([1, 0, 0, 1, 0, 0, 1, 1]);
    // The second bar is unselected: dimmed like its fill.
    expect([...(pattern.opacity as Float32Array)].map((v) => +v.toFixed(3))).toEqual([1, 0.1]);
    expect(pattern.background).toBe(fullLayout.plot_bgcolor);
    expect(barStyle(defaults([{ type: 'bar', y: [1] }]).fullData[0]!, 1).pattern).toBeNull();
  });

  it('draws the pattern with the bars, and restyles it', () => {
    const { fullData, fullLayout } = defaults([
      { type: 'bar', x: ['a', 'b'], y: [1, 3], marker: { pattern: { shape: 'x' } } },
    ]);
    const trace = fullData[0]!;
    const calc = bar.calc!(trace, { fullLayout, index: 0 } as unknown as CalcContext) as BarCalc;
    const added: unknown[] = [];
    const ctx = {
      trace,
      calc,
      index: 0,
      fullLayout,
      transform: { ...IDENTITY_TRANSFORM, scaleX: 100, scaleY: 50 },
      primitives: { resources: createResourceManager(), invalidate: vi.fn() },
      add: (p: unknown) => (added.push(p), p),
      remove: vi.fn(),
      invalidate: vi.fn(),
    } as unknown as TracePlotContext<BarCalc>;
    const view = bar.plot!.create(ctx);
    const rects = added[0] as RectPrimitive;
    const data = (rects as unknown as { data: { pattern: unknown } }).data;
    expect(data.pattern).toMatchObject({ pattern: { shape: 'x' } });
    const update = vi.spyOn(rects, 'update');
    view.update(ctx, { calc: false, plot: false, style: true, transform: false });
    expect(update.mock.calls[0]![0]).toHaveProperty('pattern');
    rects.dispose();
  });

  it("puts the trace's pattern on its legend glyph", () => {
    const { fullData } = defaults([
      { type: 'bar', y: [1], marker: { color: 'red', pattern: { shape: '.', size: [4] } } },
      { type: 'bar', y: [1], marker: { pattern: { shape: '' } } },
    ]);
    expect(bar.legendIcon!(fullData[0]!).fill?.pattern).toEqual({
      shape: '.',
      size: [4],
      fillmode: 'replace',
      solidity: 0.3,
    });
    expect(bar.legendIcon!(fullData[1]!).fill).not.toHaveProperty('pattern');
  });
});

describe('pie patterns', () => {
  it('gives each slice its pattern entry, on the paper color; outline rims get none', () => {
    const b = build(
      [
        {
          labels: ['a', 'b', 'a', 'c'],
          values: [3, 2, 1, 1],
          marker: {
            line: { width: 2 },
            pattern: { shape: ['/', '.', 'x', ''], size: [6, 7, 8, 9], fillmode: 'replace' },
          },
        },
      ],
      { paper_bgcolor: '#123456' },
    );
    const arcs = pieArcs(b.traces[0]!, b.calcs[0]!, 400, b.fullLayout.paper_bgcolor);
    const fill = arcs.pattern!;
    const patterns = fill.pattern as (Record<string, unknown> | undefined)[];
    // Slices a (points 0 and 2: the first one's entry, Plotly castOption), b, c; two instances
    // per slice (wedge, rim).
    expect(patterns[0]).toMatchObject({ shape: '/', size: 6, bgcolor: 'rgb(18, 52, 86)' });
    expect(patterns[1]).toBeUndefined();
    expect(patterns[2]).toMatchObject({ shape: '.', size: 7 });
    expect(patterns[4]).toBeUndefined();
    expect(fill.color).toBe(arcs.fill);
    expect(fill.background).toBe('rgb(18, 52, 86)');
  });

  it('keeps overlay backgrounds on the slice color and has no pattern without shapes', () => {
    const b = build([
      { labels: ['a'], values: [1], marker: { pattern: { shape: '+', fillmode: 'overlay' } } },
      { labels: ['a'], values: [1] },
    ]);
    const patterns = pieArcs(b.traces[0]!, b.calcs[0]!, 400, '#fff').pattern!.pattern as Record<
      string,
      unknown
    >[];
    expect(patterns[0]!['bgcolor']).toBeUndefined();
    expect(pieArcs(b.traces[1]!, b.calcs[1]!, 400, '#fff').pattern).toBeNull();
  });

  it('shows each slice pattern in its legend item', () => {
    const b = build([
      { labels: ['a', 'b'], values: [2, 1], marker: { pattern: { shape: ['-', '|'] } } },
    ]);
    const items = pie.legendItems!(b.calcs[0]!, b.traces[0]!, { fullLayout: b.fullLayout })!;
    expect(items.map((i) => i.glyph.fill?.pattern?.['shape'])).toEqual(['-', '|']);
  });
});

describe('scatter fillpattern', () => {
  it('paints the fill with its pattern (before a gradient) in the fill color', () => {
    const { fullData, fullLayout } = defaults([
      {
        type: 'scatter',
        y: [1, 2],
        fill: 'tozeroy',
        fillcolor: 'rgba(0, 0, 255, 0.5)',
        fillpattern: { shape: '\\' },
        fillgradient: { type: 'horizontal', colorscale: 'Viridis' },
      },
      { type: 'scatter', y: [1, 2], fill: 'tozeroy', fillpattern: { shape: '' } },
    ]);
    const paint = fillPaint(fullData[0]!, {}, fullLayout.plot_bgcolor);
    expect(paint.kind).toBe('pattern');
    if (paint.kind !== 'pattern') return;
    expect(paint.pattern.pattern).toBe(fullData[0]!['fillpattern']);
    expect(paint.pattern.color).toEqual(toRGBA('rgba(0, 0, 255, 0.5)'));
    expect(paint.pattern.background).toBe(fullLayout.plot_bgcolor);
    expect(fillPaint(fullData[1]!, {}).kind).toBe('solid');
  });

  it('puts the fill pattern on the legend glyph', () => {
    const { fullData } = defaults([
      { type: 'scatter', y: [1, 2], fill: 'tozeroy', fillpattern: { shape: '.' } },
    ]);
    const glyph = scatter.legendIcon!(fullData[0]!);
    expect(glyph.kind).toBe('fill');
    expect(glyph.fill?.pattern).toEqual(fullData[0]!['fillpattern']);
  });
});
