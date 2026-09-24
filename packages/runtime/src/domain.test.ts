// @vitest-environment jsdom
/**
 * Domain traces (plan E4.5, M2 wave 1) through a real chart with a fake renderer: domain rects in
 * the plot and hover contexts, `crossTraceLayout`, hover / click on domain traces, `calcdata` for
 * components, and the helpers (`domainRect`, `fitAspect`, `inscribedCircle`). The container is
 * 640×400 with margins l 40, r 20, t 30, b 50: plot area x 40–620, y 30–350.
 */
import { attr, type FullTrace } from '@mk7s/holochart-core';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from './chart.ts';
import type {
  ComponentDrawContext,
  ComponentModule,
  DomainInfo,
  DomainTraceEntry,
  TraceModule,
  TracePlotContext,
} from './contracts.ts';
import { domainRect, fitAspect, inscribedCircle } from './layout.ts';
import { setup, type TestSetup } from './__testing__/fakes.ts';

const MARGIN = { l: 40, r: 20, t: 30, b: 50 };
const AREA = { x: 40, y: 30, width: 580, height: 320 };

interface DiscCalc {
  label: string;
  /** Written by crossTraceLayout: the disc in container px. */
  cx: number;
  cy: number;
  r: number;
  layouts: number;
}

interface DiscLog {
  layouts: { indices: number[]; domains: DomainInfo[]; plotArea: unknown }[];
  plots: { index: number; domain: DomainInfo | undefined; overlay: boolean; plot: boolean }[];
}

/** A domain trace type: one disc inscribed in its domain, hoverable, laid out cross-trace. */
function discModule(log: DiscLog): TraceModule<DiscCalc> {
  return {
    type: 'disc',
    categories: ['domain', 'showLegend'],
    schema: attr.object({ label: attr.string({ dflt: 'disc', editType: 'calc' }) }),
    meta: { description: 'Test discs.' },
    supplyDefaults(_in, _out: FullTrace, ctx) {
      ctx.coerce('label');
    },
    calc: (trace) => ({ label: String(trace['label']), cx: 0, cy: 0, r: 0, layouts: 0 }),
    crossTraceLayout(entries: readonly DomainTraceEntry<DiscCalc>[], ctx) {
      log.layouts.push({
        indices: entries.map((e) => e.index),
        domains: entries.map((e) => e.domain),
        plotArea: ctx.plotArea,
      });
      for (const e of entries) {
        const c = inscribedCircle(e.domain.rect);
        Object.assign(e.calc, { cx: c.cx, cy: c.cy, r: c.r, layouts: e.calc.layouts + 1 });
      }
    },
    hoverPoints(calc, _trace, q) {
      const x = q.cx ?? NaN;
      const y = q.cy ?? NaN;
      if (Math.hypot(x - calc.cx, y - calc.cy) > calc.r) return [];
      // Anchor at the disc center; overlay px run bottom-up: py = height − cy.
      const height = q.py + y;
      return [
        {
          pointIndex: 0,
          distance: 0,
          px: calc.cx,
          py: height - calc.cy,
          color: '#ff0000',
          fields: { label: calc.label },
          labels: { value: '1,000' },
          hoverText: `${calc.label}<br>1,000`,
        },
      ];
    },
    plot: {
      create(ctx: TracePlotContext<DiscCalc>) {
        const record = (c: TracePlotContext<DiscCalc>, plot: boolean): void => {
          log.plots.push({
            index: c.index,
            domain: c.domain,
            overlay: c.viewport === c.viewport && c.subplot === undefined,
            plot,
          });
        };
        record(ctx, true);
        return { update: (c, plan) => record(c, plan.plot) };
      },
    },
  };
}

let t: TestSetup;
let log: DiscLog;
let charts: Chart[] = [];

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
  log = { layouts: [], plots: [] };
  t.registry.register(discModule(log));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  vi.restoreAllMocks();
});

async function chart(data: unknown[], layout: Record<string, unknown> = {}): Promise<Chart> {
  const c = createChart(t.container, { data, layout: { margin: MARGIN, ...layout } }, t.options);
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

describe('domain placement', () => {
  it('gives domain traces their domain rect on the plot area, in the overlay', async () => {
    await chart([
      { type: 'disc', domain: { x: [0, 0.5], y: [0.5, 1] } },
      { type: 'disc', domain: { x: [0.5, 1] } },
    ]);
    const first = log.plots.find((p) => p.index === 0);
    expect(first?.domain).toEqual({
      x: [0, 0.5],
      y: [0.5, 1],
      rect: { x: 40, y: 30, width: 290, height: 160 },
    });
    expect(first?.overlay).toBe(true);
    const second = log.plots.find((p) => p.index === 1);
    expect(second?.domain?.rect).toEqual({ x: 330, y: 30, width: 290, height: 320 });
  });

  it('places domain traces in layout.grid cells by row and column', async () => {
    await chart([{ type: 'disc', domain: { row: 1, column: 1 } }], {
      grid: { rows: 2, columns: 2, xgap: 0, ygap: 0 },
    });
    const p = log.plots.find((q) => q.index === 0);
    // Row 1 is the bottom row (roworder 'top to bottom'), column 1 the right one.
    expect(p?.domain?.x).toEqual([0.5, 1]);
    expect(p?.domain?.y).toEqual([0, 0.5]);
    expect(p?.domain?.rect).toEqual({ x: 330, y: 190, width: 290, height: 160 });
  });
});

describe('crossTraceLayout', () => {
  it('runs once per type with every visible domain trace, before plot', async () => {
    const c = await chart([
      { type: 'disc', domain: { x: [0, 0.5] } },
      { type: 'dots', x: [1], y: [1] },
      { type: 'disc', domain: { x: [0.5, 1] }, visible: 'legendonly' },
      { type: 'disc', domain: { x: [0.5, 1] } },
    ]);
    expect(log.layouts).toHaveLength(1);
    expect(log.layouts[0]?.indices).toEqual([0, 3]);
    expect(log.layouts[0]?.plotArea).toEqual(c.subplots.get('xy')?.rect);
    // The view saw the laid-out calc.
    const calc = c.getCalcdata(0) as DiscCalc;
    expect(calc.r).toBe(145);
    expect(calc.layouts).toBe(1);
  });

  it('reruns after a layout change and re-reads the members', async () => {
    const c = await chart([{ type: 'disc' }]);
    log.plots.length = 0;
    await c.relayout({ 'margin.l': 140 });
    expect(log.layouts).toHaveLength(2);
    expect(log.plots.at(-1)?.plot).toBe(true);
    expect(log.layouts[1]?.domains[0]?.rect.x).toBe(140);
    // A style-only edit doesn't rerun it.
    await c.relayout({ paper_bgcolor: '#eeeeee' });
    expect(log.layouts).toHaveLength(2);
  });
});

describe('hover and click on domain traces', () => {
  const labels = (c: Chart): string[] =>
    [...c.element.querySelectorAll<HTMLElement>('.holochart-hoverlabel')]
      .filter((el) => el.style.display !== 'none')
      .map((el) => el.textContent ?? '');

  it('asks domain traces at the container pointer and shows their own label text', async () => {
    const c = await chart([{ type: 'disc', label: 'Apples', name: 'fruit' }], {
      hovermode: 'x unified',
    });
    const events: unknown[] = [];
    c.on('hover', (e) => void events.push(e));
    // Disc: center (330, 190), radius 160.
    fire(c, 'pointermove', 330 + 100, 190);
    t.scheduler.step();
    expect(events).toHaveLength(1);
    const point = (events[0] as { points: Record<string, unknown>[] }).points[0];
    expect(point).toMatchObject({ curveNumber: 0, pointNumber: 0, label: 'Apples' });
    expect(point && 'x' in point).toBe(false);
    expect(labels(c).join(' ')).toContain('Apples');
    // Outside the disc: unhover.
    const out: unknown[] = [];
    c.on('unhover', (e) => void out.push(e));
    fire(c, 'pointermove', 330 + 200, 40);
    t.scheduler.step();
    expect(out).toHaveLength(1);
  });

  it('formats hovertemplate with the trace-provided labels', async () => {
    const c = await chart([
      { type: 'disc', label: 'Pears', hovertemplate: '%{label}: %{value}<extra></extra>' },
    ]);
    fire(c, 'pointermove', 330, 190);
    t.scheduler.step();
    expect(labels(c)).toEqual(['Pears: 1,000']);
  });

  it('emits click for domain points without selecting them', async () => {
    const c = await chart([{ type: 'disc' }], { clickmode: 'event+select' });
    const clicks: unknown[] = [];
    const selected: unknown[] = [];
    c.on('click', (e) => void clicks.push(e));
    c.on('selected', (e) => void selected.push(e));
    fire(c, 'pointerdown', 330, 190);
    fire(c, 'pointerup', 330, 190);
    expect(clicks).toHaveLength(1);
    expect(selected).toHaveLength(0);
  });
});

describe('component contexts', () => {
  it('expose calcdata (undefined for traces without a calc)', async () => {
    const seen: unknown[] = [];
    const probe: ComponentModule = {
      name: 'probe',
      draw: {
        create(ctx: ComponentDrawContext) {
          seen.push(ctx.calcdata?.(0), ctx.calcdata?.(1));
          return { update: () => undefined };
        },
      },
    };
    t.registry.register(probe);
    await chart([
      { type: 'disc', label: 'A' },
      { type: 'disc', visible: false },
    ]);
    expect((seen[0] as DiscCalc).label).toBe('A');
    expect(seen[1]).toBeUndefined();
  });
});

describe('overlaying axes', () => {
  it('draw no plot background on the overlaying subplot', async () => {
    const c = await chart(
      [
        { type: 'dots', x: [1, 2], y: [1, 2] },
        { type: 'dots', x: [1, 2], y: [10, 20], yaxis: 'y2' },
      ],
      { plot_bgcolor: '#e5ecf6', yaxis2: { overlaying: 'y', side: 'right' } },
    );
    expect(c.subplots.get('xy')?.viewport.background).not.toBeNull();
    expect(c.subplots.get('xy2')?.viewport.background).toBeNull();
    expect(c.subplots.get('xy2')?.rect).toEqual(c.subplots.get('xy')?.rect);
  });
});

describe('domain helpers', () => {
  const unit = fc.double({ min: 0, max: 1, noNaN: true });
  const area = fc.record({
    x: fc.integer({ min: 0, max: 200 }),
    y: fc.integer({ min: 0, max: 200 }),
    width: fc.integer({ min: 1, max: 1000 }),
    height: fc.integer({ min: 1, max: 1000 }),
  });

  it('domainRect maps fractions onto the plot area (y from the bottom)', () => {
    expect(domainRect(AREA, [0.25, 0.75], [0, 0.5])).toEqual({
      x: 185,
      y: 190,
      width: 290,
      height: 160,
    });
    // Reversed and out-of-range extents are sorted and clamped.
    expect(domainRect(AREA, [1.5, 0.5], [-1, 1])).toEqual({
      x: 330,
      y: 30,
      width: 290,
      height: 320,
    });
  });

  it('domain rects stay inside the plot area, and disjoint domains give disjoint rects', () => {
    fc.assert(
      fc.property(area, unit, unit, unit, unit, (a, x0, x1, y0, y1) => {
        const r = domainRect(a, [x0, x1], [y0, y1]);
        const eps = 1e-9;
        expect(r.x).toBeGreaterThanOrEqual(a.x - eps);
        expect(r.y).toBeGreaterThanOrEqual(a.y - eps);
        expect(r.x + r.width).toBeLessThanOrEqual(a.x + a.width + eps);
        expect(r.y + r.height).toBeLessThanOrEqual(a.y + a.height + eps);
      }),
    );
    fc.assert(
      fc.property(
        area,
        unit,
        unit,
        fc.double({ min: 0.001, max: 0.5, noNaN: true }),
        (a, s, e, gap) => {
          const mid = Math.min(s, e) * (1 - gap);
          const left = domainRect(a, [0, mid], [0, 1]);
          const right = domainRect(a, [mid + gap, 1], [0, 1]);
          expect(left.x + left.width).toBeLessThan(right.x + 1e-9);
        },
      ),
    );
  });

  it('fitAspect keeps the aspect ratio, centered, inside the rect', () => {
    expect(fitAspect({ x: 0, y: 0, width: 200, height: 100 })).toEqual({
      x: 50,
      y: 0,
      width: 100,
      height: 100,
    });
    expect(fitAspect({ x: 10, y: 10, width: 100, height: 300 }, 2)).toEqual({
      x: 10,
      y: 135,
      width: 100,
      height: 50,
    });
    fc.assert(
      fc.property(area, fc.double({ min: 0.1, max: 10, noNaN: true }), (a, aspect) => {
        const r = fitAspect(a, aspect);
        expect(r.width / r.height).toBeCloseTo(aspect, 6);
        expect(r.width).toBeLessThanOrEqual(a.width + 1e-9);
        expect(r.height).toBeLessThanOrEqual(a.height + 1e-9);
        expect(Math.min(a.width - r.width, a.height - r.height)).toBeCloseTo(0, 6);
      }),
    );
  });

  it('inscribedCircle centers the largest circle', () => {
    expect(inscribedCircle({ x: 40, y: 30, width: 580, height: 320 })).toEqual({
      cx: 330,
      cy: 190,
      r: 160,
    });
  });
});
