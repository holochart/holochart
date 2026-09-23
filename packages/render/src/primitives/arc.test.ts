import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { BufferGeometry, InstancedBufferAttribute } from 'three';
import { createResourceManager } from '../resources.ts';
import {
  ArcPrimitive,
  arcBounds,
  arcSDF,
  computeArcShape,
  packArcs,
  type ArcShape,
  type ArcShapeInput,
} from './arc.ts';

const TAU = Math.PI * 2;

function shape(input: ArcShapeInput): ArcShape {
  const s = computeArcShape(input);
  if (!s) throw new Error('empty shape');
  return s;
}

/** SDF at polar coordinates (radius, angle) around the wedge center. */
function polar(s: ArcShape, r: number, a: number): number {
  return arcSDF(r * Math.cos(a), r * Math.sin(a), s);
}

/** Root of f on [lo, hi] by bisection (f(lo) and f(hi) must differ in sign). */
function root(f: (x: number) => number, lo: number, hi: number): number {
  let flo = f(lo);
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    const fm = f(m);
    if (fm === 0) return m;
    if (fm < 0 === flo < 0) {
      lo = m;
      flo = fm;
    } else hi = m;
  }
  return (lo + hi) / 2;
}

describe('computeArcShape', () => {
  it('swaps radii, takes |span| and treats ≥ 2π as a full ring', () => {
    const s = shape({ innerRadius: 80, outerRadius: 20, startAngle: 2, endAngle: 1 });
    expect([s.r0, s.r1, s.mid, s.half, s.h]).toEqual([20, 80, 1.5, 0.5, 0]);
    const ring = shape({ innerRadius: 10, outerRadius: 20, startAngle: 0, endAngle: 7 });
    expect(ring.h).toBe(-1);
    expect(ring.half).toBe(Math.PI);
    const f32 = new Float32Array([1, 1 + TAU]);
    expect(
      shape({ innerRadius: 10, outerRadius: 20, startAngle: f32[0]!, endAngle: f32[1]! }).h,
    ).toBe(-1);
  });

  it('returns null for wedges that draw nothing', () => {
    expect(computeArcShape({ innerRadius: 0, outerRadius: 0, startAngle: 0, endAngle: 1 })).toBe(
      null,
    );
    expect(computeArcShape({ innerRadius: 0, outerRadius: 9, startAngle: 1, endAngle: 1 })).toBe(
      null,
    );
    expect(computeArcShape({ innerRadius: 0, outerRadius: 9, startAngle: NaN, endAngle: 1 })).toBe(
      null,
    );
    // Padding wider than the wedge.
    expect(
      computeArcShape({
        innerRadius: 0,
        outerRadius: 9,
        startAngle: 0,
        endAngle: 0.1,
        padAngle: 0.2,
      }),
    ).toBe(null);
  });

  it('uses d3 pad semantics: h = padRadius · sin(padAngle / 2), padRadius auto = √(r0² + r1²)', () => {
    const auto = shape({
      innerRadius: 30,
      outerRadius: 40,
      startAngle: 0,
      endAngle: 1,
      padAngle: 0.1,
    });
    expect(auto.h).toBeCloseTo(50 * Math.sin(0.05), 12);
    const fixed = shape({
      innerRadius: 30,
      outerRadius: 40,
      startAngle: 0,
      endAngle: 1,
      padAngle: 0.1,
      padRadius: 100,
    });
    expect(fixed.h).toBeCloseTo(100 * Math.sin(0.05), 12);
  });

  it('clamps the corner radius like d3 (|r1 - r0| / 2, then rc0 / rc1 for thin wedges)', () => {
    expect(
      shape({ innerRadius: 50, outerRadius: 60, startAngle: 0, endAngle: 3, cornerRadius: 20 })
        .cornerOuter,
    ).toBe(5);
    // Thin wedge: d3 rc1 = (r1 - lc) / (kc + 1), rc0 = (r0 - lc) / (kc - 1).
    const r0 = 60;
    const r1 = 100;
    const s = shape({
      innerRadius: r0,
      outerRadius: r1,
      startAngle: 0,
      endAngle: 0.3,
      padAngle: 0.02,
      cornerRadius: 19,
    });
    const lc = s.h / Math.sin(s.half);
    const kc = 1 / Math.sin(s.half);
    expect(s.cornerOuter).toBeCloseTo(Math.min(19, (r1 - lc) / (kc + 1)), 10);
    expect(s.cornerInner).toBeCloseTo(Math.min(19, (r0 - lc) / (kc - 1)), 10);
  });

  it('keeps collapsed inner corners (and the pie apex) sharp', () => {
    const pie = shape({
      innerRadius: 0,
      outerRadius: 50,
      startAngle: 0,
      endAngle: 1,
      cornerRadius: 5,
    });
    expect(pie.cornerInner).toBe(0);
    expect(pie.cornerOuter).toBe(5);
    const collapsed = shape({
      innerRadius: 10,
      outerRadius: 100,
      startAngle: 0,
      endAngle: 0.2,
      padAngle: 0.1,
      cornerRadius: 5,
    });
    expect(collapsed.cornerInner).toBe(0);
  });
});

describe('arcSDF', () => {
  const donut = shape({ innerRadius: 40, outerRadius: 100, startAngle: 0.2, endAngle: 2.2 });

  it('is the exact annulus distance away from the sides', () => {
    expect(polar(donut, 70, 1.2)).toBeCloseTo(-30, 10);
    expect(polar(donut, 103, 1.2)).toBeCloseTo(3, 10);
    expect(polar(donut, 38, 1.2)).toBeCloseTo(2, 10);
    // Just outside the start side, the distance is the perpendicular distance to the radial edge.
    expect(polar(donut, 70, 0.2 - 0.01)).toBeCloseTo(70 * Math.sin(0.01), 8);
  });

  it('matches a brute-force polar inside test (no pad, no corners)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 60, noNaN: true }),
        fc.double({ min: 61, max: 120, noNaN: true }),
        fc.double({ min: -7, max: 7, noNaN: true }),
        fc.double({ min: 0.01, max: TAU - 0.01, noNaN: true }),
        fc.double({ min: 0, max: 130, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        (r0, r1, a0, span, r, a) => {
          const s = shape({
            innerRadius: r0,
            outerRadius: r1,
            startAngle: a0,
            endAngle: a0 + span,
          });
          const d = polar(s, r, a);
          if (Math.abs(d) < 1e-6) return true;
          const rel = (((a - a0) % TAU) + TAU) % TAU;
          const inside = r >= r0 && r <= r1 && rel <= span;
          return d < 0 === inside;
        },
      ),
    );
  });

  it('fills a full ring without a seam, and a full pie through its center', () => {
    const ring = shape({ innerRadius: 20, outerRadius: 50, startAngle: 1, endAngle: 1 + TAU });
    for (const a of [Math.PI, -Math.PI, 0, 1, 1 + Math.PI])
      expect(polar(ring, 35, a)).toBeCloseTo(-15, 10);
    expect(arcSDF(0, 0, ring)).toBe(20);
    const pie = shape({ innerRadius: 0, outerRadius: 50, startAngle: 0, endAngle: TAU });
    expect(arcSDF(0, 0, pie)).toBe(-50);
  });

  it('places the padded corners exactly where d3 does', () => {
    const r0 = 60;
    const r1 = 100;
    const pad = 0.04;
    const s = shape({
      innerRadius: r0,
      outerRadius: r1,
      startAngle: 0.5,
      endAngle: 1.7,
      padAngle: pad,
    });
    const rp = Math.hypot(r0, r1);
    const p0 = Math.asin((rp / r0) * Math.sin(pad / 2));
    const p1 = Math.asin((rp / r1) * Math.sin(pad / 2));
    expect(polar(s, r1, 0.5 + p1)).toBeCloseTo(0, 9);
    expect(polar(s, r1, 1.7 - p1)).toBeCloseTo(0, 9);
    expect(polar(s, r0, 0.5 + p0)).toBeCloseTo(0, 9);
    expect(polar(s, r0, 1.7 - p0)).toBeCloseTo(0, 9);
  });

  function gapWidth(a: ArcShape, b: ArcShape, boundary: number, rho: number): number {
    // Walk perpendicular to the shared radial edge at distance rho from the center.
    const cx = rho * Math.cos(boundary);
    const cy = rho * Math.sin(boundary);
    const nx = -Math.sin(boundary);
    const ny = Math.cos(boundary);
    const at = (s: ArcShape) => (u: number) => arcSDF(cx + u * nx, cy + u * ny, s);
    const edgeA = root(at(a), -20, 0); // a lies before the boundary (u < 0)
    const edgeB = root(at(b), 0, 20);
    return edgeB - edgeA;
  }

  it('keeps the pad gap a constant width 2·padRadius·sin(padAngle/2) in px', () => {
    const common = { innerRadius: 40, outerRadius: 120, padAngle: 0.06 };
    const a = shape({ ...common, startAngle: 0, endAngle: 1 });
    const b = shape({ ...common, startAngle: 1, endAngle: 2.5 });
    const expected = 2 * Math.hypot(40, 120) * Math.sin(0.03);
    for (const rho of [45, 60, 80, 100, 115]) {
      expect(gapWidth(a, b, 1, rho)).toBeCloseTo(expected, 8);
    }
  });

  it('keeps the pad gap constant for pie slices and wedges wider than π', () => {
    const common = { innerRadius: 0, outerRadius: 100, padAngle: 0.05, padRadius: 100 };
    const a = shape({ ...common, startAngle: -3.5, endAngle: 0.5 }); // span 4 > π
    const b = shape({ ...common, startAngle: 0.5, endAngle: 1.5 });
    const expected = 2 * 100 * Math.sin(0.025);
    for (const rho of [20, 50, 90]) expect(gapWidth(a, b, 0.5, rho)).toBeCloseTo(expected, 8);
    // The wide slice still covers the point opposite its gap, near the center.
    expect(polar(a, 3, -1.5)).toBeLessThan(0);
  });

  it('rounds corners with circles tangent to the side and the arc', () => {
    const rc = 8;
    const s = shape({
      innerRadius: 50,
      outerRadius: 100,
      startAngle: 0,
      endAngle: 1,
      cornerRadius: rc,
    });
    // Outer end corner: circle center at distance r1 - rc from the center and rc from the side.
    const k = { r: 100 - rc, a: 1 - Math.asin(rc / (100 - rc)) };
    expect(polar(s, k.r, k.a)).toBeCloseTo(-rc, 9);
    // Tangent point on the outer arc lies on the boundary.
    expect(polar(s, 100, k.a)).toBeCloseTo(0, 9);
    // The sharp corner is cut off.
    expect(polar(s, 99.9, 0.999)).toBeGreaterThan(0);
    // Inner start corner.
    const ki = { r: 50 + rc, a: Math.asin(rc / (50 + rc)) };
    expect(polar(s, ki.r, ki.a)).toBeCloseTo(-rc, 9);
    expect(polar(s, 50, ki.a)).toBeCloseTo(0, 9);
    expect(polar(s, 50.1, 0.001)).toBeGreaterThan(0);
  });

  const shapes = fc
    .record({
      innerRadius: fc.double({ min: 0, max: 80, noNaN: true }),
      outerRadius: fc.double({ min: 1, max: 150, noNaN: true }),
      startAngle: fc.double({ min: -10, max: 10, noNaN: true }),
      span: fc.double({ min: 0.001, max: 7, noNaN: true }),
      cornerRadius: fc.double({ min: 0, max: 40, noNaN: true }),
      padAngle: fc.double({ min: 0, max: 0.2, noNaN: true }),
    })
    .map((r) => computeArcShape({ ...r, endAngle: r.startAngle + r.span }))
    .filter((s): s is ArcShape => s !== null);

  it('is 1-Lipschitz (continuous across every region boundary)', () => {
    fc.assert(
      fc.property(
        shapes,
        fc.double({ min: -160, max: 160, noNaN: true }),
        fc.double({ min: -160, max: 160, noNaN: true }),
        fc.double({ min: -2, max: 2, noNaN: true }),
        fc.double({ min: -2, max: 2, noNaN: true }),
        (s, x, y, dx, dy) =>
          Math.abs(arcSDF(x, y, s) - arcSDF(x + dx, y + dy, s)) <= Math.hypot(dx, dy) + 1e-7,
      ),
      { numRuns: 3000 },
    );
  });

  it('never covers more than the unpadded, unrounded sector (bounds are conservative)', () => {
    fc.assert(
      fc.property(
        shapes,
        fc.double({ min: -1.2, max: 1.2, noNaN: true }),
        fc.double({ min: -1.2, max: 1.2, noNaN: true }),
        (s, u, v) => {
          const x = u * s.r1;
          const y = v * s.r1;
          if (arcSDF(x, y, s) > 0) return true;
          const [minX, minY, maxX, maxY] = arcBounds(s);
          const e = 1e-9 * s.r1;
          return x >= minX - e && x <= maxX + e && y >= minY - e && y <= maxY + e;
        },
      ),
      { numRuns: 3000 },
    );
  });
});

describe('arcBounds', () => {
  it('is tight for simple sectors', () => {
    const q = shape({ innerRadius: 0, outerRadius: 10, startAngle: 0, endAngle: Math.PI / 2 });
    expect(arcBounds(q).map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, 0, 10, 10]);
    const band = shape({ innerRadius: 5, outerRadius: 10, startAngle: 0.1, endAngle: 0.2 });
    const [minX, minY, maxX, maxY] = arcBounds(band);
    expect(minX).toBeCloseTo(5 * Math.cos(0.2), 12);
    expect(maxX).toBeCloseTo(10 * Math.cos(0.1), 12);
    expect(minY).toBeCloseTo(5 * Math.sin(0.1), 12);
    expect(maxY).toBeCloseTo(10 * Math.sin(0.2), 12);
    const gauge = shape({
      innerRadius: 30,
      outerRadius: 40,
      startAngle: -Math.PI / 4,
      endAngle: (5 * Math.PI) / 4,
    });
    const g = arcBounds(gauge);
    expect(g[0]).toBeCloseTo(-40, 12);
    expect(g[2]).toBeCloseTo(40, 12);
    expect(g[3]).toBeCloseTo(40, 12);
    expect(g[1]).toBeCloseTo(-40 * Math.SQRT1_2, 12);
  });
});

describe('packArcs', () => {
  it('RTC-encodes centers and culls empty or non-finite wedges with zero bounds', () => {
    const t0 = 1_700_000_000_000;
    const packed = packArcs({
      x: new Float64Array([t0, t0 + 10, NaN]),
      y: new Float64Array([1, 2, 3]),
      innerRadius: 0,
      outerRadius: new Float32Array([10, 0, 10]),
      startAngle: 0,
      endAngle: 13,
      cornerRadius: 0,
      padAngle: 0,
      padRadius: 0,
    });
    expect(packed.origin).toEqual([t0 + 5, 2, 0]);
    expect([...packed.center]).toEqual([-5, -1, 0, 5, 0, 0, 0, 0, 0]);
    expect([...packed.bounds.subarray(0, 4)]).toEqual([-10, -10, 10, 10]);
    expect([...packed.bounds.subarray(4)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('reduces the bisector angle for float32 precision', () => {
    const packed = packArcs({
      x: [0],
      y: [0],
      innerRadius: 0,
      outerRadius: 10,
      startAngle: 100 * TAU,
      endAngle: 100 * TAU + 1,
      cornerRadius: 0,
      padAngle: 0,
      padRadius: 0,
    });
    expect(packed.shape[2]).toBeCloseTo(0.5, 6);
  });
});

describe('ArcPrimitive', () => {
  it('re-uploads only the attributes touched by an update', () => {
    const resources = createResourceManager();
    const prim = new ArcPrimitive(
      { resources, invalidate: () => {} },
      { x: new Float64Array(5), y: new Float64Array(5), outerRadius: 20, endAngle: 1 },
    );
    expect(prim.instanceCount).toBe(5);
    expect(prim.object.frustumCulled).toBe(false);
    const geometry = (prim.object as unknown as { geometry: BufferGeometry }).geometry;
    const v = (n: string) => (geometry.getAttribute(n) as InstancedBufferAttribute).version;
    const names = ['iCenter', 'iShape', 'iBounds', 'iFill', 'iBorderColor', 'iBorderWidth'];
    const before = Object.fromEntries(names.map((n) => [n, v(n)]));
    prim.update({ fill: [1, 0, 0, 1] });
    prim.update({ borderWidth: 2 });
    prim.update({ endAngle: 2 });
    expect(v('iFill')).toBe(before.iFill! + 1);
    expect(v('iBorderWidth')).toBe(before.iBorderWidth! + 1);
    expect(v('iShape')).toBe(before.iShape! + 1);
    expect(v('iBounds')).toBe(before.iBounds! + 1);
    expect(v('iCenter')).toBe(before.iCenter);
    expect(v('iBorderColor')).toBe(before.iBorderColor);
    prim.dispose();
    expect(resources.stats()).toEqual([]);
  });
});
