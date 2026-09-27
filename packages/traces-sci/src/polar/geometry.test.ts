import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  angleDelta,
  clipPolyline,
  isAngleInsideSector,
  isFullCircle,
  normalizeSector,
  placeSubplot,
  polygonScale,
  polygonVertices,
  regionRings,
  regionTester,
  sectorBBox,
  signedArea,
  snapToVertexAngle,
  TAU,
  type PolarRegion,
} from './geometry.ts';

const deg = (d: number): number => (d * Math.PI) / 180;

describe('angles', () => {
  it('tells full circles and sector membership like plotly.js', () => {
    expect(isFullCircle([0, TAU])).toBe(true);
    expect(isFullCircle([0, Math.PI])).toBe(false);
    expect(isAngleInsideSector(deg(45), [0, deg(90)])).toBe(true);
    expect(isAngleInsideSector(deg(135), [0, deg(90)])).toBe(false);
    // Wrapping sectors and angles.
    expect(isAngleInsideSector(deg(-10), [deg(300), deg(400)])).toBe(true);
    expect(isAngleInsideSector(deg(370), [0, deg(90)])).toBe(true);
    expect(angleDelta(deg(350), deg(10))).toBeCloseTo(deg(20), 12);
  });

  it('sorts sectors and treats a turn or more as the full circle', () => {
    expect(normalizeSector([180, 0])).toEqual([0, 180]);
    expect(normalizeSector([30, 500])).toEqual([30, 390]);
    expect(normalizeSector(undefined)).toEqual([0, 360]);
  });
});

describe('placement', () => {
  it('bounds sectors like plotly.js computeSectorBBox', () => {
    expect(sectorBBox([0, 360])).toEqual([-1, -1, 1, 1]);
    expect(sectorBBox([0, 180])).toEqual([-1, 0, 1, 1]);
    const q = sectorBBox([0, 90]);
    expect(q[0]).toBeCloseTo(0, 12);
    expect(q[1]).toBeCloseTo(0, 12);
    expect(q[2]).toBe(1);
    expect(q[3]).toBe(1);
  });

  it('fits the largest circle or sector in the domain, centered', () => {
    const full = placeSubplot({ x: 0, y: 0, width: 600, height: 400 }, [0, 360], 0.25);
    expect(full.radius).toBe(200);
    expect(full.cx).toBe(300);
    expect(full.cy).toBe(200);
    expect(full.innerRadius).toBe(50);
    // A half circle is twice as wide as high: it fills the width.
    const half = placeSubplot({ x: 0, y: 0, width: 600, height: 400 }, [0, 180], 0);
    expect(half.radius).toBe(300);
    expect(half.cx).toBe(300);
    expect(half.cy).toBe(200 + 150);
  });
});

describe('polygons (gridshape: linear)', () => {
  const square = [0, 90, 180, 270].map(deg);

  it('builds the regular polygon through the vertex angles', () => {
    const v = polygonVertices(10, 0, TAU, square);
    expect(v).toHaveLength(4);
    expect(v[1]![0]).toBeCloseTo(0, 9);
    expect(v[1]![1]).toBeCloseTo(10, 9);
  });

  it('clips the polygon to a sector through the origin', () => {
    const v = polygonVertices(10, deg(45), deg(135), square);
    // Edge crossing at 45°, the vertex at 90°, the edge crossing at 135°, the origin.
    expect(v).toHaveLength(4);
    expect(v[0]![0]).toBeCloseTo(5, 9);
    expect(v[0]![1]).toBeCloseTo(5, 9);
    expect(v[3]).toEqual([0, 0]);
  });

  it('measures radii along the polygon and snaps to vertices', () => {
    // Half way between two vertices of a square the edge is at cos(45°) of the radius.
    expect(polygonScale(deg(45), square)).toBeCloseTo(Math.SQRT1_2, 9);
    expect(polygonScale(deg(90), square)).toBeCloseTo(1, 9);
    expect(polygonScale(deg(45), null)).toBe(1);
    expect(snapToVertexAngle(deg(100), square)).toBeCloseTo(deg(90), 12);
  });
});

describe('regions', () => {
  it('gives counterclockwise outlines, clockwise holes', () => {
    const annulus = regionRings({ r0: 5, r1: 10, sector: [0, TAU], vangles: null });
    expect(annulus.rings).toHaveLength(2);
    const outerEnd = annulus.rings[1]!;
    expect(signedArea(annulus.x, annulus.y, 0, outerEnd)).toBeGreaterThan(0);
    expect(signedArea(annulus.x, annulus.y, outerEnd, annulus.x.length)).toBeLessThan(0);
    const sector = regionRings({ r0: 0, r1: 10, sector: [0, Math.PI / 2], vangles: null });
    expect(sector.rings).toEqual([0]);
    expect(signedArea(sector.x, sector.y, 0, sector.x.length)).toBeGreaterThan(0);
  });

  it('tests points against radii, sector and polygon', () => {
    const t = regionTester({ r0: 2, r1: 10, sector: [0, Math.PI], vangles: null });
    expect(t.inside(0, 5)).toBe(true);
    expect(t.inside(0, 1)).toBe(false); // in the hole
    expect(t.inside(0, -5)).toBe(false); // outside the sector
    expect(t.inside(10, 0)).toBe(true); // on the edge
    expect(t.convex).toBe(false);
    expect(regionTester({ r0: 0, r1: 1, sector: [0, TAU], vangles: null }).convex).toBe(true);
    const square = [0, 90, 180, 270].map(deg);
    const p = regionTester({ r0: 0, r1: 10, sector: [0, TAU], vangles: square });
    expect(p.inside(4, 4)).toBe(true);
    expect(p.inside(6, 6)).toBe(false); // inside the circle, outside the diamond
  });
});

describe('clipPolyline', () => {
  const region: PolarRegion = { r0: 2, r1: 10, sector: [0, Math.PI], vangles: null };

  it('keeps lines inside a convex region untouched', () => {
    const t = regionTester({ r0: 0, r1: 10, sector: [0, TAU], vangles: null });
    const x = Float64Array.of(0, 3, -4);
    const y = Float64Array.of(1, 2, -5);
    expect(clipPolyline(t, x, y).x).toBe(x);
  });

  it('cuts at the outer circle', () => {
    const t = regionTester({ r0: 0, r1: 10, sector: [0, TAU], vangles: null });
    const out = clipPolyline(t, [0, 20], [0, 0]);
    expect([...out.x]).toEqual([0, 10]);
  });

  it('splits a chord through the hole and drops what leaves the sector', () => {
    const t = regionTester(region);
    const out = clipPolyline(t, [-8, 8], [0.5, 0.5]);
    // Two pieces, separated by a gap (NaN), both outside the hole.
    const breaks = [...out.x].filter(Number.isNaN).length;
    expect(breaks).toBe(1);
    for (let i = 0; i < out.x.length; i++) {
      if (Number.isNaN(out.x[i]!)) continue;
      expect(Math.hypot(out.x[i]!, out.y[i]!)).toBeGreaterThanOrEqual(2 - 1e-9);
    }
    const below = clipPolyline(t, [-5, 5], [-1, -1]);
    expect(below.x.length).toBe(0);
  });

  it('keeps only points inside the region (property)', () => {
    const t = regionTester(region);
    // Px-like coordinates (tenths of a px): denormal floats would test floating point, not clipping.
    const coord = fc.integer({ min: -150, max: 150 }).map((v) => v / 10);
    fc.assert(
      fc.property(fc.array(fc.tuple(coord, coord), { minLength: 2, maxLength: 12 }), (pts) => {
        const out = clipPolyline(
          t,
          pts.map((p) => p[0]),
          pts.map((p) => p[1]),
        );
        for (let i = 0; i < out.x.length; i++) {
          const x = out.x[i]!;
          const y = out.y[i]!;
          if (Number.isNaN(x)) continue;
          // Endpoints lie in the region or on its boundary.
          const r = Math.hypot(x, y);
          expect(r).toBeLessThanOrEqual(10 + 1e-6);
          expect(r).toBeGreaterThanOrEqual(2 - 1e-6);
          expect(y).toBeGreaterThanOrEqual(-1e-6);
        }
        // Every kept piece's midpoint is inside.
        for (let i = 0; i + 1 < out.x.length; i++) {
          const mx = (out.x[i]! + out.x[i + 1]!) / 2;
          const my = (out.y[i]! + out.y[i + 1]!) / 2;
          if (Number.isNaN(mx)) continue;
          expect(t.inside(mx, my)).toBe(true);
        }
      }),
    );
  });
});
