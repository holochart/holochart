/**
 * The axes of a 3D scene (plan E14.1a, E14.1b): scales, autorange, aspect ratio, the linear → world
 * transform and ticks, following plotly.js `gl3d/scene.js` (`plot`: bounds, the 1/32 autorange
 * padding, `aspectmode` rules) and `layout/tick_marks.js` (tick counts from the axis' length on
 * screen). Pure: no three.js, no DOM.
 */
import {
  autorange,
  computeTicks,
  createScale,
  type AxisType,
  type FullAxis,
  type Scale,
  type Tick,
} from '@mk7s/holochart-core';
import type { DataTransform } from '@mk7s/holochart-render';
import type { Vec3 } from './camera.ts';

/**
 * What a 3D trace contributes to its scene's autorange: the `[min, max]` of its finite linear
 * coordinates on each axis (`undefined` when it has none on that axis). Plotly pads the union by
 * 1/32 of its span on each side.
 * @experimental
 */
export interface SceneExtremes {
  readonly x?: readonly [number, number] | undefined;
  readonly y?: readonly [number, number] | undefined;
  readonly z?: readonly [number, number] | undefined;
}

/** `[min, max]` of the finite values of `values`, or `undefined` for none. @experimental */
export function sceneExtent(values: ArrayLike<number>): [number, number] | undefined {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo <= hi ? [lo, hi] : undefined;
}

/** The union of several extents (`undefined` entries are skipped). */
export function unionExtent(
  list: Iterable<readonly [number, number] | undefined>,
): [number, number] | undefined {
  let lo = Infinity;
  let hi = -Infinity;
  for (const e of list) {
    if (!e) continue;
    lo = Math.min(lo, e[0]);
    hi = Math.max(hi, e[1]);
  }
  return lo <= hi ? [lo, hi] : undefined;
}

/** A scale for a defaulted scene axis (type and `_categories` from the scene defaults). */
export function sceneScale(axis: Readonly<Record<string, unknown>>): Scale {
  const type = (axis['type'] === '-' ? 'linear' : axis['type']) as AxisType;
  const cats = axis['_categories'];
  return createScale({
    type,
    ...(Array.isArray(cats) ? { categories: cats as string[] } : {}),
    length: 400,
  });
}

/**
 * The range of a scene axis in linear coordinates (Plotly's 3D autorange): the data extent (with
 * 0 for `rangemode: 'tozero'`) padded by 1/32 of its span on each side, ±1 around a single value,
 * `[-1, 1]` without data; then the autorange modes (`reversed`, partial `min` / `max`),
 * `autorangeoptions` and `minallowed` / `maxallowed` as for cartesian axes (core `autorange`).
 * An axis with a valid `range` and `autorange: false` keeps it.
 */
export function sceneRange(
  scale: Scale,
  axis: Readonly<Record<string, unknown>>,
  extent: readonly [number, number] | undefined,
): [number, number] {
  let lo = -1;
  let hi = 1;
  if (extent) {
    [lo, hi] = extent;
    if (axis['rangemode'] === 'tozero') {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    const d = (hi - lo) / 32;
    if (d > 0) {
      lo -= d;
      hi += d;
    } else {
      lo -= 1;
      hi += 1;
    }
  }
  const view = { ...axis, rangemode: 'normal' } as unknown as FullAxis;
  const extremes = [{ min: [{ l: lo, padPx: 0 }], max: [{ l: hi, padPx: 0 }] }];
  return autorange(extremes, scale, view);
}

/** An aspect mode (`scene.aspectmode`). */
export type AspectMode = 'auto' | 'cube' | 'data' | 'manual';

/**
 * The resolved aspect ratio of a scene (Plotly's `aspectmode` rules): `cube` is 1:1:1; `manual`
 * is `aspectratio`; `data` makes each axis as long as its data span divided by the geometric mean
 * of the spans of the axes of its type (so linear and log axes are compared among themselves);
 * `auto` is `data` unless the longest axis would be more than 4 times the shortest, then `cube`.
 * `spans` are the data spans in linear coordinates (`0`/`NaN` for none: counted as 1).
 */
export function sceneAspect(
  mode: AspectMode,
  manual: Vec3,
  types: readonly [string, string, string],
  spans: Vec3,
): Vec3 {
  if (mode === 'cube') return [1, 1, 1];
  if (mode === 'manual') return [...manual];
  const scale = spans.map((s) => (s > 0 && Number.isFinite(s) ? 1 / s : 1));
  const acc = new Map<string, { acc: number; count: number }>();
  types.forEach((t, i) => {
    const e = acc.get(t);
    if (e) {
      e.acc *= scale[i]!;
      e.count++;
    } else acc.set(t, { acc: scale[i]!, count: 1 });
  });
  const ratio = types.map((t, i) => {
    const e = acc.get(t)!;
    return e.acc ** (1 / e.count) / scale[i]!;
  }) as Vec3;
  if (mode === 'data') return ratio;
  return Math.max(...ratio) / Math.min(...ratio) <= 4 ? ratio : [1, 1, 1];
}

/**
 * Linear coordinates → scene (world) units: each axis' range maps onto `[-a/2, a/2]`, `a` its
 * aspect (reversed ranges flip the axis). The `z` fields of `DataTransform` carry the third axis.
 */
export function sceneTransform(
  ranges: readonly (readonly [number, number])[],
  aspect: Vec3,
): Required<DataTransform> {
  const s = [0, 1, 2].map((i) => {
    const [r0, r1] = ranges[i]!;
    const d = r1 - r0 || 1;
    return aspect[i]! / d;
  });
  const o = [0, 1, 2].map((i) => {
    const [r0, r1] = ranges[i]!;
    return (-s[i]! * (r0 + r1)) / 2;
  });
  return {
    scaleX: s[0]!,
    offsetX: o[0]!,
    scaleY: s[1]!,
    offsetY: o[1]!,
    scaleZ: s[2]!,
    offsetZ: o[2]!,
  };
}

/**
 * The ticks of a scene axis drawn `lengthPx` long on screen (Plotly's `tick_marks.js`): in `auto`
 * mode about one tick per 40 px, between 4 and 9, unless `nticks` is set. Date labels are one line
 * (`<br>` → space). `scale` keeps the axis' range; its length is set to `lengthPx`.
 */
export function sceneTicks(
  scale: Scale,
  axis: Readonly<Record<string, unknown>>,
  lengthPx: number,
): Tick[] {
  const len = Number.isFinite(lengthPx) && lengthPx > 1 ? lengthPx : 1;
  scale.setLength(len);
  const n = axis['nticks'];
  const nticks = typeof n === 'number' && n > 0 ? n : Math.min(9, Math.max(4, len / 40));
  const ticks = computeTicks(scale, { ...axis, nticks } as unknown as FullAxis);
  if (scale.type === 'date') for (const t of ticks) t.text = t.text.replace(/<br>/g, ' ');
  return ticks.filter((t) => !t.minor);
}

const SCALES = new WeakMap<object, Map<string, { x: Scale; y: Scale; z: Scale }>>();

/**
 * The data ↔ linear scales of scene `id`'s axes for calc (`d2l`, `d2lArray`), from the scene
 * defaults (type, categories); cached per full layout. Their ranges are not the axis ranges.
 * @experimental
 */
export function sceneScales(
  fullLayout: Readonly<Record<string, unknown>>,
  id: string,
): { x: Scale; y: Scale; z: Scale } {
  let map = SCALES.get(fullLayout);
  if (!map) SCALES.set(fullLayout, (map = new Map()));
  let scales = map.get(id);
  if (!scales) {
    const scene = (fullLayout[id] ?? {}) as Record<string, Record<string, unknown>>;
    scales = {
      x: sceneScale(scene['xaxis'] ?? {}),
      y: sceneScale(scene['yaxis'] ?? {}),
      z: sceneScale(scene['zaxis'] ?? {}),
    };
    map.set(id, scales);
  }
  return scales;
}
