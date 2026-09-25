import { createBreakMap, createScale, type AxisType } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import {
  linearToPosition,
  parseSelectionPath,
  positionToLinear,
  selectionFromQuery,
  selectionQuery,
  selectionsOf,
} from './selections.ts';

function axis(type: AxisType, id = 'x', options: Parameters<typeof createScale>[0] = { type }) {
  const scale = createScale({ ...options, type, range: options.range ?? [0, 10], length: 100 });
  return { id, type, scale };
}

const X = axis('linear');
const Y = axis('linear', 'y');

describe('selection positions', () => {
  it('reads range values, data values on log axes and dates with `_`', () => {
    expect(positionToLinear(X, 3)).toBe(3);
    expect(positionToLinear(axis('log'), 100)).toBe(2);
    expect(linearToPosition(axis('log'), 2)).toBe(100);
    const d = axis('date');
    expect(positionToLinear(d, '2024-03-01_12:00')).toBe(Date.parse('2024-03-01T12:00Z'));
    expect(linearToPosition(d, Date.parse('2024-03-01T12:00Z'))).toBe('2024-03-01 12:00');
    const c = axis('category', 'x', { type: 'category', categories: ['a', 'b', 'c'] });
    expect(positionToLinear(c, 'b')).toBe(1);
    expect(positionToLinear(c, 1.5)).toBe(1.5);
    expect(positionToLinear(X, null)).toBeNaN();
  });
});

describe('parseSelectionPath', () => {
  it('parses absolute, relative, H and V commands into one polygon', () => {
    expect(parseSelectionPath('M0,0L4,0L4,3Z', X, Y)).toEqual([
      [0, 0],
      [4, 0],
      [4, 3],
    ]);
    expect(parseSelectionPath('M 1 1 h 2 v 2 H 1 Z', X, Y)).toEqual([
      [1, 1],
      [3, 1],
      [3, 3],
      [1, 3],
    ]);
    // The closing vertex is dropped; only the first ring counts.
    expect(parseSelectionPath('M0,0L1,0L1,1L0,0ZM5,5L6,5L6,6Z', X, Y)).toHaveLength(3);
  });

  it('rejects fewer than 3 vertices and invalid values', () => {
    expect(parseSelectionPath('M0,0L1,1Z', X, Y)).toBeUndefined();
    expect(parseSelectionPath('M0,0Lx,1L2,2Z', X, Y)).toBeUndefined();
    expect(parseSelectionPath('Q0,0', X, Y)).toBeUndefined();
  });
});

describe('selectionQuery', () => {
  it('makes a box query from a rect, sorted, and a lasso from a path', () => {
    expect(selectionQuery({ type: 'rect', x0: 4, x1: 1, y0: 5, y1: 2 }, X, Y)).toEqual({
      kind: 'rect',
      x: [1, 4],
      y: [2, 5],
    });
    const q = selectionQuery({ type: 'path', path: 'M0,0L4,0L4,3Z' }, X, Y);
    expect(q?.kind).toBe('lasso');
    expect(q?.x).toEqual([0, 4]);
    expect(q?.y).toEqual([0, 3]);
    expect(q?.polygon).toHaveLength(3);
  });

  it('ignores incomplete, invalid and hidden selections', () => {
    expect(selectionQuery({ type: 'rect', x0: 1, x1: 2, y0: 3 }, X, Y)).toBeUndefined();
    expect(selectionQuery({ type: 'path' }, X, Y)).toBeUndefined();
    expect(
      selectionQuery({ type: 'rect', x0: 1, x1: 2, y0: 3, y1: 4, visible: false }, X, Y),
    ).toBeUndefined();
  });

  it('works in compressed space on axes with range breaks', () => {
    const breaks = createBreakMap(
      [
        {
          bounds: ['sat', 'mon'],
          enabled: true,
          visible: true,
          pattern: 'day of week',
          dvalue: 86_400_000,
        },
      ],
      'date',
    );
    const d = axis('date', 'x', { type: 'date', ...(breaks ? { breaks } : {}) });
    // Friday 2024-03-01 to Monday 2024-03-04: one trading day apart once the weekend is removed.
    const q = selectionQuery(
      { type: 'rect', x0: '2024-03-01', x1: '2024-03-04', y0: 0, y1: 1 },
      d,
      Y,
    );
    expect(q && q.x[1] - q.x[0]).toBe(86_400_000);
  });
});

describe('selectionFromQuery', () => {
  it('writes a box as a rect in range values, filling unbounded sides from the range', () => {
    expect(selectionFromQuery({ kind: 'rect', x: [1, 4], y: [-Infinity, Infinity] }, X, Y)).toEqual(
      { type: 'rect', xref: 'x', yref: 'y', x0: 1, x1: 4, y0: 0, y1: 10 },
    );
  });

  it('writes a lasso as a path with dates in Plotly form, and round-trips it', () => {
    const d = axis('date');
    const t0 = Date.parse('2024-03-01T00:00Z');
    const h = 3_600_000;
    const polygon: [number, number][] = [
      [t0, 1],
      [t0 + 12 * h, 5],
      [t0 + 24 * h, 1],
    ];
    const sel = selectionFromQuery(
      { kind: 'lasso', x: [t0, t0 + 24 * h], y: [1, 5], polygon },
      d,
      Y,
    );
    expect(sel).toEqual({
      type: 'path',
      xref: 'x',
      yref: 'y',
      path: 'M2024-03-01,1L2024-03-01_12:00,5L2024-03-02,1Z',
    });
    const back = selectionQuery(sel as { type: 'path'; path: string }, d, Y);
    expect(back?.polygon).toEqual(polygon);
  });

  it('needs 3 lasso vertices', () => {
    expect(
      selectionFromQuery({ kind: 'lasso', x: [0, 1], y: [0, 1], polygon: [[0, 0]] }, X, Y),
    ).toBeUndefined();
  });
});

describe('selectionsOf', () => {
  it('lists the visible selections of a layout', () => {
    expect(selectionsOf({ selections: [{ x0: 1 }, { visible: false }] })).toEqual([{ x0: 1 }]);
    expect(selectionsOf({})).toEqual([]);
    expect(selectionsOf(undefined)).toEqual([]);
  });
});
