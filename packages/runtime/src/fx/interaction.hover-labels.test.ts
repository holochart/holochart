// @vitest-environment jsdom
/**
 * What a pointer hover draws: the `y` and `y unified` hovermodes, the common axis label of the
 * closest trace, a custom label from `config.renderHover`, `hovermode` turned off while a point is
 * hovered, and which points get spike lines when the hovered points and the spiked ones differ
 * (`spikesnap`, `spikedistance`; the basics are in `linked-axes.test.ts`). Same figure as
 * `interaction.test.ts`: 640×400, margins l 40, r 20, t 30, b 50, so the plot area is x 40–620,
 * y 30–350; with x in [0, 10] and y in [0, 100], data (x, y) sits at container
 * (40 + 58·x, 350 − 3.2·y).
 */
import type { FigureInput } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type { ChartEventName, ChartPoint } from '../events.ts';
import { setup, type TestSetup } from '../__testing__/fakes.ts';

const MARGIN = { l: 40, r: 20, t: 30, b: 50 };
const RANGES = { xaxis: { range: [0, 10] }, yaxis: { range: [0, 100] } };
const DOTS = { type: 'dots', x: [0, 5, 10], y: [0, 50, 100] };

const cx = (x: number): number => 40 + 58 * x;
const cy = (y: number): number => 350 - 3.2 * y;

let t: TestSetup;
let charts: Chart[] = [];

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  vi.restoreAllMocks();
});

async function chart(
  data: unknown[],
  layout: Record<string, unknown> = {},
  config: Record<string, unknown> = {},
): Promise<Chart> {
  const c = createChart(
    t.container,
    { data, layout: { margin: MARGIN, ...RANGES, ...layout }, config } as FigureInput,
    t.options,
  );
  charts.push(c);
  await c.ready;
  return c;
}

function fire(c: Chart, type: string, x: number, y: number): void {
  c.three.root.canvas.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      bubbles: true,
    }),
  );
}

/** Move the pointer and deliver the frame its hover runs in. */
function hoverAt(c: Chart, x: number, y: number): void {
  fire(c, 'pointermove', x, y);
  t.scheduler.step();
}

function record(c: Chart, ...names: ChartEventName[]): string[] {
  const log: string[] = [];
  for (const name of names) c.on(name, () => void log.push(name));
  return log;
}

function labels(c: Chart): string[] {
  return [...c.element.querySelectorAll<HTMLElement>('.holochart-hoverlabel')]
    .filter((el) => el.style.display !== 'none')
    .map((el) => el.textContent ?? '');
}

function axisLabel(c: Chart): HTMLElement | null {
  return c.element.querySelector<HTMLElement>('.holochart-hoverlabel-axis');
}

/** The spike lines showing, as `'v'` (vertical) or `'h'` (horizontal), background lines included. */
function spikes(c: Chart): string[] {
  return [...c.element.querySelectorAll<SVGLineElement>('.holochart-spikeline')]
    .filter(
      (el) => el.style.display !== 'none' && (el.ownerSVGElement?.style.display ?? '') !== 'none',
    )
    .map((el) => (el.getAttribute('x1') === el.getAttribute('x2') ? 'v' : 'h'));
}

describe("hovermode 'y' and 'y unified'", () => {
  // Both traces have a point at y = 50: x = 5 on A, x = 2 on B.
  const A = { ...DOTS, name: 'A' };
  const B = { type: 'dots', x: [1, 2, 3], y: [0, 50, 100], name: 'B' };

  it("'y' labels each trace with its x value and shows y beside the y axis", async () => {
    const c = await chart([A, B], { hovermode: 'y' });
    // Far from both points along x: only the distance along y counts.
    hoverAt(c, cx(8), cy(50) + 2);
    expect(labels(c).sort()).toEqual(['2B', '5A']);
    const common = axisLabel(c);
    expect(common?.textContent).toBe('50');
    // Left of the plot area (x 40), at the height of the hovered points.
    expect(Number.parseFloat(common?.style.left ?? '')).toBeLessThan(40);
    expect(common?.style.top).toBe(`${cy(50)}px`);
  });

  it("'y unified' titles one box with the y value and lists each trace's x", async () => {
    const c = await chart([A, B], { hovermode: 'y unified' });
    hoverAt(c, cx(8), cy(50) + 2);
    const box = c.element.querySelector<HTMLElement>('.holochart-hoverlabel-unified');
    expect(box?.style.display).toBe('block');
    expect(box?.firstElementChild?.textContent).toBe('50');
    const rows = [...(box?.querySelectorAll('.holochart-hoverlabel-row') ?? [])];
    expect(rows.map((r) => r.textContent)).toEqual(['A : 5', 'B : 2']);
  });
});

describe('the common axis label', () => {
  it('shows the value of the trace closest to the pointer, at that point', async () => {
    // In x mode both traces are hovered near x = 5, at slightly different x values.
    const near = { type: 'dots', x: [0, 5.2, 10], y: [10, 20, 30], name: 'B' };
    const c = await chart([{ ...DOTS, name: 'A' }, near], { hovermode: 'x' });
    hoverAt(c, cx(5), cy(80));
    expect(labels(c)).toHaveLength(2);
    expect(axisLabel(c)?.textContent).toBe('5');
    expect(axisLabel(c)?.style.left).toBe(`${cx(5)}px`);
    fire(c, 'pointerleave', 700, 500);
    // The same two points from the other side: now the later trace's point is the closest.
    hoverAt(c, cx(5.2) + 1, cy(80));
    expect(labels(c)).toHaveLength(2);
    expect(axisLabel(c)?.textContent).toBe('5.2');
    expect(axisLabel(c)?.style.left).toBe(`${Math.round(cx(5.2))}px`);
  });
});

describe('config.renderHover', () => {
  it('shows the element it returns at the point, instead of the built-in label', async () => {
    const seen: (readonly ChartPoint[])[] = [];
    const c = await chart(
      [DOTS],
      {},
      {
        renderHover(points: readonly ChartPoint[]) {
          seen.push(points);
          const el = document.createElement('div');
          el.className = 'my-label';
          el.textContent = `custom ${String(points[0]?.x)}`;
          return el;
        },
      },
    );
    hoverAt(c, cx(5) + 3, cy(50));
    const el = c.element.querySelector<HTMLElement>('.holochart-fx .my-label');
    expect(el?.textContent).toBe('custom 5');
    expect(el?.style.position).toBe('absolute');
    // At the point's height (not the pointer's), just right of it.
    expect(el?.style.top).toBe(`${cy(50)}px`);
    expect(Number.parseFloat(el?.style.left ?? '')).toBeGreaterThanOrEqual(cx(5));
    expect(Number.parseFloat(el?.style.left ?? '')).toBeLessThan(cx(5) + 20);
    expect(labels(c)).toEqual([]);
    expect(seen[0]?.[0]).toMatchObject({ curveNumber: 0, pointNumber: 1, x: 5, y: 50 });
    // It goes away with the hover.
    fire(c, 'pointerleave', 700, 500);
    expect(el?.isConnected).toBe(false);
  });

  it('falls back to the built-in label when it returns null', async () => {
    const c = await chart([DOTS], {}, { renderHover: () => null });
    hoverAt(c, cx(5), cy(50));
    expect(labels(c)).toEqual(['(5, 50)']);
  });
});

describe('hovermode turned off', () => {
  it('ends the hover under the resting pointer on the next frame', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'hover', 'unhover');
    hoverAt(c, cx(5), cy(50));
    expect(labels(c)).toEqual(['(5, 50)']);
    await c.relayout({ hovermode: false });
    t.scheduler.step();
    expect(log).toEqual(['hover', 'unhover']);
    expect(labels(c)).toEqual([]);
    // And nothing hovers afterwards.
    hoverAt(c, cx(10) - 2, cy(100) + 2);
    expect(log).toEqual(['hover', 'unhover']);
  });
});

describe('spike lines when no label shows', () => {
  const SPIKES = { showspikes: true };
  /** 145 px left of and 96 px above the middle point: outside the 20 px hoverdistance. */
  const AWAY: [number, number] = [cx(2.5), cy(80)];

  it("draws none by default: 'hovered data' spikes only labelled points", async () => {
    const c = await chart([DOTS], {
      xaxis: { ...RANGES.xaxis, ...SPIKES },
      yaxis: { ...RANGES.yaxis, ...SPIKES },
    });
    hoverAt(c, ...AWAY);
    expect(labels(c)).toEqual([]);
    expect(spikes(c)).toEqual([]);
    // On the point they show, one background and one spike per axis.
    hoverAt(c, cx(5), cy(50));
    expect(spikes(c).sort()).toEqual(['h', 'h', 'v', 'v']);
  });

  it("spikes the closest point however far with spikesnap 'data' and no spikedistance limit", async () => {
    const c = await chart([DOTS], {
      xaxis: { ...RANGES.xaxis, ...SPIKES, spikesnap: 'data' },
    });
    hoverAt(c, ...AWAY);
    expect(labels(c)).toEqual([]);
    expect(spikes(c)).toEqual(['v', 'v']);
    // Through the middle point, the nearest of the three.
    const line = c.element.querySelector<SVGLineElement>('.holochart-spikeline');
    expect(Number(line?.getAttribute('x1'))).toBeCloseTo(cx(5), 6);
  });

  it("only on the axes that snap to 'data': an axis on 'hovered data' stays without", async () => {
    const c = await chart([DOTS], {
      xaxis: { ...RANGES.xaxis, ...SPIKES, spikesnap: 'data' },
      yaxis: { ...RANGES.yaxis, ...SPIKES },
    });
    hoverAt(c, ...AWAY);
    expect(spikes(c)).toEqual(['v', 'v']);

    c.destroy();
    const d = await chart([DOTS], {
      xaxis: { ...RANGES.xaxis, ...SPIKES },
      yaxis: { ...RANGES.yaxis, ...SPIKES, spikesnap: 'data' },
    });
    hoverAt(d, ...AWAY);
    expect(spikes(d)).toEqual(['h', 'h']);
    // With a label, both axes spike the hovered point.
    hoverAt(d, cx(5), cy(50));
    expect(spikes(d).sort()).toEqual(['h', 'h', 'v', 'v']);
  });
});

describe('spikedistance shorter than hoverdistance', () => {
  it('labels a point without spiking it beyond spikedistance', async () => {
    const c = await chart([DOTS], {
      spikedistance: 5,
      xaxis: { ...RANGES.xaxis, showspikes: true },
    });
    // 10 px from the point: inside hoverdistance (20), outside spikedistance.
    hoverAt(c, cx(5) + 10, cy(50));
    expect(labels(c)).toEqual(['(5, 50)']);
    expect(spikes(c)).toEqual([]);
    hoverAt(c, cx(5) + 3, cy(50));
    expect(spikes(c)).toEqual(['v', 'v']);
    // Back out of spikedistance, still on the same point: the spike goes, the label stays.
    hoverAt(c, cx(5) + 10, cy(50));
    expect(labels(c)).toEqual(['(5, 50)']);
    expect(spikes(c)).toEqual([]);
  });
});

describe("spikes of the app's hover", () => {
  it('go when the hover ends with an empty target', async () => {
    const c = await chart([DOTS], { xaxis: { ...RANGES.xaxis, showspikes: true } });
    c.hover([{ curveNumber: 0, pointNumber: 1 }]);
    expect(spikes(c)).toEqual(['v', 'v']);
    c.hover([]);
    expect(spikes(c)).toEqual([]);
  });
});
