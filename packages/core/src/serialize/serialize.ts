/**
 * Figure ⇄ JSON (plan E18.3): the engine behind `chart.toJSON()` and `Holochart.fromJSON()`.
 *
 * {@link encodeFigure} turns an input figure into plain JSON data that survives
 * `JSON.parse(JSON.stringify(…))` unchanged; {@link decodeFigure} turns that back into a figure.
 * Typed arrays use Plotly's `{ dtype, bdata, shape }` encoding (see `typed-array.ts`), so figures
 * exchange with plotly.py / plotly.js without loss.
 *
 * Style functions (ADR-012, E8.6) cannot be serialized: they are evaluated into per-point arrays
 * where that is well defined, and dropped otherwise, with a warning either way.
 */
import { isArrayLike } from '../coerce/coerce.ts';
import { resolveDataRefs } from '../data/datasets.ts';
import type { FigureInput } from '../defaults/types.ts';
import type { Registry } from '../registry/types.ts';
import type { ObjectNode, SchemaNode, TypedArray } from '../schema/types.ts';
import { isAttr, isItemsNode, isObjectNode, resolveChild } from '../schema/walk.ts';
import { isPlainObject } from '../util/objects.ts';
import {
  decodeTypedArray,
  encodeTypedArray,
  encodeTypedMatrix,
  isTypedArraySpec,
} from './typed-array.ts';

/** Any value `JSON.parse` can return. */
export type JSONValue =
  null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };

/** A figure encoded by {@link encodeFigure}. Keys the input figure did not set are absent. */
export interface EncodedFigure {
  data?: JSONValue;
  layout?: JSONValue;
  config?: JSONValue;
  frames?: JSONValue;
  datasets?: JSONValue;
  [key: string]: JSONValue | undefined;
}

/** Why {@link encodeFigure} changed or dropped a value. */
export type SerializeWarningCode =
  /** A style function was evaluated into a per-point array. */
  | 'function-evaluated'
  /** A function was dropped (not on an `arrayOk` trace attribute, or no data length). */
  | 'function-dropped'
  /** A style function threw while being evaluated; the attribute was dropped. */
  | 'function-failed'
  /** An invalid `Date` was written as `null`. */
  | 'invalid-date'
  /** A BigInt (or BigInt64/BigUint64 array) was written as (possibly rounded) numbers. */
  | 'bigint'
  /** A value JSON cannot hold (Map, Set, class instance, symbol, DataView, …) was dropped. */
  | 'unsupported-value'
  /** A reference back to an enclosing object or array was dropped. */
  | 'cycle';

/** A warning reported through {@link EncodeFigureOptions.onWarning}. */
export interface SerializeWarning {
  /** Where in the figure, e.g. `data[0].marker.color`. */
  readonly path: string;
  readonly code: SerializeWarningCode;
  readonly message: string;
}

/** Options for {@link encodeFigure}. */
export interface EncodeFigureOptions {
  /**
   * Registry used to find trace schemas, so style functions on `arrayOk` attributes can be
   * evaluated. Without it every function is dropped.
   */
  readonly registry?: Pick<Registry, 'getTraceSchema'>;
  /**
   * Receives each warning, at most once per path per call. Default: `console.warn`.
   */
  readonly onWarning?: (warning: SerializeWarning) => void;
}

// ---------------------------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------------------------

const DROP = Symbol('drop');
type Encoded = JSONValue | typeof DROP;

/** Per-point view of a trace's data arrays, used to call style functions. */
interface PointSource {
  readonly length: number;
  point(i: number): Record<string, unknown>;
}

/** The trace a value sits in, for evaluating style functions. */
interface TraceScope {
  /** The input trace with `'@column'` references resolved. */
  readonly trace: Readonly<Record<string, unknown>>;
  /** Lazily built; `null` when the trace has no data arrays. */
  source(): PointSource | null;
}

interface Scope {
  /** Schema node of the value, when inside a trace with a registered type. */
  readonly node?: SchemaNode | undefined;
  readonly trace?: TraceScope | undefined;
  /** Whether a `toJSON` method may be honored (never twice in a row, to avoid loops). */
  readonly allowToJSON?: boolean;
}

interface Ctx {
  readonly registry: EncodeFigureOptions['registry'];
  readonly datasets: unknown;
  readonly ancestors: Set<object>;
  readonly warned: Set<string>;
  readonly onWarning: (warning: SerializeWarning) => void;
}

function warn(ctx: Ctx, path: string, code: SerializeWarningCode, message: string): void {
  if (ctx.warned.has(path)) return;
  ctx.warned.add(path);
  ctx.onWarning({ path, code, message });
}

function defaultWarning(w: SerializeWarning): void {
  console.warn(`holochart: toJSON: ${w.path}: ${w.message}`);
}

function childPath(base: string, key: string | number): string {
  return typeof key === 'number' ? `${base}[${key}]` : base === '' ? key : `${base}.${key}`;
}

/** Assign without triggering the `__proto__` setter (keys come from untrusted input). */
function setKey(out: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__') {
    Object.defineProperty(out, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  } else out[key] = value;
}

function describe(v: unknown): string {
  if (typeof v === 'symbol') return 'a symbol';
  const name = (v as { constructor?: { name?: unknown } }).constructor?.name;
  return typeof name === 'string' && name !== '' ? `a ${name}` : 'an object';
}

function isTypedArray(v: unknown): v is TypedArray {
  return (
    ArrayBuffer.isView(v) &&
    !(v instanceof DataView) &&
    !(v instanceof BigInt64Array) &&
    !(v instanceof BigUint64Array)
  );
}

function encodeNumber(n: number): JSONValue {
  // What JSON.stringify would write, so the output is stable under a JSON round trip.
  if (!Number.isFinite(n)) return null;
  return n === 0 ? 0 : n;
}

function encodeFunction(
  fn: (...args: unknown[]) => unknown,
  path: string,
  ctx: Ctx,
  scope: Scope,
): Encoded {
  const { node, trace } = scope;
  if (!isAttr(node) || node.arrayOk !== true || trace === undefined) {
    const why =
      ctx.registry === undefined
        ? 'pass `registry` to evaluate style functions'
        : 'not a per-point (arrayOk) attribute of a registered trace';
    warn(ctx, path, 'function-dropped', `function dropped: not serializable (${why})`);
    return DROP;
  }
  const source = trace.source();
  if (source === null) {
    warn(
      ctx,
      path,
      'function-dropped',
      'style function dropped: the trace has no data arrays to evaluate it over',
    );
    return DROP;
  }
  const values: unknown[] = new Array<unknown>(source.length);
  try {
    for (let i = 0; i < source.length; i++) values[i] = fn(source.point(i), i, trace.trace);
  } catch (err) {
    warn(
      ctx,
      path,
      'function-failed',
      `style function threw (${err instanceof Error ? err.message : String(err)}); dropped`,
    );
    return DROP;
  }
  warn(
    ctx,
    path,
    'function-evaluated',
    `style function evaluated into ${source.length} per-point values (functions are not serializable)`,
  );
  return encodeValue(values, path, ctx, {});
}

function encodeArray(arr: readonly unknown[], path: string, ctx: Ctx, scope: Scope): JSONValue {
  if (arr.length > 0 && isTypedArray(arr[0])) {
    const matrix = encodeTypedMatrix(arr);
    if (matrix !== undefined) return matrix as unknown as JSONValue;
  }
  const item = isItemsNode(scope.node) ? scope.node.item : undefined;
  const out: JSONValue[] = new Array<JSONValue>(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const v = encodeValue(arr[i], childPath(path, i), ctx, { node: item, trace: scope.trace });
    // Like JSON.stringify: an unrepresentable element becomes null, keeping indices aligned.
    out[i] = v === DROP ? null : v;
  }
  return out;
}

function encodeObject(
  obj: Readonly<Record<string, unknown>>,
  path: string,
  ctx: Ctx,
  scope: Scope,
): JSONValue {
  const node = isObjectNode(scope.node) ? scope.node : undefined;
  const out: Record<string, JSONValue> = {};
  for (const key of Object.keys(obj)) {
    const child = node === undefined ? undefined : resolveChild(node, key);
    const v = encodeValue(obj[key], childPath(path, key), ctx, { node: child, trace: scope.trace });
    if (v !== DROP) setKey(out, key, v);
  }
  return out;
}

function encodeValue(v: unknown, path: string, ctx: Ctx, scope: Scope): Encoded {
  switch (typeof v) {
    case 'undefined':
      return DROP;
    case 'string':
    case 'boolean':
      return v;
    case 'number':
      return encodeNumber(v);
    case 'bigint': {
      const n = Number(v);
      if (BigInt(n) !== v) warn(ctx, path, 'bigint', `BigInt ${v} rounded to ${n}`);
      return n;
    }
    case 'function':
      return encodeFunction(v as (...args: unknown[]) => unknown, path, ctx, scope);
    case 'symbol':
      warn(ctx, path, 'unsupported-value', 'symbols are not serializable; dropped');
      return DROP;
  }
  if (v === null) return null;
  const obj = v as object;
  if (v instanceof Date) {
    const t = v.getTime();
    if (Number.isNaN(t)) {
      warn(ctx, path, 'invalid-date', 'invalid Date written as null');
      return null;
    }
    return v.toISOString();
  }
  if (isTypedArray(v)) return encodeTypedArray(v) as unknown as JSONValue;
  if (v instanceof BigInt64Array || v instanceof BigUint64Array) {
    warn(
      ctx,
      path,
      'bigint',
      `${describe(v)} written as a plain array of numbers (Plotly has no 64-bit integer dtype)`,
    );
    return Array.from(v, Number);
  }
  if (ctx.ancestors.has(obj)) {
    warn(ctx, path, 'cycle', 'circular reference dropped');
    return DROP;
  }
  const plainArray = Array.isArray(v);
  if (!plainArray && !isPlainObject(v)) {
    // Honor toJSON (Temporal, Luxon, …) like JSON.stringify does, but only once in a row.
    const toJSON = (v as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === 'function' && scope.allowToJSON !== false) {
      ctx.ancestors.add(obj);
      try {
        return encodeValue(toJSON.call(v) as unknown, path, ctx, { ...scope, allowToJSON: false });
      } finally {
        ctx.ancestors.delete(obj);
      }
    }
    warn(ctx, path, 'unsupported-value', `${describe(v)} is not serializable; dropped`);
    return DROP;
  }
  ctx.ancestors.add(obj);
  try {
    return plainArray
      ? encodeArray(v as readonly unknown[], path, ctx, scope)
      : encodeObject(v as Record<string, unknown>, path, ctx, scope);
  } finally {
    ctx.ancestors.delete(obj);
  }
}

/**
 * Per-point access to a trace's data arrays: every top-level `data_array` attribute that holds an
 * array (`x`, `y`, `customdata`, …, after `'@column'` references are resolved). The length is the
 * shorter of `x` and `y` when either is present (what gets drawn), otherwise the length of the
 * first data array.
 */
function pointSource(
  trace: Readonly<Record<string, unknown>>,
  schema: ObjectNode,
): PointSource | null {
  const columns: [string, ArrayLike<unknown>][] = [];
  for (const [key, node] of Object.entries(schema.children)) {
    const v = trace[key];
    if (isAttr(node) && node.valType === 'data_array' && isArrayLike(v)) columns.push([key, v]);
  }
  const first = columns[0];
  if (first === undefined) return null;
  const xy = columns.filter(([k]) => k === 'x' || k === 'y').map(([, c]) => c.length);
  const length = xy.length > 0 ? Math.min(...xy) : first[1].length;
  return {
    length,
    point(i) {
      const p: Record<string, unknown> = {};
      for (const [k, c] of columns) setKey(p, k, c[i]);
      return p;
    },
  };
}

/** Trace scope for `trace`; `base` is the figure trace a frame trace updates, if any. */
function traceScope(
  trace: Readonly<Record<string, unknown>>,
  base: unknown,
  path: string,
  ctx: Ctx,
): Scope {
  const baseTrace = isPlainObject(base) ? base : undefined;
  const raw = trace['type'] ?? baseTrace?.['type'];
  // Same default as supply-defaults.
  const type = typeof raw === 'string' && raw !== '' ? raw : 'scatter';
  const schema = ctx.registry?.getTraceSchema(type);
  if (schema === undefined) return {};
  const resolve = (t: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> =>
    resolveDataRefs(t, schema, ctx.datasets as FigureInput['datasets'], path).trace;
  const resolved = resolve(trace);
  let source: PointSource | null | undefined;
  return {
    node: schema,
    trace: {
      trace: resolved,
      source() {
        // A frame trace often carries only styles; fall back to the trace it updates.
        source ??=
          pointSource(resolved, schema) ??
          (baseTrace === undefined ? null : pointSource(resolve(baseTrace), schema));
        return source;
      },
    },
  };
}

function encodeTraces(
  data: unknown,
  path: string,
  ctx: Ctx,
  bases: (j: number) => unknown,
): Encoded {
  if (!Array.isArray(data)) return encodeValue(data, path, ctx, {});
  ctx.ancestors.add(data);
  try {
    return data.map((t: unknown, j) => {
      const p = childPath(path, j);
      const scope = isPlainObject(t) ? traceScope(t, bases(j), p, ctx) : {};
      const v = encodeValue(t, p, ctx, scope);
      return v === DROP ? null : v;
    });
  } finally {
    ctx.ancestors.delete(data);
  }
}

function encodeFrames(frames: unknown, data: unknown, ctx: Ctx): Encoded {
  if (!Array.isArray(frames)) return encodeValue(frames, 'frames', ctx, {});
  const figureData: readonly unknown[] = Array.isArray(data) ? data : [];
  ctx.ancestors.add(frames);
  try {
    return frames.map((frame: unknown, k) => {
      const path = childPath('frames', k);
      if (!isPlainObject(frame) || ctx.ancestors.has(frame)) {
        const v = encodeValue(frame, path, ctx, {});
        return v === DROP ? null : v;
      }
      // Frame traces update figure traces: `frame.traces[j]` names the index, else position j.
      const targets = frame['traces'];
      const bases = (j: number): unknown => {
        const idx: unknown = Array.isArray(targets) ? targets[j] : j;
        return typeof idx === 'number' ? figureData[idx] : undefined;
      };
      const out: Record<string, JSONValue> = {};
      ctx.ancestors.add(frame);
      try {
        for (const key of Object.keys(frame)) {
          const p = childPath(path, key);
          const v =
            key === 'data'
              ? encodeTraces(frame[key], p, ctx, bases)
              : encodeValue(frame[key], p, ctx, {});
          if (v !== DROP) setKey(out, key, v);
        }
      } finally {
        ctx.ancestors.delete(frame);
      }
      return out;
    });
  } finally {
    ctx.ancestors.delete(frames);
  }
}

/**
 * Encode an input figure as JSON-safe data: `JSON.parse(JSON.stringify(out))` deep-equals `out`.
 * The input is never mutated.
 *
 * - **Typed arrays** become Plotly's `{ dtype, bdata }` (bit-exact, so NaN, -0 and ±Infinity
 *   survive). An array of equal-length typed arrays of one type (a heatmap `z` as
 *   `Float64Array[]`) becomes one spec with `shape: 'rows,cols'`. `Uint8ClampedArray` is `'u1c'`.
 *   `BigInt64Array`/`BigUint64Array` have no Plotly dtype: they become plain number arrays (with a
 *   `bigint` warning), as do BigInt scalars.
 * - **Plain numbers** follow JSON: NaN and ±Infinity become `null` (a gap, as in Plotly), -0
 *   becomes 0. Use a typed array to keep them.
 * - **Dates** become ISO strings (`toISOString()`, UTC), which Holochart reads back as dates. An
 *   invalid Date becomes `null`.
 * - **Functions** (ADR-012). A function on an `arrayOk` attribute of a trace whose type is in
 *   `registry` is evaluated into a per-point array (E8.6): `fn(point, i, trace)` for each point
 *   `i`, where `point` holds the i-th element of each of the trace's top-level data arrays (`x`,
 *   `y`, `customdata`, …; `'@column'` references resolved) and `trace` is the input trace. The
 *   point count is the shorter of `x`/`y`, else the first data array's length; frame traces
 *   without data arrays use the figure trace they update. Every other function (config callbacks
 *   such as `renderHover`, non-`arrayOk` attributes, traces without data or registry) is dropped,
 *   as is one that throws.
 * - **Everything else**: `undefined` keys are omitted and `undefined` array elements become `null`
 *   (as in JSON). Objects with a `toJSON` method are encoded through it. Symbols, Maps, Sets,
 *   DataViews, ArrayBuffers, other class instances and circular references are dropped (`null` in
 *   arrays).
 *
 * Every lossy step reports a {@link SerializeWarning}, once per path.
 *
 * @example
 * ```ts
 * const json = encodeFigure(
 *   { data: [{ type: 'scatter', x: Float64Array.of(1, 2), y: [3, 4],
 *              marker: { color: (p) => (p.y > 3 ? 'red' : 'gray') } }] },
 *   { registry },
 * );
 * // json.data[0].x → { dtype: 'f8', bdata: 'AAAAAAAA8D8AAAAAAAAAQA==' }
 * // json.data[0].marker.color → ['gray', 'red'] (with a 'function-evaluated' warning)
 * ```
 */
export function encodeFigure(
  figure: FigureInput,
  options: EncodeFigureOptions = {},
): EncodedFigure {
  if (!isPlainObject(figure)) throw new TypeError('encodeFigure: the figure must be an object');
  const ctx: Ctx = {
    registry: options.registry,
    datasets: figure['datasets'],
    ancestors: new Set([figure]),
    warned: new Set(),
    onWarning: options.onWarning ?? defaultWarning,
  };
  const out: EncodedFigure = {};
  for (const key of Object.keys(figure)) {
    const v: unknown = figure[key];
    let enc: Encoded;
    if (key === 'data') enc = encodeTraces(v, 'data', ctx, () => undefined);
    else if (key === 'frames') enc = encodeFrames(v, figure['data'], ctx);
    else enc = encodeValue(v, key, ctx, {});
    if (enc !== DROP) setKey(out, key, enc);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------------------------

function decodeValue(v: unknown, path: string): unknown {
  if (Array.isArray(v)) return v.map((item: unknown, i) => decodeValue(item, childPath(path, i)));
  if (!isPlainObject(v)) return v;
  if (isTypedArraySpec(v)) {
    try {
      return decodeTypedArray(v);
    } catch (err) {
      throw new Error(`decodeFigure: ${path}: ${(err as Error).message}`, { cause: err });
    }
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(v)) setKey(out, key, decodeValue(v[key], childPath(path, key)));
  return out;
}

/**
 * Decode a figure encoded by {@link encodeFigure} (or by Plotly): every
 * `{ dtype, bdata, shape? }` spec, anywhere in the figure, becomes a typed array again (a 2D shape
 * gives an array of row typed arrays, as plotly.js does). ISO date strings stay strings, which
 * Holochart accepts wherever it accepts dates. Accepts the JSON text or the parsed value; the
 * input is never mutated.
 *
 * Throws if the input is not an object, or a spec is malformed (bad base64, byte length or shape).
 *
 * @example
 * ```ts
 * const figure = decodeFigure('{"data":[{"x":{"dtype":"f8","bdata":"AAAAAAAA8D8AAAAAAAAAQA=="}}]}');
 * // figure.data[0].x → Float64Array [1, 2]
 * ```
 */
export function decodeFigure(json: unknown): FigureInput {
  const value: unknown = typeof json === 'string' ? JSON.parse(json) : json;
  if (!isPlainObject(value)) throw new TypeError('decodeFigure: the figure must be an object');
  return decodeValue(value, '') as FigureInput;
}
