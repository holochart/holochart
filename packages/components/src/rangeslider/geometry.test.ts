import { createBreakMap, createScale } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import {
  centerWindow,
  dragWindow,
  RANGESLIDER_PAD,
  rangesliderOf,
  rangesliderYaxis,
  sliderD2P,
  sliderHeight,
  sliderMarginPush,
  sliderP2D,
  sliderRange,
  sliderRect,
  sliderTarget,
  windowPixels,
  windowRange,
} from './geometry.ts';

const DAY = 86_400_000;

describe('slider size and place (Plotly draw.js / helpers.js)', () => {
  it('is `thickness` of the height inside the layout margins', () => {
    expect(sliderHeight(450, { t: 100, b: 80 }, 0.15)).toBeCloseTo(40.5);
    expect(sliderHeight(100, { t: 60, b: 60 }, 0.15)).toBe(0);
  });

  it('sits below the axis depth plus a 15 px gap, border outside', () => {
    expect(
      sliderRect({ start: 80, end: 620, bottom: 370, depth: 20, height: 40.5, borderwidth: 3 }),
    ).toEqual({ x: 80, y: 370 + 20 + 1 + RANGESLIDER_PAD, width: 540, height: 41 });
  });

  it('pushes the bottom margin by depth, gap, slider and margin.b (Plotly autoMargin)', () => {
    const base = {
      height: 40,
      depth: 20,
      borderwidth: 0,
      marginB: 32,
      marginT: 42,
      figureHeight: 440,
    };
    expect(sliderMarginPush({ ...base, bottom: 0 })).toEqual({ b: 40 + 20 + 32 + 15 });
    // A subplot ending above the plot-area bottom already has room below it.
    const high = sliderMarginPush({ ...base, bottom: 0.5 });
    expect(high).toBeUndefined();
    const low = sliderMarginPush({ ...base, bottom: 0.1 });
    expect(low?.b).toBe(Math.ceil((107 - 0.1 * (440 - 42)) / 0.9));
  });
});

describe('slider range and window', () => {
  it('spans its own range widened to the axis range, in the axis direction', () => {
    expect(sliderRange([0, 10], [2, 4])).toEqual([0, 10]);
    expect(sliderRange([0, 10], [-5, 4])).toEqual([-5, 10]);
    expect(sliderRange([0, 10], [12, 4])).toEqual([12, 0]);
    expect(sliderRange(undefined, [2, 4])).toEqual([2, 4]);
    expect(sliderRange([3, 3], [2, 4])).toEqual([2, 4]);
  });

  it('maps linear ↔ px and clamps the window to the slider', () => {
    expect(sliderD2P(5, [0, 10], 200)).toBe(100);
    expect(sliderP2D(50, [0, 10], 200)).toBe(2.5);
    expect(windowPixels([2, 6], [0, 10], 200)).toEqual([40, 120]);
    expect(windowPixels([-5, 6], [0, 10], 200)).toEqual([0, 120]);
    expect(windowPixels([6, 2], [10, 0], 200)).toEqual([80, 160]);
  });

  it('works in ms on date axes', () => {
    const r: [number, number] = [Date.parse('2023-01-01'), Date.parse('2025-01-01')];
    const view: [number, number] = [Date.parse('2024-01-01'), Date.parse('2025-01-01')];
    const [a, b] = windowPixels(view, r, 731);
    expect(a).toBeCloseTo(365);
    expect(b).toBe(731);
    expect(windowRange([a, b], r, 731, false)).toEqual(view);
  });

  it('keeps range breaks out: the window spans trading time on a breaks axis', () => {
    const breaks = createBreakMap(
      [
        {
          enabled: true,
          visible: true,
          bounds: ['sat', 'mon'],
          pattern: 'day of week',
          dvalue: DAY,
        },
      ],
      'date',
    );
    const scale = createScale({ type: 'date', ...(breaks ? { breaks } : {}) });
    // Mon 2024-03-04 … Fri 2024-03-15: two trading weeks, ten days of linear space.
    const r: [number, number] = [scale.r2l('2024-03-04'), scale.r2l('2024-03-16')];
    expect(r[1] - r[0]).toBe(10 * DAY);
    // The second half of the slider is the second week, whatever the calendar says.
    const second = windowRange([100, 200], r, 200, false);
    expect(scale.l2r(second[0])).toBe('2024-03-11');
    // The end of Friday is the start of the break: it reads as the Monday after it.
    expect(scale.l2r(second[1])).toBe('2024-03-18');
  });
});

describe('drag math (Plotly mouseMove)', () => {
  const w: [number, number] = [40, 120];

  it('tells the ends, the window and the background apart', () => {
    expect(sliderTarget(42, w)).toBe('min');
    expect(sliderTarget(117, w)).toBe('max');
    expect(sliderTarget(80, w)).toBe('window');
    expect(sliderTarget(10, w)).toBe('background');
    expect(sliderTarget(150, w)).toBe('background');
    // A narrow window: the closer end.
    expect(sliderTarget(99, [98, 102])).toBe('min');
    expect(sliderTarget(101.5, [98, 102])).toBe('max');
  });

  it('moves the window keeping its width, held inside the slider', () => {
    expect(dragWindow('window', w, 80, -30, 200)).toEqual([10, 90]);
    expect(dragWindow('window', w, 80, -100, 200)).toEqual([0, 80]);
    expect(dragWindow('window', w, 80, 500, 200)).toEqual([120, 200]);
  });

  it('moves one end; ends swap when they cross', () => {
    expect(dragWindow('min', w, 40, -20, 200)).toEqual([20, 120]);
    expect(dragWindow('max', w, 120, 30, 200)).toEqual([40, 150]);
    expect(dragWindow('min', w, 40, 100, 200)).toEqual([120, 140]);
    expect(dragWindow('max', w, 120, 500, 200)).toEqual([40, 200]);
  });

  it('draws a new window from a press on the background', () => {
    expect(dragWindow('background', w, 150, 30, 200)).toEqual([150, 180]);
    expect(dragWindow('background', w, 150, -60, 200)).toEqual([90, 150]);
    expect(dragWindow('background', w, 150, 0.5, 200)).toBeUndefined();
  });

  it('centers the window on a click', () => {
    expect(centerWindow(150, w, 200)).toEqual([110, 190]);
    expect(centerWindow(10, w, 200)).toEqual([0, 80]);
    expect(centerWindow(199, w, 200)).toEqual([120, 200]);
  });

  it('gives axis ranges clamped to the slider, reversed axes stay reversed', () => {
    expect(windowRange([40, 120], [0, 10], 200, false)).toEqual([2, 6]);
    expect(windowRange([-10, 120], [0, 10], 200, false)).toEqual([0, 6]);
    expect(windowRange([40, 120], [10, 0], 200, true)).toEqual([8, 4]);
  });
});

describe('attributes', () => {
  it('reads the visible slider and the thumbnail y settings', () => {
    expect(rangesliderOf({ rangeslider: { visible: false } })).toBeUndefined();
    expect(rangesliderOf({})).toBeUndefined();
    const rs = rangesliderOf({
      rangeslider: {
        visible: true,
        thickness: 0.1,
        yaxis2: { rangemode: 'fixed', range: [0, 5] },
      },
    });
    expect(rs?.thickness).toBe(0.1);
    expect(rs && rangesliderYaxis(rs, 'yaxis')).toEqual({ rangemode: 'match' });
    expect(rs && rangesliderYaxis(rs, 'yaxis2')).toEqual({ rangemode: 'fixed', range: [0, 5] });
  });
});
