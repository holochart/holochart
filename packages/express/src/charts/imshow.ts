/**
 * `imshow` (plan E23.6), following plotly.py's `px.imshow`: a matrix becomes a `heatmap` on the
 * shared `coloraxis`, an RGB / RGBA array (or any image with `binaryString`) an `image` trace, with
 * px's contrast rescaling, square pixels, the y axis running down from the top, and facets or
 * animation frames over extra leading dimensions. Unlike the other Express functions, the input is
 * an array (numpy-style nested arrays or `ImageData`), not a table.
 */
import type { Template } from '@mk7s/holochart-core';
import type { Chart } from '@mk7s/holochart-runtime';
import { prepare } from '../core/args.ts';
import { frameControls } from '../core/animation.ts';
import { layoutGrid, type GridPlan } from '../core/grid.ts';
import { expressFunction } from '../core/render.ts';
import { pngDataURI } from '../data/png.ts';
import type { ContinuousScale, ExpressFigure } from '../options.ts';
import { defined } from './shared.ts';

/** A pixel value: numbers; booleans become 0 / 255; `null`, `undefined` and `NaN` are gaps. */
export type ImshowValue = number | boolean | null | undefined;

/**
 * Nested arrays in numpy's row-major layout: `[row][col]`, `[row][col][channel]`, or with leading
 * dimensions for `facetCol` / `animationFrame`. Any level may be a typed array.
 */
export type ImshowArray = ArrayLike<ImshowValue | ImshowArray>;

/** `ImageData` or anything shaped like it: `height × width` RGBA pixels, row by row. */
export interface ImageDataLike {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
}

/** What {@link imshow} displays. */
export type ImshowInput = ImshowArray | ImageDataLike;

/** Display names of `imshow`'s dimensions (px's `labels` keys; camelCase keys work too). */
export interface ImshowLabels {
  /** Title of the x axes and name of x in hover text. */
  readonly x?: string;
  /** Title of the y axes and name of y in hover text. */
  readonly y?: string;
  /** Colorbar title and name of the value in hover text. */
  readonly color?: string;
  /** Facet label prefix (default `facet_col`, as in `facet_col=0`). */
  readonly facet_col?: string;
  readonly facetCol?: string;
  /** Slider prefix (default `animation_frame`). */
  readonly animation_frame?: string;
  readonly animationFrame?: string;
}

/** Options of {@link imshow}: px.imshow's arguments in camelCase. */
export interface ImshowOptions {
  /**
   * Value (or per-channel values) shown as the lowest color: `coloraxis.cmin` of a heatmap, the
   * `image` trace's `zmin`, or the low end of `binaryString` rescaling.
   */
  readonly zmin?: number | readonly number[];
  /** Value (or per-channel values) shown as the highest color. */
  readonly zmax?: number | readonly number[];
  /** `'upper'` (default): row 0 at the top, as images are stored; `'lower'`: at the bottom. */
  readonly origin?: 'upper' | 'lower';
  readonly labels?: ImshowLabels;
  /**
   * Coordinates of the columns (as many as the image is wide). Heatmaps take any values; images
   * need evenly spaced numbers (`x0` and `dx` are taken from the first two).
   */
  readonly x?: ArrayLike<unknown>;
  /** Coordinates of the rows (as many as the image is high). */
  readonly y?: ArrayLike<unknown>;
  /** Dimension to animate over (negative counts from the end): one frame per index. */
  readonly animationFrame?: number;
  /** Dimension to facet over: one subplot per index, in columns. */
  readonly facetCol?: number;
  /** Wrap the facet columns after this many. */
  readonly facetColWrap?: number;
  /** Space between facet columns, as a fraction of the plot width. Default 0.02. */
  readonly facetColSpacing?: number;
  /** Space between facet rows, as a fraction of the plot height. Default 0.07 (wrapped). */
  readonly facetRowSpacing?: number;
  /** Colorscale of single-channel heatmaps. Default: the template's sequential colorscale. */
  readonly colorContinuousScale?: ContinuousScale;
  /** Alias of `colorContinuousScale`. */
  readonly colorscale?: ContinuousScale;
  /** `cmid` of the colorscale, for diverging scales. */
  readonly colorContinuousMidpoint?: number;
  /** `[zmin, zmax]`. */
  readonly rangeColor?: readonly [number, number];
  /** Figure title (`layout.title.text`). */
  readonly title?: string;
  /** `layout.template` (also where the default colorscale comes from). */
  readonly template?: string | Template;
  /** Figure width in px. */
  readonly width?: number;
  /** Figure height in px. */
  readonly height?: number;
  /**
   * `'equal'` (default): square pixels (`scaleanchor`, `constrain: 'domain'`); `'auto'`: the image
   * stretches to fill the plot.
   */
  readonly aspect?: 'equal' | 'auto';
  /**
   * How `zmin` / `zmax` are found when not given: `'minmax'` (the data's extent; default for
   * single-channel images) or `'infer'` (the range of the data's type; default for RGB / RGBA).
   */
  readonly contrastRescaling?: 'minmax' | 'infer';
  /**
   * Draw the image from a PNG (`image.source`) rather than from `z` values: smaller figures and
   * faster to draw, but hover shows only coordinates when the values were rescaled. Default `true`
   * for RGB / RGBA images, `false` for single-channel ones.
   */
  readonly binaryString?: boolean;
  /** Format of `binaryString` images: only `'png'`. */
  readonly binaryFormat?: 'png';
  /**
   * Show each heatmap cell's value as text: `true`, or a d3 format (`'.2f'`) — the heatmap's
   * `texttemplate`.
   */
  readonly textAuto?: boolean | string;
}

/** `imshow` called with an image (returns the figure) or with an element first (renders it). */
export interface ImshowFunction {
  (img: ImshowInput, options?: ImshowOptions): ExpressFigure;
  (el: HTMLElement, img: ImshowInput, options?: ImshowOptions): Promise<Chart>;
}

/** numpy dtypes that decide `contrastRescaling: 'infer'` (`float` for everything else). */
type Dtype = 'uint8' | 'int8' | 'uint16' | 'int16' | 'uint32' | 'int32' | 'float';

/** An n-dimensional array: row-major values, `NaN` for gaps. */
interface NdArray {
  readonly shape: readonly number[];
  readonly data: Float64Array;
  readonly dtype: Dtype;
}

/** Largest value of each integer dtype (px's `_integer_ranges`). */
const INTEGER_MAX: Readonly<Record<Exclude<Dtype, 'float'>, number>> = {
  uint8: 255,
  int8: 127,
  uint16: 65535,
  int16: 32767,
  uint32: 4294967295,
  int32: 2147483647,
};

function typedDtype(v: ArrayBufferView): Dtype {
  if (v instanceof Uint8Array || v instanceof Uint8ClampedArray) return 'uint8';
  if (v instanceof Int8Array) return 'int8';
  if (v instanceof Uint16Array) return 'uint16';
  if (v instanceof Int16Array) return 'int16';
  if (v instanceof Uint32Array) return 'uint32';
  if (v instanceof Int32Array) return 'int32';
  return 'float';
}

function isArrayLike(v: unknown): v is ArrayLike<unknown> {
  return Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView));
}

function isImageData(v: unknown): v is ImageDataLike {
  return (
    typeof v === 'object' &&
    v !== null &&
    !isArrayLike(v) &&
    typeof (v as ImageDataLike).width === 'number' &&
    typeof (v as ImageDataLike).height === 'number' &&
    isArrayLike((v as ImageDataLike).data)
  );
}

/** `(3, 4)` / `(5,)`: a shape as numpy prints it, for error messages. */
function shapeText(shape: readonly number[]): string {
  return `(${shape.join(', ')}${shape.length === 1 ? ',' : ''})`;
}

/**
 * The image as an {@link NdArray}. Its dtype is the typed arrays' (when all its rows are one kind),
 * `uint8` for booleans (cast to 0 / 255, as px) and for plain integers within 0–255 (JavaScript's
 * stand-in for numpy's `uint8` images), else `float`.
 */
function toNdArray(img: unknown): NdArray {
  if (isImageData(img)) {
    const { width, height } = img;
    const data = Float64Array.from(img.data);
    if (data.length !== width * height * 4) {
      throw new Error(
        `imshow: ImageData of ${width}×${height} needs ${width * height * 4} values (got ${data.length}).`,
      );
    }
    return { shape: [height, width, 4], data, dtype: 'uint8' };
  }
  if (!isArrayLike(img)) {
    throw new Error(`imshow: img must be nested arrays or ImageData (got ${String(img)}).`);
  }
  const shape: number[] = [];
  for (let v: unknown = img; isArrayLike(v); v = v[0]) {
    shape.push(v.length);
    if (v.length === 0) break;
  }
  const size = shape.reduce((a, b) => a * b, 1);
  if (size === 0) throw new Error(`imshow: the image is empty (shape ${shapeText(shape)}).`);

  const data = new Float64Array(size);
  const kinds = new Set<Dtype | 'number'>();
  let bools = 0;
  let others = 0;
  let o = 0;
  const walk = (v: ArrayLike<unknown>, depth: number): void => {
    if (v.length !== shape[depth]) {
      throw new Error(
        `imshow: the image is ragged: dimension ${depth} has lengths ${shape[depth]} and ${v.length}.`,
      );
    }
    if (depth < shape.length - 1) {
      for (let i = 0; i < v.length; i++) {
        const child = v[i];
        if (!isArrayLike(child)) {
          throw new Error(`imshow: the image is ragged: expected an array at dimension ${depth}.`);
        }
        walk(child, depth + 1);
      }
      return;
    }
    kinds.add(ArrayBuffer.isView(v) ? typedDtype(v as unknown as ArrayBufferView) : 'number');
    for (let i = 0; i < v.length; i++) {
      const x = v[i];
      if (typeof x === 'number') {
        data[o++] = x;
        others++;
      } else if (typeof x === 'boolean') {
        data[o++] = x ? 1 : 0;
        bools++;
      } else if (typeof x === 'bigint') {
        data[o++] = Number(x);
        others++;
      } else if (isArrayLike(x)) {
        throw new Error(`imshow: the image is ragged: unexpected array at dimension ${depth + 1}.`);
      } else data[o++] = NaN;
    }
  };
  walk(img, 0);
  for (let i = 0; i < size; i++) if (!Number.isFinite(data[i])) data[i] = NaN;

  if (bools > 0 && others === 0) {
    for (let i = 0; i < size; i++) data[i] = (data[i] as number) * 255;
    return { shape, data, dtype: 'uint8' };
  }
  const [only] = kinds;
  if (kinds.size === 1 && only !== 'number' && only !== undefined) {
    return { shape, data, dtype: only };
  }
  let bytes = true;
  for (let i = 0; i < size && bytes; i++) {
    const x = data[i] as number;
    if (x === x && !(Number.isInteger(x) && x >= 0 && x <= 255)) bytes = false;
  }
  return { shape, data, dtype: bytes ? 'uint8' : 'float' };
}

/** `a` with its dimensions reordered: dimension `d` of the result is `perm[d]` of `a`. */
function transpose(a: NdArray, perm: readonly number[]): NdArray {
  if (perm.every((p, i) => p === i)) return a;
  const n = a.shape.length;
  const strides = new Array<number>(n);
  for (let d = n - 1, s = 1; d >= 0; d--) {
    strides[d] = s;
    s *= a.shape[d] as number;
  }
  const shape = perm.map((p) => a.shape[p] as number);
  const step = perm.map((p) => strides[p] as number);
  const data = new Float64Array(a.data.length);
  const index = new Array<number>(n).fill(0);
  for (let o = 0; o < data.length; o++) {
    let src = 0;
    for (let d = 0; d < n; d++) src += (index[d] as number) * (step[d] as number);
    data[o] = a.data[src] as number;
    for (let d = n - 1; d >= 0; d--) {
      if (((index[d] as number) += 1) < (shape[d] as number)) break;
      index[d] = 0;
    }
  }
  return { shape, data, dtype: a.dtype };
}

/** Smallest and largest non-gap values. */
function extent(data: Float64Array): [number, number] | undefined {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of data) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo <= hi ? [lo, hi] : undefined;
}

/**
 * px's `_infer_zmax_from_type`: the largest value of an integer dtype; for floats 1, 255 or
 * 65535 when the data stay within 5% above it, else 2³².
 */
function inferZmax(img: NdArray): number {
  if (img.dtype !== 'float') return INTEGER_MAX[img.dtype];
  const max = extent(img.data)?.[1] ?? 0;
  if (max <= 1.05) return 1;
  if (max <= 255 * 1.05) return 255;
  if (max <= 65535 * 1.05) return 65535;
  return 2 ** 32;
}

/**
 * px's `_vectorize_zvalue`: `zmin` / `zmax` as four per-channel values. A scalar or a single value
 * applies to the color channels, and alpha's limit is 0 for `zmin`, 255 for `zmax`.
 */
function vectorize(z: number | readonly number[], mode: 'min' | 'max'): number[] {
  const values = typeof z === 'number' ? [z] : [...z];
  const alpha = mode === 'min' ? 0 : 255;
  if (values.length === 1) return [...values, ...values, ...values, alpha];
  if (values.length === 3) return [...values, alpha];
  if (values.length === 4) return values;
  throw new Error(
    `imshow: z${mode} can be a scalar, or an iterable of length 1, 3 or 4. A value of [${values.join(', ')}] was passed for z${mode}.`,
  );
}

/**
 * px's `rescale_intensity` to `uint8`: clipped to `[lo, hi]`, stretched to 0–255 and truncated
 * (clipped to 0–255 when `lo === hi`). Gaps become 0.
 */
function rescale(v: number, lo: number, hi: number): number {
  if (v !== v) return 0;
  const c = Math.min(hi, Math.max(lo, v));
  return Math.trunc(lo === hi ? Math.min(255, Math.max(0, c)) : ((c - lo) / (hi - lo)) * 255);
}

/** A value as a PNG byte. */
function byte(v: number): number {
  return v === v ? Math.min(255, Math.max(0, Math.round(v))) : 0;
}

/** Nested rows of a 2D slice (`channels` 0) or of a `[row][col][channel]` slice, gaps as `null`. */
function nested(
  data: Float64Array,
  height: number,
  width: number,
  channels: number,
): (number | null)[][] | (number | null)[][][] {
  const value = (i: number) => {
    const v = data[i] as number;
    return v === v ? v : null;
  };
  return Array.from({ length: height }, (_, r) =>
    Array.from({ length: width }, (_, c) =>
      channels === 0
        ? value(r * width + c)
        : Array.from({ length: channels }, (_, k) => value((r * width + c) * channels + k)),
    ),
  ) as (number | null)[][] | (number | null)[][][];
}

/** A dimension index (negative counts from the end), checked. */
function dimension(key: string, value: unknown, ndim: number): number {
  const d = Number(value);
  if (!Number.isInteger(d) || d < -ndim || d >= ndim) {
    throw new Error(
      `imshow: '${key}' must be a dimension index of the image (${-ndim} to ${ndim - 1}; got ${String(value)}).`,
    );
  }
  return d < 0 ? d + ndim : d;
}

/** Evenly spaced image coordinates: `[v0, dv]` from the first two, checked. */
function imageCoordinates(
  letter: 'x' | 'y',
  values: ArrayLike<unknown> | undefined,
  length: number,
): [number | undefined, number | undefined] {
  if (values === undefined) return [undefined, undefined];
  const list = Array.from(values);
  if (!list.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw new Error(`imshow: only numerical values are accepted for ${letter}.`);
  }
  checkLength(letter, list.length, length);
  const [a, b] = list as number[];
  return [a, list.length > 1 ? (b as number) - (a as number) : 1];
}

function checkLength(letter: 'x' | 'y', given: number, length: number): void {
  if (given !== length) {
    throw new Error(
      `imshow: the length of the ${letter} vector (${given}) must match the length of the ${letter === 'x' ? 'second' : 'first'} dimension of the img matrix (${length}).`,
    );
  }
}

function build(img: ImshowInput, options: ImshowOptions): ExpressFigure {
  const given = options.labels ?? {};
  const labels = {
    x: given.x ?? '',
    y: given.y ?? '',
    color: given.color ?? '',
    facetCol: given.facet_col ?? given.facetCol ?? 'facet_col',
    animationFrame: given.animation_frame ?? given.animationFrame ?? 'animation_frame',
  };

  // Slice dimensions go first, animation before facets (px's `np.moveaxis`), so slice `i` of the
  // product (animation, facet) is the `i`-th block of the data.
  let array = toNdArray(img);
  const ndim = array.shape.length;
  const facet =
    options.facetCol === undefined ? undefined : dimension('facetCol', options.facetCol, ndim);
  const anim =
    options.animationFrame === undefined
      ? undefined
      : dimension('animationFrame', options.animationFrame, ndim);
  if (facet !== undefined && facet === anim) {
    throw new Error('imshow: facetCol and animationFrame must be different dimensions.');
  }
  const sliceDims = (facet === undefined ? 0 : 1) + (anim === undefined ? 0 : 1);
  const nFacets = facet === undefined ? 1 : (array.shape[facet] as number);
  const nFrames = anim === undefined ? 1 : (array.shape[anim] as number);
  const lead = [anim, facet].filter((d): d is number => d !== undefined);
  array = transpose(array, [
    ...lead,
    ...array.shape.map((_, d) => d).filter((d) => !lead.includes(d)),
  ]);
  const shape = array.shape.slice(sliceDims);
  const [height = 0, width = 0] = shape;
  const sliceSize = shape.reduce((a, b) => a * b, 1);
  const slices = Array.from({ length: nFacets * nFrames }, (_, i) =>
    array.data.subarray(i * sliceSize, (i + 1) * sliceSize),
  );

  // A real Args (on an empty table) for the template's colorscale and the facet grid's spacing.
  const args = prepare('imshow', [], {
    template: options.template,
    colorContinuousScale: options.colorContinuousScale ?? options.colorscale,
    facetColSpacing: options.facetColSpacing,
    facetRowSpacing: options.facetRowSpacing,
  });
  const binaryString = options.binaryString ?? ndim >= 3 + sliceDims;
  if (options.binaryFormat !== undefined && options.binaryFormat !== 'png') {
    throw new Error(`imshow: binaryFormat '${String(options.binaryFormat)}' is not supported.`);
  }

  // Contrast: fill in zmin / zmax only where the traces' own defaults would not do.
  let zmin = options.rangeColor?.[0] ?? options.zmin;
  let zmax = options.rangeColor?.[1] ?? options.zmax;
  const contrast = options.contrastRescaling ?? (ndim === 2 + sliceDims ? 'minmax' : 'infer');
  if (contrast === 'minmax') {
    const range = extent(array.data);
    if ((zmin !== undefined || binaryString) && zmax === undefined) zmax = range?.[1];
    if ((zmax !== undefined || binaryString) && zmin === undefined) zmin = range?.[0];
  } else {
    if (zmax === undefined && array.dtype !== 'uint8') zmax = inferZmax(array);
    if (zmin === undefined && zmax !== undefined) zmin = 0;
  }

  const traces: Record<string, unknown>[] = [];
  const axes: { x: Record<string, unknown>; y: Record<string, unknown> } = { x: {}, y: {} };
  let coloraxis: Record<string, unknown> | undefined;
  let hoverValue: string | undefined;
  let rescaled = false;

  if (shape.length === 2 && !binaryString) {
    // Single-channel data: heatmaps on one coloraxis.
    if (options.y !== undefined) checkLength('y', options.y.length, height);
    if (options.x !== undefined) checkLength('x', options.x.length, width);
    const texttemplate =
      options.textAuto === true
        ? '%{z}'
        : typeof options.textAuto === 'string'
          ? `%{z:${options.textAuto}}`
          : undefined;
    slices.forEach((slice, i) =>
      traces.push(
        defined({
          type: 'heatmap',
          x: options.x === undefined ? undefined : Array.from(options.x),
          y: options.y === undefined ? undefined : Array.from(options.y),
          z: nested(slice, height, width, 0),
          coloraxis: 'coloraxis',
          name: String(i),
          texttemplate,
        }),
      ),
    );
    axes.y['autorange'] = options.origin === 'lower' ? true : 'reversed';
    if ((options.aspect ?? 'equal') === 'equal') {
      axes.x['constrain'] = 'domain';
      axes.y['constrain'] = 'domain';
    }
    coloraxis = defined({
      colorscale: args.continuousScale,
      cmid: options.colorContinuousMidpoint,
      cmin: zmin,
      cmax: zmax,
    });
    if (labels.color) coloraxis['colorbar'] = { title: { text: labels.color } };
    hoverValue = '%{z}';
  } else if (
    (shape.length === 3 && (shape[2] === 3 || shape[2] === 4)) ||
    (shape.length === 2 && binaryString)
  ) {
    // RGB / RGBA pixels, or any image drawn from a PNG: image traces.
    const channels = shape.length === 3 ? (shape[2] as number) : 1;
    const zminV = zmin === undefined ? undefined : vectorize(zmin, 'min');
    const zmaxV = zmax === undefined ? undefined : vectorize(zmax, 'max');
    const [x0, dx] = imageCoordinates('x', options.x, width);
    const [y0, dy] = imageCoordinates('y', options.y, height);
    const place = defined({ x0, y0, dx, dy });
    if (binaryString) {
      slices.forEach((slice, i) => {
        const pixels = new Uint8Array(slice.length);
        for (let k = 0; k < slice.length; k++) {
          let v = slice[k] as number;
          if (zminV !== undefined && zmaxV !== undefined) {
            const ch = k % channels;
            const r = rescale(v, zminV[ch] as number, zmaxV[ch] as number);
            if (!(r === v)) rescaled = true;
            v = r;
          }
          pixels[k] = byte(v);
        }
        const source = pngDataURI(width, height, channels, pixels);
        traces.push({ type: 'image', source, name: String(i), ...place });
      });
    } else {
      slices.forEach((slice, i) =>
        traces.push(
          defined({
            type: 'image',
            z: nested(slice, height, width, channels),
            zmin: zminV?.slice(0, channels),
            zmax: zmaxV?.slice(0, channels),
            colormodel: channels === 3 ? 'rgb' : 'rgba256',
            name: String(i),
            ...place,
          }),
        ),
      );
    }
    if (options.origin === 'lower' || (dy !== undefined && dy < 0)) axes.y['autorange'] = true;
    if (dx !== undefined && dx < 0) axes.x['autorange'] = 'reversed';
    // Image traces make pixels square by default (`yaxis.scaleanchor`); 'auto' turns that off.
    if (options.aspect === 'auto') axes.y['scaleanchor'] = false;
    hoverValue =
      channels === 1 ? '%{z[0]}' : channels === 3 ? '[%{z[0]}, %{z[1]}, %{z[2]}]' : '%{z}';
  } else {
    throw new Error(
      `imshow only accepts 2D single-channel, RGB or RGBA images. An image of shape ${shapeText(array.shape)} was provided. Alternatively, 3- or 4-D single or multichannel datasets can be visualized using the \`facetCol\` or/and \`animationFrame\` arguments.`,
    );
  }

  // Hover: coordinates, plus the value unless the PNG holds rescaled values.
  const xName = labels.x || 'x';
  const yName = labels.y || 'y';
  const hovertemplate = rescaled
    ? `${xName}: %{x}<br>${yName}: %{y}<extra></extra>`
    : `${xName}: %{x}<br>${yName}: %{y}<br>${labels.color || 'color'}: ${hoverValue}<extra></extra>`;
  for (const trace of traces) trace['hovertemplate'] = hovertemplate;

  // The facet grid (a single cell without facets), as px's `init_figure`.
  const wrap = facet === undefined ? 0 : Math.max(0, Math.floor(options.facetColWrap ?? 0));
  const ncols = wrap ? Math.min(wrap, nFacets) : nFacets;
  const nrows = Math.ceil(nFacets / ncols);
  const plan: GridPlan = {
    nrows,
    ncols,
    wrap,
    facetCount: nFacets,
    colLabels:
      facet === undefined
        ? []
        : Array.from({ length: nFacets }, (_, i) => `${labels.facetCol}=${i}`),
    rowLabels: [],
    colorGiven: false,
    subplotType: 'xy',
  };
  const grid = layoutGrid(args, plan);
  const layout: Record<string, unknown> = { ...grid.layout };
  traces.forEach((trace, i) => {
    const f = i % nFacets;
    grid.place(trace, Math.floor(f / ncols) + 1, (f % ncols) + 1);
  });

  // Every cell's axes: orientation and aspect; titles on the outer axes.
  for (let col = 1; col <= ncols; col++) {
    let lowest = 0;
    for (let row = 1; row <= nrows; row++) if (grid.cell(row, col)) lowest = row;
    for (let row = 1; row <= nrows; row++) {
      const k = grid.cell(row, col);
      if (!k?.xaxis || !k.yaxis) continue;
      const xa = (layout[`xaxis${k.xaxis.slice(1)}`] ??= {}) as Record<string, unknown>;
      const ya = (layout[`yaxis${k.yaxis.slice(1)}`] ??= {}) as Record<string, unknown>;
      Object.assign(xa, axes.x);
      Object.assign(ya, axes.y);
      if (xa['constrain'] === 'domain') xa['scaleanchor'] = k.yaxis;
      if (labels.x && row === lowest) xa['title'] = { text: labels.x };
      if (labels.y && col === 1) ya['title'] = { text: labels.y };
    }
  }
  if (coloraxis) layout['coloraxis'] = coloraxis;
  for (const key of ['height', 'width'] as const) {
    if (options[key] !== undefined) layout[key] = options[key];
  }
  const tl = (args.template?.layout ?? {}) as Record<string, Record<string, unknown> | undefined>;
  if (options.title !== undefined) layout['title'] = { text: options.title };
  else if (tl['margin']?.['t'] === undefined) layout['margin'] = { t: 60 };
  if (options.template !== undefined) layout['template'] = options.template;

  if (nFrames < 2) return { data: traces, layout };
  const frames = Array.from({ length: nFrames }, (_, a) => ({
    name: String(a),
    data: traces.slice(a * nFacets, (a + 1) * nFacets),
  }));
  const figure: ExpressFigure = { data: frames[0]?.data ?? [], layout, frames };
  frameControls(figure, `${labels.animationFrame}=`);
  return figure;
}

/**
 * An image or a matrix (`px.imshow`). A 2D array becomes a `heatmap` on `layout.coloraxis`
 * (colorscale from the template, `zmin` / `zmax` from the data); an RGB / RGBA array
 * (`[row][col][channel]`) or `ImageData` becomes an `image` trace, drawn from a PNG data URI by
 * default. Rows run down from the top (`origin: 'upper'`) and pixels are square
 * (`aspect: 'equal'`). A third or fourth dimension can be spread over facets (`facetCol`) or
 * animation frames (`animationFrame`).
 *
 * @example
 * ```ts
 * const figure = imshow(
 *   [
 *     [1, 20, 30],
 *     [20, 1, 60],
 *   ],
 *   { textAuto: true, labels: { x: 'column', y: 'row', color: 'value' } },
 * );
 * await imshow(el, pixels, { facetCol: 0 }); // or render directly
 * ```
 * @throws {Error} For ragged or empty arrays, shapes other than 2D / RGB / RGBA per slice, and
 * `x` / `y` of the wrong length (or not numeric, for images).
 */
export const imshow = expressFunction<ImshowOptions>((img, options) =>
  // `expressFunction` types its first argument as table data; `ImshowFunction` retypes it.
  build(img as unknown as ImshowInput, options),
) as unknown as ImshowFunction;
