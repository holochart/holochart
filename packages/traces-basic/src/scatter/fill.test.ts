import { describe, expect, it } from 'vitest';
import {
  buildFill,
  fillContains,
  fillDirection,
  fillLabelPosition,
  isSimpleBand,
  linksToPrevious,
  type FillGeometry,
} from './fill.ts';

const path = (x: number[], y: number[]) => ({ x: Float64Array.from(x), y: Float64Array.from(y) });

/** Rings of a geometry as `[x, y][]` lists. */
function rings(g: FillGeometry | undefined): [number, number][][] {
  if (!g) return [];
  const out: [number, number][][] = [];
  for (let r = 0; r < g.rings.length; r++) {
    const start = g.rings[r]!;
    const end = r + 1 < g.rings.length ? g.rings[r + 1]! : g.x.length;
    const ring: [number, number][] = [];
    for (let i = start; i < end; i++) ring.push([g.x[i]!, g.y[i]!]);
    out.push(ring);
  }
  return out;
}

const ZERO = { zeroX: 0, zeroY: 0 };

describe('fill modes (E9.4, Plotly scatter/plot.js)', () => {
  it('classifies modes', () => {
    expect(fillDirection('tozeroy')).toBe('y');
    expect(fillDirection('tonextx')).toBe('x');
    expect(fillDirection('toself')).toBe('');
    expect(fillDirection('tonext')).toBe('');
    expect(fillDirection('none')).toBe('');
    expect(linksToPrevious('tonexty')).toBe(true);
    expect(linksToPrevious('tonext')).toBe(true);
    expect(linksToPrevious('tozeroy')).toBe(false);
  });

  it("'none' and too few points fill nothing", () => {
    expect(buildFill({ mode: 'none', path: path([0, 1, 2], [1, 2, 1]), ...ZERO })).toBeUndefined();
    expect(buildFill({ mode: 'toself', path: path([0, 1], [1, 2]), ...ZERO })).toBeUndefined();
  });

  it("'tozeroy': the path closed along y = 0, end points first (simple)", () => {
    const g = buildFill({ mode: 'tozeroy', path: path([0, 1, 2], [1, 3, 2]), ...ZERO });
    expect(rings(g)).toEqual([
      [
        [2, 0],
        [0, 0],
        [0, 1],
        [1, 3],
        [2, 2],
      ],
    ]);
    expect(g!.fillRule).toBe('simple');
  });

  it("'tozerox': the path closed along x = 0", () => {
    const g = buildFill({ mode: 'tozerox', path: path([1, 3, 2], [0, 1, 2]), ...ZERO });
    expect(rings(g)[0]!.slice(0, 2)).toEqual([
      [0, 2],
      [0, 0],
    ]);
    expect(g!.fillRule).toBe('simple');
  });

  it('uses the given baseline (log axes have no zero)', () => {
    const g = buildFill({
      mode: 'tozeroy',
      path: path([0, 1], [1, 2]),
      zeroX: 0,
      zeroY: -30,
    });
    expect(rings(g)[0]!.slice(0, 2)).toEqual([
      [1, -30],
      [0, -30],
    ]);
  });

  it('directional fills bridge gaps straight; toself fills each segment', () => {
    const p = path([0, 1, NaN, 3, 4], [1, 2, NaN, 2, 1]);
    const zero = buildFill({ mode: 'tozeroy', path: p, ...ZERO });
    expect(rings(zero)).toHaveLength(1);
    expect(rings(zero)[0]).toHaveLength(6);
    const self = buildFill({
      mode: 'toself',
      path: path([0, 1, 0, NaN, 3, 4, 3], [0, 0, 1, NaN, 0, 0, 1]),
      ...ZERO,
    });
    expect(rings(self)).toHaveLength(2);
    expect(self!.fillRule).toBe('nonzero');
  });

  it('a line crossing zero is not simple: exact nonzero rule', () => {
    const g = buildFill({ mode: 'tozeroy', path: path([0, 1, 2], [1, -1, 1]), ...ZERO });
    expect(g!.fillRule).toBe('nonzero');
  });

  it("'tonexty' without a previous trace fills to zero", () => {
    const g = buildFill({ mode: 'tonexty', path: path([0, 1], [1, 2]), ...ZERO });
    expect(rings(g)[0]![0]).toEqual([1, 0]);
  });

  it("'tonexty': this path, then the previous one backwards", () => {
    const g = buildFill({
      mode: 'tonexty',
      path: path([0, 1, 2], [3, 4, 3]),
      previous: path([0, 1, NaN, 2], [1, 2, NaN, 1]),
      ...ZERO,
    });
    expect(rings(g)).toEqual([
      [
        [0, 3],
        [1, 4],
        [2, 3],
        [2, 1],
        [1, 2],
        [0, 1],
      ],
    ]);
    expect(g!.fillRule).toBe('simple');
  });

  it("crossing bounds make 'tonexty' use the nonzero rule", () => {
    const g = buildFill({
      mode: 'tonexty',
      path: path([0, 1, 2], [3, 0, 3]),
      previous: path([0, 1, 2], [1, 2, 1]),
      ...ZERO,
    });
    expect(g!.fillRule).toBe('nonzero');
  });

  it("'tonextx' links along y", () => {
    const g = buildFill({
      mode: 'tonextx',
      path: path([3, 4, 3], [0, 1, 2]),
      previous: path([1, 2, 1], [0, 1, 2]),
      ...ZERO,
    });
    expect(rings(g)[0]).toHaveLength(6);
    expect(g!.fillRule).toBe('simple');
  });

  it("'tonext': both traces' segments, the previous reversed (a ring with a hole)", () => {
    const outer = path([0, 4, 4, 0], [0, 0, 4, 4]);
    const inner = path([1, 3, 3, 1], [1, 1, 3, 3]);
    const g = buildFill({ mode: 'tonext', path: outer, previous: inner, ...ZERO })!;
    expect(rings(g)).toHaveLength(2);
    expect(rings(g)[1]).toEqual([
      [1, 3],
      [3, 3],
      [3, 1],
      [1, 1],
    ]);
    expect(fillContains(g, 0.5, 0.5)).toBe(true);
    // The previous trace's area is cut out (nonzero with opposite winding).
    expect(fillContains(g, 2, 2)).toBe(false);
    // Without a previous trace, 'tonext' acts like 'toself'.
    const self = buildFill({ mode: 'tonext', path: outer, ...ZERO })!;
    expect(fillContains(self, 2, 2)).toBe(true);
  });

  it('follows step shapes: vertical runs stay simple', () => {
    // An 'hv' path of y = [1, 2, 1]: every x appears twice.
    const g = buildFill({ mode: 'tozeroy', path: path([0, 1, 1, 2, 2], [1, 1, 2, 2, 1]), ...ZERO });
    expect(g!.fillRule).toBe('simple');
  });
});

describe('isSimpleBand', () => {
  it('needs both boundaries monotonic in the same direction over the same span', () => {
    const a = path([0, 1, 2], [2, 3, 2]);
    expect(isSimpleBand(a, path([0, 2], [0, 0]), 'y')).toBe(true);
    // Decreasing x on both: fine.
    expect(isSimpleBand(path([2, 1, 0], [2, 3, 2]), path([2, 0], [0, 0]), 'y')).toBe(true);
    // Different spans or directions: not provably simple.
    expect(isSimpleBand(a, path([0, 3], [0, 0]), 'y')).toBe(false);
    expect(isSimpleBand(a, path([2, 0], [0, 0]), 'y')).toBe(false);
    expect(isSimpleBand(path([0, 2, 1], [1, 1, 1]), path([0, 1], [0, 0]), 'y')).toBe(false);
  });

  it('allows touching, rejects crossing', () => {
    expect(isSimpleBand(path([0, 1, 2], [1, 0, 1]), path([0, 2], [0, 0]), 'y')).toBe(true);
    expect(isSimpleBand(path([0, 1, 2], [1, -1, 1]), path([0, 2], [0, 0]), 'y')).toBe(false);
    // A vertical run of one boundary straddling the other.
    expect(isSimpleBand(path([0, 1, 1, 2], [1, 1, -1, -1]), path([0, 2], [0, 0]), 'y')).toBe(false);
  });
});

describe('fill hit testing (hoveron fills)', () => {
  const g = buildFill({ mode: 'tozeroy', path: path([0, 1, 2], [2, 4, 2]), ...ZERO })!;

  it('tests containment with the nonzero rule', () => {
    expect(fillContains(g, 1, 1)).toBe(true);
    expect(fillContains(g, 1, 5)).toBe(false);
    expect(fillContains(g, -1, 1)).toBe(false);
    // A self-intersecting star: nonzero fills the center.
    const star = buildFill({
      mode: 'toself',
      path: path([0, 0.6, -0.95, 0.95, -0.6], [1, -0.8, 0.3, 0.3, -0.8]),
      ...ZERO,
    })!;
    expect(fillContains(star, 0, 0)).toBe(true);
  });

  it("places the label at the containing ring's vertical middle, right edge (Plotly)", () => {
    // Identity mapping; plot 10 × 10.
    const peak = buildFill({ mode: 'tozeroy', path: path([0, 1, 2], [1, 4, 1]), ...ZERO })!;
    const at = fillLabelPosition(peak, [1, 1], (x, y) => [x, y], { width: 10, height: 10 })!;
    expect(at.y).toBe(2);
    // The right edge at y = 2, on the segment (1, 4) → (2, 1).
    expect(at.x).toBeCloseTo(5 / 3);
    // Clamped to the plot area.
    const clamped = fillLabelPosition(g, [1, 1], (x, y) => [x * 10, y * 10], {
      width: 15,
      height: 10,
    })!;
    expect(clamped.y).toBe(5);
    expect(clamped.x).toBeLessThanOrEqual(15);
    expect(fillLabelPosition(g, [5, 5], (x, y) => [x, y], { width: 10, height: 10 })).toBe(
      undefined,
    );
  });
});
