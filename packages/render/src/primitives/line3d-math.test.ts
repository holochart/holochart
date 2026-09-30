import fc from 'fast-check';
import { Matrix4, OrthographicCamera, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { buildLineLayout } from './line-buffers.ts';
import { computeSegmentFrame } from './line-join.ts';
import {
  clipSegmentNear,
  clipToScreen,
  computeDashDistances3D,
  mixClip,
  NEAR_EPS,
  projectSegment3D,
  segmentDepthAt,
  transformPoint,
  type NearClip,
  type Vec4,
} from './line3d-math.ts';

const W = 800;
const H = 600;

/** World → clip matrix of a perspective camera at `eye` looking at the origin. */
function perspective(eye: [number, number, number], near = 0.1): number[] {
  const camera = new PerspectiveCamera(50, W / H, near, 100);
  camera.position.set(...eye);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    .elements;
}

const clipOf = (m: number[], p: [number, number, number]): Vec4 =>
  transformPoint(m, p[0], p[1], p[2]);

describe('near-plane clipping (clip space, before the divide)', () => {
  it('keeps segments in front of the near plane untouched', () => {
    const out: NearClip = { sA: -1, sB: -1 };
    expect(clipSegmentNear(1, 2, out)).toBe(true);
    expect(out).toEqual({ sA: 0, sB: 0 });
  });

  it('culls segments entirely behind it', () => {
    expect(clipSegmentNear(-1, -0.5, { sA: 0, sB: 0 })).toBe(false);
    expect(clipSegmentNear(0, 0, { sA: 0, sB: 0 })).toBe(false);
  });

  it('cuts the end behind the plane exactly at z + w = NEAR_EPS', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.double({ min: -5, max: 5, noNaN: true }), fc.double({ min: -5, max: 5 })),
        fc.tuple(fc.double({ min: -5, max: 5, noNaN: true }), fc.double({ min: -5, max: 5 })),
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        ([ax, ay], [bx, by], dA, dB) => {
          const out: NearClip = { sA: 0, sB: 0 };
          if (!clipSegmentNear(dA, dB, out)) {
            expect(dA < NEAR_EPS && dB < NEAR_EPS).toBe(true);
            return;
          }
          // Put d = z + w into z with w = 1 (any split of d works: clipping is linear).
          const a: Vec4 = [ax, ay, dA - 1, 1];
          const b: Vec4 = [bx, by, dB - 1, 1];
          const ca = mixClip(a, b, out.sA, [0, 0, 0, 0]);
          const cb = mixClip(b, a, out.sB, [0, 0, 0, 0]);
          expect(out.sA).toBeGreaterThanOrEqual(0);
          expect(out.sB).toBeGreaterThanOrEqual(0);
          expect(out.sA + out.sB).toBeLessThanOrEqual(1 + 1e-12);
          expect(ca[2] + ca[3]).toBeGreaterThanOrEqual(NEAR_EPS - 1e-9);
          expect(cb[2] + cb[3]).toBeGreaterThanOrEqual(NEAR_EPS - 1e-9);
          if (out.sA > 0) expect(ca[2] + ca[3]).toBeCloseTo(NEAR_EPS, 9);
          if (out.sB > 0) expect(cb[2] + cb[3]).toBeCloseTo(NEAR_EPS, 9);
        },
      ),
    );
  });

  it('cuts a segment through the eye at the near plane, not at the eye', () => {
    const near = 0.5;
    const m = perspective([0, 0, 5], near);
    // From in front of the camera (z = 0) to behind it (z = 8): crosses the near plane at z = 4.5.
    const seg = projectSegment3D(
      undefined,
      clipOf(m, [0.2, 0.1, 0]),
      clipOf(m, [0.2, 0.1, 8]),
      undefined,
      W,
      H,
    )!;
    expect(seg).not.toBeNull();
    expect(seg.sA).toBe(0);
    expect(seg.sB).toBeCloseTo(1 - 4.5 / 8, 3);
    // The cut end sits at NDC depth -1 (the near plane) and at a finite screen position.
    expect(seg.b[2]).toBeCloseTo(-1, 3);
    expect(Number.isFinite(seg.b[0]) && Number.isFinite(seg.b[1])).toBe(true);
    // Point at world z = 4.5 on the line projects where the clipped end is.
    const expected = clipToScreen(clipOf(m, [0.2, 0.1, 4.5]), W, H);
    expect(seg.b[0]).toBeCloseTo(expected[0], 1);
    expect(seg.b[1]).toBeCloseTo(expected[1], 1);
  });

  it('turns a cut end into a cap: no join towards the neighbour behind the camera', () => {
    const m = perspective([0, 0, 5]);
    const seg = projectSegment3D(
      clipOf(m, [0, 0, 9]),
      clipOf(m, [0, 0.5, 6]),
      clipOf(m, [0, 0, 0]),
      clipOf(m, [1, 0, 0]),
      W,
      H,
    )!;
    expect(seg.sA).toBeGreaterThan(0);
    expect(seg.prev).toBeUndefined();
    expect(seg.next).toBeDefined();
  });

  it('clips orthographic cameras at their near plane too (w = 1)', () => {
    const camera = new OrthographicCamera(-2, 2, 1.5, -1.5, 1, 10);
    camera.position.set(0, 0, 5);
    camera.updateMatrixWorld();
    const m = new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    ).elements;
    // Near plane at world z = 4.
    const seg = projectSegment3D(
      undefined,
      clipOf(m, [0, 0, 0]),
      clipOf(m, [0, 0, 6]),
      undefined,
      W,
      H,
    )!;
    expect(seg.sB).toBeCloseTo(2 / 6, 4);
    expect(seg.b[2]).toBeCloseTo(-1, 4);
  });
});

describe('screen-space expansion of 3D segments', () => {
  it('feeds the 2D join/cap frame: joins at shared vertices agree between segments', () => {
    const m = perspective([2, 1.5, 4]);
    const pts: [number, number, number][] = [
      [-1, 0, 0],
      [0, 0.5, 0.3],
      [0.8, -0.2, -0.4],
    ];
    const c = pts.map((p) => clipOf(m, p));
    const s1 = projectSegment3D(undefined, c[0]!, c[1]!, c[2]!, W, H)!;
    const s2 = projectSegment3D(c[0]!, c[1]!, c[2]!, undefined, W, H)!;
    const xy = (v: number[]): [number, number] => [v[0]!, v[1]!];
    const f1 = computeSegmentFrame(undefined, xy(s1.a), xy(s1.b), s1.next, 4, 'miter', 'butt', 4);
    const f2 = computeSegmentFrame(s2.prev, xy(s2.a), xy(s2.b), undefined, 4, 'miter', 'butt', 4);
    // The shared vertex: same screen position and the same bisector tangent from both sides.
    expect(s1.b[0]).toBeCloseTo(s2.a[0], 9);
    expect(s1.b[1]).toBeCloseTo(s2.a[1], 9);
    expect(f1.endEnd.tangent[0]).toBeCloseTo(f2.startEnd.tangent[0], 9);
    expect(f1.endEnd.tangent[1]).toBeCloseTo(f2.startEnd.tangent[1], 9);
  });

  it('interpolates NDC depth linearly along the projected segment (exact for straight lines)', () => {
    const m = perspective([1, 2, 5]);
    const A: [number, number, number] = [-1, 0.2, 1];
    const B: [number, number, number] = [1.5, -0.3, -2];
    const seg = projectSegment3D(undefined, clipOf(m, A), clipOf(m, B), undefined, W, H)!;
    const len = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]);
    for (const t of [0.1, 0.37, 0.5, 0.9]) {
      const P = A.map((a, i) => a + (B[i]! - a) * t) as [number, number, number];
      const p = clipToScreen(clipOf(m, P), W, H);
      const along = Math.hypot(p[0] - seg.a[0], p[1] - seg.a[1]);
      expect(segmentDepthAt(seg.a[2], seg.b[2], along, len)).toBeCloseTo(p[2], 9);
    }
    // Caps and joins past the ends take the end depth.
    expect(segmentDepthAt(seg.a[2], seg.b[2], -5, len)).toBe(seg.a[2]);
    expect(segmentDepthAt(seg.a[2], seg.b[2], len + 5, len)).toBe(seg.b[2]);
  });
});

describe('computeDashDistances3D', () => {
  const identity = {
    scale: [1, 1, 1] as [number, number, number],
    offset: [0, 0, 0] as [number, number, number],
  };

  it('accumulates visible screen lengths, restarting after gaps, modulo the period', () => {
    const m = perspective([0, 0, 6]);
    const input = {
      x: Float64Array.from([-1, 0, 1, NaN, -1, 1]),
      y: Float64Array.from([0, 1, 0, 0, -1, -1]),
      z: Float64Array.from([0, 0.5, 0, 0, 0, 0]),
    };
    const layout = buildLineLayout(input);
    const out = new Float32Array(layout.vertexCount * 2);
    computeDashDistances3D(layout, input, identity, m, W, H, 0, out);
    const screen = (i: number) =>
      clipToScreen(clipOf(m, [input.x[i]!, input.y[i]!, input.z[i]!]), W, H);
    const d01 = Math.hypot(screen(1)[0] - screen(0)[0], screen(1)[1] - screen(0)[1]);
    const d12 = Math.hypot(screen(2)[0] - screen(1)[0], screen(2)[1] - screen(1)[1]);
    const d45 = Math.hypot(screen(5)[0] - screen(4)[0], screen(5)[1] - screen(4)[1]);
    // Stream: [S, 0, 1, 2, S, 4, 5, S].
    expect(Array.from(layout.source)).toEqual([-1, 0, 1, 2, -1, 4, 5, -1]);
    expect(out[2]).toBe(0);
    expect(out[3]).toBeCloseTo(d01, 3);
    expect(out[4]).toBeCloseTo(d01, 3);
    expect(out[5]).toBeCloseTo(d12, 3);
    expect(out[10]).toBe(0); // restarts after the gap
    expect(out[11]).toBeCloseTo(d45, 3);

    const period = 37;
    computeDashDistances3D(layout, input, identity, m, W, H, period, out);
    expect(out[4]).toBeCloseTo(d01 % period, 3);
    expect(out[6]).toBeCloseTo((d01 + d12) % period, 3);
  });

  it('counts only the visible part of segments crossing the near plane', () => {
    const near = 0.5;
    const m = perspective([0, 0, 5], near);
    const input = {
      x: Float64Array.from([0.3, 0.3, -0.4]),
      y: Float64Array.from([0.2, 0.2, 0.1]),
      z: Float64Array.from([0, 8, 9]), // the second segment is entirely behind the camera
    };
    const layout = buildLineLayout(input);
    const out = new Float32Array(layout.vertexCount * 2);
    computeDashDistances3D(layout, input, identity, m, W, H, 0, out);
    const a = clipToScreen(clipOf(m, [0.3, 0.2, 0]), W, H);
    const cut = clipToScreen(clipOf(m, [0.3, 0.2, 4.5]), W, H);
    expect(out[3]).toBeCloseTo(Math.hypot(cut[0] - a[0], cut[1] - a[1]), 1);
    expect(out[5]).toBe(0); // culled segment: zero length, phase unchanged
    expect(out[6]).toBeCloseTo(out[4]!, 6);
  });

  it('property: phase(v + 1) = phase(v) + length(v) mod period along every polyline', () => {
    const m = perspective([1.5, 2, 4]);
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.double({ min: -2, max: 2, noNaN: true }),
            fc.double({ min: -2, max: 2, noNaN: true }),
            fc.oneof(fc.double({ min: -2, max: 6, noNaN: true }), fc.constant(NaN)),
          ),
          { minLength: 2, maxLength: 30 },
        ),
        fc.double({ min: 3, max: 50, noNaN: true }),
        (pts, period) => {
          const input = {
            x: Float64Array.from(pts.map((p) => p[0])),
            y: Float64Array.from(pts.map((p) => p[1])),
            z: Float64Array.from(pts.map((p) => p[2])),
          };
          const layout = buildLineLayout(input);
          const out = new Float32Array(layout.vertexCount * 2);
          computeDashDistances3D(layout, input, identity, m, W, H, period, out);
          for (let v = 0; v + 1 < layout.vertexCount; v++) {
            if (layout.source[v]! < 0 || layout.source[v + 1]! < 0) continue;
            const expected = (out[v * 2]! + out[v * 2 + 1]!) % period;
            const got = out[(v + 1) * 2]!;
            const diff = Math.abs(expected - got);
            expect(Math.min(diff, period - diff)).toBeLessThan(1e-3 * Math.max(1, period));
            expect(got).toBeGreaterThanOrEqual(0);
            expect(got).toBeLessThan(period + 1e-3);
          }
        },
      ),
    );
  });
});
