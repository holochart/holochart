import type { HoverContext, HoverQuery } from '@mk7s/holochart-runtime';
import { IDENTITY_TRANSFORM } from '@mk7s/holochart-render';
import { describe, expect, it } from 'vitest';
import { build } from './__testing__/build.ts';
import { pie } from './index.ts';
import type { PieCalc } from './calc.ts';

const HEIGHT = 400;

function hover(b: ReturnType<typeof build>, x: number, y: number, k = 0) {
  const query: HoverQuery = {
    px: x,
    py: HEIGHT - y,
    xl: x,
    yl: HEIGHT - y,
    mode: 'closest',
    distance: 20,
    cx: x,
    cy: y,
  };
  const ctx: HoverContext = {
    fullLayout: b.fullLayout,
    xaxis: undefined,
    yaxis: undefined,
    transform: IDENTITY_TRANSFORM,
    domain: b.entries[k]!.domain,
  };
  return pie.hoverPoints!(b.calcs[k]!, b.traces[k]!, query, ctx);
}

/** Container point at Plotly angle `a` (degrees clockwise from 12 o'clock), `f` of the radius. */
function at(calc: PieCalc, deg: number, f: number): [number, number] {
  const { cx, cy, r } = calc.layout!;
  const a = (deg * Math.PI) / 180;
  return [cx + f * r * Math.sin(a), cy - f * r * Math.cos(a)];
}

const labelsAt = (b: ReturnType<typeof build>, deg: number, f: number) =>
  hover(b, ...at(b.calcs[0]!, deg, f)).map(
    (p) => b.calcs[0]!.slices.find((s) => s.i === p.pointIndex)?.label,
  );

describe('pie hover', () => {
  const data = { labels: ['a', 'b', 'c'], values: [2, 1, 1], sort: false };

  it('finds the slice under the pointer, per direction and rotation', () => {
    // a covers half the pie from 12 o'clock, on the right in both directions.
    const cw = build([{ ...data, direction: 'clockwise' }]);
    expect(labelsAt(cw, 90, 0.5)).toEqual(['a']);
    expect(labelsAt(cw, 225, 0.5)).toEqual(['b']);
    expect(labelsAt(cw, 315, 0.5)).toEqual(['c']);
    const ccw = build([data]);
    expect(labelsAt(ccw, 90, 0.5)).toEqual(['a']);
    expect(labelsAt(ccw, 315, 0.5)).toEqual(['b']);
    expect(labelsAt(ccw, 225, 0.5)).toEqual(['c']);
    const rotated = build([{ ...data, direction: 'clockwise', rotation: 90 }]);
    expect(labelsAt(rotated, 180, 0.5)).toEqual(['a']);
    expect(labelsAt(rotated, 20, 0.5)).toEqual(['c']);
  });

  it('returns nothing outside the pie and inside the hole', () => {
    const b = build([{ ...data, hole: 0.5 }]);
    expect(labelsAt(b, 90, 1.05)).toEqual([]);
    expect(labelsAt(b, 90, 0.4)).toEqual([]);
    expect(labelsAt(b, 90, 0.75)).toEqual(['a']);
    expect(hover(b, 5, 5)).toEqual([]);
  });

  it('hits pulled slices at their offset position only', () => {
    const b = build([{ ...data, direction: 'clockwise', pull: [0, 0.2, 0] }]);
    const calc = b.calcs[0]!;
    // b is pulled along its bisector (225°) by 0.2 r: its outer edge moved past r.
    expect(labelsAt(b, 225, 1.1)).toEqual(['b']);
    // The gap left near the center.
    expect(labelsAt(b, 225, 0.1)).toEqual([]);
    expect(calc.layout!.r).toBeCloseTo(200 / 1.2);
  });

  it('reports Plotly-shaped fields, labels and hover text', () => {
    const b = build([
      {
        labels: ['a', 'b', 'a'],
        values: [1, 2, 1],
        hovertext: ['ha', 'hb', 'hc'],
        hoverinfo: 'label+text+percent',
        customdata: ['c0', 'c1', 'c2'],
        direction: 'clockwise',
      },
    ]);
    const calc = b.calcs[0]!;
    // Sorted: a (2) then b (2): a is the first slice, on the right.
    const [p] = hover(b, ...at(calc, 90, 0.5));
    expect(p).toMatchObject({
      pointIndex: 0,
      pointIndices: [0, 2],
      distance: 0,
      text: 'ha',
      color: b.fullLayout.colorway[0],
      labels: { percent: '50%', value: '2' },
      hoverText: 'a<br>ha<br>50%',
    });
    expect(p!.fields).toMatchObject({
      label: 'a',
      value: 2,
      percent: 0.5,
      v: 2,
      pointNumbers: [0, 2],
      customdata: 'c0',
    });
    expect(p!.fields?.['pointNumber']).toBeUndefined();
    // Anchor on the bisector, (1 − rInscribed) of the radius out, in overlay px (y up).
    const [ax, ay] = at(calc, 90, 1 - calc.slices[0]!.rInscribed);
    expect(p!.px).toBeCloseTo(ax);
    expect(p!.py).toBeCloseTo(HEIGHT - ay);
  });

  it("builds every line for hoverinfo 'all'", () => {
    const b = build([{ labels: ['a'], values: [1234567], text: ['t'] }]);
    const [p] = hover(b, ...at(b.calcs[0]!, 90, 0.5));
    expect(p!.hoverText).toBe('a<br>t<br>1,234,567<br>100%');
    expect(p!.fields?.['pointNumber']).toBe(0);
  });
});
