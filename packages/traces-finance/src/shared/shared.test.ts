import type { FullLayout } from '@mk7s/holochart-core';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { calcOf, daily, hoverCtx } from '../__testing__/figure.ts';
import { distinctMinDiff, priceExtremes } from './calc.ts';
import { describePrices } from './describe.ts';
import { barUnderPointer, priceHoverPoints, priceSelectPoints } from './hover.ts';
import { candlestickLegendIcon, ohlcLegendIcon } from './legend.ts';

const DAY = 86_400_000;
const T0 = Date.UTC(2024, 0, 1);
const ROWS = [
  [1, 3, 0.5, 2],
  [2, 2.5, 1, 1.5],
  [1.5, 2, 1, 1.5],
  [1.5, 4, 1.5, 3.5],
] as const;
const DATE_AXES = {
  x: { type: 'date' as const, range: [T0 - DAY, T0 + 4 * DAY] as [number, number] },
};

/** Plotly's direction rule, written plainly: close vs open, else vs the previous close. */
function naiveDirections(o: number[], c: number[]): number[] {
  const out: number[] = [];
  let up = true;
  let prev: number | null = null;
  for (let i = 0; i < o.length; i++) {
    if (c[i] === o[i]) {
      if (prev !== null && c[i] !== prev) up = c[i]! > prev;
    } else up = c[i]! > o[i]!;
    prev = c[i]!;
    out.push(up ? 1 : 0);
  }
  return out;
}

describe('price calc', () => {
  it('linearizes dates and prices and sets each direction', () => {
    const { calc } = calcOf(daily(ROWS), DATE_AXES);
    expect(Array.from(calc.pos)).toEqual([T0, T0 + DAY, T0 + 2 * DAY, T0 + 3 * DAY]);
    expect(Array.from(calc.close)).toEqual([2, 1.5, 1.5, 3.5]);
    // The third bar is unchanged (close = open) and keeps falling: its close equals the last one.
    expect(Array.from(calc.increasing)).toEqual([1, 0, 0, 1]);
    expect(Array.from(calc.drawn)).toEqual([0, 1, 2, 3]);
    expect(calc.sorted).toBe(true);
    expect(calc.minDiff).toBe(DAY);
  });

  it('counts the first unchanged bars as increasing and compares later ones with the last close', () => {
    const { calc } = calcOf({
      open: [5, 5, 4, 6],
      high: [6, 6, 6, 7],
      low: [4, 4, 3, 5],
      close: [5, 4, 4, 6],
    });
    expect(Array.from(calc.increasing)).toEqual([1, 0, 0, 1]);
  });

  it('defaults x to the point indices and skips bars with a missing value', () => {
    const { calc } = calcOf({
      open: [1, null, 3, 4],
      high: [2, 3, 'x', 5],
      low: [0, 1, 2, 3],
      close: [2, 2, 3, 4],
    });
    expect(Array.from(calc.pos)).toEqual([0, 1, 2, 3]);
    expect(Array.from(calc.drawn)).toEqual([0, 3]);
    // Missing points still count for the spacing (Plotly's `distinctVals` of every x).
    expect(calc.minDiff).toBe(1);
  });

  it('aligns x to periods and keeps the given x for hover', () => {
    const { calc } = calcOf(
      { ...daily(ROWS, '2024-01-10'), xperiod: 'M1', xperiodalignment: 'start' },
      { x: { type: 'date' } },
    );
    expect(new Set(calc.pos)).toEqual(new Set([Date.UTC(2024, 0, 1)]));
    expect(calc.origPos[0]).toBe(Date.UTC(2024, 0, 10));
    expect(calc.period?.ends[0]).toBe(Date.UTC(2024, 1, 1));
  });

  it('drops bars inside range breaks and compresses the others', () => {
    // 2024-01-06 and 07 are a weekend.
    const rows = Array.from({ length: 8 }, () => [1, 2, 0, 1.5] as const);
    const { calc } = calcOf(daily(rows), {
      x: { type: 'date', rangebreaks: [{ bounds: ['sat', 'mon'] }] },
    });
    expect(Array.from(calc.drawn)).toEqual([0, 1, 2, 3, 4, 7]);
    // Friday → Monday is one day in the compressed space.
    expect(calc.pos[7]! - calc.pos[4]!).toBe(DAY);
    expect(calc.minDiff).toBe(DAY);
  });

  it('has the log of the prices on log axes', () => {
    const { calc } = calcOf(
      { open: [10], high: [100], low: [1], close: [10] },
      { y: { type: 'log' } },
    );
    expect([calc.low[0], calc.open[0], calc.high[0]]).toEqual([0, 1, 2]);
  });

  it('matches the naive direction rule (property)', () => {
    const price = fc.integer({ min: 1, max: 5 });
    fc.assert(
      fc.property(fc.array(fc.tuple(price, price), { minLength: 1, maxLength: 30 }), (rows) => {
        const o = rows.map((r) => r[0]);
        const c = rows.map((r) => r[1]);
        const { calc } = calcOf({ open: o, high: o.map(() => 9), low: o.map(() => 0), close: c });
        expect(Array.from(calc.increasing)).toEqual(naiveDirections(o, c));
      }),
    );
  });

  it('reports x padded by half the spacing and padded lows and highs', () => {
    const { calc } = calcOf(daily(ROWS), DATE_AXES);
    const ext = priceExtremes(calc);
    expect(ext.x?.min[0]?.l).toBe(T0 - DAY / 2);
    expect(ext.x?.max[0]?.l).toBe(T0 + 3.5 * DAY);
    expect(ext.x?.min[0]?.extrapad).toBeUndefined();
    expect(ext.y?.min[0]).toMatchObject({ l: 0.5, extrapad: true });
    expect(ext.y?.max[0]).toMatchObject({ l: 4, extrapad: true });
  });
});

describe('distinctMinDiff (Plotly distinctVals)', () => {
  it('handles single values, duplicates and gaps', () => {
    expect(distinctMinDiff([])).toBeNaN();
    expect(distinctMinDiff([5])).toBe(1);
    expect(distinctMinDiff([2, 2, 2])).toBe(1);
    expect(distinctMinDiff([3, NaN, 1, 10])).toBe(2);
    // Values within 1/10000 of the average spacing merge.
    expect(distinctMinDiff([0, 1e-6, 1, 2])).toBe(1);
  });

  it('equals the smallest gap of the distinct sorted values (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 2 }), (values) => {
        const distinct = [...new Set(values)].sort((a, b) => a - b);
        let expected = distinct.length > 1 ? Infinity : 1;
        for (let i = 1; i < distinct.length; i++) {
          expected = Math.min(expected, distinct[i]! - distinct[i - 1]!);
        }
        expect(distinctMinDiff(values)).toBe(expected);
        expect(distinctMinDiff(Float64Array.from(values).sort())).toBe(expected);
      }),
    );
  });
});

describe('price hover', () => {
  const query = (xl: number, yl: number, mode: 'closest' | 'x' | 'y' = 'closest') => ({
    px: 0,
    py: 0,
    xl,
    yl,
    mode,
    distance: 20,
  });

  it("shows Plotly's label: the x value, then open, high, low and close with the direction", () => {
    const s = calcOf({ ...daily(ROWS), name: 'ACME' }, DATE_AXES);
    const [p, ...rest] = priceHoverPoints(s.calc, s.trace, query(T0 + DAY + 1000, 2), hoverCtx(s));
    expect(rest).toEqual([]);
    expect(p).toMatchObject({
      pointIndex: 1,
      x: '2024-01-02',
      color: 'rgb(255, 65, 54)',
      hoverText: 'Jan 2, 2024<br>open: 2<br>high: 2.5<br>low: 1<br>close: 1.5  ▼',
      fields: { open: 2, high: 2.5, low: 1, close: 1.5, change: -0.5, changepercent: -25 },
    });
    // Beside the bar (its right tick end), at the middle of the body.
    const tick = 0.3 * DAY;
    expect(p!.px).toBeCloseTo((T0 + DAY + tick) * 10);
    expect(p!.py).toBe(17.5);
  });

  it('leaves the x value to the common label in x modes and names unified rows', () => {
    const s = calcOf({ ...daily(ROWS), name: 'ACME' }, DATE_AXES);
    // Along x only: the pointer may be above the bar.
    const [x] = priceHoverPoints(s.calc, s.trace, query(T0, 99, 'x'), hoverCtx(s));
    expect(x?.hoverText).toBe('open: 1<br>high: 3<br>low: 0.5<br>close: 2  ▲');
    const unified = { ...s, fullLayout: { ...s.fullLayout, hovermode: 'x unified' } as FullLayout };
    const [u] = priceHoverPoints(s.calc, s.trace, query(T0, 99, 'x'), hoverCtx(unified));
    expect(u?.hoverText).toBe('ACME : open: 1<br>high: 3<br>low: 0.5<br>close: 2  ▲');
  });

  it('needs the pointer between low and high in closest mode, and within the slot along x', () => {
    const s = calcOf(daily(ROWS), DATE_AXES);
    expect(priceHoverPoints(s.calc, s.trace, query(T0, 3.5), hoverCtx(s))).toEqual([]);
    expect(barUnderPointer(s.calc, query(T0 + 0.49 * DAY, 1))).toBe(0);
    expect(barUnderPointer(s.calc, query(T0 + 0.51 * DAY, 1))).toBe(1);
    expect(barUnderPointer(s.calc, query(T0 + 3.6 * DAY, 2, 'x'))).toBe(-1);
    // Along y: the nearest bar whose range holds the pointer.
    expect(barUnderPointer(s.calc, query(T0 + 3 * DAY, 3.9, 'y'))).toBe(3);
  });

  it('finds the same bar in unsorted data', () => {
    const rows = daily(ROWS);
    const order = [2, 0, 3, 1];
    const shuffled = Object.fromEntries(
      Object.entries(rows).map(([k, v]) => [k, order.map((i) => (v as unknown[])[i])]),
    );
    const s = calcOf(shuffled, DATE_AXES);
    expect(s.calc.sorted).toBe(false);
    const k = barUnderPointer(s.calc, query(T0 + DAY, 2));
    expect(s.calc.drawn[k]).toBe(3);
  });

  it('follows hoverinfo, text and hovertext', () => {
    const s = calcOf(
      { ...daily(ROWS), hoverinfo: 'x+text', text: ['a', 'b', 'c', 'd'], hovertext: 'all' },
      DATE_AXES,
    );
    const [p] = priceHoverPoints(s.calc, s.trace, query(T0, 1), hoverCtx(s));
    expect(p?.hoverText).toBe('Jan 1, 2024<br>all');
    const t = calcOf({ ...daily(ROWS), hoverinfo: 'y+text', text: ['a', 'b'] }, DATE_AXES);
    const [q] = priceHoverPoints(t.calc, t.trace, query(T0, 1), hoverCtx(t));
    expect(q?.hoverText).toBe('open: 1<br>high: 3<br>low: 0.5<br>close: 2  ▲<br>a');
    const none = calcOf({ ...daily(ROWS), hoverinfo: 'none' }, DATE_AXES);
    expect(priceHoverPoints(none.calc, none.trace, query(T0, 1), hoverCtx(none))).toEqual([]);
  });

  it('formats prices with yhoverformat', () => {
    const s = calcOf({ ...daily(ROWS), yhoverformat: '$.2f', xhoverformat: '%b %d' }, DATE_AXES);
    const [p] = priceHoverPoints(s.calc, s.trace, query(T0, 1), hoverCtx(s));
    expect(p?.hoverText).toBe(
      'Jan 01<br>open: $1.00<br>high: $3.00<br>low: $0.50<br>close: $2.00  ▲',
    );
  });

  it('splits the label per price with hoverlabel.split, merging equal prices', () => {
    const s = calcOf({ ...daily(ROWS), hoverlabel: { split: true } }, DATE_AXES);
    const points = priceHoverPoints(s.calc, s.trace, query(T0 + 2 * DAY, 1.5, 'x'), hoverCtx(s));
    expect(points.map((p) => p.hoverText)).toEqual([
      'high: 2',
      'open: 1.5<br>close: 1.5',
      'low: 1',
    ]);
    expect(points.map((p) => p.py)).toEqual([20, 15, 10]);
    expect(points.every((p) => p.multi === true && p.showName === false)).toBe(true);
    expect(points.map((p) => p.spikeDistance)).toEqual([Infinity, undefined, Infinity]);
    const [closest] = priceHoverPoints(s.calc, s.trace, query(T0, 1), hoverCtx(s));
    expect(closest?.hoverText).toBe('(Jan 1, 2024, high: 3)');
  });

  it('selects the bars whose center and mid-body are inside the selection', () => {
    const s = calcOf(daily(ROWS), DATE_AXES);
    const rect = {
      kind: 'rect' as const,
      x: [T0 - 1, T0 + 1.5 * DAY] as const,
      y: [1.4, 2] as const,
    };
    expect(priceSelectPoints(s.calc, rect)).toEqual([0, 1]);
    const lasso = {
      kind: 'lasso' as const,
      x: [T0 - 1, T0 + 4 * DAY] as const,
      y: [0, 5] as const,
      polygon: [
        [T0 - 1, 0],
        [T0 + 4 * DAY, 0],
        [T0 + 4 * DAY, 5],
      ] as [number, number][],
    };
    expect(priceSelectPoints(s.calc, lasso)).toEqual([2, 3]);
  });
});

describe('describe and legend', () => {
  it('summarizes the bars and tabulates their prices', () => {
    const s = calcOf({ ...daily(ROWS), name: 'ACME' }, DATE_AXES);
    const d = describePrices(
      {
        trace: s.trace,
        calc: s.calc,
        index: 0,
        fullLayout: s.fullLayout,
        xaxis: s.xaxis,
        yaxis: s.yaxis,
        maxRows: 2,
      },
      'candlestick',
    );
    expect(d.summary).toBe(
      'Candlestick chart "ACME": 4 candles from Jan 1, 2024 to Jan 4, 2024. Close from 2 to 3.5; lowest low 0.5 at Jan 1, 2024, highest high 4 at Jan 4, 2024. 2 rising, 2 falling.',
    );
    expect(d.table?.columns).toEqual(['x', 'open', 'high', 'low', 'close']);
    expect(d.table?.rows).toEqual([
      ['Jan 1, 2024', '1', '3', '0.5', '2'],
      ['Jan 2, 2024', '2', '2.5', '1', '1.5'],
    ]);
    expect(d.table?.total).toBe(4);
  });

  it('draws a falling and a rising glyph in their styles', () => {
    const o = calcOf({ ...daily(ROWS), decreasing: { line: { dash: 'dot', width: 3 } } });
    const glyph = ohlcLegendIcon(o.trace);
    expect(glyph.kind).toBe('parts');
    expect(glyph.parts).toEqual([
      { segment: [15, 0, 0, 0], color: 'rgb(255, 65, 54)', width: 3, dash: 'dot' },
      { segment: [8, -6, 8, 6], color: 'rgb(255, 65, 54)', width: 3, dash: 'dot' },
      { segment: [-15, 0, 0, 0], color: 'rgb(61, 153, 112)', width: 2, dash: 'solid' },
      { segment: [-8, -6, -8, 6], color: 'rgb(61, 153, 112)', width: 2, dash: 'solid' },
    ]);
    const c = calcOf({ type: 'candlestick', ...daily(ROWS) });
    expect(candlestickLegendIcon(c.trace).parts?.[0]).toEqual({
      rect: [0, -6, 8, 6],
      color: 'rgba(255, 65, 54, 0.5)',
      lineColor: 'rgb(255, 65, 54)',
      lineWidth: 2,
    });
  });
});
