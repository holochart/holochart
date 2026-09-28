import type { HoverContext, SelectionQuery } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { barpolar } from '../barpolar/index.ts';
import type { ScatterpolarCalc } from '../scatterpolar/calc.ts';
import { scatterpolar } from '../scatterpolar/index.ts';
import { layoutFigure } from './__testing__/figure.ts';

const CTX: HoverContext = {
  fullLayout: {} as HoverContext['fullLayout'],
  xaxis: undefined,
  yaxis: undefined,
  transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
};

/** A box in container px around `(r px, deg)` of the subplot. */
function boxAt(sp: { cx: number; cy: number }, r: number, deg: number, half = 5): SelectionQuery {
  const a = (deg * Math.PI) / 180;
  const x = sp.cx + r * Math.cos(a);
  const y = sp.cy - r * Math.sin(a);
  return { kind: 'rect', x: [x - half, x + half], y: [y - half, y + half] };
}

describe('scatterpolar box / lasso selection (plotly.js scatter/select.js in px)', () => {
  const f = layoutFigure({
    data: [
      { type: 'scatterpolar', mode: 'markers', r: [1, 2, 3, 6], theta: [0, 90, 180, 270] },
      { type: 'scatterpolar', mode: 'lines', r: [1, 2], theta: [0, 90] },
    ],
    layout: { polar: { radialaxis: { range: [0, 4] } } },
  });
  const sp = f.subplot();
  const calc = f.calcs[0] as ScatterpolarCalc;
  const trace = f.fullData[0]!;
  // r = 1 of 4 over the radius.
  const px = (r: number): number => (r / 4) * sp.radius;

  it('selects the markers inside a box, in container px', () => {
    expect(scatterpolar.selectPoints!(calc, trace, boxAt(sp, px(2), 90), CTX)).toEqual([1]);
    expect(scatterpolar.selectPoints!(calc, trace, boxAt(sp, px(2), 0), CTX)).toEqual([]);
    const all: SelectionQuery = {
      kind: 'rect',
      x: [sp.cx - sp.radius, sp.cx + sp.radius],
      y: [sp.cy - sp.radius, sp.cy + sp.radius],
    };
    // r = 6 is past the radial range: hidden, so not selectable.
    expect(scatterpolar.selectPoints!(calc, trace, all, CTX)).toEqual([0, 1, 2]);
  });

  it('selects inside a lasso polygon', () => {
    // A triangle around the upper half-plane points (θ = 0°, 90°), not θ = 180°.
    const polygon: [number, number][] = [
      [sp.cx - 5, sp.cy + 5],
      [sp.cx + sp.radius, sp.cy + 5],
      [sp.cx - 5, sp.cy - sp.radius],
    ];
    const query: SelectionQuery = {
      kind: 'lasso',
      x: [sp.cx - 5, sp.cx + sp.radius],
      y: [sp.cy - sp.radius, sp.cy + 5],
      polygon,
    };
    expect(scatterpolar.selectPoints!(calc, trace, query, CTX)).toEqual([0, 1]);
  });

  it('selects nothing on traces without markers or text (Plotly)', () => {
    const q = boxAt(sp, px(2), 90);
    expect(
      scatterpolar.selectPoints!(f.calcs[1] as ScatterpolarCalc, f.fullData[1]!, q, CTX),
    ).toEqual([]);
  });

  it('reports r and theta in selection events', () => {
    expect(scatterpolar.eventData!(calc, trace, 2)).toEqual({ r: 3, theta: 180 });
  });
});

describe('barpolar box selection (plotly.js bar/select.js with barpolar di.ct)', () => {
  const f = layoutFigure({
    data: [{ type: 'barpolar', r: [2, 4], theta: ['a', 'b'] }],
    layout: { polar: { radialaxis: { range: [0, 5] } } },
  });
  const sp = f.subplot();
  const calc = f.calcs[0]!;
  const trace = f.fullData[0]!;

  it('selects bars whose outer-edge middle is inside', () => {
    // Bar 0 at `a` (0°) ends at r = 2 (80 px); bar 1 at `b` (180°) at r = 4 (160 px).
    expect(barpolar.selectPoints!(calc, trace, boxAt(sp, 80, 0), CTX)).toEqual([0]);
    expect(barpolar.selectPoints!(calc, trace, boxAt(sp, 160, 180), CTX)).toEqual([1]);
    // Inside bar 1 but away from its outer edge: not selected.
    expect(barpolar.selectPoints!(calc, trace, boxAt(sp, 60, 180), CTX)).toEqual([]);
    expect(barpolar.eventData!(calc, trace, 1)).toEqual({ r: 4, theta: 'b' });
  });
});
