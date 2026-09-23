import fc from 'fast-check';
import { Matrix4, PerspectiveCamera, Vector3, Vector4 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  MAX_PICK_RADIUS,
  computePickWindow,
  createPickWindow,
  pickProjection,
  toDeviceGLRect,
  windowPixelDistance,
  windowPixelVisible,
  type PickWindow,
} from './pick-window.ts';

const CANVAS = { width: 400, height: 300, pixelRatio: 2 };
const AREA = { x: 40, y: 30, width: 320, height: 240 };

function win(
  x: number,
  y: number,
  radius: number,
  canvas = CANVAS,
  area = AREA,
  scissor: typeof AREA | null = AREA,
): PickWindow {
  const w = createPickWindow();
  expect(computePickWindow(w, x, y, radius, canvas, area, scissor)).toBe(true);
  return w;
}

describe('toDeviceGLRect', () => {
  it('flips to bottom-left and rounds like WebGLRenderer.setViewport', () => {
    expect(toDeviceGLRect({ x: 40, y: 30, width: 320, height: 240 }, 300, 2)).toEqual({
      x: 80,
      y: 60,
      width: 640,
      height: 480,
    });
    expect(toDeviceGLRect({ x: 10.3, y: 0, width: 33.3, height: 10 }, 100, 1.5)).toEqual({
      x: 15,
      y: 135,
      width: 50,
      height: 15,
    });
  });
});

describe('computePickWindow', () => {
  it('converts CSS px to device px (DPR) and sizes the window by the radius', () => {
    const w = win(100.2, 50.7, 3);
    expect(w.pixelRatio).toBe(2);
    expect(w.col).toBe(200);
    expect(w.row).toBe(101);
    expect(w.half).toBe(6);
    expect(w.size).toBe(13);
    expect(w.canvasRows).toBe(600);
    expect([w.vx, w.vy, w.vw, w.vh]).toEqual([80, 60, 640, 480]);
    // Window CSS size scales with area / device viewport (= 1 / dpr here).
    expect(w.windowWidth).toBeCloseTo(6.5, 10);
    expect(w.windowHeight).toBeCloseTo(6.5, 10);
  });

  it('uses a single pixel for radius 0 and rounds radius up to whole device px', () => {
    expect(win(100, 100, 0).size).toBe(1);
    expect(win(100, 100, 0.1, { ...CANVAS, pixelRatio: 1 }).size).toBe(3);
    expect(win(100, 100, 1.25, { ...CANVAS, pixelRatio: 1.5 }).half).toBe(2);
  });

  it('clamps the radius', () => {
    const w = win(200, 150, 1e9);
    expect(w.radius).toBe(MAX_PICK_RADIUS);
    expect(w.half).toBe(MAX_PICK_RADIUS * 2);
  });

  it('treats negative/NaN radius as 0 and rejects non-finite positions', () => {
    expect(win(100, 100, -5).size).toBe(1);
    expect(win(100, 100, NaN).size).toBe(1);
    const w = createPickWindow();
    expect(computePickWindow(w, NaN, 10, 0, CANVAS, AREA, null)).toBe(false);
    expect(computePickWindow(w, 10, Infinity, 0, CANVAS, AREA, null)).toBe(false);
  });

  it('rejects positions outside the visible region (area ∩ scissor ∩ canvas)', () => {
    const w = createPickWindow();
    expect(computePickWindow(w, 39.9, 100, 0, CANVAS, AREA, AREA)).toBe(false);
    expect(computePickWindow(w, 40, 100, 0, CANVAS, AREA, AREA)).toBe(true);
    expect(computePickWindow(w, 359.9, 100, 0, CANVAS, AREA, AREA)).toBe(true);
    expect(computePickWindow(w, 360, 100, 0, CANVAS, AREA, AREA)).toBe(false);
    expect(computePickWindow(w, 100, 29.9, 0, CANVAS, AREA, AREA)).toBe(false);
    expect(computePickWindow(w, 100, 269.9, 0, CANVAS, AREA, AREA)).toBe(true);
    expect(computePickWindow(w, 100, 270, 0, CANVAS, AREA, AREA)).toBe(false);
    // A tighter scissor wins.
    const scissor = { x: 100, y: 100, width: 50, height: 50 };
    expect(computePickWindow(w, 60, 60, 0, CANVAS, AREA, scissor)).toBe(false);
    expect(computePickWindow(w, 120, 120, 0, CANVAS, AREA, scissor)).toBe(true);
    // Unclipped view: only the canvas bounds apply.
    const whole = { x: 0, y: 0, width: 400, height: 300 };
    expect(computePickWindow(w, 399.9, 299.9, 0, CANVAS, whole, null)).toBe(true);
    expect(computePickWindow(w, 400, 10, 0, CANVAS, whole, null)).toBe(false);
    // Empty view.
    expect(computePickWindow(w, 0, 0, 0, CANVAS, { x: 0, y: 0, width: 0, height: 5 }, null)).toBe(
      false,
    );
  });

  it('marks window pixels outside the visible region', () => {
    // Cursor 1 CSS px (2 device px) inside the left edge, radius 3 → window reaches outside.
    const w = win(41, 100, 3);
    const h = w.half;
    expect(windowPixelVisible(w, h, h)).toBe(true);
    expect(windowPixelVisible(w, h - 2, h)).toBe(true); // device col 80 = first visible
    expect(windowPixelVisible(w, h - 3, h)).toBe(false);
    expect(windowPixelVisible(w, 0, 0)).toBe(false);
  });
});

describe('windowPixelDistance', () => {
  it('is 0 under the cursor and the CSS distance to pixel centres elsewhere', () => {
    const w = win(100.25, 50.25, 5, { ...CANVAS, pixelRatio: 1 });
    const h = w.half;
    expect(windowPixelDistance(w, h, h)).toBe(0);
    // One pixel right: centre (101.5, 50.5).
    expect(windowPixelDistance(w, h + 1, h)).toBeCloseTo(Math.hypot(1.25, 0.25), 12);
    // One pixel UP in read-back rows = one CSS row up: centre (100.5, 49.5).
    expect(windowPixelDistance(w, h, h + 1)).toBeCloseTo(Math.hypot(0.25, 0.75), 12);
    expect(windowPixelDistance(w, h - 3, h - 4)).toBeCloseTo(Math.hypot(2.75, 4.25), 12);
  });

  it('measures in CSS px at DPR 2', () => {
    const w = win(100, 50, 5);
    const h = w.half;
    // Two device px right → centre at ((200 + 2 + 0.5) / 2, (100 + 0.5) / 2) CSS.
    expect(windowPixelDistance(w, h + 2, h)).toBeCloseTo(Math.hypot(1.25, 0.25), 12);
  });
});

describe('pickProjection', () => {
  it('matches PerspectiveCamera.setViewOffset over the same device-pixel window', () => {
    const w = win(123.4, 77.7, 4);
    const camera = new PerspectiveCamera(50, w.vw / w.vh, 0.1, 100);
    const out = pickProjection(new Matrix4(), camera.projectionMatrix, w);
    const c = w.col - w.vx;
    const rowFromTop = w.vh - 1 - (w.canvasRows - 1 - w.row - w.vy);
    camera.setViewOffset(w.vw, w.vh, c - w.half, rowFromTop - w.half, w.size, w.size);
    const expected = camera.projectionMatrix.elements;
    out.elements.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 9));
  });

  it('may alias its input', () => {
    const w = win(200, 150, 2);
    const p = new PerspectiveCamera(40, 1.3, 0.5, 50).projectionMatrix;
    const expected = pickProjection(new Matrix4(), p, w);
    const alias = p.clone();
    pickProjection(alias, alias, w);
    expect(alias.equals(expected)).toBe(true);
  });

  it('rasterizes every point into the same device pixel as the visible frame', () => {
    const canvas = { width: 400, height: 300, pixelRatio: 1 };
    let inside = 0;
    fc.assert(
      fc.property(
        fc.constantFrom(1, 1.5, 2, 3),
        fc.double({ min: 45, max: 355, noNaN: true }),
        fc.double({ min: 35, max: 265, noNaN: true }),
        fc.integer({ min: 0, max: 8 }),
        fc.tuple(
          fc.double({ min: -10, max: 10, noNaN: true }),
          fc.double({ min: -10, max: 10, noNaN: true }),
          fc.double({ min: -0.95, max: 0.95, noNaN: true }),
        ),
        (dpr, x, y, radius, [dx, dy, ndcZ]) => {
          const w = createPickWindow();
          if (!computePickWindow(w, x, y, radius, { ...canvas, pixelRatio: dpr }, AREA, AREA)) {
            return;
          }
          const camera = new PerspectiveCamera(45, w.vw / w.vh, 0.1, 100);
          camera.position.set(0.3, 0.2, 4);
          camera.lookAt(0, 0, 0);
          camera.updateMatrixWorld();
          // A world point that projects near the cursor (within about the window).
          const world = new Vector3(
            ((x + dx - AREA.x) / AREA.width) * 2 - 1,
            1 - ((y + dy - AREA.y) / AREA.height) * 2,
            ndcZ,
          ).unproject(camera);
          const view = camera.matrixWorldInverse;
          const clip = new Vector4(world.x, world.y, world.z, 1)
            .applyMatrix4(view)
            .applyMatrix4(camera.projectionMatrix);
          const pick = new Vector4(world.x, world.y, world.z, 1)
            .applyMatrix4(view)
            .applyMatrix4(pickProjection(new Matrix4(), camera.projectionMatrix, w));
          // Visible frame: NDC → device pixel of the GL viewport.
          const fx = w.vx + ((clip.x / clip.w + 1) / 2) * w.vw;
          const fy = w.vy + ((clip.y / clip.w + 1) / 2) * w.vh;
          // Pick pass: NDC → pixel of the size × size target.
          const rx = ((pick.x / pick.w + 1) / 2) * w.size;
          const ry = ((pick.y / pick.w + 1) / 2) * w.size;
          expect(pick.z / pick.w).toBeCloseTo(clip.z / clip.w, 9); // same depth
          // Skip points on a pixel boundary (either side is a valid rasterization).
          const edge = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;
          if (edge(fx) || edge(fy) || edge(rx) || edge(ry)) return;
          const i = Math.floor(rx);
          const j = Math.floor(ry);
          if (i < 0 || j < 0 || i >= w.size || j >= w.size) {
            // Outside the window: must also be outside it in the visible frame.
            const gx = Math.floor(fx) - (w.col - w.half);
            const gy = Math.floor(fy) - (w.canvasRows - 1 - w.row - w.half);
            expect(gx >= 0 && gy >= 0 && gx < w.size && gy < w.size).toBe(false);
            return;
          }
          expect(Math.floor(fx)).toBe(w.col - w.half + i);
          expect(Math.floor(fy)).toBe(w.canvasRows - 1 - w.row - w.half + j);
          inside++;
        },
      ),
      { numRuns: 400 },
    );
    // Most samples must exercise the in-window branch.
    expect(inside).toBeGreaterThan(100);
  });
});
