import { Object3D, PerspectiveCamera } from 'three';
import type { InstancedBufferAttribute } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { HIDDEN_POSITION } from '../precision.ts';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { Markers3D, type Markers3DOptions } from './markers3d.ts';

/**
 * Depth-sorted 3D markers (plan E14.2): every per-item field follows the back-to-front order,
 * whatever its shape (per item, one for all, shorter than the data), and pick ids keep reporting
 * data indices.
 */

function context(): PrimitiveContext {
  return { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
}

/** A manual clock for the re-sort throttle. */
function fakeClock() {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  return {
    now: () => now,
    setTimeout(fn: () => void, ms: number) {
      const t = { at: now + ms, fn };
      timers.push(t);
      return t;
    },
    clearTimeout(handle: unknown) {
      const i = timers.indexOf(handle as (typeof timers)[number]);
      if (i >= 0) timers.splice(i, 1);
    },
    advance(ms: number) {
      now += ms;
      for (const t of [...timers].sort((a, b) => a.at - b.at)) {
        if (t.at > now) continue;
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
    },
    get pending() {
      return timers.length;
    },
  };
}

const fakeRenderer = {
  getCurrentViewport: (v: { set(...a: number[]): unknown }) => v.set(0, 0, 800, 600),
  getPixelRatio: () => 1,
  getRenderTarget: () => null,
};

/** A camera at `(x, y, z)` looking at the origin. */
function cameraAt(x: number, y: number, z: number): PerspectiveCamera {
  const camera = new PerspectiveCamera();
  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

/** What three.js does before drawing the markers with `camera`. */
function render(m: Markers3D, camera: PerspectiveCamera): void {
  m.object.updateMatrixWorld();
  m.object.onBeforeRender(
    fakeRenderer as never,
    new Object3D() as never,
    camera,
    m.object.geometry,
    m.markers.material,
    null as never,
  );
}

function sorted(
  data: ConstructorParameters<typeof Markers3D>[1],
  options: Markers3DOptions = {},
): Markers3D {
  return new Markers3D(context(), data, { depthSort: true, ...options });
}

function values(m: Markers3D, name: string): number[] {
  const attribute = m.markers.geometry.getAttribute(name) as InstancedBufferAttribute;
  return Array.from(attribute.array.subarray(0, m.count * attribute.itemSize));
}

/** Component `c` of every item of a 4-float attribute. */
function component(m: Markers3D, name: string, c: number): number[] {
  return values(m, name).filter((_, i) => i % 4 === c);
}

const order = (m: Markers3D): number[] =>
  Array.from({ length: m.count }, (_, slot) => m.sourceIndex(slot));

// Plotly's symbol codes.
const CIRCLE = 0;
const SQUARE = 1;
const DIAMOND = 2;
const X = 4;

describe('Markers3D depth order: per-item fields', () => {
  it('border colors, widths, opacities, angles and symbol names follow the order', () => {
    const m = sorted({
      x: [0, 0, 0],
      y: [0, 0, 0],
      z: [1, -1, 0],
      lineColor: Float32Array.from([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]),
      lineWidth: Float32Array.from([1, 2, 3]),
      opacity: Float32Array.from([0.25, 0.5, 0.75]),
      angle: Float32Array.from([10, 20, 30]),
      symbol: ['circle', 'square', 'diamond'],
    });
    render(m, cameraAt(0, 0, 5));
    // Seen from +z, the farthest is z = -1 (item 1), then z = 0 (item 2), then z = 1 (item 0).
    expect(order(m)).toEqual([1, 2, 0]);
    expect(values(m, 'aLine')).toEqual([0, 255, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255]);
    // aStyle: border width, symbol code, opacity, angle.
    expect(values(m, 'aStyle')).toEqual([
      2,
      SQUARE,
      0.5,
      20,
      3,
      DIAMOND,
      0.75,
      30,
      1,
      CIRCLE,
      0.25,
      10,
    ]);
    m.dispose();
  });

  it('one color and one size for all stay as they are', () => {
    const m = sorted({
      x: [0, 0, 0],
      y: [0, 0, 0],
      z: [1, -1, 0],
      color: [1, 0, 0, 1],
      size: 12,
    });
    render(m, cameraAt(0, 0, 5));
    expect(order(m)).toEqual([1, 2, 0]);
    expect(values(m, 'aSize')).toEqual([12, 12, 12]);
    expect(values(m, 'aFill')).toEqual([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]);
    m.dispose();
  });

  it('numeric symbol codes follow the order, as a typed or a plain array', () => {
    for (const symbol of [Uint16Array.from([CIRCLE, SQUARE, DIAMOND]), [CIRCLE, SQUARE, DIAMOND]]) {
      const m = sorted({ x: [0, 0, 0], y: [0, 0, 0], z: [1, -1, 0], symbol });
      render(m, cameraAt(0, 0, 5));
      expect(component(m, 'aStyle', 1)).toEqual([SQUARE, DIAMOND, CIRCLE]);
      m.dispose();
    }
  });
});

describe('Markers3D depth order: arrays shorter than the data', () => {
  // Seen from +z: z = 0 (item 3) is the farthest, z = 3 (item 0) the nearest.
  const positions = { x: [0, 0, 0, 0], y: [0, 0, 0, 0], z: [3, 2, 1, 0] };

  it('sizes, colors and symbols of the missing items repeat the last one given', () => {
    const m = sorted({
      ...positions,
      size: Float32Array.from([10, 20]),
      color: Float32Array.from([1, 0, 0, 1, 0, 1, 0, 1]),
      symbol: ['square', 'x'],
    });
    render(m, cameraAt(0, 0, 5));
    expect(order(m)).toEqual([3, 2, 1, 0]);
    // Items 2 and 3 have no size, color or symbol of their own: item 1's.
    expect(values(m, 'aSize')).toEqual([20, 20, 20, 10]);
    expect(values(m, 'aFill')).toEqual([
      0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 255, 0, 0, 255,
    ]);
    expect(component(m, 'aStyle', 1)).toEqual([X, X, X, SQUARE]);
    m.dispose();
  });

  it('numeric symbol codes in a typed array repeat the last one too', () => {
    const m = sorted({ ...positions, symbol: Uint16Array.from([SQUARE, DIAMOND]) });
    render(m, cameraAt(0, 0, 5));
    expect(component(m, 'aStyle', 1)).toEqual([DIAMOND, DIAMOND, DIAMOND, SQUARE]);
    m.dispose();
  });

  it('items without a color value are drawn with the NaN color (hidden value)', () => {
    const m = sorted({
      ...positions,
      colorValues: [5, 7],
      colorscale: [
        [0, [0, 0, 1, 1]],
        [1, [1, 0, 0, 1]],
      ],
      cmin: 5,
      cmax: 7,
    });
    render(m, cameraAt(0, 0, 5));
    // Values are stored relative to the center of their finite range (6); slots hold items
    // 3, 2 (no value), 1 (7), 0 (5).
    const hidden = Math.fround(HIDDEN_POSITION);
    expect(values(m, 'aValue')).toEqual([hidden, hidden, 1, -1]);
    m.dispose();
  });

  it('empty size and color arrays draw nothing visible: size 0, transparent', () => {
    const m = sorted({ ...positions, size: new Float32Array(0), color: new Float32Array(0) });
    render(m, cameraAt(0, 0, 5));
    expect(values(m, 'aSize')).toEqual([0, 0, 0, 0]);
    expect(values(m, 'aFill')).toEqual(new Array(16).fill(0));
    m.dispose();
  });
});

describe('Markers3D depth order: views and updates', () => {
  it('sorts 2D positions (no z) along the view direction', () => {
    const m = sorted({ x: [2, -1, 0, 1], y: [0, 0, 0, 0], size: Float32Array.from([1, 2, 3, 4]) });
    expect(m.count).toBe(4);
    // From +x the farthest point has the smallest x.
    render(m, cameraAt(5, 0, 0));
    expect(order(m)).toEqual([1, 2, 3, 0]);
    expect(values(m, 'aSize')).toEqual([2, 3, 4, 1]);
    m.dispose();
  });

  it('reports -1 for a slot that draws nothing, and the slot itself when unsorted', () => {
    const data = { x: [0, 0], y: [0, 0], z: [1, -1] };
    const m = sorted(data);
    render(m, cameraAt(0, 0, 5));
    expect(m.sourceIndex(0)).toBe(1);
    expect(m.sourceIndex(2)).toBe(-1);
    const plain = new Markers3D(context(), data);
    expect(plain.sourceIndex(0)).toBe(0);
    expect(plain.sourceIndex(1)).toBe(1);
    m.dispose();
    plain.dispose();
  });

  it('new positions are sorted for the current view at once; undefined fields keep their value', () => {
    const m = sorted({
      x: [0, 0, 0],
      y: [0, 0, 0],
      z: [1, -1, 0],
      size: Float32Array.from([10, 20, 30]),
    });
    render(m, cameraAt(0, 0, 5));
    expect(values(m, 'aSize')).toEqual([20, 30, 10]);
    m.update({ z: [0, 1, -1], size: undefined });
    // Farthest first: z = -1 (item 2), z = 0 (item 0), z = 1 (item 1); the sizes are still there.
    expect(order(m)).toEqual([2, 0, 1]);
    expect(values(m, 'aSize')).toEqual([30, 10, 20]);
    expect(values(m, 'aSourceIndex')).toEqual([2, 0, 1]);
    m.dispose();
  });

  it('styles given before any position apply once positions arrive', () => {
    const m = sorted({});
    m.update({ size: Float32Array.from([5, 6]) });
    expect(m.count).toBe(0);
    expect(m.markers.geometry.getAttribute('aSourceIndex')).toBeUndefined();
    // A frame with nothing to draw.
    render(m, cameraAt(0, 0, 5));
    expect(m.count).toBe(0);
    m.update({ x: [0, 0], y: [0, 0], z: [1, -1] });
    expect(m.count).toBe(2);
    expect(order(m)).toEqual([1, 0]);
    expect(values(m, 'aSize')).toEqual([6, 5]);
    expect(values(m, 'aSourceIndex')).toEqual([1, 0]);
    m.dispose();
  });

  it('more points than before: the data indices move to the new, larger geometry', () => {
    const m = sorted({ x: [0, 0], y: [0, 0], z: [1, 0] });
    render(m, cameraAt(0, 0, 5));
    expect(values(m, 'aSourceIndex')).toEqual([1, 0]);
    const before = m.markers.geometry;
    m.update({ x: [0, 0, 0, 0, 0], y: [0, 0, 0, 0, 0], z: [4, 3, 2, 1, 0] });
    expect(m.markers.geometry).not.toBe(before);
    expect(m.object.geometry).toBe(m.markers.geometry);
    expect(values(m, 'aSourceIndex')).toEqual([4, 3, 2, 1, 0]);
    m.dispose();
  });

  it('sorts in world space: a transform that flips z reverses the order', () => {
    const clock = fakeClock();
    const m = sorted({ x: [0, 0, 0], y: [0, 0, 0], z: [1, -1, 0] }, { clock });
    const camera = cameraAt(0, 0, 5);
    render(m, camera);
    expect(order(m)).toEqual([1, 2, 0]);
    m.setTransform({ scaleX: 1, scaleY: 1, scaleZ: -1, offsetX: 0, offsetY: 0, offsetZ: 0 });
    expect(m.markers.worldScale.z).toBe(-1);
    render(m, camera);
    // Inside the throttle interval: the re-sort runs when it ends.
    expect(order(m)).toEqual([1, 2, 0]);
    clock.advance(100);
    // World z = -data z: item 0 (world -1) is now the farthest.
    expect(order(m)).toEqual([0, 2, 1]);
    m.dispose();
  });

  it('dispose cancels the pending re-sort, and later frames leave the order alone', () => {
    const clock = fakeClock();
    const m = sorted({ x: [0, 0, 0], y: [0, 0, 0], z: [1, -1, 0] }, { clock });
    render(m, cameraAt(0, 0, 5));
    render(m, cameraAt(0, 0, -5));
    expect(clock.pending).toBe(1);
    m.dispose();
    expect(clock.pending).toBe(0);
    clock.advance(1000);
    render(m, cameraAt(0, 0, -5));
    expect(order(m)).toEqual([1, 2, 0]);
  });
});
