import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PickHitList, gatherPickHits } from './pick-hits.ts';
import { encodePickId } from './pick-id.ts';
import { computePickWindow, createPickWindow, windowPixelDistance } from './pick-window.ts';

const CANVAS = { width: 200, height: 100, pixelRatio: 1 };
const FULL = { x: 0, y: 0, width: 200, height: 100 };

function windowAt(x: number, y: number, radius: number, area = FULL) {
  const w = createPickWindow();
  expect(computePickWindow(w, x, y, radius, CANVAS, area, area)).toBe(true);
  return w;
}

/** A read-back buffer (rows bottom-up) with `ids[j][i]` (-1 = background). */
function pixels(n: number, at: (i: number, j: number) => number): Uint8Array {
  const out = new Uint8Array(n * n * 4);
  const rgba = new Float32Array(4);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const id = at(i, j);
      if (id < 0) continue;
      encodePickId(id, rgba);
      for (let c = 0; c < 4; c++) out[(j * n + i) * 4 + c] = Math.round(rgba[c]! * 255);
    }
  }
  return out;
}

describe('gatherPickHits', () => {
  it('dedupes ids with their minimum distance and sorts nearest first', () => {
    const w = windowAt(50.5, 50.5, 3);
    const n = w.size;
    const h = w.half;
    // id 7 fills the right column, id 3 a pixel two left of the centre, id 9 under the cursor.
    const buf = pixels(n, (i, j) =>
      i === h && j === h ? 9 : i === n - 1 ? 7 : i === h - 2 && j === h ? 3 : -1,
    );
    const hits = gatherPickHits(buf, w, new PickHitList());
    expect(hits.count).toBe(3);
    expect(hits.ids.slice(0, 3)).toEqual([9, 3, 7]);
    expect(hits.distances[0]).toBe(0);
    expect(hits.distances[1]).toBeCloseTo(2, 12);
    // Closest pixel of the column (same row as the cursor).
    expect(hits.distances[2]).toBeCloseTo(3, 12);
  });

  it('ignores background and pixels beyond the radius (corners of the square window)', () => {
    const w = windowAt(50.5, 50.5, 2);
    const n = w.size;
    // Only the four corners are set: distance 2√2 > 2.
    const buf = pixels(n, (i, j) =>
      (i === 0 || i === n - 1) && (j === 0 || j === n - 1) ? 1 : -1,
    );
    expect(gatherPickHits(buf, w, new PickHitList()).count).toBe(0);
  });

  it('always counts the pixel under the cursor, even with radius 0', () => {
    const w = windowAt(10.9, 10.9, 0);
    expect(w.size).toBe(1);
    const hits = gatherPickHits(
      pixels(1, () => 42),
      w,
      new PickHitList(),
    );
    expect(hits.count).toBe(1);
    expect(hits.ids[0]).toBe(42);
    expect(hits.distances[0]).toBe(0);
  });

  it('drops pixels outside the visible region', () => {
    const area = { x: 50, y: 0, width: 150, height: 100 };
    const w = windowAt(50.5, 50.5, 3, area);
    const h = w.half;
    // Everything left of the centre column lies outside the view.
    const buf = pixels(w.size, (i) => (i < h ? 5 : i > h ? 6 : -1));
    const hits = gatherPickHits(buf, w, new PickHitList());
    expect(hits.ids.slice(0, hits.count)).toEqual([6]);
  });

  it('breaks distance ties by id and honours maxHits', () => {
    const w = windowAt(50.5, 50.5, 1);
    const h = w.half;
    const buf = pixels(w.size, (i, j) =>
      j === h && i === h - 1 ? 20 : j === h && i === h + 1 ? 10 : -1,
    );
    const list = new PickHitList();
    gatherPickHits(buf, w, list);
    expect(list.ids.slice(0, list.count)).toEqual([10, 20]);
    gatherPickHits(buf, w, list, 1);
    expect(list.count).toBe(1);
    expect(list.ids[0]).toBe(10);
  });

  it('matches a brute-force oracle on random windows', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4 }),
        fc.array(fc.integer({ min: -1, max: 6 }), { minLength: 81, maxLength: 81 }),
        (radius, ids) => {
          const w = windowAt(100.3, 40.7, radius);
          const n = w.size;
          const at = (i: number, j: number) => ids[(j * n + i) % ids.length]!;
          const hits = gatherPickHits(pixels(n, at), w, new PickHitList());
          const best = new Map<number, number>();
          for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
              const id = at(i, j);
              const d = windowPixelDistance(w, i, j);
              if (id < 0 || (d > w.radius && d !== 0)) continue;
              best.set(id, Math.min(best.get(id) ?? Infinity, d));
            }
          }
          const expected = [...best].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
          expect(hits.count).toBe(expected.length);
          expected.forEach(([id, d], k) => {
            expect(hits.ids[k]).toBe(id);
            expect(hits.distances[k]).toBe(d);
          });
        },
      ),
      { numRuns: 200 },
    );
  });
});
