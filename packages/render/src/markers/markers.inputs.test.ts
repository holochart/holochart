import type { InstancedBufferAttribute } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { HIDDEN_POSITION } from '../precision.ts';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { createMarkers, type MarkerSet } from './markers.ts';

const HIDDEN = Math.fround(HIDDEN_POSITION);
// Plotly symbol codes.
const SQUARE = 1;
const DIAMOND = 2;
const X = 4;

function context() {
  const ctx = { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
  return ctx satisfies PrimitiveContext;
}

function attr(m: MarkerSet, name: string): InstancedBufferAttribute {
  return m.geometry.getAttribute(name) as InstancedBufferAttribute;
}

function items(m: MarkerSet, name: string, count = m.count): number[] {
  const a = attr(m, name);
  return Array.from(a.array as ArrayLike<number>).slice(0, count * a.itemSize);
}

/** Component `c` of every `aStyle` item (0 line width, 1 symbol, 2 opacity, 3 angle). */
function style(m: MarkerSet, c: number): number[] {
  return items(m, 'aStyle').filter((_, i) => i % 4 === c);
}

const STYLE_ATTRIBUTES = ['aPos', 'aSize', 'aFill', 'aLine', 'aStyle'];

function versions(m: MarkerSet): Record<string, number> {
  return Object.fromEntries(STYLE_ATTRIBUTES.map((n) => [n, attr(m, n).version]));
}

describe('MarkerSet per-item inputs', () => {
  it('pads short per-item arrays with their last value', () => {
    const m = createMarkers(context(), {
      x: [0, 1, 2, 3],
      y: [0, 1, 2, 3],
      size: new Float32Array([4, 8]),
      lineWidth: new Float32Array([1, 2]),
      opacity: new Float32Array([0.25, 0.5]),
      angle: new Float32Array([10, 20]),
      symbol: ['square', 'diamond'],
    });
    expect(items(m, 'aSize')).toEqual([4, 8, 8, 8]);
    expect(style(m, 0)).toEqual([1, 2, 2, 2]);
    expect(style(m, 1)).toEqual([SQUARE, DIAMOND, DIAMOND, DIAMOND]);
    expect(style(m, 2)).toEqual([0.25, 0.5, 0.5, 0.5]);
    expect(style(m, 3)).toEqual([10, 20, 20, 20]);
  });

  it('gives empty per-item arrays the neutral value of their field', () => {
    const m = createMarkers(context(), {
      x: [0, 1],
      y: [0, 1],
      size: new Float32Array(0),
      color: new Float32Array(0),
      lineColor: new Float32Array(0),
      lineWidth: new Float32Array(0),
      opacity: new Float32Array(0),
      angle: new Float32Array(0),
      symbol: [],
    });
    // No size: nothing to draw. No colors: transparent.
    expect(items(m, 'aSize')).toEqual([0, 0]);
    expect(items(m, 'aFill')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(items(m, 'aLine')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    // No line, a circle, opaque, unrotated.
    expect(items(m, 'aStyle')).toEqual([0, 0, 1, 0, 0, 0, 1, 0]);
  });

  it('draws markers with a non-finite angle unrotated', () => {
    const m = createMarkers(context(), {
      x: [0, 1, 2],
      y: [0, 1, 2],
      angle: new Float32Array([NaN, Infinity, 30]),
    });
    expect(style(m, 3)).toEqual([0, 0, 30]);
  });

  it('paints points beyond the end of colorValues with the NaN color', () => {
    const m = createMarkers(context(), {
      x: [0, 1, 2],
      y: [0, 1, 2],
      colorValues: [4, 6],
      colorscale: [
        [0, [0, 0, 0, 1]],
        [1, [1, 1, 1, 1]],
      ],
    });
    // Values are stored relative to the center of their range (5); a missing one is the sentinel
    // the shader maps to `nanColor`.
    expect(items(m, 'aValue')).toEqual([-1, 1, HIDDEN]);
  });
});

describe('MarkerSet.update', () => {
  it('keeps the previous input for a field passed as undefined', () => {
    const m = createMarkers(context(), { x: [0, 1], y: [0, 1], size: 5 });
    const before = versions(m);
    m.update({ size: undefined, color: [0, 1, 0, 1] });
    expect(items(m, 'aSize')).toEqual([5, 5]);
    expect(items(m, 'aFill')).toEqual([0, 255, 0, 255, 0, 255, 0, 255]);
    const after = versions(m);
    expect(after.aSize).toBe(before.aSize);
    expect(after.aFill).toBe(before.aFill! + 1);
    // The stored input survives a later growth.
    m.update({ x: [0, 1, 2], y: [0, 1, 2] });
    expect(items(m, 'aSize')).toEqual([5, 5, 5]);
  });

  it('draws nothing and uploads nothing once emptied', () => {
    const m = createMarkers(context(), { x: [0, 1], y: [0, 1] });
    const geometry = m.geometry;
    const before = versions(m);
    const positionVersion = m.positionVersion;

    m.update({ x: [], y: [] });

    expect(m.count).toBe(0);
    expect(m.pickCount).toBe(0);
    expect(m.geometry).toBe(geometry);
    expect(m.geometry.instanceCount).toBe(0);
    expect(versions(m)).toEqual(before);
    expect(attr(m, 'aPos').updateRanges).toEqual([]);
    // CPU indexes over the positions must rebuild.
    expect(m.positionVersion).toBeGreaterThan(positionVersion);
    // The buffers are still there for the next points.
    m.update({ x: [7, 9], y: [1, 3] });
    expect(m.geometry).toBe(geometry);
    expect(items(m, 'aPos')).toEqual([-1, -1, 0, 1, 1, 0]);
  });
});

describe('MarkerSet.patch', () => {
  it('does nothing for an empty range', () => {
    const ctx = context();
    const m = createMarkers(ctx, { x: [0, 1, 2], y: [0, 1, 2], size: 5 });
    const positionVersion = m.positionVersion;
    ctx.invalidate.mockClear();

    m.patch(1, 0, { size: new Float32Array([9]) });
    m.patch(3, -2, { size: new Float32Array([9]) });

    expect(items(m, 'aSize')).toEqual([5, 5, 5]);
    expect(attr(m, 'aSize').updateRanges).toEqual([]);
    expect(m.count).toBe(3);
    expect(m.positionVersion).toBe(positionVersion);
    expect(ctx.invalidate).not.toHaveBeenCalled();
  });

  it('leaves a field passed as undefined alone', () => {
    const m = createMarkers(context(), { x: [0, 1, 2], y: [0, 1, 2], size: 5 });
    m.patch(1, 1, { size: undefined, symbol: 'x' });
    expect(items(m, 'aSize')).toEqual([5, 5, 5]);
    expect(attr(m, 'aSize').updateRanges).toEqual([]);
    expect(style(m, 1)).toEqual([0, X, 0]);
    expect(attr(m, 'aStyle').updateRanges).toEqual([{ start: 4, count: 4 }]);
  });

  it('appends into spare capacity, uploading only the new items of every attribute', () => {
    const m = createMarkers(context(), {
      x: [0, 1, 2, 3],
      y: [0, 1, 2, 3],
      size: 7,
      color: [0, 0, 1, 1],
    });
    // Shrinking keeps the buffers (and re-centers the origin on the two points left: 0.5).
    m.update({ x: [0, 1], y: [0, 1] });
    expect(m.capacity).toBe(4);
    const geometry = m.geometry;
    for (const name of STYLE_ATTRIBUTES) attr(m, name).clearUpdateRanges();

    m.patch(2, 1, { x: [5], y: [5] });

    expect(m.count).toBe(3);
    expect(m.geometry).toBe(geometry);
    expect(m.geometry.instanceCount).toBe(3);
    // The new position is encoded against the current origin.
    expect(items(m, 'aPos')).toEqual([-0.5, -0.5, 0, 0.5, 0.5, 0, 4.5, 4.5, 0]);
    // Fields not in the patch come from the update inputs, for the new item only.
    expect(items(m, 'aSize')).toEqual([7, 7, 7]);
    expect(items(m, 'aFill').slice(8)).toEqual([0, 0, 255, 255]);
    expect(attr(m, 'aPos').updateRanges).toEqual([{ start: 6, count: 3 }]);
    expect(attr(m, 'aSize').updateRanges).toEqual([{ start: 2, count: 1 }]);
    expect(attr(m, 'aFill').updateRanges).toEqual([{ start: 8, count: 4 }]);
    expect(attr(m, 'aLine').updateRanges).toEqual([{ start: 8, count: 4 }]);
    expect(attr(m, 'aStyle').updateRanges).toEqual([{ start: 8, count: 4 }]);
  });
});

describe('MarkerSet.setViewport', () => {
  it('keeps the resolution and pixel ratio usable for a degenerate viewport', () => {
    const m = createMarkers(context());
    const u = m.material.uniforms;
    m.setViewport({ width: 0, height: 0.25, pixelRatio: 0 });
    expect(u.uResolution!.value.toArray()).toEqual([1, 1]);
    expect(u.uPixelRatio!.value).toBe(1);
    m.setViewport({ width: 300, height: 200, pixelRatio: NaN });
    expect(u.uResolution!.value.toArray()).toEqual([300, 200]);
    expect(u.uPixelRatio!.value).toBe(1);
  });
});
