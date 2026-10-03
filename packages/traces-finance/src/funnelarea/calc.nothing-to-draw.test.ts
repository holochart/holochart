/**
 * Funnel areas with nothing to draw: every stage hidden through `layout.hiddenlabels` (the total
 * is then 0), or a domain without room. Plotly's `setCoords` gives such a funnel no stage shapes;
 * the rest of the figure is laid out as if it were not there.
 */
import type { DomainInfo } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { figure } from '../__testing__/bars.ts';
import { calcFunnelarea, crossTraceLayoutFunnelarea, type FunnelareaCalc } from './calc.ts';

const LABELS = ['a', 'b', 'c', 'd'];
const AREA = { type: 'funnelarea', labels: LABELS, values: [40, 30, 20, 10] };
const RECT = { x: 100, y: 50, width: 400, height: 400 };

function laidOut(
  data: Record<string, unknown>[],
  layout: Record<string, unknown> = {},
  rects: (typeof RECT)[] = [RECT],
): FunnelareaCalc[] {
  const { fullData, fullLayout } = figure(data, layout);
  const calcs = fullData.map((t) => calcFunnelarea(t, { fullLayout }));
  crossTraceLayoutFunnelarea(
    fullData.map((trace, index) => ({
      trace,
      index,
      calc: calcs[index]!,
      domain: { x: [0, 1], y: [0, 1], rect: rects[index] ?? RECT } as DomainInfo,
    })),
    { fullLayout, width: 600, height: 500, plotArea: RECT },
  );
  return calcs;
}

describe('funnelarea with nothing to draw', () => {
  it('gives no stage a shape when every label is hidden', () => {
    const [calc] = laidOut([AREA], { hiddenlabels: LABELS });
    expect(calc!.slices.map((s) => s.hidden)).toEqual([true, true, true, true]);
    expect(calc!.vTotal).toBe(0);
    expect(calc!.slices.map((s) => s.corners)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(calc!.halfHeight).toBe(0);
    // The area itself is still laid out in its domain.
    expect(calc!.layout).toMatchObject({ cx: 300, cy: 250, r: 200 });
  });

  it('gives no stage a shape in a domain without width', () => {
    const [calc] = laidOut([AREA], {}, [{ ...RECT, width: 0 }]);
    expect(calc!.vTotal).toBe(100);
    expect(calc!.layout!.r).toBe(0);
    expect(calc!.slices.map((s) => s.corners)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(calc!.halfHeight).toBe(0);
  });

  it('a fully hidden member does not shrink the others of its scalegroup', () => {
    const [shown, hidden] = laidOut(
      [
        { ...AREA, scalegroup: 'g' },
        { type: 'funnelarea', labels: ['x', 'y'], values: [1, 2], scalegroup: 'g' },
      ],
      { hiddenlabels: ['x', 'y'] },
      [RECT, { ...RECT, x: 500 }],
    );
    // Alone in its group the visible funnel keeps the radius of its domain: 400 px wide and tall.
    expect(shown!.layout!.r).toBeCloseTo(200);
    expect(shown!.halfHeight).toBeCloseTo(200);
    const top = shown!.slices[0]!.corners!;
    expect(top.tr[0] - top.tl[0]).toBeCloseTo(400);
    expect(hidden!.vTotal).toBe(0);
    expect(hidden!.slices.map((s) => s.corners)).toEqual([undefined, undefined]);
    expect(hidden!.halfHeight).toBe(0);
  });
});
