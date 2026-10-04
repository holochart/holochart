// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type {
  DescribeContext,
  TraceA11yParts,
  TraceDescription,
  TraceModule,
} from '../contracts.ts';
import {
  createDotsModule,
  createLog,
  setup,
  type DotsCalc,
  type TestSetup,
} from '../__testing__/fakes.ts';

const XY = { x: [0, 5, 10], y: [10, 60, 40] };
const TRACE_ITEM = 'ul[aria-labelledby$="-traces"] li';

let t: TestSetup;
let charts: Chart[] = [];

async function chart(figure: Parameters<typeof createChart>[1]): Promise<Chart> {
  const c = createChart(t.container, figure, t.options);
  charts.push(c);
  await c.ready;
  return c;
}

/** A `dots` variant of type `type` describing itself with `describe`. */
function described(
  type: string,
  describeTrace: (ctx: DescribeContext<DotsCalc>) => TraceDescription | undefined,
): TraceModule<DotsCalc> {
  return { ...createDotsModule(createLog()), type, describe: describeTrace };
}

/** A `dots` variant whose description comes with its accessibility chunk (`TraceModule.a11y`). */
function lazy(type: string, load: () => Promise<TraceA11yParts>): TraceModule<DotsCalc> {
  return { ...createDotsModule(createLog()), type, a11y: load };
}

const mirrorTraces = (): (string | null)[] =>
  [...t.container.querySelectorAll(TRACE_ITEM)].map((li) => li.textContent);

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  t.container.remove();
  vi.restoreAllMocks();
});

describe('trace descriptions (E17.1)', () => {
  it('gives the generic line when describe() has nothing to say', async () => {
    t.registry.register(described('quiet', () => undefined));
    const c = await chart({ data: [{ type: 'quiet', name: 'Rev', ...XY }] });
    expect(c.description?.traces).toEqual(['Quiet trace "Rev".']);
    expect(c.description?.summary).toBe('Quiet chart.');
    expect(c.description?.tables).toEqual([]);
  });

  it('describes a legend-only trace as hidden, and leaves its kind out of the chart type', async () => {
    t.registry.register(
      described('lines', (ctx) => ({ kind: 'line', summary: `Line ${ctx.index}.` })),
    );
    const c = await chart({
      data: [
        { type: 'dots', ...XY },
        { type: 'lines', name: 'Later', visible: 'legendonly', ...XY },
      ],
    });
    expect(c.description?.summary).toBe('Dots chart.');
    expect(c.description?.traces[1]).toBe('Line 1. Hidden (shown in the legend only).');
    // Shown again: part of the chart type, and no longer marked hidden.
    await c.restyle({ visible: true }, [1]);
    expect(c.description?.summary).toBe('Dots and line chart with 2 traces.');
    expect(c.description?.traces[1]).toBe('Line 1.');
  });

  it('names a table after the trace and counts the rows it was given when there is no total', async () => {
    t.registry.register(
      described('tabled', () => ({
        summary: 'Tabled.',
        table: {
          columns: ['x', '<b>y</b> &amp; z'],
          rows: [
            ['0', '10'],
            ['5', '60'],
          ],
        },
      })),
    );
    const c = await chart({ data: [{ type: 'tabled', name: 'Rev <i>2024</i>', ...XY }] });
    expect(c.description?.tables).toEqual([
      {
        title: 'Rev 2024',
        caption: 'Rev 2024 (2 rows)',
        columns: ['x', 'y & z'],
        rows: [
          ['0', '10'],
          ['5', '60'],
        ],
        total: 2,
      },
    ]);
  });

  it('leaves out a table without columns', async () => {
    t.registry.register(
      described('bare', () => ({ summary: 'Bare.', table: { columns: [], rows: [['1']] } })),
    );
    const c = await chart({ data: [{ type: 'bare', ...XY }] });
    expect(c.description?.tables).toEqual([]);
    expect(t.container.querySelector('.holochart-a11y table')).toBeNull();
  });

  it('never claims fewer rows than it shows', async () => {
    t.registry.register(
      described('short', () => ({
        summary: 'Short.',
        table: { columns: ['x'], rows: [['a'], ['b'], ['c']], total: 1 },
      })),
    );
    const c = await chart({ data: [{ type: 'short', name: 'S', ...XY }] });
    expect(c.description?.tables[0]).toMatchObject({ caption: 'S (3 rows)', total: 3 });
  });
});

describe('descriptions from a lazily loaded accessibility chunk (S2.14)', () => {
  it('shows the generic line until the chunk has loaded, then its description', async () => {
    let loads = 0;
    let arrive: (parts: TraceA11yParts) => void = () => undefined;
    t.registry.register(
      lazy('late', () => {
        loads++;
        return new Promise<TraceA11yParts>((resolve) => (arrive = resolve));
      }),
    );
    const c = await chart({
      data: [
        { type: 'late', name: 'A', ...XY },
        { type: 'late', name: 'B', ...XY },
      ],
    });
    expect(c.description?.traces).toEqual(['Late trace "A".', 'Late trace "B".']);
    expect(mirrorTraces()).toEqual(['Late trace "A".', 'Late trace "B".']);
    arrive({ late: { describe: (ctx) => ({ kind: 'line', summary: `Late ${ctx.index}.` }) } });
    const d = await c.describe();
    expect(d?.traces).toEqual(['Late 0.', 'Late 1.']);
    expect(d?.summary).toBe('Line chart with 2 traces.');
    // The hidden description follows, and the chunk loaded once for both traces.
    expect(mirrorTraces()).toEqual(['Late 0.', 'Late 1.']);
    expect(t.container.getAttribute('aria-label')).toBe('Line chart with 2 traces.');
    expect(loads).toBe(1);
  });

  it("uses the chunk's '*' parts for a type it does not name", async () => {
    t.registry.register(
      lazy('other', () =>
        Promise.resolve({
          named: { describe: () => ({ summary: 'Named.' }) },
          '*': { describe: () => ({ summary: 'Any type.' }) },
        }),
      ),
    );
    const c = await chart({ data: [{ type: 'other', ...XY }] });
    expect((await c.describe())?.traces).toEqual(['Any type.']);
  });

  it("prefers the module's own describe() over the chunk's", async () => {
    const load = vi.fn(() =>
      Promise.resolve({ own: { describe: () => ({ summary: 'From the chunk.' }) } }),
    );
    t.registry.register({ ...described('own', () => ({ summary: 'Own.' })), a11y: load });
    const c = await chart({ data: [{ type: 'own', ...XY }] });
    expect((await c.describe())?.traces).toEqual(['Own.']);
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps the generic line when the chunk has no description for the trace', async () => {
    t.registry.register(lazy('keys', () => Promise.resolve({ keys: {} })));
    const c = await chart({ data: [{ type: 'keys', name: 'K', ...XY }] });
    expect((await c.describe())?.traces).toEqual(['Keys trace "K".']);
  });

  it('keeps the generic line, with a warning, when the chunk fails to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const load = vi.fn(() => Promise.reject(new Error('offline')));
    t.registry.register(lazy('broken', load));
    const c = await chart({ data: [{ type: 'broken', name: 'B', ...XY }] });
    expect((await c.describe())?.traces).toEqual(['Broken trace "B".']);
    expect(warn).toHaveBeenCalledWith(
      "holochart: loading a trace's accessibility code failed",
      expect.objectContaining({ message: 'offline' }),
    );
    // Not retried on every description.
    expect(c.description?.traces).toEqual(['Broken trace "B".']);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('the accessible name and overview (E17.1, E17.2)', () => {
  /** A `dots` variant reporting its points as a joined series. */
  function series(): TraceModule<DotsCalc> {
    return described('series', (ctx) => ({
      kind: 'line',
      summary: 'Line.',
      insight: {
        kind: 'series',
        length: ctx.calc.x.length,
        x: ctx.calc.x,
        y: ctx.calc.y,
        joined: true,
        formatX: String,
        formatY: String,
      },
    }));
  }

  it('falls back to the title when layout.meta has no description', async () => {
    const c = await chart({
      data: [{ type: 'dots', ...XY }],
      layout: { title: { text: 'Sales' }, meta: { source: 'CRM', description: '  ' } },
    });
    expect(c.description?.label).toBe('Sales. Dots chart.');
  });

  it('starts the overview with "y by x" only when both first axes have a title', async () => {
    t.registry.register(series());
    const trend = 'Rev rises from 10 (0) to 40 (10). It peaks at 60 (5).';
    const c = await chart({
      data: [{ type: 'series', name: 'Rev', ...XY }],
      layout: { xaxis: { title: { text: 'Day' } } },
    });
    expect((await c.describe())?.overview).toBe(trend);
    await c.relayout({ 'yaxis.title.text': '<b>k$</b>' });
    expect((await c.describe())?.overview).toBe(`k$ by Day. ${trend}`);
  });

  it('summarizes only the traces that are shown', async () => {
    t.registry.register(series());
    const c = await chart({
      data: [
        { type: 'series', name: 'Rev', ...XY },
        { type: 'series', name: 'Costs', visible: 'legendonly', x: [0, 1], y: [9, 1] },
      ],
    });
    expect((await c.describe())?.overview).toBe(
      'Rev rises from 10 (0) to 40 (10). It peaks at 60 (5).',
    );
  });
});
