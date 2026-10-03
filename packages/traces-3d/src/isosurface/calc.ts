/**
 * `isosurface` / `volume` calc (plan E14.7, E14.8), after plotly.js `isosurface/calc.js`: the
 * columns in linear coordinates, validated as a grid (`grid.ts`), the value range (Plotly's
 * `_vMin` / `_vMax`: `isomin` / `isomax`, else the data extent), which is also the colorscale's
 * automatic domain, and the extracted mesh (`extract.ts`; not for ray-marched volumes, which draw
 * the grid itself).
 *
 * Large grids stay cheap: numeric typed-array columns on linear axes are used as they are (no
 * copy), and a structured grid is read along its strides (no sort).
 */
import { isArrayLike, type FullTrace, type Scale } from '@mk7s/holochart-core';
import type { CalcContext } from '@mk7s/holochart-runtime';
import { sceneScales } from '../scene/axes.ts';
import type { SceneCalc } from '../scene/layout.ts';
import { sceneOf } from '../scene/layout-defaults.ts';
import { numbersOf } from '../mesh3d/colors.ts';
import { extractIsoMesh, type IsoMesh, type IsoMeshOptions } from './extract.ts';
import { emptyIsoGrid, processIsoGrid, type IsoGrid } from './grid.ts';

type Vec3 = [number, number, number];
type Container = Record<string, unknown>;

/** @experimental */
export interface IsoCalc extends SceneCalc {
  readonly grid: IsoGrid;
  /** The value range drawn (Plotly's `_vMin` / `_vMax`); NaN without values. */
  readonly isomin: number;
  readonly isomax: number;
  /** The extracted triangles, or null (ray-marched volumes). */
  readonly mesh: IsoMesh | null;
  /** Plotly's `dataScale`: 1 / the grid's span per axis (1 for no span). */
  readonly dataScale: Vec3;
}

/** A column in linear coordinates: numeric typed arrays on plain linear axes are used as given. */
export function linearColumn(scale: Scale, raw: unknown): ArrayLike<number> {
  const values = isArrayLike(raw) ? (raw as ArrayLike<unknown>) : [];
  if (ArrayBuffer.isView(values) && scale.type === 'linear' && !scale.breaks) {
    return values as unknown as ArrayLike<number>;
  }
  return scale.d2lArray(values);
}

/** The values as numbers: numeric typed arrays as given, else converted (non-numbers → NaN). */
export function valueColumn(raw: unknown): ArrayLike<number> {
  if (ArrayBuffer.isView(raw) && !(raw instanceof DataView)) {
    return raw as unknown as ArrayLike<number>;
  }
  return numbersOf(raw);
}

const EXTENTS = new WeakMap<object, { length: number; extent: [number, number] | undefined }>();

/** Finite `[min, max]` of a value column (cached per array). */
export function valueExtent(raw: unknown): [number, number] | undefined {
  if (!isArrayLike(raw)) return undefined;
  const hit = EXTENTS.get(raw as object);
  if (hit && hit.length === raw.length) return hit.extent;
  const v = valueColumn(raw);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < v.length; i++) {
    const x = v[i]!;
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  const extent: [number, number] | undefined = lo <= hi ? [lo, hi] : undefined;
  EXTENTS.set(raw as object, { length: raw.length, extent });
  return extent;
}

/** The value range of a defaulted trace: `[isomin, isomax]`, the data extent where not given. */
export function isoRange(trace: Readonly<Container>): [number, number] | undefined {
  const extent = valueExtent(trace['value']);
  const min = typeof trace['isomin'] === 'number' ? trace['isomin'] : extent?.[0];
  const max = typeof trace['isomax'] === 'number' ? trace['isomax'] : extent?.[1];
  return min !== undefined && max !== undefined ? [min, max] : undefined;
}

/** The colorscale's automatic domain of a defaulted trace: `[isomin, isomax]`. */
export function isoColorValues(trace: FullTrace): [number, number] | undefined {
  return trace.visible === false ? undefined : isoRange(trace);
}

function num(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** The extraction options of a defaulted trace (hidden parts: `show: false`). */
export function isoMeshOptions(
  trace: Readonly<Container>,
  isomin: number,
  isomax: number,
  scales: { x: Scale; y: Scale; z: Scale },
): IsoMeshOptions {
  const part = (k: string): Container => (trace[k] ?? {}) as Container;
  const axis = (k: string, a: string): Container => (part(k)[a] ?? {}) as Container;
  const surface = part('surface');
  const spaceframe = part('spaceframe');
  const cap = (a: string) => ({
    show: axis('caps', a)['show'] === true,
    fill: num(axis('caps', a)['fill'], 1),
  });
  const slice = (a: string, s: Scale) => {
    const o = axis('slices', a);
    const locations = isArrayLike(o['locations'])
      ? Array.from(s.d2lArray(o['locations'] as ArrayLike<unknown>)).filter(Number.isFinite)
      : [];
    return { show: o['show'] === true, fill: num(o['fill'], 1), locations };
  };
  return {
    isomin,
    isomax,
    surface: {
      show: surface['show'] === true,
      count: num(surface['count'], 2),
      fill: num(surface['fill'], 1),
      pattern: typeof surface['pattern'] === 'string' ? surface['pattern'] : 'all',
    },
    spaceframe: { show: spaceframe['show'] === true, fill: num(spaceframe['fill'], 0.15) },
    caps: { x: cap('x'), y: cap('y'), z: cap('z') },
    slices: { x: slice('x', scales.x), y: slice('y', scales.y), z: slice('z', scales.z) },
  };
}

/** The calc of `isosurface` and `volume`; `extract: false` skips the mesh (ray marching). */
export function calcIso(trace: FullTrace, ctx: CalcContext, extract = true): IsoCalc {
  const scales = sceneScales(ctx.fullLayout, sceneOf(trace));
  const x = linearColumn(scales.x, trace['x']);
  const y = linearColumn(scales.y, trace['y']);
  const z = linearColumn(scales.z, trace['z']);
  const value = valueColumn(trace['value']);
  const grid =
    x.length && y.length && z.length && value.length
      ? processIsoGrid(x, y, z, value)
      : emptyIsoGrid();
  const isomin = num(trace['isomin'], grid.valueMin);
  const isomax = num(trace['isomax'], grid.valueMax);
  const span = (v: Float64Array): number =>
    v.length > 1 && v[v.length - 1]! > v[0]! ? 1 / (v[v.length - 1]! - v[0]!) : 1;
  const dataScale: Vec3 = [span(grid.xs), span(grid.ys), span(grid.zs)];
  const mesh =
    extract && grid.len > 0
      ? extractIsoMesh(grid, isoMeshOptions(trace, isomin, isomax, scales))
      : null;
  const box = (v: Float64Array): [number, number] | undefined =>
    v.length ? [v[0]!, v[v.length - 1]!] : undefined;
  return {
    grid,
    isomin,
    isomax,
    mesh,
    dataScale,
    sceneExtremes: grid.len > 0 ? { x: box(grid.xs), y: box(grid.ys), z: box(grid.zs) } : {},
  };
}
