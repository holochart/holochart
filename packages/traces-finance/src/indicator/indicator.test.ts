import { holochartTemplate, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry } from '@mk7s/holochart-runtime';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { calcIndicator } from './calc.ts';
import { describeIndicator } from './describe.ts';
import { adjustFormat, deltaText, numberText, valueFormatter } from './format.ts';
import { indicator } from './index.ts';
import {
  gaugeTicks,
  layoutIndicator,
  measure,
  textFont,
  type IndicatorLayout,
  type IndicatorLayoutCache,
} from './layout.ts';
import { gaugeArcData, gaugeRectData, indicatorTextLabels } from './plot.ts';

const registry = createChartRegistry().register(indicator);

/** Defaults of one indicator trace. */
function full(trace: Record<string, unknown>, layout: Record<string, unknown> = {}): FullTrace {
  const { fullData } = supplyDefaults(
    { data: [{ type: 'indicator', ...trace }], layout },
    registry.core,
    { onIssue: () => {} },
  );
  return fullData[0]!;
}

const DOMAIN = { x: 80, y: 100, width: 540, height: 270 };

/** Defaults, calc and layout of one indicator in {@link DOMAIN}. */
function laid(
  trace: Record<string, unknown>,
  options: { domain?: typeof DOMAIN; cache?: IndicatorLayoutCache } = {},
): { trace: FullTrace; layout: IndicatorLayout } {
  const t = full(trace);
  const domain = options.domain ?? DOMAIN;
  const layout = layoutIndicator(t, calcIndicator(t), {
    domain,
    plotWidth: domain.width,
    ...(options.cache ? { cache: options.cache } : {}),
  });
  return { trace: t, layout };
}

const textOf = (layout: IndicatorLayout, role: string) => layout.texts.find((t) => t.role === role);

describe('indicator defaults', () => {
  it('reads the mode flags and sizes the number to fit by default', () => {
    const t = full({ value: 450 });
    expect(t).toMatchObject({
      mode: 'number',
      _hasNumber: true,
      _hasDelta: false,
      _hasGauge: false,
      _isAngular: false,
      _isBullet: false,
      _scaleNumbers: true,
      _range: [0, 675],
      align: 'center',
      number: { valueformat: '', prefix: '', suffix: '', font: { size: 80 } },
      title: { align: 'center', font: { size: 20 } },
    });
    expect(t['delta']).toBeUndefined();
    expect(t['gauge']).toBeUndefined();
  });

  it('sizes the delta at half the number, or like the number without one', () => {
    expect(full({ mode: 'number+delta', value: 1 })['delta']).toMatchObject({ font: { size: 40 } });
    expect(full({ mode: 'delta', value: 1 })['delta']).toMatchObject({ font: { size: 80 } });
    const sized = full({ mode: 'number+delta', value: 1, number: { font: { size: 30 } } });
    expect(sized).toMatchObject({
      _scaleNumbers: false,
      delta: { font: { size: 15 } },
      title: { font: { size: 7.5 } },
    });
    // A delta font size alone also turns fitting off.
    expect(full({ mode: 'number+delta', value: 1, delta: { font: { size: 20 } } })).toMatchObject({
      _scaleNumbers: false,
    });
    expect(full({ mode: 'delta', value: 1, delta: { font: { size: 20 } } })).toMatchObject({
      title: { font: { size: 5 } },
    });
  });

  it('defaults the delta reference to the value and formats relative deltas as percentages', () => {
    const t = full({ mode: 'number+delta', value: 5, delta: { relative: true } });
    expect(t['delta']).toMatchObject({
      reference: 5,
      relative: true,
      valueformat: '2%',
      position: 'bottom',
      increasing: { symbol: '▲', color: 'rgb(61, 153, 112)' },
      decreasing: { symbol: '▼', color: 'rgb(255, 65, 54)' },
    });
    expect(full({ mode: 'delta', value: 5 })['delta']).toMatchObject({ valueformat: '' });
  });

  it('supplies angular and bullet gauge defaults', () => {
    const angular = full({ mode: 'gauge', value: 100 }, { paper_bgcolor: '#123' });
    expect(angular).toMatchObject({
      _isAngular: true,
      _isBullet: false,
      _range: [0, 150],
      title: { align: 'center' },
      gauge: {
        shape: 'angular',
        bgcolor: 'rgb(17, 34, 51)',
        bordercolor: 'rgb(68, 68, 68)',
        borderwidth: 1,
        bar: { color: 'rgb(0, 128, 0)', thickness: 0.5, line: { width: 0 } },
        steps: [],
        threshold: { thickness: 0.85, line: { width: 1, color: 'rgb(68, 68, 68)' } },
        axis: {
          visible: true,
          range: [0, 150],
          tickmode: 'auto',
          nticks: 0,
          ticks: 'outside',
          ticklen: 5,
          tickwidth: 1,
          tickcolor: 'rgb(68, 68, 68)',
          showticklabels: true,
          tickfont: { size: 12 },
          exponentformat: 'B',
        },
      },
    });
    // An angular gauge centers its numbers: `align` is not used.
    expect(angular['align']).toBeUndefined();
    const bullet = full({ mode: 'gauge', value: 100, gauge: { shape: 'bullet' } });
    expect(bullet).toMatchObject({
      _isBullet: true,
      align: 'center',
      gauge: { bar: { thickness: 0.25 } },
    });
    // A bullet gauge's title is right-aligned left of the domain: `title.align` is not used.
    expect((bullet['title'] as Record<string, unknown>)['align']).toBeUndefined();
  });

  it("fills null axis range ends from the default, like Plotly's [null, 500]", () => {
    const t = full({ mode: 'gauge', value: 100, gauge: { axis: { range: [null, 500] } } });
    expect(t['_range']).toEqual([0, 500]);
    expect(
      full({ mode: 'gauge', value: 100, gauge: { axis: { range: [20, 'x'] } } }),
    ).toMatchObject({ _range: [20, 150] });
  });

  it('infers the tick mode from tickvals and dtick', () => {
    const axis = (a: Record<string, unknown>) =>
      (full({ mode: 'gauge', value: 1, gauge: { axis: a } })['gauge'] as Record<string, unknown>)[
        'axis'
      ];
    expect(axis({ tickvals: [0, 1], ticktext: ['lo', 'hi'] })).toMatchObject({
      tickmode: 'array',
      tickvals: [0, 1],
      ticktext: ['lo', 'hi'],
    });
    expect(axis({ dtick: 0.25 })).toMatchObject({ tickmode: 'linear', dtick: 0.25, tick0: 0 });
    expect(axis({ tickmode: 'linear', dtick: -1 })).toMatchObject({ dtick: 1 });
    expect(axis({ tickmode: 'array' })).toMatchObject({ tickmode: 'auto' });
    const noTicks = axis({ ticks: '' }) as Record<string, unknown>;
    expect(noTicks['ticklen']).toBeUndefined();
    expect(axis({ tickformat: '.1f' })).not.toHaveProperty('exponentformat');
  });

  it('coerces steps, with the template step defaults', () => {
    const t = full(
      {
        mode: 'gauge',
        value: 1,
        gauge: { steps: [{ range: [0, 0.5], color: 'red' }, { range: [0.5, 1] }] },
      },
      { template: { data: { indicator: [{ gauge: { stepdefaults: { color: 'blue' } } }] } } },
    );
    expect((t['gauge'] as Record<string, unknown>)['steps']).toMatchObject([
      { range: [0, 0.5], color: 'rgb(255, 0, 0)', thickness: 1, line: { width: 0 } },
      { range: [0.5, 1], color: 'rgb(0, 0, 255)' },
    ]);
  });

  it("applies the default look's entries (and keeps fitting the number)", () => {
    const t = full(
      { mode: 'number+delta+gauge', value: 1, delta: { reference: 2 } },
      { template: holochartTemplate },
    );
    expect(t).toMatchObject({
      _scaleNumbers: true,
      number: { font: { size: 80, color: 'rgb(236, 238, 244)' } },
      delta: {
        increasing: { color: 'rgb(17, 142, 54)' },
        decreasing: { color: 'rgb(234, 42, 55)' },
      },
      gauge: {
        bgcolor: 'rgb(26, 26, 34)',
        bordercolor: 'rgb(44, 44, 56)',
        bar: { color: 'rgb(94, 116, 213)' },
        threshold: { line: { color: 'rgb(236, 238, 244)' } },
        axis: { ticklen: 3, tickcolor: 'rgb(44, 44, 56)', tickfont: { size: 8 } },
      },
    });
  });

  it('flags value and delta.reference as animatable', () => {
    const schema = registry.core.getTraceSchema('indicator')!;
    expect(schema.children['value']).toMatchObject({ animatable: true });
    const delta = schema.children['delta'] as { children: Record<string, unknown> };
    expect(delta.children['reference']).toMatchObject({ animatable: true });
  });
});

describe('indicator calc and formatting', () => {
  it('computes the delta and relative delta', () => {
    expect(calcIndicator(full({ mode: 'delta', value: 450, delta: { reference: 400 } }))).toEqual({
      value: 450,
      reference: 400,
      delta: 50,
      relativeDelta: 0.125,
    });
    const none = calcIndicator(full({ mode: 'number' }));
    expect(none.value).toBeUndefined();
    expect(none.delta).toBeNaN();
  });

  it("adjusts d3 formats like Plotly's adjustFormat", () => {
    expect(adjustFormat('')).toBe('');
    expect(adjustFormat('2%')).toBe('~%');
    expect(adjustFormat('.1%')).toBe('.1%');
    expect(adjustFormat('0.f')).toBe('~f');
    expect(adjustFormat('3s')).toBe('~s');
    expect(adjustFormat('f')).toBe('~f');
    expect(adjustFormat('+s')).toBe('+~s');
    expect(adjustFormat('$.2f')).toBe('$.2f');
    expect(adjustFormat(',.0f')).toBe(',.0f');
  });

  it('rounds unformatted values like tick labels of a [0, 1.5 × value] axis', () => {
    expect(valueFormatter('', [0, 675], 540)(450)).toBe('450');
    // Two digits past the leading digit of the step (50 here).
    expect(valueFormatter('', [0, 185.184], 540)(123.456)).toBe('123.5');
    expect(valueFormatter('', [0, 1.5e6], 540)(1e6)).toBe('1M');
    expect(valueFormatter('', [0, 1.5], 540)(0.9876)).toBe('0.988');
    expect(valueFormatter('2%', [0, 1], 540)(0.125)).toBe('12.5%');
    expect(valueFormatter(',.0f', [0, 1], 540)(-12345.6)).toBe('−12,346');
  });

  it('writes deltas with the direction symbol and a true minus sign', () => {
    const style = {
      prefix: '$',
      suffix: ' up',
      increasing: { symbol: '▲', color: 'green' },
      decreasing: { symbol: '▼', color: 'red' },
    };
    const f = valueFormatter('', [0, 150], 500);
    expect(deltaText(50, f, style)).toBe('▲$50 up');
    expect(deltaText(-20, f, style)).toBe('▼$−20 up');
    expect(deltaText(0, f, style)).toBe('-');
    expect(deltaText(NaN, f, style)).toBe('-');
    expect(numberText(undefined, f, '$', '')).toBe('-');
    expect(numberText(12, f, '$', 'k')).toBe('$12k');
  });
});

describe('indicator layout: numbers', () => {
  it('centers a lone number in its domain, at most 80 px, the title above it', () => {
    const { layout } = laid({ value: 450, title: { text: 'Speed' } });
    const number = textOf(layout, 'number')!;
    expect(layout.numbersScale).toBe(1);
    expect(number).toMatchObject({ text: '450', anchorX: 'center', font: { size: 80 } });
    expect(number.x).toBeCloseTo(DOMAIN.x + DOMAIN.width / 2);
    const box = measure('450', number.font, 'center');
    // Vertically centered on the domain.
    expect((number.y + box.top + number.y + box.bottom) / 2).toBeCloseTo(
      DOMAIN.y + DOMAIN.height / 2,
    );
    const title = textOf(layout, 'title')!;
    const tbox = measure('Speed', title.font, 'center');
    expect(title.y + tbox.bottom).toBeCloseTo(number.y + box.top - 5);
    expect(title.font.size).toBe(20);
  });

  it('aligns the number left or right in its domain', () => {
    const left = textOf(laid({ value: 1, align: 'left' }).layout, 'number')!;
    expect(left).toMatchObject({ x: DOMAIN.x, anchorX: 'left' });
    const right = textOf(laid({ value: 1, align: 'right' }).layout, 'number')!;
    expect(right).toMatchObject({ x: DOMAIN.x + DOMAIN.width, anchorX: 'right' });
  });

  it('shrinks a long number to fit, and not with a font size', () => {
    const { layout } = laid({ value: 123456789.123, number: { valueformat: ',.3f' } });
    const number = textOf(layout, 'number')!;
    expect(layout.numbersScale).toBeLessThan(1);
    expect(number.font.size).toBeCloseTo(80 * layout.numbersScale);
    expect(measure(number.text, number.font).width).toBeCloseTo(DOMAIN.width, 0);
    const fixed = laid({
      value: 123456789.123,
      number: { valueformat: ',.3f', font: { size: 80 } },
    }).layout;
    expect(fixed.numbersScale).toBe(1);
  });

  it('keeps the fitted number inside its domain box (property)', () => {
    fc.assert(
      fc.property(
        fc
          .double({ min: -1e9, max: 1e9, noNaN: true })
          .filter((v) => v === 0 || Math.abs(v) > 1e-6),
        fc.integer({ min: 40, max: 900 }),
        fc.integer({ min: 30, max: 600 }),
        fc.constantFrom('top', 'bottom', 'left', 'right'),
        (value, width, height, position) => {
          const domain = { x: 10, y: 20, width, height };
          const { layout } = laid(
            { mode: 'number+delta', value, delta: { reference: value / 2 + 1, position } },
            { domain },
          );
          const texts = layout.texts.filter((t) => t.role === 'number' || t.role === 'delta');
          for (const t of texts) {
            const b = measure(t.text, t.font, t.anchorX);
            expect(t.x + b.left).toBeGreaterThanOrEqual(domain.x - 1e-6 * width - 0.5);
            expect(t.x + b.right).toBeLessThanOrEqual(domain.x + width + 0.5);
            expect(t.y + b.top).toBeGreaterThanOrEqual(domain.y - 0.5);
            expect(t.y + b.bottom).toBeLessThanOrEqual(domain.y + height + 0.5);
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('places the delta below, above, left or right of the number', () => {
    const at = (position: string) => {
      const { layout } = laid({
        mode: 'number+delta',
        value: 450,
        delta: { reference: 400, position },
      });
      return { number: textOf(layout, 'number')!, delta: textOf(layout, 'delta')! };
    };
    const bottom = at('bottom');
    expect(bottom.delta.text).toBe('▲50');
    expect(bottom.delta.color).toBe('rgb(61, 153, 112)');
    expect(bottom.delta.x).toBeCloseTo(bottom.number.x);
    expect(bottom.delta.y).toBeGreaterThan(bottom.number.y);
    // The delta's box is stacked right under the number's.
    const nb = measure('450', bottom.number.font, 'center');
    const db = measure('▲50', bottom.delta.font, 'center');
    expect(bottom.delta.y - bottom.number.y).toBeCloseTo(db.height);
    expect(bottom.delta.font.size).toBeCloseTo(bottom.number.font.size / 2);
    const top = at('top');
    expect(top.delta.y - top.number.y).toBeCloseTo(nb.top);
    const right = at('right');
    expect(right.delta.x).toBeGreaterThan(right.number.x + nb.width / 2);
    // Vertically centered on each other.
    const center = (t: { y: number }, b: { top: number; bottom: number }) =>
      t.y + (b.top + b.bottom) / 2;
    expect(center(right.delta, db)).toBeCloseTo(center(right.number, nb));
    const left = at('left');
    expect(left.delta.x).toBeLessThan(left.number.x - nb.width / 2);
  });

  it('colors a falling delta and formats relative deltas', () => {
    const { layout } = laid({
      mode: 'number+delta',
      value: 360,
      delta: { reference: 400, relative: true },
    });
    expect(textOf(layout, 'delta')).toMatchObject({ text: '▼−10%', color: 'rgb(255, 65, 54)' });
  });

  it('keeps the smallest scale per layout key across redraws (no jitter while counting)', () => {
    const cache: IndicatorLayoutCache = new Map();
    const wide = laid({ value: 8888888888888, number: { valueformat: ',d' } }, { cache }).layout;
    const narrow = laid({ value: 8, number: { valueformat: ',d' } }, { cache }).layout;
    expect(wide.numbersScale).toBeLessThan(1);
    expect(narrow.numbersScale).toBe(wide.numbersScale);
    // A new key (another format) starts over.
    const other = laid({ value: 8, number: { valueformat: 'd' } }, { cache }).layout;
    expect(other.numbersScale).toBe(1);
  });
});

describe('indicator layout: angular gauge', () => {
  const gauge = (extra: Record<string, unknown> = {}) =>
    laid({
      mode: 'gauge+number',
      value: 250,
      title: { text: 'Speed' },
      gauge: {
        axis: { range: [0, 500] },
        steps: [{ range: [0, 250], color: 'gray' }],
        threshold: { value: 400, line: { color: 'red', width: 4 } },
        ...extra,
      },
    });

  it('fits a half ring in the domain, its flat side on the number baseline', () => {
    const { layout } = gauge();
    const radius = Math.min(DOMAIN.width / 2, DOMAIN.height);
    expect(layout.angular).toEqual({
      cx: DOMAIN.x + DOMAIN.width / 2,
      cy: DOMAIN.y + DOMAIN.height / 2 + radius / 2,
      radius,
    });
    const number = textOf(layout, 'number')!;
    const box = measure(number.text, number.font, 'center');
    expect(number.y + box.bottom).toBeCloseTo(layout.angular!.cy);
  });

  it('draws background, steps, bar, threshold and outline as sectors, in order', () => {
    const { layout } = gauge();
    const R = layout.angular!.radius;
    const [bg, step, bar, threshold, outline] = layout.arcs;
    // Background: the full ring, 0.75 R to R, from 9 to 3 o'clock.
    expect(bg).toMatchObject({ a0: Math.PI, a1: 0, fill: 'rgb(255, 255, 255)' });
    expect(bg!.r0).toBeCloseTo(0.75 * R);
    expect(bg!.r1).toBeCloseTo(R);
    expect(step).toMatchObject({ a0: Math.PI, fill: 'rgb(128, 128, 128)' });
    expect(step!.a1).toBeCloseTo(Math.PI / 2);
    // The bar: half the ring's thickness, centered, from the start to the value.
    expect(bar!.r0).toBeCloseTo(0.8125 * R);
    expect(bar!.r1).toBeCloseTo(0.9375 * R);
    expect(bar!.a1).toBeCloseTo(Math.PI / 2);
    // The threshold: a 4 px stroke across 0.85 of the ring at 400.
    const angle = Math.PI - (400 / 500) * Math.PI;
    expect(threshold).toMatchObject({ fill: 'rgba(0, 0, 0, 0)', borderWidth: 4 });
    expect((threshold!.a0 + threshold!.a1) / 2).toBeCloseTo(angle);
    expect((threshold!.a1 - threshold!.a0) * ((threshold!.r0 + threshold!.r1) / 2)).toBeCloseTo(4);
    expect(threshold!.r1 - threshold!.r0).toBeCloseTo(0.85 * 0.25 * R);
    // The outline: a 1 px stroke centered on the ring's edges.
    expect(outline).toMatchObject({ border: 'rgb(68, 68, 68)', borderWidth: 1 });
    expect(outline!.r0).toBeCloseTo(0.75 * R - 0.5);
    expect(outline!.r1).toBeCloseTo(R + 0.5);
  });

  it('clamps the bar to the axis range', () => {
    const over = laid({ mode: 'gauge', value: 900, gauge: { axis: { range: [0, 500] } } }).layout;
    expect(over.arcs[1]!.a1).toBeCloseTo(0);
    const under = laid({ mode: 'gauge', value: -5, gauge: { axis: { range: [0, 500] } } }).layout;
    // No bar below the start: background and outline only.
    expect(under.arcs.filter((a) => a.fill === 'rgb(0, 128, 0)')).toEqual([]);
  });

  it('draws radial tick marks and labels around the ring, the title above them', () => {
    const { layout } = gauge();
    const ticks = layout.texts.filter((t) => t.role === 'tick');
    expect(ticks.map((t) => t.text)).toEqual(['0', '100', '200', '300', '400', '500']);
    // Labels hug the ring: left of it at the start, right at the end, centered on top.
    expect(ticks[0]!.anchorX).toBe('right');
    expect(ticks[5]!.anchorX).toBe('left');
    const { cx, cy, radius } = layout.angular!;
    // Tick marks: 5 px long, 1 px wide, just outside the ring.
    const marks = layout.arcs.slice(-6);
    for (const m of marks) {
      expect(m.r0).toBeCloseTo(radius + 0.5);
      expect(m.r1).toBeCloseTo(radius + 5.5);
      expect((m.a1 - m.a0) * ((m.r0 + m.r1) / 2)).toBeCloseTo(1);
    }
    const title = textOf(layout, 'title')!;
    const topLabel = Math.min(...ticks.map((t) => t.y - measure(t.text, t.font).height));
    expect(title.y).toBeLessThan(topLabel);
    expect(title.x).toBeCloseTo(cx);
    expect(cy).toBeGreaterThan(title.y);
  });

  it('puts the title above the ring without an axis', () => {
    const { layout } = gauge({ axis: { range: [0, 500], visible: false } });
    expect(layout.texts.filter((t) => t.role === 'tick')).toEqual([]);
    const title = textOf(layout, 'title')!;
    const box = measure('Speed', title.font, 'center');
    const { cy, radius } = layout.angular!;
    expect(title.y + box.bottom).toBeCloseTo(cy - radius - 5);
  });
});

describe('indicator layout: bullet gauge', () => {
  const bullet = (mode = 'number+gauge') =>
    laid({
      mode,
      value: 220,
      title: { text: 'Profit' },
      gauge: {
        shape: 'bullet',
        axis: { range: [0, 300] },
        steps: [{ range: [150, 250], color: 'gray' }],
        threshold: { value: 280, line: { width: 2 } },
      },
    });

  it('stacks background, steps, bar, threshold and outline over the domain height', () => {
    const { layout } = bullet();
    const length = 0.75 * DOMAIN.width;
    expect(layout.bullet).toEqual({
      x0: DOMAIN.x,
      x1: DOMAIN.x + length,
      y: DOMAIN.y + DOMAIN.height,
    });
    const [bg, step, bar, threshold, outline] = layout.rects;
    expect(bg).toMatchObject({
      x0: DOMAIN.x,
      x1: DOMAIN.x + length,
      y0: DOMAIN.y,
      y1: DOMAIN.y + DOMAIN.height,
    });
    expect(step!.x0).toBeCloseTo(DOMAIN.x + length / 2);
    expect(step!.x1).toBeCloseTo(DOMAIN.x + (length * 250) / 300);
    // The bar: a quarter of the height, centered, from the start to the value.
    expect(bar!.x0).toBe(DOMAIN.x);
    expect(bar!.x1).toBeCloseTo(DOMAIN.x + (length * 220) / 300);
    expect(bar!.y0).toBeCloseTo(DOMAIN.y + 0.375 * DOMAIN.height);
    expect(bar!.y1).toBeCloseTo(DOMAIN.y + 0.625 * DOMAIN.height);
    // The threshold: a 2 px line across 0.85 of the height.
    const tx = DOMAIN.x + (length * 280) / 300;
    expect(threshold!.x0).toBeCloseTo(tx - 1);
    expect(threshold!.x1).toBeCloseTo(tx + 1);
    expect(threshold!.y1 - threshold!.y0).toBeCloseTo(0.85 * DOMAIN.height);
    expect(outline).toMatchObject({ fill: '', borderWidth: 1 });
  });

  it('puts the axis under the gauge, the number right of it and the title left of it', () => {
    const { layout } = bullet();
    const ticks = layout.texts.filter((t) => t.role === 'tick');
    expect(ticks.map((t) => t.text)).toEqual(['0', '50', '100', '150', '200', '250', '300']);
    const bottom = DOMAIN.y + DOMAIN.height;
    // Baselines at the tick length + 0.2 font sizes + half the line, plus one font size.
    for (const t of ticks) expect(t.y).toBeCloseTo(bottom + 5 + 2.4 + 0.5 + 12);
    const marks = layout.rects.slice(-7);
    expect(marks[0]).toMatchObject({ y0: bottom + 0.5, y1: bottom + 5.5 });
    const number = textOf(layout, 'number')!;
    const p = 0.75 + 0.025;
    expect(number.x).toBeCloseTo(DOMAIN.x + (p + (1 - p) / 2) * DOMAIN.width);
    const title = textOf(layout, 'title')!;
    expect(title).toMatchObject({ anchorX: 'right' });
    expect(title.x).toBeCloseTo(DOMAIN.x - 0.025 * DOMAIN.width);
  });

  it('spans the whole domain without a number', () => {
    const { layout } = bullet('gauge');
    expect(layout.bullet!.x1).toBe(DOMAIN.x + DOMAIN.width);
    expect(textOf(layout, 'number')).toBeUndefined();
  });

  it('skips inside ticks at the ends', () => {
    const { layout } = laid({
      mode: 'gauge',
      value: 1,
      gauge: { shape: 'bullet', axis: { range: [0, 4], ticks: 'inside', showticklabels: false } },
    });
    const bottom = DOMAIN.y + DOMAIN.height;
    const marks = layout.rects.filter((r) => r.y1 === bottom - 0.5);
    expect(marks.map((m) => Math.round((m.x0 + m.x1) / 2))).toEqual([215, 350, 485]);
  });
});

describe('indicator gauge ticks', () => {
  it('computes ticks like a mock cartesian axis of the plot width', () => {
    const t = full({ mode: 'gauge', value: 1, gauge: { axis: { range: [0, 500] } } });
    expect(gaugeTicks(t, 540).map((k) => k.text)).toEqual(['0', '100', '200', '300', '400', '500']);
    expect(gaugeTicks(t, 200).map((k) => k.text)).toEqual(['0', '200', '400']);
    const arr = full({
      mode: 'gauge',
      value: 1,
      gauge: { axis: { range: [0, 10], tickvals: [0, 5, 10], ticktext: ['lo', 'mid', 'hi'] } },
    });
    expect(gaugeTicks(arr, 540).map((k) => k.text)).toEqual(['lo', 'mid', 'hi']);
  });
});

describe('indicator transitions', () => {
  it('counts the number up and sweeps the bar monotonically through in-between values', () => {
    const texts: number[] = [];
    const angles: number[] = [];
    const cache: IndicatorLayoutCache = new Map();
    const scales: number[] = [];
    for (let e = 0; e <= 1.0001; e += 0.05) {
      const value = 120 + (385 - 120) * e;
      const { layout } = laid(
        { mode: 'gauge+number', value, gauge: { axis: { range: [0, 500] } } },
        { cache },
      );
      texts.push(Number(textOf(layout, 'number')!.text));
      angles.push(layout.arcs[1]!.a1);
      scales.push(layout.numbersScale);
    }
    expect(texts[0]).toBe(120);
    expect(texts.at(-1)).toBe(385);
    for (let i = 1; i < texts.length; i++) {
      expect(texts[i]).toBeGreaterThanOrEqual(texts[i - 1]!);
      expect(angles[i]).toBeLessThan(angles[i - 1]!);
      expect(scales[i]).toBeLessThanOrEqual(scales[i - 1]!);
    }
  });
});

describe('indicator rendering buffers', () => {
  it('flips container px to world px', () => {
    const { layout } = laid({ mode: 'gauge+number', value: 5, title: { text: 'T' } });
    const arcs = gaugeArcData(layout.arcs, 400);
    expect(arcs.y![0]).toBeCloseTo(400 - layout.angular!.cy);
    const labels = indicatorTextLabels(layout, 400);
    const title = layout.texts.find((t) => t.role === 'title')!;
    expect(labels.find((l) => l.text === 'T')).toMatchObject({
      y: 400 - title.y,
      anchorY: 'baseline',
    });
    const bullet = laid({ mode: 'gauge', value: 5, gauge: { shape: 'bullet' } }).layout;
    const rects = gaugeRectData(bullet.rects, 400);
    expect(rects).toMatchObject({ borderAlign: 'center' });
    expect(rects.y0![0]).toBeCloseTo(400 - (DOMAIN.y + DOMAIN.height));
    expect(rects.y1![0]).toBeCloseTo(400 - DOMAIN.y);
  });

  it('maps fonts to the text engine', () => {
    expect(textFont({ family: 'Arial', size: 10, weight: 'bold', style: 'italic' }, 2)).toEqual({
      family: 'Arial',
      size: 20,
      weight: 'bold',
      style: 'italic',
    });
  });
});

describe('indicator description', () => {
  it('summarizes the value, its change and the gauge', () => {
    const t = full({
      mode: 'number+delta+gauge',
      value: 450,
      number: { prefix: '$' },
      delta: { reference: 400 },
      title: { text: 'Revenue<br>2024' },
      gauge: { axis: { range: [0, 500] }, threshold: { value: 480 } },
    });
    const d = describeIndicator({
      trace: t,
      calc: calcIndicator(t),
      index: 0,
      fullLayout: {} as never,
      xaxis: undefined,
      yaxis: undefined,
      maxRows: 100,
    });
    expect(d).toEqual({
      kind: 'indicator',
      summary:
        'Indicator "Revenue 2024": $450. Up 50 (12.5%) from 400. Gauge from 0 to 500, threshold 480.',
    });
  });
});
