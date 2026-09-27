import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  clipPolylineByBoxes,
  cutPath,
  LABEL_CONSTANTS,
  placeContourLabels,
  segmentDistance,
  type ContourLabel,
  type LabelBox,
  type LabelPath,
  type LabelSize,
} from './contour-labels.ts';

/** Round away float noise. */
const r9 = (v: number): number => +v.toFixed(9);

const plot = { x0: 0, y0: 0, x1: 1000, y1: 1000 };
const size: LabelSize = { width: 40, height: 12, fontSize: 10 };
/** Stored box height: 12 − 10/3. */
const BOX_H = 12 - 10 / 3;

function line(x0: number, y0: number, x1: number, y1: number, level = 0, n = 11): LabelPath {
  const x: number[] = [];
  const y: number[] = [];
  for (let k = 0; k < n; k++) {
    x.push(x0 + ((x1 - x0) * k) / (n - 1));
    y.push(y0 + ((y1 - y0) * k) / (n - 1));
  }
  return { x, y, closed: false, level };
}

function circle(cx: number, cy: number, r: number, level = 0, n = 96): LabelPath {
  const x: number[] = [];
  const y: number[] = [];
  for (let k = 0; k < n; k++) {
    x.push(cx + r * Math.cos((2 * Math.PI * k) / n));
    y.push(cy + r * Math.sin((2 * Math.PI * k) / n));
  }
  return { x, y, closed: true, level };
}

/** Distance from a point to a polyline (closing segment included). */
function distToPath(px: number, py: number, p: { x: ArrayLike<number>; y: ArrayLike<number> }) {
  let best = Infinity;
  const n = p.x.length;
  for (let k = 0; k < n; k++) {
    const ax = p.x[k]!;
    const ay = p.y[k]!;
    const vx = p.x[(k + 1) % n]! - ax;
    const vy = p.y[(k + 1) % n]! - ay;
    const ll = vx * vx + vy * vy;
    const t = ll > 0 ? Math.min(1, Math.max(0, ((px - ax) * vx + (py - ay) * vy) / ll)) : 0;
    best = Math.min(best, Math.hypot(px - ax - t * vx, py - ay - t * vy));
  }
  return best;
}

/** Box corners (y up) for the given size (default: the stored box). */
function corners(l: LabelBox, w = l.width, h = l.height): [number, number][] {
  const rad = (-l.angle * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => [
    l.x + (a! * w * ux) / 2 - (b! * h * uy) / 2,
    l.y + (a! * w * uy) / 2 + (b! * h * ux) / 2,
  ]);
}

/** Separating-axis overlap test of two oriented boxes (touching is not overlapping). */
function overlap(a: LabelBox, b: LabelBox): boolean {
  const ca = corners(a);
  const cb = corners(b);
  for (const l of [a, b]) {
    const rad = (-l.angle * Math.PI) / 180;
    for (const [nx, ny] of [
      [Math.cos(rad), Math.sin(rad)],
      [-Math.sin(rad), Math.cos(rad)],
    ] as const) {
      const pa = ca.map(([x, y]) => x * nx + y * ny);
      const pb = cb.map(([x, y]) => x * nx + y * ny);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}

/** Whether (x, y) is inside the box by more than `eps`. */
function strictlyInside(b: LabelBox, x: number, y: number, eps = 1e-7): boolean {
  const rad = (-b.angle * Math.PI) / 180;
  const u = (x - b.x) * Math.cos(rad) + (y - b.y) * Math.sin(rad);
  const v = (y - b.y) * Math.cos(rad) - (x - b.x) * Math.sin(rad);
  return Math.abs(u) < b.width / 2 - eps && Math.abs(v) < b.height / 2 - eps;
}

function polylineLength(x: ArrayLike<number>, y: ArrayLike<number>, closed: boolean): number {
  let len = 0;
  const n = x.length;
  for (let k = 0; k + 1 < (closed ? n + 1 : n); k++) {
    const b = (k + 1) % n;
    len += Math.hypot(x[b]! - x[k]!, y[b]! - y[k]!);
  }
  return len;
}

/** A busy scene: rings and waves over several levels. */
function scene(): LabelPath[] {
  const paths: LabelPath[] = [];
  for (let k = 0; k < 6; k++) paths.push(circle(500, 500, 60 + 55 * k, k));
  for (let k = 0; k < 6; k++) {
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i <= 200; i++) {
      x.push(i * 5);
      y.push(80 + 25 * k + 20 * Math.sin(i / 9));
    }
    paths.push({ x, y, closed: false, level: k });
  }
  return paths;
}

describe('placeContourLabels', () => {
  it('centers labels on straight paths, horizontal, with padded boxes', () => {
    const { labels } = placeContourLabels([line(100, 500, 900, 500)], [size], plot);
    expect(labels).toHaveLength(1);
    const l = labels[0]!;
    expect(l).toMatchObject({ path: 0, level: 0, angle: 0 });
    expect(l.y).toBeCloseTo(500, 9);
    expect(l.width).toBeCloseTo(40 + 10 / 3, 12);
    expect(l.height).toBeCloseTo(BOX_H, 12);
    // The edge cost pulls the single label to the middle of the plot.
    expect(l.x).toBeGreaterThan(400);
    expect(l.x).toBeLessThan(600);
  });

  it('puts labels on their paths', () => {
    const paths = scene();
    const { labels } = placeContourLabels(paths, [size, size, size, size, size, size], plot);
    expect(labels.length).toBeGreaterThan(8);
    for (const l of labels) {
      expect(l.level).toBe(paths[l.path]!.level);
      // (4·pc + p0 + p1) / 6 is off a curved path by a third of the text chord's sagitta: on
      // these waves (curvature radius ≥ 100 px) at most 20² / 200 / 3 ≈ 0.67 px, plus the
      // polyline's own corners.
      expect(distToPath(l.x, l.y, paths[l.path]!)).toBeLessThan(1.5);
    }
  });

  it('never overlaps label boxes', () => {
    const paths = scene();
    const { labels } = placeContourLabels(paths, [size, size, size, size, size, size], plot);
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        expect(overlap(labels[i]!, labels[j]!)).toBe(false);
      }
    }
  });

  it('keeps the text inside the plot ∩ data bounds', () => {
    const paths = scene();
    const bounds = { x0: 150, x1: 850, y0: 900, y1: 60 };
    const { labels } = placeContourLabels(paths, [size, size, size, size, size, size], plot, {
      bounds,
    });
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) {
      for (const [x, y] of corners(l, size.width, size.height)) {
        expect(x).toBeGreaterThan(150);
        expect(x).toBeLessThan(850);
        expect(y).toBeGreaterThan(60);
        expect(y).toBeLessThan(900);
      }
    }
    // Bounds reaching past the plot are clipped to it.
    const wide = placeContourLabels([line(-500, 3, 1500, 3)], [size], plot, {
      bounds: { x0: -1000, x1: 2000, y0: -1000, y1: 2000 },
    });
    expect(wide.labels).toHaveLength(0);
    // Data off screen: no labels.
    const off = placeContourLabels([line(100, 500, 900, 500)], [size], plot, {
      bounds: { x0: 1100, x1: 1200, y0: 0, y1: 1000 },
    });
    expect(off.labels).toHaveLength(0);
  });

  it('labels only the visible part of a path', () => {
    const { labels } = placeContourLabels([line(-2000, 500, 600, 500, 0, 27)], [size], plot);
    expect(labels).toHaveLength(1);
    expect(labels[0]!.x).toBeGreaterThan(0);
    expect(labels[0]!.x).toBeLessThan(600);
  });

  it('skips paths shorter than LABELMIN · (width + height)', () => {
    // 3 · (40 + 12) = 156 px.
    expect(placeContourLabels([line(400, 500, 550, 500)], [size], plot).labels).toHaveLength(0);
    expect(placeContourLabels([line(400, 500, 560, 500)], [size], plot).labels).toHaveLength(1);
    expect(placeContourLabels([line(0, 500, 1000, 500)], [undefined], plot).labels).toHaveLength(0);
  });

  it('prefers horizontal stretches and reports clockwise angles', () => {
    // A 45° climb, then a flat run: the label goes on the flat run.
    const bent: LabelPath = {
      x: [100, 400, 700],
      y: [200, 500, 500],
      closed: false,
      level: 0,
    };
    const [l] = placeContourLabels([bent], [size], plot).labels;
    expect(l!.angle).toBe(0);
    expect(l!.x).toBeGreaterThan(400);
    // Rising to the right (y up) is counter-clockwise on screen: −45°.
    const up = placeContourLabels([line(200, 200, 800, 800)], [size], plot).labels;
    expect(up[0]!.angle).toBeCloseTo(-45, 9);
    const down = placeContourLabels([line(800, 800, 200, 200)], [size], plot).labels;
    expect(down[0]!.angle).toBeCloseTo(-45, 9);
    const falling = placeContourLabels([line(200, 800, 800, 200)], [size], plot).labels;
    expect(falling[0]!.angle).toBeCloseTo(45, 9);
    const vertical = placeContourLabels([line(500, 900, 500, 100)], [size], plot).labels;
    expect(vertical[0]!.angle).toBe(90);
  });

  it('spreads labels of the same level apart', () => {
    // 60 levels: normLength = 2·√2·1000 / 6 ≈ 471 px, so a 900 px path wants 2 labels.
    const sizes = Array.from({ length: 60 }, () => size);
    const { labels } = placeContourLabels([line(50, 500, 950, 500, 0, 91)], sizes, plot);
    expect(labels).toHaveLength(2);
    const [a, b] = labels as [ContourLabel, ContourLabel];
    const gap = Math.abs(a.x - b.x) - (size.width + b.width) / 2;
    expect(gap).toBeGreaterThan((LABEL_CONSTANTS.SAMELEVELDISTANCE * (12 + BOX_H)) / 2);
    // Two short parallel lines 20 px apart: a second label of the same level cannot get far
    // enough from the first; a label of another level can.
    const pair = (level: number): LabelPath[] => [
      line(400, 500, 600, 500, 0),
      line(400, 520, 600, 520, level),
    ];
    expect(placeContourLabels(pair(0), [size, size], plot).labels).toHaveLength(1);
    expect(placeContourLabels(pair(1), [size, size], plot).labels).toHaveLength(2);
  });

  it('caps labels per path at LABELMAX and by normLength', () => {
    // A serpentine 10 rows × 900 px; 10 000 levels make normLength tiny.
    const x: number[] = [];
    const y: number[] = [];
    for (let r = 0; r < 10; r++) {
      const row = r % 2 === 0 ? [50, 950] : [950, 50];
      for (let i = 0; i <= 30; i++) {
        x.push(row[0]! + ((row[1]! - row[0]!) * i) / 30);
        y.push(60 + 95 * r);
      }
    }
    const serpent: LabelPath = { x, y, closed: false, level: 0 };
    const many = Array.from({ length: 10_000 }, () => size);
    expect(placeContourLabels([serpent], many, plot).labels).toHaveLength(LABEL_CONSTANTS.LABELMAX);
    // One level: normLength = 2·√2·1000 ≈ 2828 px, so ceil(9855 / 2828) = 4 labels at most.
    expect(placeContourLabels([serpent], [size], plot).labels.length).toBeLessThanOrEqual(4);
  });

  it('labels closed paths all around', () => {
    const sizes = Array.from({ length: 100 }, () => size);
    const { labels } = placeContourLabels([circle(500, 500, 300)], sizes, plot);
    expect(labels.length).toBeGreaterThan(1);
    for (const l of labels) expect(Math.hypot(l.x - 500, l.y - 500)).toBeCloseTo(300, 0);
  });

  it('processes paths by level, then in order', () => {
    const a = line(100, 500, 900, 500, 1);
    const b = line(100, 520, 900, 520, 0);
    const { labels } = placeContourLabels([a, b], [size, size], plot);
    expect(labels.map((l) => l.path)).toEqual([1, 0]);
  });

  it('is deterministic', () => {
    const sizes = [size, size, size, size, size, size];
    expect(placeContourLabels(scene(), sizes, plot)).toEqual(
      placeContourLabels(scene(), sizes, plot),
    );
  });
});

describe('segmentDistance', () => {
  it('measures segment gaps', () => {
    expect(segmentDistance(0, 0, 10, 0, 5, -5, 5, 5)).toBe(0);
    expect(segmentDistance(0, 0, 10, 0, 13, 4, 20, 4)).toBe(5);
    expect(segmentDistance(0, 0, 10, 0, 5, 3, 6, 3)).toBe(3);
  });
});

describe('clipPolylineByBoxes', () => {
  const axis: LabelBox = { x: 50, y: 0, angle: 0, width: 20, height: 10 };

  it('cuts a segment exactly at an axis-aligned box', () => {
    const out = clipPolylineByBoxes([0, 100], [0, 0], false, [axis]);
    expect(out.map((p) => [Array.from(p.x, r9), Array.from(p.y, r9), p.closed])).toEqual([
      [[0, 40], [0, 0], false],
      [[60, 100], [0, 0], false],
    ]);
  });

  it('cuts a segment crossing a rotated box at its sides', () => {
    // A 45° box (either sign: a square box is symmetric) centered at the origin, half size 10 × 5.
    const box: LabelBox = { x: 0, y: 0, angle: -45, width: 20, height: 10 };
    // The x axis leaves this box where |u| = x/√2 or |v| = x/√2 reaches 10 or 5: at x = 5√2.
    const out = clipPolylineByBoxes([-100, 100], [0, 0], false, [box]);
    expect(out).toHaveLength(2);
    expect(out[0]!.x[1]).toBeCloseTo(-5 * Math.SQRT2, 12);
    expect(out[1]!.x[0]).toBeCloseTo(5 * Math.SQRT2, 12);
    // Along the box's long axis (rising 45° in y up, i.e. angle −45) it removes the full width.
    const diag = clipPolylineByBoxes([-50, 50], [-50, 50], false, [box]);
    expect(diag).toHaveLength(2);
    expect(Math.hypot(diag[0]!.x[1]!, diag[0]!.y[1]!)).toBeCloseTo(10, 12);
    expect(Math.hypot(diag[1]!.x[0]!, diag[1]!.y[0]!)).toBeCloseTo(10, 12);
  });

  it('removes segments fully inside and keeps untouched paths as they are', () => {
    expect(clipPolylineByBoxes([45, 55], [0, 1], false, [axis])).toEqual([]);
    const x = [0, 10, 20];
    const y = [50, 50, 50];
    const kept = clipPolylineByBoxes(x, y, false, [axis]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.x).toBe(x);
    expect(kept[0]!.y).toBe(y);
    // Zero-area boxes remove nothing.
    const flat = { ...axis, height: 0 };
    expect(clipPolylineByBoxes([0, 100], [0, 0], false, [flat])[0]!.x).toEqual([0, 100]);
  });

  it('keeps interior vertices and splits across several boxes', () => {
    const boxes: LabelBox[] = [
      { x: 25, y: 0, angle: 0, width: 10, height: 4 },
      { x: 28, y: 0, angle: 0, width: 10, height: 4 },
      { x: 75, y: 0, angle: 90, width: 10, height: 4 },
    ];
    const out = clipPolylineByBoxes([0, 10, 50, 90, 100], [0, 0, 0, 0, 0], false, boxes);
    expect(out.map((p) => Array.from(p.x, r9))).toEqual([
      [0, 10, 20],
      [33, 50, 73],
      [77, 90, 100],
    ]);
  });

  it('keeps closed paths closed when uncut, joins across the start when cut', () => {
    const sq = { x: [0, 100, 100, 0], y: [0, 0, 100, 100] };
    const far: LabelBox = { x: 500, y: 500, angle: 0, width: 10, height: 10 };
    const whole = clipPolylineByBoxes(sq.x, sq.y, true, [far]);
    expect(whole).toEqual([{ x: sq.x, y: sq.y, closed: true }]);
    // A cut on the top edge: one open piece from the cut round to the cut.
    const top: LabelBox = { x: 50, y: 100, angle: 0, width: 20, height: 4 };
    const one = clipPolylineByBoxes(sq.x, sq.y, true, [top]);
    expect(one).toHaveLength(1);
    expect(Array.from(one[0]!.x, r9)).toEqual([40, 0, 0, 100, 100, 60]);
    expect(Array.from(one[0]!.y, r9)).toEqual([100, 100, 0, 0, 100, 100]);
    // A cut on the bottom edge (segment 0): the piece through the start is joined.
    const bottom: LabelBox = { x: 50, y: 0, angle: 0, width: 20, height: 4 };
    const two = clipPolylineByBoxes(sq.x, sq.y, true, [bottom, { ...top, x: 30 }]);
    expect(two.map((p) => [Array.from(p.x), Array.from(p.y)])).toEqual([
      [
        [20, 0, 0, 40],
        [100, 100, 0, 0],
      ],
      [
        [60, 100, 100, 40],
        [0, 0, 100, 100],
      ],
    ]);
    // A cut over the first point.
    const corner: LabelBox = { x: 0, y: 0, angle: 0, width: 20, height: 20 };
    const c = clipPolylineByBoxes(sq.x, sq.y, true, [corner]);
    expect(c.map((p) => [Array.from(p.x), Array.from(p.y)])).toEqual([
      [
        [10, 100, 100, 0, 0],
        [0, 0, 100, 100, 10],
      ],
    ]);
  });

  it('property: keeps exactly the parts of the path outside every box', () => {
    const coord = fc.double({ min: -50, max: 50, noNaN: true });
    const box = fc.record({
      x: coord,
      y: coord,
      angle: fc.double({ min: -89.9, max: 90, noNaN: true }),
      width: fc.double({ min: 1, max: 40, noNaN: true }),
      height: fc.double({ min: 1, max: 20, noNaN: true }),
    });
    fc.assert(
      fc.property(
        fc.array(fc.tuple(coord, coord), { minLength: 2, maxLength: 12 }),
        fc.boolean(),
        fc.array(box, { maxLength: 20 }),
        (pts, closed, boxes) => {
          const x = pts.map((p) => p[0]);
          const y = pts.map((p) => p[1]);
          const out = clipPolylineByBoxes(x, y, closed, boxes);
          let kept = 0;
          for (const p of out) {
            expect(p.x.length).toBeGreaterThanOrEqual(p.closed ? 1 : 2);
            kept += polylineLength(p.x, p.y, p.closed);
            // Nothing kept lies strictly inside a box.
            const n = p.x.length;
            for (let k = 0; k + 1 < (p.closed ? n + 1 : n); k++) {
              const b = (k + 1) % n;
              for (let t = 0; t <= 1; t += 0.125) {
                const px = p.x[k]! + t * (p.x[b]! - p.x[k]!);
                const py = p.y[k]! + t * (p.y[b]! - p.y[k]!);
                for (const bx of boxes) expect(strictlyInside(bx, px, py)).toBe(false);
              }
            }
          }
          // Kept length = the length outside every box, estimated by sampling the input.
          const n = x.length;
          const samples = 400;
          let outside = 0;
          let total = 0;
          for (let k = 0; k + 1 < (closed ? n + 1 : n); k++) {
            const b = (k + 1) % n;
            const len = Math.hypot(x[b]! - x[k]!, y[b]! - y[k]!);
            total += len;
            let free = 0;
            for (let s = 0; s < samples; s++) {
              const t = (s + 0.5) / samples;
              const px = x[k]! + t * (x[b]! - x[k]!);
              const py = y[k]! + t * (y[b]! - y[k]!);
              if (!boxes.some((bx) => strictlyInside(bx, px, py, 0))) free++;
            }
            outside += (len * free) / samples;
          }
          expect(kept).toBeLessThanOrEqual(total + 1e-9);
          // Each box boundary crossing can misplace up to one sample.
          const crossings = 2 * boxes.length * (n + 1);
          expect(Math.abs(kept - outside)).toBeLessThanOrEqual(
            (crossings * 100 * Math.SQRT2) / samples + 1e-9,
          );
        },
      ),
      { numRuns: 300, seed: 20260927 },
    );
  });
});

describe('cutPath', () => {
  const straight = { x: [0, 50, 100], y: [0, 0, 0] };

  it('removes gaps from open paths', () => {
    const pieces = cutPath(straight.x, straight.y, false, [[40, 60]]);
    expect(pieces).toHaveLength(2);
    expect(Array.from(pieces[0]!.x)).toEqual([0, 40]);
    expect(Array.from(pieces[1]!.x)).toEqual([60, 100]);
  });

  it('merges overlapping gaps and clips them to the path', () => {
    const pieces = cutPath(straight.x, straight.y, false, [
      [30, 45],
      [40, 60],
      [90, 120],
      [-10, 5],
    ]);
    expect(pieces.map((p) => Array.from(p.x, r9))).toEqual([
      [5, 30],
      [60, 90],
    ]);
  });

  it('returns the whole path without gaps, nothing when fully cut', () => {
    expect(cutPath(straight.x, straight.y, false, []).map((p) => Array.from(p.x, r9))).toEqual([
      [0, 50, 100],
    ]);
    expect(cutPath(straight.x, straight.y, false, [[-1, 200]])).toHaveLength(0);
  });

  it('joins the pieces of closed paths across the start', () => {
    const sq = { x: [0, 100, 100, 0], y: [0, 0, 100, 100] };
    const whole = cutPath(sq.x, sq.y, true, []);
    expect(whole).toHaveLength(1);
    expect(Array.from(whole[0]!.x)).toEqual([0, 100, 100, 0, 0]);
    const one = cutPath(sq.x, sq.y, true, [[150, 250]]);
    expect(one).toHaveLength(1);
    expect(Array.from(one[0]!.x)).toEqual([50, 0, 0, 100, 100]);
    expect(Array.from(one[0]!.y, r9)).toEqual([100, 100, 0, 0, 50]);
    const wrapped = cutPath(sq.x, sq.y, true, [[-10, 10]]);
    expect(wrapped).toHaveLength(1);
    expect(Array.from(wrapped[0]!.x)).toEqual([10, 100, 100, 0, 0]);
    expect(Array.from(wrapped[0]!.y)).toEqual([0, 0, 100, 100, 10]);
    const two = cutPath(sq.x, sq.y, true, [
      [50, 60],
      [350, 420],
    ]);
    expect(two).toHaveLength(2);
    expect(Array.from(two[0]!.x)).toEqual([20, 50]);
    expect(Array.from(two[1]!.x)).toEqual([60, 100, 100, 0, 0]);
    expect(Array.from(two[1]!.y)).toEqual([0, 0, 100, 100, 50]);
  });
});
