// @vitest-environment jsdom
import * as fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DescribedTable } from './describe.ts';
import {
  DataTableView,
  MAX_TABLE_HEIGHT,
  ROW_OVERSCAN,
  rowWindow,
  tableStyle,
  UNVIRTUALIZED_ROWS,
} from './table-view.ts';

describe('rowWindow (E17.3)', () => {
  it('covers the rows in view plus the overscan, clamped to the data', () => {
    expect(rowWindow(0, 100, 20, 1000)).toEqual({ start: 0, end: 6 + ROW_OVERSCAN });
    expect(rowWindow(2000, 100, 20, 1000)).toEqual({
      start: 100 - ROW_OVERSCAN,
      end: 106 + ROW_OVERSCAN,
    });
    expect(rowWindow(1e9, 100, 20, 1000)).toEqual({ start: 999 - ROW_OVERSCAN, end: 1000 });
    expect(rowWindow(-50, 100, 20, 3)).toEqual({ start: 0, end: 3 });
    expect(rowWindow(0, 100, 20, 0)).toEqual({ start: 0, end: 0 });
  });

  it('always includes every row intersecting the viewport (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: 0, max: 2000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (total, rowHeight, viewport, at) => {
          const scrollTop = at * total * rowHeight;
          const { start, end } = rowWindow(scrollTop, viewport, rowHeight, total);
          expect(start).toBeGreaterThanOrEqual(0);
          expect(end).toBeLessThanOrEqual(total);
          expect(start).toBeLessThan(end);
          const first = Math.min(total - 1, Math.floor(scrollTop / rowHeight));
          const last = Math.min(total - 1, Math.floor((scrollTop + viewport) / rowHeight));
          expect(start).toBeLessThanOrEqual(first);
          expect(end).toBeGreaterThan(last);
          // A window, not the data: bounded by the viewport.
          expect(end - start).toBeLessThanOrEqual(
            Math.ceil(viewport / rowHeight) + 2 + 2 * ROW_OVERSCAN,
          );
        },
      ),
    );
  });
});

describe('DataTableView (E17.3)', () => {
  let anchor: HTMLElement;
  afterEach(() => {
    anchor?.parentElement?.remove();
    vi.restoreAllMocks();
  });

  function view(): DataTableView {
    const host = document.createElement('div');
    anchor = document.createElement('div');
    host.appendChild(anchor);
    document.body.appendChild(host);
    return new DataTableView(anchor);
  }

  function big(total: number, calls: number[] = []): DescribedTable {
    return {
      title: 'Big',
      caption: 'Big',
      columns: ['i', 'square'],
      rows: [],
      total,
      row: (i) => {
        calls.push(i);
        return [String(i), String(i * i)];
      },
    };
  }

  const rendered = (v: DataTableView): string[] =>
    [...v.root.querySelectorAll('tbody tr[aria-rowindex]')].map((tr) => tr.textContent ?? '');

  it('renders short tables whole, styled like the chart', () => {
    const v = view();
    const small: DescribedTable = {
      title: 'Costs',
      caption: 'Costs (2 rows)',
      columns: ['Month', 'k$'],
      rows: [
        ['Jan', '8'],
        ['Feb', '9'],
      ],
      total: 2,
    };
    const layout = {
      font: { family: 'Inter', size: 9, color: 'rgb(1, 2, 3)' },
      paper_bgcolor: 'rgb(10, 10, 15)',
      plot_bgcolor: 'rgb(20, 20, 25)',
      xaxis: { gridcolor: 'rgb(50, 50, 50)' },
    };
    v.update([small], tableStyle(layout as never), 500);
    expect(anchor.nextElementSibling).toBe(v.root);
    expect(v.root.style.fontSize).toBe('12px');
    expect(v.root.style.color).toBe('rgb(1, 2, 3)');
    expect(v.root.style.background).toContain('rgb(10, 10, 15)');
    expect(v.root.textContent).toContain('Costs (2 rows)');
    expect(rendered(v)).toEqual(['Jan8', 'Feb9']);
    const th = v.root.querySelector('th')!;
    expect(th.scope).toBe('col');
    expect(th.style.position).toBe('sticky');
    // Tables without a row accessor show the rows they have.
    v.update([{ ...small, rows: [['Jan', '8']] }], tableStyle(undefined), 500);
    expect(v.root.textContent).toContain('Costs (first 1 of 2 rows)');
  });

  it('formats only the rows in view of 100k rows and follows scrolling', async () => {
    const v = view();
    const calls: number[] = [];
    v.update([big(100_000, calls)], tableStyle(undefined), 640);
    const h = Math.round(12 * 1.8);
    const inView = Math.ceil(MAX_TABLE_HEIGHT / h) + 1;
    expect(calls.length).toBe(inView + ROW_OVERSCAN);
    expect(rendered(v)[0]).toBe('00');
    // Spacers keep the full scroll height.
    const spacers = [...v.root.querySelectorAll<HTMLElement>('tbody tr[aria-hidden] td')];
    expect(spacers.map((td) => td.style.height)).toEqual([`${(100_000 - calls.length) * h}px`]);

    const scroll = v.root.querySelector<HTMLElement>('[role="region"]')!;
    Object.defineProperty(scroll, 'scrollTop', { value: (50_000 + 1) * h, configurable: true });
    scroll.dispatchEvent(new Event('scroll'));
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    const rows = [...v.root.querySelectorAll('tbody tr[aria-rowindex]')];
    expect(rows[0]?.getAttribute('aria-rowindex')).toBe(String(50_000 - ROW_OVERSCAN + 2));
    expect(rows[ROW_OVERSCAN]?.textContent).toBe(`50000${50_000 * 50_000}`);
    expect(rows.length).toBe(inView + 2 * ROW_OVERSCAN);
    expect(v.root.querySelectorAll('tbody tr[aria-hidden]')).toHaveLength(2);
    v.destroy();
    expect(v.root.isConnected).toBe(false);
  });

  it(`does not virtualize ${UNVIRTUALIZED_ROWS} rows or fewer`, () => {
    const v = view();
    v.update([big(UNVIRTUALIZED_ROWS)], tableStyle(undefined), 640);
    expect(rendered(v)).toHaveLength(UNVIRTUALIZED_ROWS);
    expect(v.root.querySelectorAll('tbody tr[aria-hidden]')).toHaveLength(0);
  });
});
