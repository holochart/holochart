/**
 * Update API semantics (plan E7.1) and the mapping from core's edit-type plan (E1.7) to what the
 * runtime re-runs. Pure: no chart state, no renderer.
 */
import {
  getIn,
  isPlainObject,
  isTypedArray,
  parsePath,
  planUpdate,
  type Change,
  type FullLayout,
  type FullTrace,
  type PathSegment,
  type Registry,
  type Stage,
} from '@mk7s/holochart-core';
import type { TraceUpdatePlan } from './contracts.ts';

/** Attribute-string edits: `{ 'marker.color': 'red', 'xaxis.range[0]': 2 }`. */
export type AttributeUpdate = Readonly<Record<string, unknown>>;

// ---- Applying edits -----------------------------------------------------------------------------

/**
 * Copy-on-write write of `value` at `segs`: returns a new root with fresh containers along the path
 * and everything else shared, so the caller's objects are never mutated. `undefined` deletes an
 * object key.
 *
 * @throws When an intermediate value exists but is not an object or array (overwriting it would
 * silently drop data), mirroring core's `setIn`.
 */
function setInCopy(obj: unknown, segs: readonly PathSegment[], i: number, value: unknown): unknown {
  if (i === segs.length) return value;
  const seg = segs[i] as PathSegment;
  let copy: Record<PathSegment, unknown>;
  if (obj === undefined || obj === null) {
    if (value === undefined) return obj;
    copy = (typeof seg === 'number' ? [] : {}) as Record<PathSegment, unknown>;
  } else if (Array.isArray(obj)) {
    copy = obj.slice() as unknown as Record<PathSegment, unknown>;
  } else if (typeof obj === 'object') {
    copy = { ...(obj as Record<string, unknown>) };
  } else {
    throw new Error(`Cannot set '${String(segs.join('.'))}': a parent value is not an object`);
  }
  const current = Object.hasOwn(copy, seg) ? copy[seg] : undefined;
  const child = setInCopy(current, segs, i + 1, value);
  if (child === undefined && !Array.isArray(copy)) delete copy[seg];
  else copy[seg] = child;
  return copy;
}

/**
 * Apply attribute-string edits to `target` without mutating it (plan E7.1): `null` resets an
 * attribute to its default (removes it), `undefined` is ignored.
 *
 * @returns The new object (or `target` itself when nothing changed).
 * @throws On malformed paths (see core `parsePath`).
 */
export function applyEdits<T>(target: T, edits: AttributeUpdate): T {
  let out: unknown = target ?? {};
  for (const [path, value] of Object.entries(edits)) {
    if (value === undefined) continue;
    out = setInCopy(out, parsePath(path), 0, value === null ? undefined : value);
  }
  return out as T;
}

/**
 * Split a restyle into per-trace edits (Plotly semantics): an array value holds one value per
 * listed trace (cycling when shorter), so data arrays must be wrapped (`{ x: [[1, 2, 3]] }`).
 * Typed arrays and other values apply to every listed trace as-is. `undefined` entries skip that
 * trace.
 */
export function distributeRestyle(
  update: AttributeUpdate,
  traces: readonly number[],
): Map<number, Record<string, unknown>> {
  const out = new Map<number, Record<string, unknown>>();
  traces.forEach((traceIndex, k) => {
    const edits: Record<string, unknown> = {};
    for (const [path, value] of Object.entries(update)) {
      const v = Array.isArray(value)
        ? value.length === 0
          ? undefined
          : (value[k % value.length] as unknown)
        : value;
      if (v !== undefined) edits[path] = v;
    }
    out.set(traceIndex, edits);
  });
  return out;
}

/**
 * Flatten a nested patch into attribute strings, recursing into plain objects only: arrays, typed
 * arrays and other values are leaves (`{ marker: { color: 'red' } }` → `{ 'marker.color': 'red' }`).
 * This is what makes `chart.update({ data: [{ marker: { color } }] })` a deep merge.
 */
export function flattenPatch(
  patch: unknown,
  prefix = '',
  out: Record<string, unknown> = {},
): Record<string, unknown> {
  if (!isPlainObject(patch)) return out;
  for (const [key, value] of Object.entries(patch)) {
    const path = prefix ? `${prefix}.${key}` : key;
    // An empty object is a no-op in a deep merge, not "replace the container with {}".
    if (isPlainObject(value)) flattenPatch(value, path, out);
    else out[path] = value;
  }
  return out;
}

const RANGE_PATH = /^([xy]axis\d*)\.range(?:\[([01])\])?$/;

/**
 * Relayout side effects on axis ranges (Plotly semantics): setting a range (or one end of it)
 * turns that axis' autorange off, and setting one end fills the other from the range in use.
 */
export function withRangeImplications(
  update: AttributeUpdate,
  layoutIn: Readonly<Record<string, unknown>>,
  fullLayout: FullLayout | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...update };
  for (const [path, value] of Object.entries(update)) {
    const m = RANGE_PATH.exec(path);
    if (!m || value === undefined) continue;
    const axis = m[1] as string;
    if (value !== null && !(`${axis}.autorange` in update)) out[`${axis}.autorange`] = false;
    if (m[2] !== undefined && !(`${axis}.range` in update)) {
      const current = getIn(layoutIn, `${axis}.range`);
      if (!Array.isArray(current) || current.length !== 2) {
        // `range[0]` and `range[1]` in one update (a zoom) fill the same array.
        const pending = out[`${axis}.range`];
        const inUse = Array.isArray(pending)
          ? pending
          : (fullLayout?.[axis] as { range?: unknown } | undefined)?.range;
        if (Array.isArray(inUse) && inUse.length === 2) {
          const filled = [...(inUse as unknown[])];
          filled[Number(m[2])] = value;
          delete out[path];
          out[`${axis}.range`] = filled;
        }
      }
    }
  }
  return out;
}

// ---- Planning -----------------------------------------------------------------------------------

/** The effective trace type of an input trace, defaulted like supply-defaults does. */
export function inputTraceType(trace: unknown): string {
  const t = isPlainObject(trace) ? trace['type'] : undefined;
  return typeof t === 'string' && t !== '' ? t : 'scatter';
}

/** Declared stages for edits of one trace (`calcIfAutorange` resolved when `full*` are given). */
export function planTraceEdit(
  paths: Iterable<string>,
  type: string,
  traceIndex: number,
  registry: Registry,
  full?: { fullData: readonly FullTrace[]; fullLayout: FullLayout },
): Set<Stage> {
  const changes: Change[] = [];
  for (const path of paths) changes.push({ target: 'trace', type, path, traceIndex });
  return planUpdate(changes, { registry, ...(full ?? {}) });
}

/** Declared stages for layout edits. */
export function planLayoutEdit(paths: Iterable<string>, registry: Registry): Set<Stage> {
  const changes: Change[] = [];
  for (const path of paths) changes.push({ target: 'layout', path });
  return planUpdate(changes, { registry });
}

/** Stages after which the figure's layout (sizes, autorange, transforms) must be recomputed. */
const LAYOUT_STAGES: readonly Stage[] = ['calc', 'crossTraceCalc', 'layout', 'ticks', 'plot'];

/** Whether declared stages require the layout step (margins, domains, autorange, transforms). */
export function needsLayout(stages: ReadonlySet<Stage>): boolean {
  return LAYOUT_STAGES.some((s) => stages.has(s));
}

/**
 * What a trace view must do, from the stages declared for the trace itself and for the layout.
 *
 * Trace-level `plot` means "re-read the trace" (e.g. `name`, draw order), but layout-level
 * `plot`/`ticks`/`layout` (an axis range, the figure size) only move things: those give traces a
 * new transform and nothing else, so zooming never re-uploads buffers. Layout-level `style`
 * (`colorway`) restyles every trace; layout-level `calc` (axis `type`) recalcs every trace.
 */
export function tracePlan(
  traceStages: ReadonlySet<Stage>,
  layoutStages: ReadonlySet<Stage>,
  options: { forceCalc: boolean; layoutRan: boolean },
): TraceUpdatePlan {
  const calc = options.forceCalc || traceStages.has('calc') || layoutStages.has('calc');
  const plot =
    calc ||
    traceStages.has('plot') ||
    traceStages.has('crossTraceCalc') ||
    layoutStages.has('crossTraceCalc');
  const style = plot || traceStages.has('style') || layoutStages.has('style');
  return { calc, plot, style, transform: options.layoutRan };
}

// ---- Streaming (extendTraces / prependTraces, E7.2) --------------------------------------------

/**
 * `maxPoints` of `extendTraces` / `prependTraces` (Plotly semantics): one number for every key
 * and trace, or per attribute string an array with one number per listed trace. The options form
 * `{ maxPoints: n }` (plan §7.2) is accepted too. Negative or non-numeric: no limit.
 */
export type MaxPoints =
  number | Readonly<Record<string, readonly number[]>> | { readonly maxPoints: number };

/** Streaming updates: per attribute string, one array of new values per listed trace. */
export type StreamUpdate = Readonly<Record<string, readonly ArrayLike<unknown>[]>>;

type TypedArray = Exclude<ReturnType<typeof asTyped>, undefined>;
function asTyped(v: unknown) {
  return isTypedArray(v) && !(v instanceof BigInt64Array || v instanceof BigUint64Array)
    ? (v as Float64Array | Float32Array | Int32Array | Uint8Array)
    : undefined;
}

function isArrayOrTyped(v: unknown): v is ArrayLike<unknown> {
  return Array.isArray(v) || isTypedArray(v);
}

/**
 * Plotly's argument checks for `extendTraces` / `prependTraces` (same error messages). Returns
 * the normalized (non-negative) trace indices.
 *
 * @throws On a malformed update, bad or repeated indices, or a `maxPoints` object that does not
 * match the update's keys and trace count.
 */
export function assertStreamArgs(
  update: unknown,
  indices: unknown,
  maxPoints: unknown,
  traceCount: number,
): number[] {
  if (!isPlainObject(update)) throw new Error('update must be a key:value object');
  if (indices === undefined) throw new Error('indices must be an integer or array of integers');
  const list = (Array.isArray(indices) ? indices : [indices]) as unknown[];
  const out: number[] = [];
  for (const index of list) {
    if (typeof index !== 'number' || !Number.isInteger(index)) {
      throw new Error('all values in indices must be integers');
    }
    if (index >= traceCount || index < -traceCount) {
      throw new Error('indices must be valid indices for gd.data.');
    }
    const i = index < 0 ? traceCount + index : index;
    if (out.includes(i)) throw new Error('each index in indices must be unique.');
    out.push(i);
  }
  const perKey = isPlainObject(maxPoints) && !isOptionsForm(maxPoints);
  for (const [key, value] of Object.entries(update)) {
    if (!Array.isArray(value) || value.length !== out.length) {
      throw new Error(`attribute ${key} must be an array of length equal to indices array length`);
    }
    const mp = perKey ? (maxPoints as Record<string, unknown>)[key] : undefined;
    if (perKey && (!Array.isArray(mp) || mp.length !== value.length)) {
      throw new Error(
        'when maxPoints is set as a key:value object it must contain a 1:1 correspondence with the keys and number of traces in the update object',
      );
    }
    value.forEach((insert: unknown, j: number) => {
      if (!isArrayOrTyped(insert))
        throw new Error(`attribute: ${key} index: ${j} must be an array`);
    });
  }
  return out;
}

function isOptionsForm(v: Readonly<Record<string, unknown>>): boolean {
  const keys = Object.keys(v);
  return keys.length === 1 && keys[0] === 'maxPoints' && !Array.isArray(v['maxPoints']);
}

/** The point limit for attribute `key` of the `k`-th listed trace; -1 means no limit. */
export function maxPointsFor(maxPoints: unknown, key: string, k: number): number {
  let v: unknown = maxPoints;
  if (isPlainObject(maxPoints)) {
    v = isOptionsForm(maxPoints) ? maxPoints['maxPoints'] : (maxPoints[key] as unknown[])[k];
  }
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : -1;
}

/** Result of {@link spliceArray}. */
export interface SpliceResult {
  readonly value: ArrayLike<unknown>;
  /** Items removed from the other end by the limit. */
  readonly removed: number;
}

/** Element ranges `[lo, hi)` written so far into buffers created by {@link spliceArray}. */
const OWNED = new WeakMap<ArrayBufferLike, { lo: number; hi: number }>();

/**
 * `extendTraces` (`at: 'end'`) / `prependTraces` (`at: 'start'`) on one array (Plotly's
 * `updateArray`): the values of `target` and `insert` joined, keeping at most `maxp` (≥ 0) from
 * the end just written (extend keeps the last ones, prepend the first ones). Neither input is
 * mutated.
 *
 * Plain arrays give a new plain array. Typed arrays give a typed array of the target's type (a
 * plain or differently typed `insert` is converted, where Plotly throws), as a view into a buffer
 * with room to grow: the next splice of that same view writes in place, so a steady stream
 * allocates only when the room runs out (amortized O(inserted) per call). Earlier views are
 * never written to.
 */
export function spliceArray(
  target: ArrayLike<unknown>,
  insert: ArrayLike<unknown>,
  maxp: number,
  at: 'end' | 'start',
): SpliceResult {
  const total = target.length + insert.length;
  const keep = maxp >= 0 ? Math.min(maxp, total) : total;
  const removed = total - keep;
  const typed = asTyped(target);
  if (!typed) {
    const joined =
      at === 'end'
        ? [...Array.from(target), ...Array.from(insert)]
        : [...Array.from(insert), ...Array.from(target)];
    return { value: at === 'end' ? joined.slice(removed) : joined.slice(0, keep), removed };
  }
  const ctor = typed.constructor as new (n: number | ArrayBufferLike) => TypedArray;
  const size = typed.BYTES_PER_ELEMENT;
  const t0 = typed.byteOffset / size;
  const t1 = t0 + typed.length;
  const capacity = typed.buffer.byteLength / size;
  const own = OWNED.get(typed.buffer);
  const values = insert as ArrayLike<number>;
  if (own && at === 'end' && own.hi === t1 && t1 + insert.length <= capacity) {
    const all = new ctor(typed.buffer);
    all.set(values, t1);
    own.hi = t1 + insert.length;
    return { value: all.subarray(own.hi - keep, own.hi), removed };
  }
  if (own && at === 'start' && own.lo === t0 && t0 - insert.length >= 0) {
    const all = new ctor(typed.buffer);
    all.set(values, t0 - insert.length);
    own.lo = t0 - insert.length;
    return { value: all.subarray(own.lo, own.lo + keep), removed };
  }
  // New buffer with as much room again on the growing side.
  const room = keep + 64;
  const all = new ctor(keep + room);
  const lo = at === 'end' ? 0 : room;
  if (at === 'end') {
    const fromInsert = Math.min(keep, insert.length);
    const fromTarget = keep - fromInsert;
    all.set(typed.subarray(typed.length - fromTarget), lo);
    all.set(sliceNumbers(values, insert.length - fromInsert, insert.length), lo + fromTarget);
  } else {
    const fromInsert = Math.min(keep, insert.length);
    all.set(sliceNumbers(values, 0, fromInsert), lo);
    all.set(typed.subarray(0, keep - fromInsert), lo + fromInsert);
  }
  OWNED.set(all.buffer, { lo, hi: lo + keep });
  return { value: all.subarray(lo, lo + keep), removed };
}

function sliceNumbers(v: ArrayLike<number>, a: number, b: number): ArrayLike<number> {
  if (a === 0 && b === v.length) return v;
  return ArrayBuffer.isView(v)
    ? (v as Float64Array).subarray(a, b)
    : (Array.prototype.slice.call(v, a, b) as number[]);
}
