// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DescribedTable } from './describe.ts';
import { DataTableView, tableStyle } from './table-view.ts';

/** `requestAnimationFrame`, run by hand: `frames.run()` calls what is pending. */
function manualFrames() {
  let next = 1;
  const pending = new Map<number, FrameRequestCallback>();
  const request = vi.fn((cb: FrameRequestCallback) => {
    pending.set(next, cb);
    return next++;
  });
  const cancel = vi.fn((id: number) => void pending.delete(id));
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  return {
    request,
    cancel,
    run(): void {
      const cbs = [...pending.values()];
      pending.clear();
      for (const cb of cbs) cb(0);
    },
  };
}

const STYLE = tableStyle(undefined);
/** Row height of the default style: 12 px text, 1.8 line height. */
const ROW = Math.round(12 * 1.8);

let anchor: HTMLElement;
let frames: ReturnType<typeof manualFrames>;

function view(): DataTableView {
  const host = document.createElement('div');
  anchor = document.createElement('div');
  host.appendChild(anchor);
  document.body.appendChild(host);
  return new DataTableView(anchor);
}

function small(title: string, rows: readonly (readonly string[])[]): DescribedTable {
  return { title, caption: title, columns: ['Month', 'k$'], rows, total: rows.length };
}

function big(total: number, calls: number[]): DescribedTable {
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

function scrollTo(v: DataTableView, top: number): void {
  const scroll = v.root.querySelector<HTMLElement>('[role="region"]')!;
  Object.defineProperty(scroll, 'scrollTop', { value: top, configurable: true });
  scroll.dispatchEvent(new Event('scroll'));
}

const firstRowIndex = (v: DataTableView): string | null | undefined =>
  v.root.querySelector('tbody tr[aria-rowindex]')?.getAttribute('aria-rowindex');

beforeEach(() => {
  frames = manualFrames();
});

afterEach(() => {
  anchor?.parentElement?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DataTableView: one table per trace (E17.3)', () => {
  it('shows each table in its own region, named by its title', () => {
    const v = view();
    v.update([small('Costs', [['Jan', '8']]), small('Sales', [['Jan', '9']])], STYLE, 400);
    const regions = [...v.root.querySelectorAll('[role="region"]')];
    expect(regions).toHaveLength(2);
    const names = regions.map(
      (r) => document.getElementById(r.getAttribute('aria-labelledby') ?? '')?.textContent,
    );
    expect(names).toEqual(['Costs (1 row)', 'Sales (1 row)']);
    // Each table has the same name as its region, and the tables are set apart.
    const tables = [...v.root.querySelectorAll('table')];
    expect(tables.map((tb) => tb.getAttribute('aria-labelledby'))).toEqual(
      regions.map((r) => r.getAttribute('aria-labelledby')),
    );
    expect(regions.map((r) => r.parentElement!.style.marginTop)).toEqual(['0px', '12px']);
  });

  it('drops the tables of traces that are gone and hides itself without any', () => {
    const v = view();
    v.update([small('Costs', [['Jan', '8']]), small('Sales', [['Jan', '9']])], STYLE, 400);
    expect(v.root.style.display).toBe('block');
    v.update([small('Sales', [['Feb', '7']])], STYLE, 400);
    expect(v.root.querySelectorAll('table')).toHaveLength(1);
    expect(v.root.textContent).toBe('Sales (1 row)Monthk$Feb7');
    v.update([], STYLE, 400);
    expect(v.root.querySelectorAll('table')).toHaveLength(0);
    expect(v.root.style.display).toBe('none');
    // And comes back with the next table.
    v.update([small('Costs', [['Mar', '3']])], STYLE, 400);
    expect(v.root.style.display).toBe('block');
    expect(v.root.querySelectorAll('table')).toHaveLength(1);
  });

  it('fills a row that has fewer cells than the table has columns with empty cells', () => {
    const v = view();
    v.update([small('Costs', [['Jan'], ['Feb', '9']])], STYLE, 400);
    const rows = [...v.root.querySelectorAll('tbody tr')];
    expect(rows.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent))).toEqual([
      ['Jan', ''],
      ['Feb', '9'],
    ]);
  });

  it('labels rows on the left and aligns values right', () => {
    const v = view();
    v.update([small('Costs', [['Jan', '8']])], STYLE, 400);
    const cells = [...v.root.querySelectorAll<HTMLElement>('tbody td')];
    expect(cells.map((td) => td.style.textAlign)).toEqual(['left', 'right']);
  });

  it('never gets a negative or fractional width', () => {
    const v = view();
    v.update([small('Costs', [['Jan', '8']])], STYLE, -20);
    expect(v.root.style.width).toBe('0px');
    v.update([small('Costs', [['Jan', '8']])], STYLE, 320.6);
    expect(v.root.style.width).toBe('321px');
  });
});

describe('DataTableView: scrolling a virtualized table (E17.3)', () => {
  it('renders once per animation frame however many scroll events arrive', () => {
    const v = view();
    const calls: number[] = [];
    v.update([big(10_000, calls)], STYLE, 400);
    scrollTo(v, 1000 * ROW);
    scrollTo(v, 2000 * ROW);
    scrollTo(v, 3001 * ROW);
    expect(frames.request).toHaveBeenCalledTimes(1);
    // Nothing moves before the frame.
    expect(firstRowIndex(v)).toBe('2');
    calls.length = 0;
    frames.run();
    // Only the last position is rendered: row 3000 (aria-rowindex 3002) with its overscan.
    expect(Math.min(...calls)).toBe(3000 - 8);
    expect(firstRowIndex(v)).toBe(String(3000 - 8 + 2));
    // The next scroll asks for a new frame.
    scrollTo(v, 5001 * ROW);
    expect(frames.request).toHaveBeenCalledTimes(2);
  });

  it('keeps the rendered rows while scrolling inside the same row', () => {
    const v = view();
    const calls: number[] = [];
    v.update([big(10_000, calls)], STYLE, 400);
    scrollTo(v, 501 * ROW);
    frames.run();
    const row = v.root.querySelector('tbody tr[aria-rowindex]');
    calls.length = 0;
    // A few pixels further: the same first row in view, so nothing is formatted or replaced.
    scrollTo(v, 501 * ROW + 5);
    frames.run();
    expect(calls).toEqual([]);
    expect(v.root.querySelector('tbody tr[aria-rowindex]')).toBe(row);
  });

  it('cancels a pending render when its table goes away', () => {
    const v = view();
    const calls: number[] = [];
    v.update([big(10_000, calls)], STYLE, 400);
    scrollTo(v, 4000 * ROW);
    calls.length = 0;
    v.destroy();
    expect(frames.cancel).toHaveBeenCalledTimes(1);
    frames.run();
    expect(calls).toEqual([]);
    expect(v.root.isConnected).toBe(false);
  });

  it('renders new data from the scroll position the reader is at', () => {
    const v = view();
    v.update([big(10_000, [])], STYLE, 400);
    scrollTo(v, 2001 * ROW);
    frames.run();
    // The data changes (a stream appends) while the reader is at row 2000: same rows, new values.
    const next: DescribedTable = { ...big(20_000, []), row: (i) => [`#${i}`, 'new'] };
    v.update([next], STYLE, 400);
    expect(v.root.querySelector('table')?.getAttribute('aria-rowcount')).toBe('20001');
    expect(v.root.querySelector('[role="region"]')?.previousElementSibling?.textContent).toBe(
      'Big (20,000 rows)',
    );
    expect(v.root.querySelector('tbody tr[aria-rowindex]')?.textContent).toBe(`#${2000 - 8}new`);
  });
});
