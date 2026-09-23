/**
 * Streaming calc and autorange for scatter (plan E7.2): `extendTraces` / `prependTraces` convert
 * only the new points.
 *
 * The calc arrays of a streamed trace are views into buffers with room at both ends (a sliding
 * window): appends write after the live range, prepends before it, trimming moves the range, and
 * when an end runs out of room the retained points move once into new buffers with slack. The
 * previous calc's views stay intact through one edit (new values only go outside them, and
 * relocation allocates new buffers), which is what `extremesAppend` needs to look at removed
 * points. A new calc object per edit also drops the hover index cached per calc, so it is rebuilt
 * lazily on the next hover rather than on every append.
 */
import {
  concatExtremes,
  getIn,
  isArrayLike,
  isTwoLevel,
  type AxisExtremes,
  type ExtremePoint,
  type FullTrace,
  type Scale,
} from '@mk7s/holochart-core';
import type { CalcContext, TraceAppend, TraceExtremes } from '@mk7s/holochart-runtime';
import { calcErrorBars } from '../shared/error-bars/index.ts';
import {
  linearExtremeOptions,
  linearExtremes,
  markerDiameters,
  markerPadding,
  writeCoordinates,
  writeMarkerDiameters,
  writeMarkerPadding,
  type ScatterCalc,
} from './calc.ts';
import type { WindowChange } from './line-stream.ts';

/**
 * Scatter attributes that may hold one value per point. When retained points move (a prepend, or
 * a trimmed front), every such array must have received the same edit, or values would pair with
 * other points than before.
 */
const PER_POINT = [
  'x',
  'y',
  'text',
  'hovertext',
  'customdata',
  'ids',
  'marker.color',
  'marker.size',
  'marker.symbol',
  'marker.opacity',
  'marker.angle',
  'marker.line.color',
  'marker.line.width',
  'textposition',
  'textfont.color',
  'textfont.size',
  'textfont.family',
  'textfont.weight',
  'textfont.style',
  'texttemplate',
  'hovertemplate',
  'error_x.array',
  'error_x.arrayminus',
  'error_y.array',
  'error_y.arrayminus',
] as const;

/** Streaming buffers shared by consecutive calcs (see the module comment). */
interface ScatterStream {
  x: Float64Array;
  y: Float64Array;
  size: Float32Array | undefined;
  ppad: Float64Array | undefined;
  /** Live window `[head, head + n)`. */
  head: number;
  n: number;
}

/** The window change of an append, in the terms `LinePathStream` and the views use. */
export function windowChange(append: TraceAppend): WindowChange {
  return append.at === 'end'
    ? { frontRemoved: append.trimmed, frontAdded: 0, endRemoved: 0, endAdded: append.count }
    : { frontRemoved: 0, frontAdded: append.count, endRemoved: append.trimmed, endAdded: 0 };
}

function slack(n: number): number {
  return 2 * n + 64;
}

/** Whether retained points keep their pairing with every per-point array (see PER_POINT). */
function alignedArrays(trace: FullTrace, append: TraceAppend): boolean {
  const moved = append.at === 'start' || append.trimmed > 0;
  if (!moved) return true;
  const keys = new Set(append.keys);
  for (const path of PER_POINT) {
    const value = path.includes('.') ? getIn(trace, path) : trace[path];
    if (keys.has(path)) continue;
    // Implicit coordinates (x0 + i·dx) shift with the index too.
    if (isArrayLike(value) || ((path === 'x' || path === 'y') && value === undefined)) {
      return false;
    }
  }
  return true;
}

function copyInto<T extends Float64Array | Float32Array>(
  make: (n: number) => T,
  src: T,
  from: number,
  to: number,
  cap: number,
  at: number,
): T {
  const out = make(cap);
  out.set(src.subarray(from, to), at);
  return out;
}

/**
 * Scatter `calcAppend` (E7.2): the calc after an append or prepend, converting only the added
 * points; `undefined` when a full calc is needed (periods, multicategory data, misaligned arrays,
 * or a mismatch with the previous calc).
 */
export function calcScatterAppend(
  previous: ScatterCalc,
  trace: FullTrace,
  ctx: CalcContext,
  append: TraceAppend,
): ScatterCalc | undefined {
  const length = typeof trace['_length'] === 'number' ? trace['_length'] : -1;
  if (length !== append.length || previous.length !== append.previous) return undefined;
  if (!ctx.xaxis || !ctx.yaxis) return undefined;
  if (trace['xperiod'] !== undefined || trace['yperiod'] !== undefined) return undefined;
  if (isTwoLevel(trace['x']) || isTwoLevel(trace['y'])) return undefined;
  if (!alignedArrays(trace, append)) return undefined;
  const sizes = markerDiameters(trace, 0);
  const perPointSize = typeof sizes !== 'number';
  if (perPointSize !== (typeof previous.markerSize !== 'number')) return undefined;

  const change = windowChange(append);
  const n = length;
  let st = previous.stream as ScatterStream | undefined;
  if (!st) {
    // First streamed edit: move the full calc into buffers with room at the growing end.
    const cap = slack(Math.max(n, previous.length));
    const at = append.at === 'start' ? cap - previous.length : 0;
    const m = previous.length;
    st = {
      x: copyInto((k) => new Float64Array(k), previous.x, 0, m, cap, at),
      y: copyInto((k) => new Float64Array(k), previous.y, 0, m, cap, at),
      size:
        typeof previous.markerSize === 'number'
          ? undefined
          : copyInto((k) => new Float32Array(k), previous.markerSize, 0, m, cap, at),
      ppad:
        previous.ppad instanceof Float64Array
          ? copyInto((k) => new Float64Array(k), previous.ppad, 0, m, cap, at)
          : undefined,
      head: at,
      n: m,
    };
  }
  // Retained points: old window [head + frontRemoved, head + n - endRemoved).
  const keepFrom = st.head + change.frontRemoved;
  const keepTo = st.head + st.n - change.endRemoved;
  let head = keepFrom - change.frontAdded;
  let next: ScatterStream = { ...st };
  if (head < 0 || head + n > st.x.length) {
    // Out of room at the growing end: move the retained points into new buffers. (New arrays,
    // never in place: the previous calc's views must stay intact.)
    const cap = slack(n);
    head = append.at === 'start' ? cap - n : 0;
    const at = head + change.frontAdded;
    next = {
      x: copyInto((k) => new Float64Array(k), st.x, keepFrom, keepTo, cap, at),
      y: copyInto((k) => new Float64Array(k), st.y, keepFrom, keepTo, cap, at),
      size: st.size && copyInto((k) => new Float32Array(k), st.size, keepFrom, keepTo, cap, at),
      ppad: st.ppad && copyInto((k) => new Float64Array(k), st.ppad, keepFrom, keepTo, cap, at),
      head,
      n,
    };
  }
  next.head = head;
  next.n = n;
  if (perPointSize && !next.size) return undefined;

  // Convert the added points only.
  const added: [number, number][] = [];
  if (change.frontAdded > 0) added.push([0, change.frontAdded]);
  if (change.endAdded > 0) added.push([n - change.endAdded, n]);
  const xs = ctx.xaxis.scale;
  const ys = ctx.yaxis.scale;
  for (const [a, b] of added) {
    writeCoordinates(trace, 'x', xs, next.x.subarray(head + a, head + b), a, b);
    writeCoordinates(trace, 'y', ys, next.y.subarray(head + a, head + b), a, b);
    if (next.size) writeMarkerDiameters(trace, next.size.subarray(head + a, head + b), a, b);
    if (next.ppad) writeMarkerPadding(trace, next.ppad.subarray(head + a, head + b), a, b);
  }

  const x = next.x.subarray(head, head + n);
  const y = next.y.subarray(head, head + n);
  return {
    x,
    y,
    length: n,
    markerSize: next.size ? next.size.subarray(head, head + n) : (sizes as number),
    ppad: next.ppad ? next.ppad.subarray(head, head + n) : markerPadding(trace, 0),
    // Error bars depend on per-point options and arrays: recomputed for the window (O(n)).
    errorX: calcErrorBars(trace, 'x', x, ctx.xaxis.type),
    errorY: calcErrorBars(trace, 'y', y, ctx.yaxis.type),
    stream: next,
  };
}

function samePoint(a: ExtremePoint, b: ExtremePoint): boolean {
  return a.l === b.l && a.padPx === b.padPx && (a.extrapad === true) === (b.extrapad === true);
}

/** Whether any extreme of `removed` is (one of) the current extremes. */
function removesExtreme(current: AxisExtremes, removed: AxisExtremes): boolean {
  for (const r of removed.min) if (current.min.some((c) => samePoint(c, r))) return true;
  for (const r of removed.max) if (current.max.some((c) => samePoint(c, r))) return true;
  return false;
}

const LINEAR = { type: 'linear' } as unknown as Scale;

/**
 * Scatter `extremesAppend` (E7.2): merge the extremes of the added points into the previous
 * ones, per axis, unless a removed point was one of them (then that axis is recomputed over the
 * window). Error bars fall back to a full `extremes`.
 */
export function scatterExtremesAppend(
  previous: TraceExtremes,
  calc: ScatterCalc,
  previousCalc: ScatterCalc,
  trace: FullTrace,
  ctx: CalcContext,
  append: TraceAppend,
): TraceExtremes | undefined {
  if (calc.errorX || calc.errorY || previousCalc.errorX || previousCalc.errorY) return undefined;
  const opts = linearExtremeOptions(calc, trace);
  const change = windowChange(append);
  const out: { x?: AxisExtremes; y?: AxisExtremes } = {};
  for (const letter of ['x', 'y'] as const) {
    const axis = letter === 'x' ? ctx.xaxis : ctx.yaxis;
    const prev = previous[letter];
    if (!axis) continue;
    const o = opts[letter];
    const full = (): AxisExtremes => linearExtremes(axis, calc[letter], o);
    if (!prev) {
      out[letter] = full();
      continue;
    }
    // Per-point paddings are sliced with the values (a scalar or tight `ppad: 0` stays as is).
    const part = (c: ScatterCalc, a: number, b: number): AxisExtremes =>
      linearExtremes(axis, c[letter].subarray(a, b), {
        ...o,
        ...(o.ppad !== undefined && typeof o.ppad !== 'number' && c.ppad instanceof Float64Array
          ? { ppad: c.ppad.subarray(a, b) }
          : {}),
      });
    const removed =
      change.frontRemoved > 0
        ? part(previousCalc, 0, change.frontRemoved)
        : change.endRemoved > 0
          ? part(previousCalc, previousCalc.length - change.endRemoved, previousCalc.length)
          : undefined;
    if (removed && removesExtreme(prev, removed)) {
      out[letter] = full();
      continue;
    }
    const added =
      change.endAdded > 0
        ? part(calc, calc.length - change.endAdded, calc.length)
        : part(calc, 0, change.frontAdded);
    out[letter] = concatExtremes([prev, added], LINEAR);
  }
  return out;
}
