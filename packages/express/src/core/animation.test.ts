/** Animation frames from data (plan E23.4), as px builds them. */
import { describe, expect, it } from 'vitest';
import { bar, scatter } from '../index.ts';

const rows = [
  { year: 2000, country: 'A', continent: 'Asia', gdp: 1, life: 50 },
  { year: 2000, country: 'B', continent: 'Europe', gdp: 10, life: 70 },
  { year: 2005, country: 'A', continent: 'Asia', gdp: 2, life: 55 },
  { year: 2005, country: 'C', continent: 'Asia', gdp: 4, life: 60 },
  { year: 2010, country: 'B', continent: 'Europe', gdp: 20, life: 76 },
];

describe('animationFrame', () => {
  const f = scatter(rows, {
    x: 'gdp',
    y: 'life',
    color: 'continent',
    animationFrame: 'year',
    animationGroup: 'country',
  });

  it('makes one frame per value, in order, each with every group (empty when absent)', () => {
    expect(f.frames?.map((fr) => fr.name)).toEqual(['2000', '2005', '2010']);
    expect(f.frames?.map((fr) => fr.data.map((t) => [t['name'], t['ids']]))).toEqual([
      [
        ['Asia', ['A']],
        ['Europe', ['B']],
      ],
      [
        ['Asia', ['A', 'C']],
        ['Europe', []],
      ],
      [
        ['Asia', []],
        ['Europe', ['B']],
      ],
    ]);
    expect(f.data).toBe(f.frames?.[0]?.data);
    expect(f.data[0]?.['hovertemplate']).toBe(
      'continent=Asia<br>year=2000<br>gdp=%{x}<br>life=%{y}<extra></extra>',
    );
  });

  it('adds px play / pause buttons and a slider stepping through the frames', () => {
    const [menu] = f.layout['updatemenus'] as Record<string, unknown>[];
    expect(menu).toMatchObject({
      type: 'buttons',
      direction: 'left',
      x: 0.1,
      xanchor: 'right',
      y: 0,
    });
    const buttons = menu?.['buttons'] as Record<string, unknown>[];
    expect(buttons.map((b) => [b['label'], b['method'], (b['args'] as unknown[])[0]])).toEqual([
      ['&#9654;', 'animate', null],
      ['&#9724;', 'animate', [null]],
    ]);
    expect((buttons[0]?.['args'] as unknown[])[1]).toEqual({
      frame: { duration: 500, redraw: false },
      mode: 'immediate',
      fromcurrent: true,
      transition: { duration: 500, easing: 'linear' },
    });
    const [slider] = f.layout['sliders'] as Record<string, unknown>[];
    expect(slider).toMatchObject({
      active: 0,
      currentvalue: { prefix: 'year=' },
      len: 0.9,
      x: 0.1,
    });
    expect(
      (slider?.['steps'] as Record<string, unknown>[]).map((s) => [
        s['label'],
        (s['args'] as unknown[])[0],
      ]),
    ).toEqual([
      ['2000', ['2000']],
      ['2005', ['2005']],
      ['2010', ['2010']],
    ]);
  });

  it('fixes numeric axis ranges to every frame, padded 5%', () => {
    const range = (axis: string) => (f.layout[axis] as { range: [number, number] }).range;
    expect(range('xaxis')[0]).toBeCloseTo(1 - 0.95, 12);
    expect(range('xaxis')[1]).toBeCloseTo(20 + 0.95, 12);
    expect(range('yaxis')[0]).toBeCloseTo(50 - 1.3, 12);
    expect(range('yaxis')[1]).toBeCloseTo(76 + 1.3, 12);
    const log = scatter(rows, { x: 'gdp', y: 'life', animationFrame: 'year', logX: true });
    const [lo, hi] = (log.layout['xaxis'] as { range: number[] }).range as [number, number];
    expect(lo).toBeCloseTo(0 - 0.05 * Math.log10(20), 12);
    expect(hi).toBeCloseTo(Math.log10(20) * 1.05, 12);
    // Given ranges win (log ranges in data units, as px).
    const given = scatter(rows, {
      x: 'gdp',
      y: 'life',
      animationFrame: 'year',
      logX: true,
      rangeX: [1, 100],
    });
    expect((given.layout['xaxis'] as { range: number[] }).range).toEqual([0, 2]);
  });

  it('spans zero and the stacked totals on the value axis of bars', () => {
    const b = bar(rows, { x: 'continent', y: 'gdp', color: 'country', animationFrame: 'year' });
    expect((b.layout['yaxis'] as { range: number[] }).range).toEqual([0, 20 * 1.05]);
    expect(b.layout['xaxis']).not.toHaveProperty('range');
    // Bars redraw in Plotly; px writes `redraw: true` for them.
    const play = (
      (b.layout['updatemenus'] as Record<string, unknown>[])[0]?.['buttons'] as Record<
        string,
        unknown
      >[]
    )[0];
    expect(((play?.['args'] as unknown[])[1] as { frame: { redraw: boolean } }).frame.redraw).toBe(
      true,
    );
  });

  it('adds no frames or controls for a single frame value', () => {
    const one = scatter(rows.slice(0, 2), { x: 'gdp', y: 'life', animationFrame: 'year' });
    expect(one).not.toHaveProperty('frames');
    expect(one.layout).not.toHaveProperty('sliders');
  });

  it('orders frames by categoryOrders', () => {
    const g = scatter(rows, {
      x: 'gdp',
      y: 'life',
      animationFrame: 'year',
      categoryOrders: { year: [2010] },
    });
    expect(g.frames?.map((fr) => fr.name)).toEqual(['2010', '2000', '2005']);
  });
});
