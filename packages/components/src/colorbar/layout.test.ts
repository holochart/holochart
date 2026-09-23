import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import type { ColorbarSpec } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { measure } from '../__testing__/fixtures.ts';
import {
  colorbarEntries,
  colorbarMarginPush,
  fullColorbar,
  gradientRects,
  layoutColorbar,
  type ColorbarEnv,
} from './layout.ts';

const FONT = { family: 'Inter', size: 12, color: '#444' };
const ENV: ColorbarEnv = {
  fullLayout: { font: FONT } as unknown as FullLayout,
  size: { width: 700, height: 450 },
  plotArea: { x: 80, y: 100, width: 500, height: 250 },
  measure,
};

function spec(attributes: Record<string, unknown> = {}, extra: Partial<ColorbarSpec> = {}) {
  return {
    colorscale: [
      [0, 'rgb(0,0,0)'],
      [1, 'rgb(255,255,255)'],
    ],
    cmin: 0,
    cmax: 10,
    attributes,
    ...extra,
  } as ColorbarSpec;
}

describe('fullColorbar', () => {
  it('fills Plotly defaults, orientation-dependent for horizontal bars', () => {
    const v = fullColorbar({});
    expect(v).toMatchObject({ x: 1.02, xanchor: 'left', y: 0.5, yanchor: 'middle', len: 1 });
    expect(v.title.side).toBe('top');
    const h = fullColorbar({ orientation: 'h' });
    expect(h).toMatchObject({ x: 0.5, xanchor: 'center', y: 1.02, yanchor: 'bottom' });
    expect(h.title.side).toBe('right');
    expect(fullColorbar({ orientation: 'h', yref: 'container' })).toMatchObject({
      y: 1,
      yanchor: 'top',
    });
  });
});

describe('gradientRects', () => {
  it('draws a discrete (stepped) scale as one block per step', () => {
    const rects = gradientRects(
      [
        [0, 'red'],
        [0.5, 'red'],
        [0.5, 'blue'],
        [1, 'blue'],
      ],
      200,
      100,
      10,
      40,
      true,
    );
    expect(rects).toHaveLength(2);
    expect(rects[0]).toMatchObject({ x0: 10, x1: 40, y0: 150, y1: 200, color: [1, 0, 0, 1] });
    expect(rects[1]).toMatchObject({ y0: 100, y1: 150, color: [0, 0, 1, 1] });
  });

  it('splits interpolated segments into ≤ 1 px strips colored at their middle', () => {
    const rects = gradientRects(
      [
        [0, 'rgb(0,0,0)'],
        [1, 'rgb(255,255,255)'],
      ],
      0,
      100,
      0,
      10,
      false,
    );
    expect(rects).toHaveLength(100);
    expect(rects[0]).toMatchObject({ x0: 0, x1: 1, y0: 0, y1: 10 });
    expect(rects[0]?.color[0]).toBeCloseTo(0.005);
    expect(rects[99]?.color[0]).toBeCloseTo(0.995);
  });

  it('extends the end colors when the stops do not span 0–1', () => {
    const rects = gradientRects(
      [
        [0.25, 'red'],
        [0.75, 'red'],
      ],
      0,
      100,
      0,
      10,
      false,
    );
    expect(rects.map((r) => [r.x0, r.x1])).toEqual([
      [0, 25],
      [25, 75],
      [75, 100],
    ]);
  });
});

describe('colorbarEntries', () => {
  const trace = (i: number, visible: FullTrace['visible'] = true) =>
    ({ type: 't', _index: i, visible }) as unknown as FullTrace;

  it('keeps one bar per color axis and one per trace, in trace order', () => {
    const specs: Record<number, ColorbarSpec | null> = {
      0: spec({}, { coloraxis: 'coloraxis' }),
      1: spec({}, { coloraxis: 'coloraxis' }),
      2: spec(),
      3: null,
      4: spec(),
    };
    const module = { colorbar: (t: FullTrace) => specs[t._index] ?? null };
    const entries = colorbarEntries(
      [trace(0), trace(1), trace(2), trace(3), trace(4, 'legendonly')],
      {} as FullLayout,
      () => module,
    );
    expect(entries.map((e) => e.key)).toEqual(['coloraxis', 'trace2']);
  });

  it('skips modules without the hook and hooks that throw', () => {
    const entries = colorbarEntries([trace(0), trace(1)], {} as FullLayout, (t) =>
      t._index === 0
        ? {}
        : {
            colorbar: () => {
              throw new Error('broken');
            },
          },
    );
    expect(entries).toEqual([]);
  });
});

describe('layoutColorbar', () => {
  it('places a default vertical bar beside the plot, as long as the plot area', () => {
    const s = layoutColorbar(spec(), ENV);
    // x = 1.02 of the paper, anchored left; len 1 of the plot height, centered at y = 0.5.
    expect(s.box.left).toBe(Math.round(80 + 1.02 * 500));
    expect(s.box.top).toBe(100);
    expect(s.box.height).toBe(250);
    // Padding 10 + outline 1 on each end; thickness 30.
    expect(s.bar).toEqual({
      x0: s.box.left + 11,
      x1: s.box.left + 41,
      y0: 111,
      y1: 339,
    });
    // Box background first, outline after the gradient.
    expect(s.rects[0]).toMatchObject({ x0: s.box.left, y0: 100, y1: 350 });
    expect(s.box.width).toBeGreaterThan(41 + 10);
  });

  it('puts tick labels at their values along the bar, outside it', () => {
    const s = layoutColorbar(spec(), ENV);
    const byText = new Map(s.labels.map((l) => [l.text, l]));
    const zero = byText.get('0');
    const ten = byText.get('10');
    expect(zero?.y).toBeCloseTo(s.bar.y1);
    expect(ten?.y).toBeCloseTo(s.bar.y0);
    expect(byText.get('4')?.y).toBeCloseTo(s.bar.y1 - 0.4 * (s.bar.y1 - s.bar.y0));
    for (const l of s.labels) expect(l.x).toBeGreaterThan(s.bar.x1);
  });

  it('honors the axis tick API (dtick, prefix) and outside tick marks', () => {
    const s = layoutColorbar(
      spec({ dtick: 5, tickprefix: '$', ticks: 'outside', ticklen: 4 }),
      ENV,
    );
    expect(s.labels.map((l) => l.text)).toEqual(['$0', '$5', '$10']);
    const marks = s.rects.filter((r) => r.x0 === s.bar.x1 + 1 && r.x1 === s.bar.x1 + 5);
    expect(marks).toHaveLength(3);
  });

  it('shortens the bar for a top title and uses thickness/len in px', () => {
    const s = layoutColorbar(
      spec({
        title: { text: 'Temp', side: 'top' },
        lenmode: 'pixels',
        len: 200,
        thickness: 12,
      }),
      ENV,
    );
    const title = s.labels.find((l) => l.text === 'Temp');
    // Title font: 1.2 × the tick font size.
    expect(title?.font.size).toBe(14);
    expect(title?.y).toBe(s.box.top + 10);
    expect(s.box.height).toBe(200);
    expect(s.bar.y0).toBeCloseTo(s.box.top + 10 + 1 + 14 * 1.3 + 4);
    expect(s.bar.x1 - s.bar.x0).toBe(12);
  });

  it('lays a horizontal bar out along x with labels below it', () => {
    const s = layoutColorbar(spec({ orientation: 'h', len: 0.5 }), ENV);
    expect(s.bar.x1 - s.bar.x0).toBeCloseTo(250 - 22);
    expect(s.bar.y1 - s.bar.y0).toBe(30);
    // Centered on the plot area, bottom anchored just above it.
    expect(s.box.left + s.box.width / 2).toBeCloseTo(330, 0);
    expect(s.box.top + s.box.height).toBeCloseTo(100 - 0.02 * 250, 0);
    expect(s.labels.find((l) => l.text === '0')?.x).toBeCloseTo(s.bar.x0);
    for (const l of s.labels) expect(l.y).toBeGreaterThan(s.bar.y1);
  });

  it('pushes the right margin for the default vertical bar', () => {
    const margin = { l: 80, r: 80, t: 100, b: 100 };
    const push = colorbarMarginPush(spec(), ENV, margin);
    const width = layoutColorbar(spec(), ENV).box.width;
    expect(push?.r).toBe(Math.ceil((0.02 * (700 - 80) + width) / 1.02));
    expect(push?.l).toBeUndefined();
    expect(colorbarMarginPush(spec({ xref: 'container', x: 1 }), ENV, margin)).toBeUndefined();
  });
});
