// @vitest-environment jsdom
/**
 * Linked axes (E3.9) where two links meet: a `scaleanchor` constraint on an axis that also has
 * `matches` partners or an overlaying axis, a domain constraint solved again after automargin
 * moved the plot area, and a reversed `matches` group. The container is 640×400 with margins
 * l 40, r 20, t 30, b 50, so a full-size plot area is 580 × 320.
 */
import type { FigureInput } from '@mk7s/holochart-core';
import { afterEach, describe, expect, it } from 'vitest';
import { createChart, type Chart } from './chart.ts';
import type { ComponentModule } from './contracts.ts';
import { setup, type TestSetup } from './__testing__/fakes.ts';

const MARGIN = { l: 40, r: 20, t: 30, b: 50 };

let charts: Chart[] = [];
let setups: TestSetup[] = [];

afterEach(() => {
  for (const c of charts) c.destroy();
  for (const s of setups) s.container.remove();
  charts = [];
  setups = [];
});

async function chart(
  data: unknown[],
  layout: Record<string, unknown>,
  components: ComponentModule[] = [],
): Promise<Chart> {
  const s = setup({ width: 640, height: 400, components });
  setups.push(s);
  const c = createChart(
    s.container,
    { data, layout: { margin: MARGIN, ...layout } } as FigureInput,
    s.options,
  );
  charts.push(c);
  await c.ready;
  return c;
}

function range(c: Chart, id: string): number[] {
  return [...(c.axes.get(id)?.scale.range ?? [])];
}

/** px per linear unit of an axis. */
function pxPerUnit(c: Chart, id: string): number {
  const s = c.axes.get(id)?.scale;
  if (!s) throw new Error(`no axis ${id}`);
  return Math.abs(s.length / (s.range[1] - s.range[0]));
}

describe('scaleanchor on an axis with matches partners', () => {
  it('gives the matched axis the range the constraint widened its partner to', async () => {
    // x spans 5 units over 261 px, y 10 units over 320 px: x is the more zoomed-in axis, so the
    // constraint widens it. x2 matches x and must show that same widened range.
    const c = await chart(
      [
        { type: 'dots', x: [0, 5], y: [0, 10], size: 0 },
        { type: 'dots', x: [0, 5], y: [0, 1], xaxis: 'x2', yaxis: 'y2', size: 0 },
      ],
      {
        xaxis: { domain: [0, 0.45] },
        yaxis: { scaleanchor: 'x' },
        xaxis2: { domain: [0.55, 1], anchor: 'y2', matches: 'x' },
        yaxis2: { anchor: 'x2' },
      },
    );
    expect(pxPerUnit(c, 'x')).toBeCloseTo(pxPerUnit(c, 'y'), 6);
    const [x0, x1] = range(c, 'x') as [number, number];
    expect(x1 - x0).toBeGreaterThan(5);
    expect((x0 + x1) / 2).toBeCloseTo(2.5, 6);
    expect(range(c, 'x2')).toEqual([x0, x1]);
    expect(c.fullLayout?.['xaxis2']).toMatchObject({ range: [x0, x1] });
  });
});

describe("constrain: 'domain'", () => {
  const SQUARE = { type: 'dots', x: [0, 10], y: [0, 10], size: 0 };

  it('an overlaying axis takes the shrunk domain of the axis it overlays', async () => {
    const c = await chart([SQUARE, { ...SQUARE, x: [0, 50], xaxis: 'x2' }], {
      xaxis: { constrain: 'domain', constraintoward: 'left' },
      yaxis: { scaleanchor: 'x' },
      xaxis2: { overlaying: 'x', side: 'top' },
    });
    const base = c.subplots.get('xy');
    const over = c.subplots.get('x2y');
    // x shrank to keep the square square: 320 px of the 580 px plot area.
    expect(base?.rect.width).toBeCloseTo(320, 3);
    expect(over?.rect).toEqual(base?.rect);
    expect(c.fullLayout?.['xaxis2']).toMatchObject({ domain: c.fullLayout?.xaxis?.domain });
    // The input domain of neither axis was written to.
    expect(c.layout['xaxis2']).toEqual({ overlaying: 'x', side: 'top' });
  });

  it('is solved again on the plot area automargin settles on', async () => {
    const pushes: number[] = [];
    // Tick labels that need more room once the axis is autoranged (the push follows the range).
    const labels: ComponentModule = {
      name: 'labels',
      pushMargin: ({ axes }) => {
        const r = axes.get('y')?.scale.range ?? [0, 1];
        const l = 100 + 10 * Math.round(Math.abs(r[1] - r[0]));
        pushes.push(l);
        return { l };
      },
    };
    const c = await chart(
      [SQUARE],
      {
        xaxis: { constrain: 'domain', constraintoward: 'left' },
        yaxis: { scaleanchor: 'x' },
      },
      [labels],
    );
    // First pass on the default range [0, 1], then on the autoranged [0, 10].
    expect(pushes[0]).toBe(110);
    expect(pushes.at(-1)).toBe(200);
    const sp = c.subplots.get('xy');
    // Left margin 200: the plot area is x 200–620. The subplot keeps its left edge there and is
    // as wide as it is tall, so the square data is drawn square.
    expect(sp?.rect.x).toBe(200);
    expect(sp?.rect.height).toBe(320);
    expect(sp?.rect.width).toBeCloseTo(320, 3);
    expect(pxPerUnit(c, 'x')).toBeCloseTo(pxPerUnit(c, 'y'), 3);
    const d = c.fullLayout?.xaxis?.domain as number[];
    expect(d[0]).toBe(0);
    expect(d[1]).toBeCloseTo(320 / 420, 3);
  });
});

describe('a reversed matches group', () => {
  it('shares one reversed range that covers the data of every member', async () => {
    const c = await chart(
      [
        { type: 'dots', x: [0, 5], y: [0, 1], size: 0 },
        { type: 'dots', x: [3, 10], y: [0, 1], xaxis: 'x2', yaxis: 'y2', size: 0 },
      ],
      {
        xaxis: { domain: [0, 0.45], autorange: 'reversed' },
        xaxis2: { domain: [0.55, 1], anchor: 'y2', matches: 'x' },
        yaxis2: { anchor: 'x2' },
      },
    );
    const [r0, r1] = range(c, 'x') as [number, number];
    expect(r0).toBeGreaterThanOrEqual(10);
    expect(r1).toBeLessThanOrEqual(0);
    expect(range(c, 'x2')).toEqual([r0, r1]);
  });
});
