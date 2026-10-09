import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import {
  clipToView,
  computeViewLights,
  createViewLights,
  lightViewPosition,
  PLOTLY_LIGHTING,
  PLOTLY_LIGHTPOSITION,
} from './lighting.ts';

/**
 * Where directional lights are for the Plotly shader (plan E2.11, E8.7): the three spaces a
 * light's `position` can be given in and their defaults, and which lights a `scene.lighting` spec
 * without some of its parts yields.
 */

const S3 = 1 / Math.sqrt(3);

/** A camera at `(x, y, z)` looking at the origin (y up). */
function cameraAt(x: number, y: number, z: number): PerspectiveCamera {
  const c = new PerspectiveCamera(45, 1.5, 0.1, 100);
  c.position.set(x, y, z);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
}

/** Equal up to rounding: float64 math, or float32 storage (the light arrays). */
function closeTo(actual: ArrayLike<number>, expected: number[]): void {
  expect(actual.length).toBe(expected.length);
  const digits = actual instanceof Float32Array ? 6 : 12;
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));
}

describe('clipToView', () => {
  it('gives a direction (w = 0) for a clip-space point at infinity', () => {
    // 90° field of view, aspect 1, near 1, far 3: view = (x_clip, y_clip, -1) / w, and
    // w = (z_clip - 2) / -3, which vanishes at z_clip = 2 (beyond the far plane: infinity).
    const c = new PerspectiveCamera(90, 1, 1, 3);
    const v = clipToView([1, 1, 2], c.projectionMatrixInverse.elements);
    expect(v[3]).toBe(0);
    closeTo(v, [S3, S3, -S3, 0]);
    // A finite point on the same ray, for comparison: z_clip = -1 is the near plane (w = 1).
    closeTo(clipToView([1, 1, -1], c.projectionMatrixInverse.elements), [1, 1, -1, 1]);
  });

  it('writes into the array it is given', () => {
    const c = new PerspectiveCamera(90, 1, 1, 3);
    const out: [number, number, number, number] = [9, 9, 9, 9];
    expect(clipToView([0, 0, -1], c.projectionMatrixInverse.elements, out)).toBe(out);
    closeTo(out, [0, 0, -1, 1]);
  });
});

describe('lightViewPosition', () => {
  it("clip space: defaults to Plotly's lightposition, a point to the upper right", () => {
    const c = cameraAt(0, 0, 5);
    const byDefault = lightViewPosition({ space: 'clip' }, c);
    const explicit = lightViewPosition({ space: 'clip', position: [...PLOTLY_LIGHTPOSITION] }, c);
    expect(byDefault).toEqual(explicit);
    expect(byDefault[3]).toBe(1);
    expect(byDefault[0]).toBeGreaterThan(0);
    expect(byDefault[1]).toBeGreaterThan(0);
    // The same clip point, whatever the camera looks at.
    expect(lightViewPosition({ space: 'clip' }, cameraAt(5, 0, 0))).toEqual(byDefault);
  });

  it('camera space: a direction in view space, default (1, 1, 1), whatever the camera pose', () => {
    for (const c of [cameraAt(0, 0, 5), cameraAt(5, 2, -3)]) {
      closeTo(lightViewPosition({ space: 'camera' }, c), [S3, S3, S3, 0]);
      closeTo(lightViewPosition({ space: 'camera', position: [0, 3, 4] }, c), [0, 0.6, 0.8, 0]);
    }
  });

  it('scene space (the default): the direction toward the light, rotated into view space', () => {
    // From +x looking at the origin: view x = scene -z, view y = scene y, view z = scene x.
    const c = cameraAt(5, 0, 0);
    closeTo(lightViewPosition({}, c), [-S3, S3, S3, 0]);
    closeTo(lightViewPosition({ position: [0, 0, 2], space: 'scene' }, c), [-1, 0, 0, 0]);
    // The camera's distance does not matter: only its orientation.
    closeTo(lightViewPosition({ position: [0, 0, 2] }, cameraAt(50, 0, 0)), [-1, 0, 0, 0]);
  });

  it('a light at the center of the scene has no direction, and no NaN', () => {
    expect(lightViewPosition({ position: [0, 0, 0] }, cameraAt(0, 0, 5))).toEqual([0, 0, 0, 0]);
  });
});

describe('computeViewLights with partial specs', () => {
  const lighting = { ...PLOTLY_LIGHTING, ambient: 0.5 };

  it('an empty spec has no light at all', () => {
    const view = computeViewLights({}, PLOTLY_LIGHTPOSITION, lighting, cameraAt(0, 0, 5));
    expect(view.count).toBe(0);
    expect(view.position).toHaveLength(0);
    expect(view.color).toHaveLength(0);
    expect(view.ambient).toEqual([0, 0, 0]);
    expect(view.hemiSky).toEqual([0, 0, 0]);
    expect(view.hemiGround).toEqual([0, 0, 0]);
  });

  it('a hemisphere light alone: sky and ground × the trace ambient, up in view space', () => {
    const view = computeViewLights(
      { hemisphere: { intensity: 2, groundColor: [0.5, 0.25, 0, 1], up: [0, 1, 0] } },
      PLOTLY_LIGHTPOSITION,
      lighting,
      // From +x: scene y is view y.
      cameraAt(5, 0, 0),
    );
    expect(view.count).toBe(0);
    expect(view.ambient).toEqual([0, 0, 0]);
    // White sky by default; 2 × 0.5 = 1.
    expect(view.hemiSky).toEqual([1, 1, 1]);
    expect(view.hemiGround).toEqual([0.5, 0.25, 0]);
    closeTo(view.hemiUp, [0, 1, 0]);
  });

  it('the default ground is a dark gray and the default up is scene +z', () => {
    const view = computeViewLights(
      { hemisphere: {} },
      PLOTLY_LIGHTPOSITION,
      lighting,
      // From +x: scene z is view -x.
      cameraAt(5, 0, 0),
    );
    closeTo(view.hemiGround, [0.15, 0.15, 0.15]);
    closeTo(view.hemiUp, [-1, 0, 0]);
  });

  it('reuses the output, resizing the light arrays when the number of lights changes', () => {
    const out = createViewLights();
    const c = cameraAt(0, 0, 5);
    const two = computeViewLights(
      { directional: [{ space: 'camera', position: [1, 0, 0] }, { space: 'camera' }] },
      PLOTLY_LIGHTPOSITION,
      lighting,
      c,
      out,
    );
    expect(two).toBe(out);
    expect(out.count).toBe(2);
    closeTo(out.position, [1, 0, 0, 0, S3, S3, S3, 0]);
    expect([...out.color]).toEqual([1, 1, 1, 1, 1, 1]);
    computeViewLights({ ambient: { intensity: 1 } }, PLOTLY_LIGHTPOSITION, lighting, c, out);
    expect(out.count).toBe(0);
    expect(out.position).toHaveLength(0);
    expect(out.ambient).toEqual([0.5, 0.5, 0.5]);
  });
});
