import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { createResourceManager } from '../resources.ts';
import {
  acquireInstancedGeometry,
  computeOrigin,
  effectiveTransform,
  expandColor,
  expandScalar,
  scalarAt,
  snapToDevicePixel,
} from './common.ts';

describe('computeOrigin', () => {
  it('centers the finite bbox and ignores gaps', () => {
    expect(computeOrigin([1, NaN, 5], [Infinity, -2, 2])).toEqual([3, 0, 0]);
    expect(computeOrigin([NaN], undefined)).toEqual([0, 0, 0]);
  });
});

describe('effectiveTransform (RTC)', () => {
  it('keeps precision for ms timestamps zoomed to a 1 s window', () => {
    const t0 = 1_700_000_000_000;
    const x = new Float64Array([t0 + 100, t0 + 600]);
    const origin = computeOrigin(x, [0]);
    // 1000 px span for 1000 ms, window starting at t0.
    const transform = { scaleX: 1, scaleY: 1, offsetX: -t0, offsetY: 0 };
    const { scale, offset } = effectiveTransform(transform, origin);
    const local = Math.fround(x[0]! - origin[0]);
    // Emulate the float32 GPU math.
    const world = Math.fround(Math.fround(local * scale[0]) + Math.fround(offset[0]));
    expect(world).toBeCloseTo(100, 3);
  });
});

describe('expandColor / expandScalar', () => {
  it('broadcasts tuples and pads short arrays with the last value', () => {
    expect([...expandColor([1, 0, 0, 1], 2)]).toEqual([1, 0, 0, 1, 1, 0, 0, 1]);
    const c = expandColor(new Float32Array([0, 1, 0, 1]), 2);
    expect([...c]).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
    expect([...expandScalar(new Float32Array([2, 3]), 3)]).toEqual([2, 3, 3]);
    expect([...expandScalar(new Float32Array(0), 2, 7)]).toEqual([7, 7]);
    expect(scalarAt(4, 10)).toBe(4);
  });
});

describe('snapToDevicePixel', () => {
  it('snaps to device pixel edges / centers', () => {
    expect(snapToDevicePixel(10.3, 1)).toBe(10);
    expect(snapToDevicePixel(10.3, 1, 0.5)).toBe(10.5);
    expect(snapToDevicePixel(10.3, 2)).toBe(10.5);
  });
});

describe('acquireInstancedGeometry', () => {
  it('shares the template and keeps it attached for the last user', () => {
    const resources = createResourceManager();
    const make = (): BufferGeometry => {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3));
      return g;
    };
    const a = acquireInstancedGeometry(resources, 'k', make);
    const b = acquireInstancedGeometry(resources, 'k', make);
    expect(a.geometry.getAttribute('position')).toBe(b.geometry.getAttribute('position'));
    a.release();
    expect(a.geometry.getAttribute('position')).toBeUndefined();
    b.release();
    expect(b.geometry.getAttribute('position')).toBeDefined();
    expect(resources.stats()).toEqual([]);
  });
});
