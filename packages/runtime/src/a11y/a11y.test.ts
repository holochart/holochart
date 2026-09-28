// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type { DescribeContext, TraceModule } from '../contracts.ts';
import {
  createDotsModule,
  createLog,
  setup,
  type DotsCalc,
  type TestSetup,
} from '../__testing__/fakes.ts';
import { chartSummary } from './describe.ts';
import { RANGE_DEBOUNCE_MS, STREAM_THROTTLE_MS } from './mirror.ts';
import { accessibleText, formatPlainNumber, listText } from './text.ts';

const XY = { type: 'dots', x: [0, 10], y: [0, 100] };
const TRACE_ITEM = 'ul[aria-labelledby$="-traces"] li';
const AXIS_ITEM = 'ul[aria-labelledby$="-axes"] li';

let t: TestSetup;
let charts: Chart[] = [];
const describeCalls: number[] = [];

/** A `dots` variant with a `describe()` (kind, summary, a long table). */
function describedModule(options: { rows?: number; fail?: boolean } = {}): TraceModule<DotsCalc> {
  const base = createDotsModule(createLog());
  return {
    ...base,
    type: 'described',
    describe(ctx: DescribeContext<DotsCalc>) {
      describeCalls.push(ctx.index);
      if (options.fail) throw new Error('broken');
      const n = options.rows ?? 2;
      const rows = Array.from({ length: Math.min(n, ctx.maxRows) }, (_, i) => [`${i}`, `${i * 2}`]);
      return {
        kind: 'line',
        summary: `Line "${String(ctx.trace['name'])}": ${ctx.calc.x.length} points.`,
        table: { caption: 'Values <b>table</b>', columns: ['x', 'y'], rows, total: n },
      };
    },
  };
}

function chart(figure: Parameters<typeof createChart>[1], s: TestSetup = t): Chart {
  const c = createChart(s.container, figure, s.options);
  charts.push(c);
  return c;
}

function mirror(el: HTMLElement = t.container): HTMLElement {
  const m = el.querySelector<HTMLElement>('.holochart-a11y');
  if (!m) throw new Error('no a11y mirror');
  return m;
}

function describedBy(el: HTMLElement = t.container): string {
  const id = el.getAttribute('aria-describedby') ?? '';
  return el.ownerDocument.getElementById(id)?.textContent ?? '';
}

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
  describeCalls.length = 0;
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  t.container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('text helpers', () => {
  it('turns rich text into plain text', () => {
    expect(accessibleText('Revenue<br><i>(USD)</i> &amp; costs&#33; &#x41;')).toBe(
      'Revenue (USD) & costs! A',
    );
    expect(accessibleText(undefined)).toBe('');
    expect(accessibleText('  a \n b ')).toBe('a b');
  });

  it('lists and formats', () => {
    expect(listText(['a'])).toBe('a');
    expect(listText(['a', 'b', 'c'])).toBe('a, b and c');
    expect(formatPlainNumber(1234.56789)).toBe('1234.57');
    expect(formatPlainNumber(42)).toBe('42');
    expect(chartSummary([], 0)).toBe('Empty chart.');
    expect(chartSummary(['line', 'bar'], 3)).toBe('Line and bar chart with 3 traces.');
    expect(chartSummary(['pie'], 1)).toBe('Pie chart.');
  });
});

describe('ARIA attributes', () => {
  it('makes an interactive chart a figure named by its title and summary', async () => {
    const c = chart({ data: [XY, XY], layout: { title: { text: 'Sales <b>2024</b>' } } });
    await c.ready;
    const el = t.container;
    expect(el.getAttribute('role')).toBe('figure');
    expect(el.getAttribute('aria-label')).toBe('Sales 2024. Dots chart with 2 traces.');
    expect(describedBy()).toContain('Dots chart with 2 traces.');
    // The canvas and the hover layer are hidden from assistive technology.
    expect(el.querySelector('canvas')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.holochart-fx')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('makes a static chart an image', async () => {
    const c = chart({ data: [XY], config: { staticPlot: true } });
    await c.ready;
    expect(t.container.getAttribute('role')).toBe('img');
    expect(t.container.getAttribute('aria-label')).toBe('Dots chart.');
  });

  it('takes the name from config.ariaLabel, then layout.meta.description', async () => {
    const c = chart({
      data: [XY],
      layout: { title: { text: 'Title' }, meta: { description: 'From meta' } },
      config: { ariaLabel: 'From config' },
    });
    await c.ready;
    expect(t.container.getAttribute('aria-label')).toBe('From config');
    await c.update({ config: { ariaLabel: '' } });
    expect(t.container.getAttribute('aria-label')).toBe('From meta');
  });

  it('ignores a meta that is not an object (Plotly templating data)', async () => {
    const c = chart({ data: [XY], layout: { title: { text: 'T' }, meta: ['a', 'b'] } });
    await c.ready;
    expect(t.container.getAttribute('aria-label')).toBe('T. Dots chart.');
    expect(c.fullLayout?.['meta']).toEqual(['a', 'b']);
  });

  it("keeps the page's own attributes and restores everything on destroy", async () => {
    const el = t.container;
    el.setAttribute('aria-label', 'Mine');
    const c = chart({ data: [XY] });
    await c.ready;
    expect(el.getAttribute('aria-label')).toBe('Mine');
    expect(el.getAttribute('role')).toBe('figure');
    c.destroy();
    expect(el.getAttribute('aria-label')).toBe('Mine');
    expect(el.hasAttribute('role')).toBe(false);
    expect(el.hasAttribute('aria-describedby')).toBe(false);
    expect(el.querySelector('.holochart-a11y')).toBeNull();
  });

  it('re-creates the mirror with the right role when config changes', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    await c.update({ config: { staticPlot: true } });
    expect(t.container.getAttribute('role')).toBe('img');
    expect(t.container.querySelectorAll('.holochart-a11y')).toHaveLength(1);
  });
});

describe('hidden description', () => {
  it('is visually hidden, not display:none', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    const style = mirror().style;
    expect(style.display).not.toBe('none');
    expect(style.position).toBe('absolute');
    expect(style.width).toBe('1px');
    expect(style.overflow).toBe('hidden');
    expect(mirror().getAttribute('aria-hidden')).toBeNull();
  });

  it('lists the chart type, axes and traces', async () => {
    const c = chart({
      data: [XY, { ...XY, name: 'Second', visible: 'legendonly' }, { ...XY, visible: false }],
      layout: {
        xaxis: { title: { text: 'Time' }, range: [0, 10] },
        yaxis: { range: [0, 100] },
      },
    });
    await c.ready;
    const m = mirror();
    expect(m.querySelector('p')?.textContent).toBe('Dots chart.');
    const axes = [...m.querySelectorAll(AXIS_ITEM)].map((li) => li.textContent);
    expect(axes).toEqual([
      'X axis "Time": linear axis from 0 to 10.',
      'Y axis: linear axis from 0 to 100.',
    ]);
    const traces = [...m.querySelectorAll(TRACE_ITEM)].map((l) => l.textContent);
    expect(traces).toEqual([
      'Dots trace "trace 0".',
      'Dots trace "Second". Hidden (shown in the legend only).',
    ]);
    expect(c.description?.traces).toEqual(traces);
  });

  it("uses the trace's describe(), capping its table at 100 rows", async () => {
    const s = setup({ width: 640, height: 400 });
    s.registry.register(describedModule({ rows: 1000 }));
    const c = chart({ data: [{ ...XY, type: 'described', name: 'Rev' }] }, s);
    await c.ready;
    const m = mirror(s.container);
    expect(m.querySelector('p')?.textContent).toBe('Line chart.');
    expect(m.querySelector(TRACE_ITEM)?.textContent).toBe('Line "Rev": 2 points.');
    const table = m.querySelector('table');
    expect(table?.querySelector('caption')?.textContent).toBe(
      'Values table (first 100 of 1,000 rows)',
    );
    expect([...(table?.querySelectorAll('th') ?? [])].map((th) => th.textContent)).toEqual([
      'x',
      'y',
    ]);
    expect(table?.querySelector('th')?.getAttribute('scope')).toBe('col');
    expect(table?.querySelectorAll('tbody tr')).toHaveLength(100);
    s.container.remove();
  });

  it('falls back to the generic line when describe() throws', async () => {
    const s = setup({ width: 640, height: 400 });
    s.registry.register(describedModule({ fail: true }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const c = chart({ data: [{ ...XY, type: 'described' }] }, s);
    await c.ready;
    expect(mirror(s.container).querySelector(TRACE_ITEM)?.textContent).toBe(
      'Described trace "trace 0".',
    );
    expect(warn).toHaveBeenCalled();
    s.container.remove();
  });
});

describe('updates', () => {
  function described(): { s: TestSetup; c: Chart } {
    const s = setup({ width: 640, height: 400 });
    s.registry.register(describedModule());
    const c = chart({ data: [{ ...XY, type: 'described', name: 'A' }] }, s);
    return { s, c };
  }

  it('rebuilds right away on data and layout changes', async () => {
    const { s, c } = described();
    await c.ready;
    expect(describeCalls).toHaveLength(1);
    await c.restyle({ name: 'B' });
    expect(mirror(s.container).querySelector(TRACE_ITEM)?.textContent).toBe('Line "B": 2 points.');
    await c.relayout({ 'title.text': 'New' });
    expect(s.container.getAttribute('aria-label')).toBe('New. Line chart.');
    await c.addTraces({ ...XY, type: 'described', name: 'C' });
    expect(s.container.getAttribute('aria-label')).toBe('New. Line chart with 2 traces.');
    s.container.remove();
  });

  it('debounces axis range changes', async () => {
    const { s, c } = described();
    await c.ready;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const before = describeCalls.length;
    await c.relayout({ 'xaxis.range': [0, 5] });
    await c.relayout({ 'xaxis.range': [0, 4] });
    expect(describeCalls.length).toBe(before);
    vi.advanceTimersByTime(RANGE_DEBOUNCE_MS - 1);
    expect(describeCalls.length).toBe(before);
    vi.advanceTimersByTime(1);
    expect(describeCalls.length).toBe(before + 1);
    expect(mirror(s.container).querySelector(AXIS_ITEM)?.textContent).toBe(
      'X axis: linear axis from 0 to 4.',
    );
    s.container.remove();
  });

  it('throttles streaming appends', async () => {
    const { s, c } = described();
    await c.ready;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const before = describeCalls.length;
    await c.extendTraces({ x: [[11]], y: [[1]] }, [0]);
    vi.advanceTimersByTime(STREAM_THROTTLE_MS / 2);
    await c.extendTraces({ x: [[12]], y: [[2]] }, [0]);
    expect(describeCalls.length).toBe(before);
    vi.advanceTimersByTime(STREAM_THROTTLE_MS / 2);
    expect(describeCalls.length).toBe(before + 1);
    expect(mirror(s.container).querySelector(TRACE_ITEM)?.textContent).toBe('Line "A": 4 points.');
    s.container.remove();
  });

  it('never rebuilds for hover, selection or interaction modes', async () => {
    const { s, c } = described();
    await c.ready;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const before = describeCalls.length;
    c.hover([{ curveNumber: 0, pointNumber: 0 }]);
    c.unhover();
    await c.setDragmode('pan');
    await c.setHovermode('x');
    await c.clearSelection();
    vi.advanceTimersByTime(STREAM_THROTTLE_MS * 2);
    expect(describeCalls.length).toBe(before);
    s.container.remove();
  });

  it('leaves the DOM alone when the text did not change', async () => {
    const { s, c } = described();
    await c.ready;
    const li = mirror(s.container).querySelector(TRACE_ITEM);
    await c.restyle({ color: 'red' });
    expect(mirror(s.container).querySelector(TRACE_ITEM)).toBe(li);
    s.container.remove();
  });

  it('stops pending rebuilds on destroy', async () => {
    const { s, c } = described();
    await c.ready;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await c.relayout({ 'xaxis.range': [0, 5] });
    const before = describeCalls.length;
    c.destroy();
    vi.advanceTimersByTime(RANGE_DEBOUNCE_MS * 2);
    expect(describeCalls.length).toBe(before);
    s.container.remove();
  });
});

describe('summaries and data tables (E17.2, E17.3)', () => {
  /** A `dots` variant describing its points as a series, with every row on demand. */
  function seriesModule(total = 3): TraceModule<DotsCalc> {
    const base = createDotsModule(createLog());
    return {
      ...base,
      type: 'series',
      describe(ctx: DescribeContext<DotsCalc>) {
        const row = (i: number): string[] => [`x${i}`, `y${i}`];
        return {
          kind: 'line',
          summary: `Line "${String(ctx.trace['name'])}".`,
          table: { columns: ['x', 'y'], rows: [row(0)], total, row },
          insight: {
            kind: 'series',
            length: ctx.calc.x.length,
            x: ctx.calc.x,
            y: ctx.calc.y,
            joined: true,
            formatX: String,
            formatY: String,
          },
        };
      },
    };
  }

  function seriesChart(config: Record<string, unknown> = {}, total?: number) {
    const s = setup({ width: 640, height: 400 });
    s.registry.register(seriesModule(total));
    const c = chart(
      {
        data: [{ type: 'series', name: 'Rev', x: [0, 5, 10], y: [10, 60, 40] }],
        layout: { xaxis: { title: { text: 'Day' } }, yaxis: { title: { text: 'k$' } } },
        config,
      },
      s,
    );
    return { s, c };
  }

  it('adds the generated overview once its code has loaded', async () => {
    const { s, c } = seriesChart();
    await c.ready;
    const d = await c.describe();
    expect(d?.overview).toBe('k$ by Day. Rev rises from 10 (0) to 40 (10). It peaks at 60 (5).');
    expect(c.description?.overview).toBe(d?.overview);
    const paragraphs = [...mirror(s.container).querySelectorAll('p')].map((p) => p.textContent);
    expect(paragraphs.slice(0, 2)).toEqual(['Line chart.', d?.overview]);
    expect(describedBy(s.container)).toContain('Rev rises from 10 (0) to 40 (10).');
    s.container.remove();
  });

  it('leaves the overview out with a11y.summaries off', async () => {
    const { s, c } = seriesChart({ a11y: { summaries: false } });
    await c.ready;
    expect((await c.describe())?.overview).toBe('');
    expect(mirror(s.container).querySelectorAll('p')[1]?.textContent).toBe('Axes:');
    s.container.remove();
  });

  it('has no tables with a11y.dataTable false', async () => {
    const { s, c } = seriesChart({ a11y: { dataTable: false } });
    await c.ready;
    expect(c.description?.tables).toEqual([]);
    expect(mirror(s.container).querySelector('table')).toBeNull();
    s.container.remove();
  });

  it('shows every row of a visible table after the chart, virtualized', async () => {
    const { s, c } = seriesChart({ a11y: { dataTable: 'visible' } }, 100_000);
    await c.ready;
    await c.describe();
    // Not hidden in the mirror too (screen readers would read both).
    expect(mirror(s.container).querySelector('table')).toBeNull();
    const view = s.container.nextElementSibling as HTMLElement;
    expect(view.className).toBe('holochart-data-table');
    expect(view.style.width).toBe('640px');
    const table = view.querySelector('table')!;
    expect(table.getAttribute('aria-rowcount')).toBe('100001');
    expect(view.textContent).toContain('Rev (100,000 rows)');
    expect(view.querySelector('[role="region"]')?.getAttribute('tabindex')).toBe('0');
    const rows = table.querySelectorAll('tbody tr[aria-rowindex]');
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.length).toBeLessThan(60);
    expect(rows[0]?.getAttribute('aria-rowindex')).toBe('2');
    expect(rows[0]?.textContent).toBe('x0y0');
    c.destroy();
    expect(s.container.nextElementSibling).toBeNull();
    s.container.remove();
  });
});
