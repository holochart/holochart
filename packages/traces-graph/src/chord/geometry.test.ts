import { describe, expect, it } from 'vitest';
import {
  arrowLength,
  hillOutline,
  outlineArea,
  outlineBounds,
  outlineContains,
  ribbonAnchor,
  ribbonOutline,
  ribbonStrips,
  ringCoordinates,
  ringPoint,
  spanContains,
  type Outline,
  type RibbonShape,
} from './geometry.ts';

const DEG = Math.PI / 180;
const CX = 300;
const CY = 200;

/** A ribbon from 10°–40° to 150°–200° on a ring of radius 100. */
const SHAPE: RibbonShape = {
  cx: CX,
  cy: CY,
  sourceRadius: 100,
  targetRadius: 100,
  sourceStart: 10 * DEG,
  sourceEnd: 40 * DEG,
  targetStart: 150 * DEG,
  targetEnd: 200 * DEG,
};

const radiusOf = (o: Outline, i: number): number => Math.hypot(o.x[i]! - CX, o.y[i]! - CY);
const angleOf = (o: Outline, i: number): number =>
  (ringCoordinates(CX, CY, o.x[i]!, o.y[i]!).angle + 2 * Math.PI) % (2 * Math.PI);
const finite = (o: Outline): boolean =>
  o.x.length === o.y.length && [...o.x, ...o.y].every(Number.isFinite);
/** Indices of the outline's points at `radius`. */
const onRing = (o: Outline, radius: number): number[] =>
  o.x.flatMap((_, i) => (Math.abs(radiusOf(o, i) - radius) < 1e-9 ? [i] : []));

describe('ring coordinates', () => {
  it('measures angles clockwise from 12 o’clock, y down', () => {
    expect(ringPoint(CX, CY, 50, 0)).toEqual([CX, CY - 50]);
    const [x, y] = ringPoint(CX, CY, 50, 90 * DEG);
    expect(x).toBeCloseTo(CX + 50, 12);
    expect(y).toBeCloseTo(CY, 12);
    const back = ringCoordinates(CX, CY, ...ringPoint(CX, CY, 80, 200 * DEG));
    expect(back.radius).toBeCloseTo(80, 12);
    expect((back.angle + 2 * Math.PI) % (2 * Math.PI)).toBeCloseTo(200 * DEG, 12);
  });

  it('tells whether an angle is on a span, in either direction and across the turn', () => {
    expect(spanContains(10 * DEG, 40 * DEG, 25 * DEG)).toBe(true);
    expect(spanContains(10 * DEG, 40 * DEG, 41 * DEG)).toBe(false);
    expect(spanContains(10 * DEG, 40 * DEG, (25 - 360) * DEG)).toBe(true);
    // A counterclockwise span runs from its larger angle to its smaller one.
    expect(spanContains(40 * DEG, 10 * DEG, 25 * DEG)).toBe(true);
    expect(spanContains(-10 * DEG, -40 * DEG, 335 * DEG)).toBe(true);
    expect(spanContains(-10 * DEG, -40 * DEG, 5 * DEG)).toBe(false);
    // Past a full turn (rotation), and a span that is the whole ring.
    expect(spanContains(350 * DEG, 380 * DEG, 5 * DEG)).toBe(true);
    expect(spanContains(350 * DEG, 380 * DEG, 30 * DEG)).toBe(false);
    expect(spanContains(0, 2 * Math.PI, 123)).toBe(true);
  });
});

describe('ribbonOutline', () => {
  it('is a closed, finite polygon whose two ends lie on the ring', () => {
    const o = ribbonOutline(SHAPE);
    expect(finite(o)).toBe(true);
    expect(o.x.length).toBeGreaterThan(20);
    // Closed without repeating the first point.
    expect([o.x.at(-1), o.y.at(-1)]).not.toEqual([o.x[0], o.y[0]]);
    expect(Math.abs(outlineArea(o))).toBeGreaterThan(1000);
    // The points on the ring are the two spans, and nothing is outside it.
    const ring = onRing(o, 100);
    const angles = ring.map((i) => angleOf(o, i) / DEG);
    const source = angles.filter((a) => a < 90);
    const target = angles.filter((a) => a > 90);
    expect(Math.min(...source)).toBeCloseTo(10, 9);
    expect(Math.max(...source)).toBeCloseTo(40, 9);
    expect(Math.min(...target)).toBeCloseTo(150, 9);
    expect(Math.max(...target)).toBeCloseTo(200, 9);
    expect(source.length + target.length).toBe(ring.length);
    o.x.forEach((_, i) => expect(radiusOf(o, i)).toBeLessThanOrEqual(100 + 1e-9));
    // It starts on the source span and its sides pass near the center.
    expect(angleOf(o, 0)).toBeCloseTo(10 * DEG, 12);
    expect(Math.min(...o.x.map((_, i) => radiusOf(o, i)))).toBeLessThan(40);
  });

  it('contains its anchor and not the center of the gap between its ends', () => {
    const o = ribbonOutline(SHAPE);
    const [ax, ay] = ribbonAnchor(SHAPE, false);
    expect(outlineContains(o, ax, ay)).toBe(true);
    const [x0, y0, x1, y1] = outlineBounds(o);
    expect(ax).toBeGreaterThan(x0);
    expect(ax).toBeLessThan(x1);
    expect(ay).toBeGreaterThan(y0);
    expect(ay).toBeLessThan(y1);
    // Just inside each end; and off the ribbon, on the far side of the ring.
    expect(outlineContains(o, ...ringPoint(CX, CY, 97, 25 * DEG))).toBe(true);
    expect(outlineContains(o, ...ringPoint(CX, CY, 97, 175 * DEG))).toBe(true);
    expect(outlineContains(o, ...ringPoint(CX, CY, 97, 95 * DEG))).toBe(false);
    expect(outlineContains(o, ...ringPoint(CX, CY, 97, 300 * DEG))).toBe(false);
    expect(outlineContains(o, ...ringPoint(CX, CY, 103, 25 * DEG))).toBe(false);
  });

  it('keeps one winding whatever the direction of the ring', () => {
    const cw = outlineArea(ribbonOutline(SHAPE));
    // The same ribbon on a counterclockwise ring: every angle mirrored.
    const ccw = outlineArea(
      ribbonOutline({
        ...SHAPE,
        sourceStart: -10 * DEG,
        sourceEnd: -40 * DEG,
        targetStart: -150 * DEG,
        targetEnd: -200 * DEG,
      }),
    );
    expect(Math.abs(cw)).toBeCloseTo(Math.abs(ccw), 6);
    expect(Math.sign(cw)).toBe(-Math.sign(ccw));
  });

  it('ends each end at its own radius', () => {
    const o = ribbonOutline({ ...SHAPE, targetRadius: 90 });
    expect(onRing(o, 100).every((i) => angleOf(o, i) < 90 * DEG)).toBe(true);
    const inset = onRing(o, 90).map((i) => angleOf(o, i) / DEG);
    expect(Math.min(...inset)).toBeCloseTo(150, 9);
    expect(Math.max(...inset)).toBeCloseTo(200, 9);
  });

  it('draws the target end as an arrowhead', () => {
    const o = ribbonOutline({ ...SHAPE, arrow: 12 });
    expect(finite(o)).toBe(true);
    // One point of the target end is on the ring, in the middle of the span …
    const tips = onRing(o, 100).filter((i) => angleOf(o, i) > 90 * DEG);
    expect(tips).toHaveLength(1);
    expect(angleOf(o, tips[0]!)).toBeCloseTo(175 * DEG, 12);
    // … between the ends of the two sides, an arrow length short of it.
    const tip = tips[0]!;
    expect(radiusOf(o, tip - 1)).toBeCloseTo(88, 9);
    expect(angleOf(o, tip - 1)).toBeCloseTo(150 * DEG, 9);
    expect(radiusOf(o, tip + 1)).toBeCloseTo(88, 9);
    expect(angleOf(o, tip + 1)).toBeCloseTo(200 * DEG, 9);
    expect(Math.abs(outlineArea(o))).toBeLessThan(Math.abs(outlineArea(ribbonOutline(SHAPE))));
  });

  it('limits the arrowhead to the target radius', () => {
    expect(arrowLength(SHAPE)).toBe(0);
    expect(arrowLength({ ...SHAPE, arrow: 12 })).toBe(12);
    expect(arrowLength({ ...SHAPE, arrow: 500 })).toBe(100);
    expect(arrowLength({ ...SHAPE, arrow: -3 })).toBe(0);
    expect(arrowLength({ ...SHAPE, arrow: NaN })).toBe(0);
    expect(arrowLength({ ...SHAPE, targetRadius: -5, arrow: 3 })).toBe(0);
    expect(finite(ribbonOutline({ ...SHAPE, arrow: 500 }))).toBe(true);
  });

  it('stays finite for a ribbon with no width at one end, or no radius', () => {
    const pointed = ribbonOutline({ ...SHAPE, sourceEnd: SHAPE.sourceStart });
    expect(finite(pointed)).toBe(true);
    expect(Math.abs(outlineArea(pointed))).toBeGreaterThan(100);
    const flat = ribbonOutline({ ...SHAPE, sourceRadius: 0, targetRadius: 0 });
    expect(finite(flat)).toBe(true);
    expect(outlineArea(flat)).toBeCloseTo(0, 9);
  });

  it('has no side where its two spans meet end to end', () => {
    // Source 10°–40°, target 40°–90°: one arc from 10° to 90°, and one side back.
    const o = ribbonOutline({ ...SHAPE, targetStart: 40 * DEG, targetEnd: 90 * DEG });
    expect(finite(o)).toBe(true);
    const ring = onRing(o, 100);
    // The ring points come first, in order, without the meeting point twice.
    expect(ring).toEqual(ring.map((_, k) => k));
    const angles = ring.map((i) => angleOf(o, i));
    angles.forEach((a, k) => k > 0 && expect(a).toBeGreaterThan(angles[k - 1]!));
    expect(angles.at(-1)).toBeCloseTo(90 * DEG, 12);
    expect(o.x.length).toBeGreaterThan(ring.length + 5);
    // Meeting across the top of the ring (the target ends where the source starts, a turn on).
    const wrap = ribbonOutline({
      ...SHAPE,
      sourceStart: 0,
      sourceEnd: 30 * DEG,
      targetStart: 300 * DEG,
      targetEnd: 360 * DEG,
    });
    expect(finite(wrap)).toBe(true);
    const points = wrap.x.map((x, i) => `${x.toFixed(6)},${wrap.y[i]!.toFixed(6)}`);
    expect(new Set(points).size).toBe(points.length);
    // With an arrowhead the sides end short of the ring, where the spans do not meet.
    const arrow = ribbonOutline({
      ...SHAPE,
      targetStart: 40 * DEG,
      targetEnd: 90 * DEG,
      arrow: 10,
    });
    expect(finite(arrow)).toBe(true);
    expect(Math.abs(outlineArea(arrow))).toBeGreaterThan(100);
  });

  it('gives two ribbons the same points on a side they share', () => {
    // Two links between the same nodes, nested: A's side from 40° to 150° is B's from 150° to 40°.
    const a = ribbonOutline(SHAPE);
    const b = ribbonOutline({
      ...SHAPE,
      sourceStart: 40 * DEG,
      sourceEnd: 60 * DEG,
      targetStart: 120 * DEG,
      targetEnd: 150 * DEG,
    });
    const key = (o: Outline, i: number): string => `${o.x[i]!.toFixed(6)},${o.y[i]!.toFixed(6)}`;
    const inA = new Set(a.x.map((_, i) => key(a, i)));
    const shared = b.x.filter((_, i) => inA.has(key(b, i)));
    // The whole side: its two ends and every point between them.
    expect(shared.length).toBeGreaterThanOrEqual(9);
  });
});

describe('ribbonStrips', () => {
  it('cuts the ribbon into strips that add up to it', () => {
    const strips = ribbonStrips(SHAPE, 12);
    expect(strips).toHaveLength(12);
    expect(strips.every(finite)).toBe(true);
    const whole = outlineArea(ribbonOutline(SHAPE));
    const sum = strips.reduce((s, o) => s + outlineArea(o), 0);
    // Flattened differently, so close, not equal; every strip winds like the whole.
    expect(sum / whole).toBeCloseTo(1, 2);
    expect(strips.every((o) => Math.sign(outlineArea(o)) === Math.sign(whole))).toBe(true);
    // The first strip has the source span, the last one the target span.
    expect(onRing(strips[0]!, 100).length).toBeGreaterThan(2);
    expect(onRing(strips.at(-1)!, 100).length).toBeGreaterThan(2);
    expect(onRing(strips[5]!, 100)).toEqual([]);
  });

  it('shares the two points of an edge between neighbouring strips exactly', () => {
    const strips = ribbonStrips(SHAPE, 6);
    for (let j = 0; j + 1 < strips.length; j++) {
      const a = strips[j]!;
      const b = strips[j + 1]!;
      const points = new Set(a.x.map((x, i) => `${x},${a.y[i]}`));
      expect(b.x.filter((x, i) => points.has(`${x},${b.y[i]}`))).toHaveLength(2);
    }
  });

  it('ends the last strip in the arrowhead, and makes at least one strip', () => {
    const strips = ribbonStrips({ ...SHAPE, arrow: 12 }, 4);
    const last = strips.at(-1)!;
    const tips = onRing(last, 100);
    expect(tips).toHaveLength(1);
    expect(angleOf(last, tips[0]!)).toBeCloseTo(175 * DEG, 12);
    const sum = strips.reduce((s, o) => s + outlineArea(o), 0);
    // Four strips flatten the sides coarsely.
    expect(sum / outlineArea(ribbonOutline({ ...SHAPE, arrow: 12 }))).toBeCloseTo(1, 1);
    const one = ribbonStrips(SHAPE, 0);
    expect(one).toHaveLength(1);
    // One strip is the ribbon with straight sides: both spans, nothing between them.
    expect(finite(one[0]!)).toBe(true);
    expect(onRing(one[0]!, 100)).toHaveLength(one[0]!.x.length);
  });
});

describe('hillOutline', () => {
  it('is a hill on its span, about half as high as it is wide', () => {
    const o = hillOutline(CX, CY, 100, 80 * DEG, 100 * DEG);
    expect(finite(o)).toBe(true);
    const ring = onRing(o, 100).map((i) => angleOf(o, i) / DEG);
    expect(Math.min(...ring)).toBeCloseTo(80, 9);
    expect(Math.max(...ring)).toBeCloseTo(100, 9);
    o.x.forEach((_, i) => expect(radiusOf(o, i)).toBeLessThanOrEqual(100 + 1e-9));
    // The chord is 2·100·sin 10° ≈ 34.7 px; the hill reaches about half of that below it.
    const chord = 200 * Math.sin(10 * DEG);
    const depth = 100 * Math.cos(10 * DEG) - Math.min(...o.x.map((_, i) => radiusOf(o, i)));
    expect(depth).toBeGreaterThan(chord * 0.4);
    expect(depth).toBeLessThan(chord * 0.55);
    expect(Math.abs(outlineArea(o))).toBeGreaterThan(100);
  });

  it('contains its anchor', () => {
    const shape = { ...SHAPE, sourceStart: 80 * DEG, sourceEnd: 100 * DEG };
    const o = hillOutline(CX, CY, 100, shape.sourceStart, shape.sourceEnd);
    expect(outlineContains(o, ...ribbonAnchor(shape, true))).toBe(true);
    expect(outlineContains(o, CX, CY)).toBe(false);
  });

  it('stops at the center for a span of half the ring or more', () => {
    const half = hillOutline(CX, CY, 100, 0, 200 * DEG);
    expect(finite(half)).toBe(true);
    expect(outlineContains(half, ...ringPoint(CX, CY, 60, 100 * DEG))).toBe(true);
    const full = hillOutline(CX, CY, 100, 0, 2 * Math.PI);
    expect(finite(full)).toBe(true);
    expect(Math.abs(outlineArea(full))).toBeCloseTo(Math.PI * 1e4, -2);
    expect(finite(hillOutline(CX, CY, 0, 0, 1))).toBe(true);
    // The anchor of a wide hill stays inside the ring.
    const [ax, ay] = ribbonAnchor({ ...SHAPE, sourceStart: 0, sourceEnd: 200 * DEG }, true);
    expect(Math.hypot(ax - CX, ay - CY)).toBeLessThan(100);
  });
});

describe('outline helpers', () => {
  const SQUARE: Outline = { x: [0, 10, 10, 0], y: [0, 0, 10, 10] };

  it('measures bounds, area and containment', () => {
    expect(outlineBounds(SQUARE)).toEqual([0, 0, 10, 10]);
    expect(Math.abs(outlineArea(SQUARE))).toBe(100);
    expect(outlineContains(SQUARE, 5, 5)).toBe(true);
    expect(outlineContains(SQUARE, 15, 5)).toBe(false);
    expect(outlineContains(SQUARE, 5, -1)).toBe(false);
    expect(outlineBounds({ x: [], y: [] })).toEqual([Infinity, Infinity, -Infinity, -Infinity]);
    expect(outlineContains({ x: [], y: [] }, 0, 0)).toBe(false);
  });
});
