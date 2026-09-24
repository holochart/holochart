import { describe, expect, it } from 'vitest';
import { layoutRows, maxScroll, RowHeights } from './rows.ts';

describe('RowHeights', () => {
  it('keeps running offsets and finds the row at a position', () => {
    const rows = new RowHeights(5, 20);
    expect(rows.total).toBe(100);
    rows.set(1, 50);
    expect(rows.top(2)).toBe(70);
    expect(rows.total).toBe(130);
    expect(rows.rowAt(0)).toBe(0);
    expect(rows.rowAt(19.9)).toBe(0);
    expect(rows.rowAt(20)).toBe(1);
    expect(rows.rowAt(69)).toBe(1);
    expect(rows.rowAt(70)).toBe(2);
    expect(rows.rowAt(1e9)).toBe(4);
    expect(rows.rowAt(-5)).toBe(0);
  });

  it('never shrinks a row below the declared height, and reset forgets measurements', () => {
    const rows = new RowHeights(3, 20);
    expect(rows.set(0, 5)).toBe(false);
    expect(rows.measured(0)).toBe(true);
    expect(rows.height(0)).toBe(20);
    rows.set(2, 33);
    rows.reset(25);
    expect(rows.measured(2)).toBe(false);
    expect(rows.total).toBe(75);
  });

  it('converts between anchors and positions', () => {
    const rows = new RowHeights(4, 10);
    rows.set(0, 30);
    expect(rows.anchorAt(35)).toEqual({ row: 1, offset: 5 });
    expect(rows.positionOf({ row: 2, offset: 3 })).toBe(43);
  });
});

describe('layoutRows (virtualization)', () => {
  it('measures only the rows near the viewport of a 100k-row table', () => {
    const rows = new RowHeights(100_000, 20);
    const measured: number[] = [];
    const window = layoutRows(
      rows,
      { row: 50_000, offset: 0 },
      200,
      (i) => {
        measured.push(i);
        return 20;
      },
      10,
    );
    expect(window.first).toBe(50_000);
    expect(window.last).toBe(50_009);
    expect(window.scrollY).toBe(1_000_000);
    expect(measured.length).toBeLessThanOrEqual(30);
    expect(Math.min(...measured)).toBe(49_990);
    expect(Math.max(...measured)).toBe(50_019);
  });

  it('keeps the anchor row in place when rows above it grow while measured', () => {
    const rows = new RowHeights(1000, 20);
    const window = layoutRows(rows, { row: 100, offset: 4 }, 100, () => 30, 5);
    // Rows 95…99 grew by 10 px each: the scroll position follows, row 100 stays at the top.
    expect(window.anchor).toEqual({ row: 100, offset: 4 });
    expect(window.scrollY).toBe(rows.top(100) + 4);
    expect(window.first).toBe(100);
  });

  it('clamps at both ends', () => {
    const rows = new RowHeights(10, 20);
    const bottom = layoutRows(rows, { row: 9, offset: 15 }, 50, () => 20);
    expect(bottom.scrollY).toBe(maxScroll(rows, 50));
    expect(bottom.last).toBe(9);
    const top = layoutRows(rows, { row: -3, offset: -40 }, 50, () => 20);
    expect(top.scrollY).toBe(0);
    expect(top.first).toBe(0);
  });

  it('handles tables with no rows or rows that all fit', () => {
    const none = layoutRows(new RowHeights(0, 20), { row: 0, offset: 0 }, 100, () => 20);
    expect(none.last).toBe(-1);
    const fit = new RowHeights(3, 20);
    expect(layoutRows(fit, { row: 2, offset: 0 }, 100, () => 20).scrollY).toBe(0);
    expect(maxScroll(fit, 100)).toBe(0);
  });
});
