// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartDescription } from './describe.ts';
import { A11yMirror, RANGE_DEBOUNCE_MS, STREAM_THROTTLE_MS } from './mirror.ts';

let el: HTMLElement;
let mirror: A11yMirror | undefined;
/** What `describe` returns next, and how often it was asked. */
let current: ChartDescription | undefined;
let asked: number;

function description(extra: Partial<ChartDescription> = {}): ChartDescription {
  return {
    label: 'Sales. Line chart.',
    summary: 'Line chart.',
    axes: ['X axis: linear axis from 0 to 10.'],
    traces: ['Line "Rev": 3 points.'],
    tables: [],
    overview: '',
    ...extra,
  };
}

function make(options: { dataTable?: 'hidden' | false } = {}): A11yMirror {
  mirror = new A11yMirror(el, {
    interactive: true,
    describe: () => {
      asked++;
      return current;
    },
    ...options,
  });
  return mirror;
}

const paragraphs = (): (string | null)[] =>
  [...el.querySelectorAll('.holochart-a11y p')].map((p) => p.textContent);

beforeEach(() => {
  el = document.createElement('div');
  document.body.appendChild(el);
  current = description();
  asked = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  mirror?.destroy();
  mirror = undefined;
  el.remove();
  vi.useRealTimers();
});

describe('A11yMirror: deferred rebuilds (E17.1)', () => {
  it('does not let range changes push back a streaming rebuild that is already due', () => {
    const m = make();
    m.update();
    current = description({ traces: ['Line "Rev": 4 points.'] });
    m.invalidate('stream');
    // A pan while streaming: every range change would restart the debounce.
    vi.advanceTimersByTime(STREAM_THROTTLE_MS - 100);
    m.invalidate('range');
    vi.advanceTimersByTime(99);
    m.invalidate('range');
    expect(asked).toBe(1);
    vi.advanceTimersByTime(1);
    expect(asked).toBe(2);
    expect(el.querySelector('ul[aria-labelledby$="-traces"] li')?.textContent).toBe(
      'Line "Rev": 4 points.',
    );
    // Nothing is left for the range changes.
    expect(m.pending).toBe(false);
    vi.advanceTimersByTime(RANGE_DEBOUNCE_MS * 2);
    expect(asked).toBe(2);
  });

  it('restarts the debounce on every range change and reports a pending rebuild', () => {
    const m = make();
    m.update();
    expect(m.pending).toBe(false);
    m.invalidate('range');
    expect(m.pending).toBe(true);
    vi.advanceTimersByTime(RANGE_DEBOUNCE_MS - 1);
    m.invalidate('range');
    vi.advanceTimersByTime(RANGE_DEBOUNCE_MS - 1);
    expect(asked).toBe(1);
    expect(m.pending).toBe(true);
    vi.advanceTimersByTime(1);
    expect(asked).toBe(2);
    expect(m.pending).toBe(false);
  });

  it('lets a streaming append wait for a pending range rebuild instead of adding its own', () => {
    const m = make();
    m.update();
    m.invalidate('range');
    m.invalidate('stream');
    vi.advanceTimersByTime(RANGE_DEBOUNCE_MS);
    expect(asked).toBe(2);
    vi.advanceTimersByTime(STREAM_THROTTLE_MS);
    expect(asked).toBe(2);
  });

  it('rebuilds at once on a content change, which replaces a pending rebuild', () => {
    const m = make();
    m.update();
    m.invalidate('range');
    m.invalidate('content');
    expect(asked).toBe(2);
    expect(m.pending).toBe(false);
    vi.advanceTimersByTime(RANGE_DEBOUNCE_MS);
    expect(asked).toBe(2);
  });

  it('ignores changes that do not concern the description', () => {
    const m = make();
    m.update();
    m.invalidate('none');
    expect(m.pending).toBe(false);
    vi.advanceTimersByTime(STREAM_THROTTLE_MS);
    expect(asked).toBe(1);
  });
});

describe('A11yMirror: what it renders (E17.1)', () => {
  it('has a role and a description target but no name before the first description', () => {
    current = undefined;
    const m = make();
    m.update();
    expect(el.getAttribute('role')).toBe('figure');
    expect(el.hasAttribute('aria-label')).toBe(false);
    const text = document.getElementById(el.getAttribute('aria-describedby') ?? '');
    expect(text?.textContent).toBe('');
    // The first description fills it in.
    current = description();
    m.update();
    expect(el.getAttribute('aria-label')).toBe('Sales. Line chart.');
    expect(text?.textContent).toContain('Line chart.');
  });

  it('leaves out the heading of a list that would be empty (charts without axes)', () => {
    current = description({ axes: [], summary: 'Pie chart.' });
    make().update();
    expect(paragraphs()).toEqual(['Pie chart.', 'Traces:']);
    expect(el.querySelectorAll('.holochart-a11y ul')).toHaveLength(1);
  });

  it('follows the name when the description changes it', () => {
    const m = make();
    m.update();
    current = description({ label: 'Costs. Line chart.' });
    m.update();
    expect(el.getAttribute('aria-label')).toBe('Costs. Line chart.');
  });

  it('renders hidden tables by default, padding short rows to the columns', () => {
    current = description({
      tables: [
        {
          title: 'Rev',
          caption: 'Rev (2 rows)',
          columns: ['x', 'y'],
          rows: [['0'], ['5', '60']],
          total: 2,
        },
      ],
    });
    make().update();
    const table = el.querySelector('.holochart-a11y table')!;
    expect(table.querySelector('caption')?.textContent).toBe('Rev (2 rows)');
    const cells = [...table.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent),
    );
    expect(cells).toEqual([
      ['0', ''],
      ['5', '60'],
    ]);
  });

  it('rebuilds the hidden tables when only their rows changed', () => {
    const table = { title: 'Rev', caption: 'Rev (1 row)', columns: ['x'], total: 1 };
    current = description({ tables: [{ ...table, rows: [['0']] }] });
    const m = make();
    m.update();
    current = description({ tables: [{ ...table, rows: [['7']] }] });
    m.update();
    expect(el.querySelector('.holochart-a11y td')?.textContent).toBe('7');
  });

  it('renders no tables with dataTable off', () => {
    current = description({
      tables: [{ title: 'Rev', caption: 'Rev (1 row)', columns: ['x'], rows: [['0']], total: 1 }],
    });
    make({ dataTable: false }).update();
    expect(el.querySelector('.holochart-a11y table')).toBeNull();
    expect(paragraphs()[0]).toBe('Line chart.');
  });
});
