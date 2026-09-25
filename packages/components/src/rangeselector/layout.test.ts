import { describe, expect, it } from 'vitest';
import type { MeasureLine } from '../shared/text.ts';
import {
  layoutRangeselector,
  measureRangeselector,
  rangeselectorMarginPush,
  readRangeselector,
  resolveRangeselectorAnchors,
  type FullRangeselector,
} from './layout.ts';
import type { RangeselectorButton } from './step.ts';

/** 0.5 em per character. */
const measure: MeasureLine = (line, font) => line.length * font.size * 0.5;

const BUTTONS: RangeselectorButton[] = [
  { step: 'month', stepmode: 'backward', count: 1 },
  { step: 'month', stepmode: 'backward', count: 6, visible: false },
  { step: 'year', stepmode: 'todate', count: 1, label: 'Year to date' },
  { step: 'all', stepmode: 'backward', count: 1 },
];

function selector(over: Partial<FullRangeselector> = {}): FullRangeselector {
  return {
    visible: true,
    buttons: BUTTONS,
    x: 0,
    y: 1.02,
    xanchor: 'left',
    yanchor: 'bottom',
    font: { family: 'Arial', size: 12, color: '#444' },
    bgcolor: '#eee',
    activecolor: '#d4d4d4',
    bordercolor: '#444',
    borderwidth: 0,
    ...over,
  };
}

const plotArea = { x: 80, y: 100, width: 500, height: 300 };

describe('measureRangeselector', () => {
  it('sizes visible buttons: min 30 px, text + 10, 5 px apart, one line + 3 px tall', () => {
    const m = measureRangeselector(selector(), measure);
    // Height: max(12 · 1.3, 16) + 3.
    expect(m.height).toBe(19);
    expect(m.buttons.map((b) => b.label)).toEqual(['1m', 'Year to date', 'all']);
    // '1m' → 12 + 10 < 30; 'Year to date' → 72 + 10 = 82; 'all' → 30.
    expect(m.buttons.map((b) => b.width)).toEqual([30, 82, 30]);
    expect(m.buttons.map((b) => b.left)).toEqual([0, 35, 122]);
    expect(m.buttons.every((b) => b.top === 0 && b.height === 19)).toBe(true);
    expect(m.width).toBe(35 + 87 + 35);
  });

  it('offsets buttons by the border width', () => {
    const m = measureRangeselector(selector({ borderwidth: 2 }), measure);
    expect(m.buttons.map((b) => b.left)).toEqual([2, 37, 124]);
    expect(m.buttons[0]?.top).toBe(2);
  });

  it('grows with the font and with multi-line labels', () => {
    const big = measureRangeselector(
      selector({ font: { family: 'Arial', size: 20, color: '#444' } }),
      measure,
    );
    expect(big.height).toBe(20 * 1.3 + 3);
    const two = measureRangeselector(
      selector({ buttons: [{ step: 'day', stepmode: 'backward', count: 1, label: 'a<br>b' }] }),
      measure,
    );
    expect(two.height).toBeCloseTo(12 * 1.3 * 2 + 3);
    expect(two.buttons[0]?.label).toBe('a\nb');
  });
});

describe('resolveRangeselectorAnchors', () => {
  it('resolves auto by thirds of the plot area', () => {
    const r = (x: number, y: number) =>
      resolveRangeselectorAnchors({ x, y, xanchor: 'auto', yanchor: 'auto' });
    expect(r(0.1, 0.9)).toEqual({ xanchor: 'left', yanchor: 'top' });
    expect(r(0.5, 0.5)).toEqual({ xanchor: 'center', yanchor: 'middle' });
    expect(r(2 / 3, 1 / 3)).toEqual({ xanchor: 'right', yanchor: 'bottom' });
    expect(r(1 / 3, 2 / 3)).toEqual({ xanchor: 'left', yanchor: 'top' });
  });

  it('keeps explicit anchors', () => {
    expect(
      resolveRangeselectorAnchors({ x: 0.9, y: 0.1, xanchor: 'left', yanchor: 'top' }),
    ).toEqual({ xanchor: 'left', yanchor: 'top' });
  });
});

describe('layoutRangeselector', () => {
  it('places the row above the plot area by default (left / bottom anchors)', () => {
    const l = layoutRangeselector(selector(), plotArea, measure);
    expect(l.left).toBe(80);
    // 100 + 300 · (1 − 1.02) − 19 = 75.
    expect(l.top).toBe(75);
    expect(l.width).toBe(157);
    expect(l.height).toBe(19);
  });

  it('moves the corner by the anchors, then rounds', () => {
    const right = layoutRangeselector(selector({ x: 1, xanchor: 'right' }), plotArea, measure);
    expect(right.left).toBe(580 - 157);
    const center = layoutRangeselector(
      selector({ x: 0.5, y: 0.5, xanchor: 'center', yanchor: 'middle' }),
      plotArea,
      measure,
    );
    expect(center.left).toBe(Math.round(330 - 157 / 2));
    expect(center.top).toBe(Math.round(250 - 19 / 2));
    const top = layoutRangeselector(selector({ y: 1, yanchor: 'top' }), plotArea, measure);
    expect(top.top).toBe(100);
    const auto = layoutRangeselector(
      selector({ x: 0.9, y: 0.9, xanchor: 'auto', yanchor: 'auto' }),
      plotArea,
      measure,
    );
    expect(auto.xanchor).toBe('right');
    expect(auto.yanchor).toBe('top');
    expect(auto.left).toBe(Math.round(80 + 450 - 157));
    expect(auto.top).toBe(130);
  });

  it('ceils a fractional row size', () => {
    const l = layoutRangeselector(
      selector({ font: { family: 'Arial', size: 13, color: '#444' } }),
      plotArea,
      measure,
    );
    // 13 · 1.3 + 3 = 19.9.
    expect(l.height).toBe(20);
  });
});

describe('rangeselectorMarginPush', () => {
  const size = { width: 700, height: 500 };
  const margin = { l: 80, r: 80, t: 100, b: 80 };

  it('pushes the top margin for the default position above the plot', () => {
    // top = (19 + 0.02 · (500 − 80)) / 1.02.
    expect(rangeselectorMarginPush(selector(), size, margin, measure)).toEqual({
      t: Math.ceil((19 + 0.02 * 420) / 1.02),
    });
  });

  it('pushes the right margin for a row right of the plot', () => {
    const push = rangeselectorMarginPush(
      selector({ x: 1.02, y: 0.5, yanchor: 'middle' }),
      size,
      margin,
      measure,
    );
    expect(push).toEqual({ r: Math.ceil((0.02 * 620 + 157) / 1.02) });
  });

  it('pushes nothing without visible buttons', () => {
    const hidden = selector({
      buttons: [{ step: 'all', stepmode: 'backward', count: 1, visible: false }],
    });
    expect(rangeselectorMarginPush(hidden, size, margin, measure)).toBeUndefined();
  });
});

describe('readRangeselector', () => {
  it('reads a visible selector with defaults for missing fields', () => {
    const sel = readRangeselector({
      rangeselector: {
        visible: true,
        buttons: [{ step: 'month', stepmode: 'backward', count: 1 }, { step: 'bogus' }],
        bgcolor: '#222',
      },
    });
    expect(sel?.buttons).toHaveLength(1);
    expect(sel?.xanchor).toBe('left');
    expect(sel?.yanchor).toBe('bottom');
    expect(sel?.activecolor).toBe('#222');
    expect(sel?.font.size).toBe(12);
    expect(sel?.borderwidth).toBe(0);
  });

  it('ignores hidden or missing selectors', () => {
    expect(readRangeselector({})).toBeUndefined();
    expect(readRangeselector(undefined)).toBeUndefined();
    expect(readRangeselector({ rangeselector: { visible: false, buttons: [] } })).toBeUndefined();
  });
});
