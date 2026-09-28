/**
 * Scroll math of scrolling legends (plan E5.2, plotly.js `legend/draw.js`): offsets clamped to the
 * content, the scrollbar inside its track, scrolling an item into view, wheel deltas.
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  clampScroll,
  revealOffset,
  SCROLLBAR,
  scrollGeometry,
  wheelDelta,
} from './legend-scroll.ts';

describe('scrollGeometry', () => {
  it("matches plotly.js's metrics", () => {
    const g = scrollGeometry(100, 400);
    expect(g.max).toBe(300);
    expect(g.barHeight).toBe(25);
    expect(g.barMax).toBe(100 - 25 - 2 * SCROLLBAR.margin);
    expect(g.ratio).toBeCloseTo(67 / 300);
    // At least 20 px tall.
    expect(scrollGeometry(100, 5000).barHeight).toBe(SCROLLBAR.minHeight);
    // Content that fits does not scroll.
    expect(scrollGeometry(100, 80)).toMatchObject({ max: 0, ratio: 0 });
  });

  it('keeps the scrollbar inside its track at every offset', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 30, max: 2000 }),
        fc.integer({ min: 1, max: 20000 }),
        fc.double({ min: -1e4, max: 1e5, noNaN: true }),
        (view, extra, offset) => {
          const g = scrollGeometry(view, view + extra);
          const y = clampScroll(offset, g);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(g.max);
          const top = SCROLLBAR.margin + y * g.ratio;
          expect(top).toBeGreaterThanOrEqual(SCROLLBAR.margin);
          // The bar stays inside its track (when the track can hold it).
          if (view >= g.barHeight + 2 * SCROLLBAR.margin) {
            expect(top + g.barHeight).toBeLessThanOrEqual(view - SCROLLBAR.margin + 1e-6);
          }
        },
      ),
    );
  });
});

describe('clampScroll', () => {
  it('clamps to [0, max] and maps NaN to 0', () => {
    expect(clampScroll(-5, { max: 10 })).toBe(0);
    expect(clampScroll(15, { max: 10 })).toBe(10);
    expect(clampScroll(4, { max: 10 })).toBe(4);
    expect(clampScroll(Number.NaN, { max: 10 })).toBe(0);
  });
});

describe('revealOffset', () => {
  it('moves as little as possible to show an item', () => {
    // Visible band [100, 200] at offset 50: content [150, 250].
    expect(revealOffset(50, 160, 20, 100, 200)).toBe(50);
    expect(revealOffset(50, 240, 20, 100, 200)).toBe(60);
    expect(revealOffset(50, 120, 20, 100, 200)).toBe(20);
    // Taller than the band: its start wins.
    expect(revealOffset(50, 300, 150, 100, 200)).toBe(200);
  });

  it('shows any item that fits (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 60, max: 400 }),
        (offset, top, height, viewTop, band) => {
          const y = revealOffset(offset, top, height, viewTop, viewTop + band);
          expect(top - y).toBeGreaterThanOrEqual(viewTop);
          expect(top + height - y).toBeLessThanOrEqual(viewTop + band);
        },
      ),
    );
  });
});

describe('wheelDelta', () => {
  it('scales lines and pages like the wheel zoom', () => {
    expect(wheelDelta({ deltaY: 53, deltaMode: 0 })).toBe(53);
    expect(wheelDelta({ deltaY: 3, deltaMode: 1 })).toBe(120);
    expect(wheelDelta({ deltaY: -1, deltaMode: 2 })).toBe(-800);
  });
});
