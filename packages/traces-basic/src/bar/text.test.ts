import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { IDENTITY_TRANSFORM } from '@mk7s/holochart-render';
import { createChartRegistry, type AxisInfo } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { bar, type BarCalc } from './index.ts';
import { formatTemplate } from './template.ts';
import {
  barLabel,
  barTextLabels,
  placeBarText,
  TEXTPAD,
  type BarBox,
  type TextPlacementOptions,
} from './text.ts';

const base: TextPlacementOptions = {
  position: 'auto',
  horizontal: false,
  outmost: true,
  angle: 'auto',
  anchor: 'end',
  constrainInside: true,
  constrainOutside: true,
  inside: { width: 20, height: 12 },
  outside: { width: 20, height: 12 },
};

// A vertical bar 40 px wide from y = 0 up to y = 100 (y up).
const tall: BarBox = { x0: 0, y0: 0, x1: 40, y1: 100 };

describe('placeBarText', () => {
  it('auto: puts a fitting label inside, against the bar end', () => {
    const p = placeBarText(tall, base)!;
    expect(p.inside).toBe(true);
    expect(p.cx).toBe(20);
    expect(p.cy).toBe(100 - TEXTPAD - 6);
    expect([p.rotate, p.scale]).toEqual([0, 1]);
  });

  it('auto: goes outside when the label does not fit, past the bar end', () => {
    const label = { width: 30, height: 12 };
    // Shrunk to the bar width (10 / 30), the label is 4 px tall: fits a 5 px bar, not a 3 px one.
    const fitsShrunk: BarBox = { x0: 0, y0: 0, x1: 10, y1: 5 };
    expect(placeBarText(fitsShrunk, { ...base, inside: label, outside: label })!.inside).toBe(true);
    const short: BarBox = { x0: 0, y0: 0, x1: 10, y1: 3 };
    const p = placeBarText(short, { ...base, inside: label, outside: label })!;
    expect(p.inside).toBe(false);
    // Outside labels are constrained to the bar width too.
    expect(p.scale).toBeCloseTo(1 / 3);
    expect(p.cy).toBeCloseTo(3 + TEXTPAD + 2);
  });

  it('auto: inner bars of a stack stay inside, and outside becomes inside for them', () => {
    const short: BarBox = { x0: 0, y0: 0, x1: 10, y1: 5 };
    expect(placeBarText(short, { ...base, outmost: false })!.inside).toBe(true);
    expect(placeBarText(tall, { ...base, position: 'outside', outmost: false })!.inside).toBe(true);
  });

  it('points outside labels away from negative bars', () => {
    const down: BarBox = { x0: 0, y0: 100, x1: 40, y1: 60 };
    const p = placeBarText(down, { ...base, position: 'outside' })!;
    expect(p.cy).toBe(60 - TEXTPAD - 6);
    const inside = placeBarText(down, { ...base, position: 'inside' })!;
    expect(inside.cy).toBe(60 + TEXTPAD + 6);
  });

  it('anchors inside labels at the start or middle', () => {
    expect(placeBarText(tall, { ...base, anchor: 'start' })!.cy).toBe(TEXTPAD + 6);
    expect(placeBarText(tall, { ...base, anchor: 'middle' })!.cy).toBe(50);
  });

  it('rotates a long label 90° inside a tall, narrow bar (textangle auto)', () => {
    const narrow: BarBox = { x0: 0, y0: 0, x1: 16, y1: 100 };
    const p = placeBarText(narrow, {
      ...base,
      position: 'inside',
      inside: { width: 60, height: 8 },
    })!;
    expect(p.rotate).toBe(90);
    expect(p.scale).toBe(1);
  });

  it('keeps an explicit angle and shrinks to fit when constrained', () => {
    const narrow: BarBox = { x0: 0, y0: 0, x1: 16, y1: 100 };
    const opts = {
      ...base,
      position: 'inside' as const,
      angle: 0,
      inside: { width: 60, height: 12 },
    };
    expect(placeBarText(narrow, opts)!.scale).toBeCloseTo(10 / 60);
    expect(placeBarText(narrow, { ...opts, constrainInside: false })!.scale).toBe(1);
  });

  it('places horizontal-bar labels along x', () => {
    const wide: BarBox = { x0: 0, y0: 0, x1: 200, y1: 30 };
    const p = placeBarText(wide, { ...base, horizontal: true })!;
    expect(p.cx).toBe(200 - TEXTPAD - 10);
    expect(p.cy).toBe(15);
    const out = placeBarText(
      { x0: 0, y0: 0, x1: 10, y1: 30 },
      {
        ...base,
        horizontal: true,
        position: 'outside',
      },
    )!;
    expect(out.cx).toBe(10 + TEXTPAD + 10);
  });

  it('shows nothing for none or an empty label', () => {
    expect(placeBarText(tall, { ...base, position: 'none' })).toBeNull();
    const empty = { width: 0, height: 12 };
    expect(placeBarText(tall, { ...base, inside: empty, outside: empty })).toBeNull();
  });
});

describe('formatTemplate', () => {
  it('fills variables with labels, d3 and date formats', () => {
    const scope = {
      values: { value: 3.14159, label: 'A', x: Date.UTC(2024, 2, 5), customdata: [7, 8] },
      labels: { label: 'Label A' },
    };
    expect(formatTemplate('%{label}: %{value:.1f}', scope)).toBe('Label A: 3.1');
    expect(formatTemplate('%{x|%b %Y}', scope)).toBe('Mar 2024');
    expect(formatTemplate('%{customdata[1]} %{missing}!', scope)).toBe('8 !');
    expect(formatTemplate('plain', scope)).toBe('plain');
  });
});

const registry = createChartRegistry().register(bar);

function setup(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'bar', ...trace }], layout },
    registry.core,
  );
  const x = {
    id: 'x',
    scale: createScale({ type: 'category', categories: ['a', 'b'], range: [-0.5, 1.5] }),
  } as unknown as AxisInfo;
  const y = {
    id: 'y',
    scale: createScale({ type: 'linear', range: [0, 10] }),
  } as unknown as AxisInfo;
  const t = fullData[0] as FullTrace;
  const calc = bar.calc!(t, { fullLayout, index: 0, xaxis: x, yaxis: y }) as BarCalc;
  return { trace: t, calc, x, y };
}

describe('bar labels', () => {
  it('uses texttemplate over text, with the bar value and position', () => {
    const { trace, calc } = setup({
      x: ['a', 'b'],
      y: [2, 5],
      text: ['t0', 't1'],
      texttemplate: '%{label}=%{value} (%{text})',
    });
    expect(barLabel(trace, calc, 1)).toBe('b=5 (t1)');
    const plain = setup({ x: ['a', 'b'], y: [2, 5], text: 'same' });
    expect(barLabel(plain.trace, plain.calc, 0)).toBe('same');
  });

  it('builds one label per bar with contrast colors, in linear coordinates', () => {
    const { trace, calc } = setup(
      { x: ['a', 'b'], y: [8, 0.2], text: ['long label here', 'b'], marker: { color: '#000' } },
      {},
    );
    // 100 px per category, 20 px per y unit.
    const transform = { ...IDENTITY_TRANSFORM, scaleX: 100, offsetX: 50, scaleY: 20 };
    const labels = barTextLabels(trace, calc, {
      transform,
      xRange: [-0.5, 1.5],
      yRange: [0, 10],
      fill: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
      background: [1, 1, 1, 1],
      formatters: {},
      floor: NaN,
      selected: null,
    });
    expect(labels).toHaveLength(2);
    const [first, second] = labels;
    // Inside the tall black bar: white, centered on the bar.
    expect(first!.color).toEqual([1, 1, 1, 1]);
    expect(first!.x).toBeCloseTo(0);
    expect(first!.y).toBeLessThan(8);
    // The short bar's label goes outside, above it, in the default dark color.
    expect(second!.y).toBeGreaterThan(0.2);
    expect(second!.color?.[0]).toBeCloseTo(68 / 255);
  });

  it('dims labels of unselected bars', () => {
    const { trace, calc } = setup({ x: ['a', 'b'], y: [8, 8], text: ['a', 'b'] });
    const labels = barTextLabels(trace, calc, {
      transform: { ...IDENTITY_TRANSFORM, scaleX: 100, scaleY: 20 },
      xRange: undefined,
      yRange: undefined,
      fill: new Float32Array(8).fill(1),
      background: [1, 1, 1, 1],
      formatters: {},
      floor: NaN,
      selected: new Set([0]),
    });
    expect(labels[0]!.color?.[3]).toBe(1);
    expect(labels[1]!.color?.[3]).toBeCloseTo(0.2);
  });
});
