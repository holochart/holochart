/**
 * Funnel areas of one `scalegroup` with different aspect ratios. Expected radii are worked out by
 * hand from Plotly's pie `groupScale` for funnel areas:
 *
 * - a grouped funnel area first gets `r = min(width, height) / 2` of its domain (the aspect ratio
 *   is not applied yet);
 * - its area is `rx · (1 + baseratio) / 2 · ry`, where `rx = r, ry = r / aspectratio` for
 *   `aspectratio > 1` and `ry = r, rx = r · aspectratio` otherwise (the funnel fits its box);
 * - the group's scale is the smallest area per unit of value, and each member is resized to
 *   `r = sqrt(scale · total / ((1 + baseratio) / 2) / aspectratio)`.
 *
 * The funnel is then `2 r` wide at the top and `2 r · aspectratio` tall.
 */
import type { DomainInfo } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { figure } from '../__testing__/bars.ts';
import { calcFunnelarea, crossTraceLayoutFunnelarea, type FunnelareaCalc } from './calc.ts';

const LABELS = ['a', 'b', 'c', 'd'];
/** Two 400 × 400 px domains side by side. */
const RECTS = [
  { x: 100, y: 50, width: 400, height: 400 },
  { x: 500, y: 50, width: 400, height: 400 },
];

function laidOut(data: Record<string, unknown>[]): FunnelareaCalc[] {
  const { fullData, fullLayout } = figure(data.map((t) => ({ type: 'funnelarea', ...t })));
  const calcs = fullData.map((t) => calcFunnelarea(t, { fullLayout }));
  crossTraceLayoutFunnelarea(
    fullData.map((trace, index) => ({
      trace,
      index,
      calc: calcs[index]!,
      domain: { x: [0, 1], y: [0, 1], rect: RECTS[index]! } as DomainInfo,
    })),
    { fullLayout, width: 1000, height: 500, plotArea: RECTS[0]! },
  );
  return calcs;
}

/** Drawn area of a funnel: the sum of its stages' trapezoids. */
function drawnArea(calc: FunnelareaCalc): number {
  let sum = 0;
  for (const s of calc.slices) {
    const c = s.corners!;
    sum += ((c.tr[0] - c.tl[0] + (c.br[0] - c.bl[0])) / 2) * (c.bl[1] - c.tl[1]);
  }
  return sum;
}

describe('funnelarea scalegroup with aspect ratios', () => {
  it('scales a tall (aspectratio > 1) and a flat funnel to the same value per px²', () => {
    const [tall, flat] = laidOut([
      { labels: LABELS, values: [40, 30, 20, 10], scalegroup: 'g', aspectratio: 2, baseratio: 0.5 },
      {
        labels: LABELS,
        values: [20, 15, 10, 5],
        scalegroup: 'g',
        aspectratio: 0.5,
        baseratio: 0.5,
      },
    ]);
    // Both start at r = 200.
    // Tall (total 100): rx = 200, ry = 100, area 200 · 0.75 · 100 = 15000: 150 per unit.
    // Flat (total 50): ry = 200, rx = 100, area 100 · 0.75 · 200 = 15000: 300 per unit.
    // Scale 150: tall r = sqrt(150 · 100 / 0.75 / 2) = 100; flat r = sqrt(150 · 50 / 0.75 / 0.5).
    expect(tall!.layout!.r).toBeCloseTo(100);
    expect(flat!.layout!.r).toBeCloseTo(Math.sqrt(20000));
    // Heights 2 r · aspectratio: the tall one fills its 400 px domain.
    expect(tall!.halfHeight).toBeCloseTo(200);
    expect(flat!.halfHeight).toBeCloseTo(Math.sqrt(20000) / 2);
    // Drawn areas (top 2 r, bottom r, height 2 r · aspectratio): 60000 and 30000 px², the ratio of
    // the totals.
    expect(drawnArea(tall!)).toBeCloseTo(60000, 4);
    expect(drawnArea(flat!)).toBeCloseTo(30000, 4);
    // Scale groups resize in place: the centers stay in the middle of the domains.
    expect(tall!.layout).toMatchObject({ cx: 300, cy: 250 });
    expect(flat!.layout).toMatchObject({ cx: 700, cy: 250 });
  });

  it('lets the tall funnel fill its domain when it is the one with less room per value', () => {
    const [tall, wide] = laidOut([
      { labels: LABELS, values: [40, 30, 20, 10], scalegroup: 'g', aspectratio: 4, baseratio: 0.5 },
      { labels: LABELS, values: [40, 30, 20, 10], scalegroup: 'g', aspectratio: 1, baseratio: 0.5 },
    ]);
    // Tall: rx = 200, ry = 50, area 200 · 0.75 · 50 = 7500: 75 per unit.
    // Wide: rx = ry = 200, area 200 · 0.75 · 200 = 30000: 300 per unit.
    // Scale 75: tall r = sqrt(75 · 100 / 0.75 / 4) = 50 (400 px tall: its whole domain);
    // wide r = sqrt(75 · 100 / 0.75 / 1) = 100.
    expect(tall!.layout!.r).toBeCloseTo(50);
    expect(tall!.halfHeight).toBeCloseTo(200);
    expect(wide!.layout!.r).toBeCloseTo(100);
    expect(wide!.halfHeight).toBeCloseTo(100);
    // Equal totals: equal drawn areas.
    expect(drawnArea(tall!)).toBeCloseTo(drawnArea(wide!), 4);
  });
});
