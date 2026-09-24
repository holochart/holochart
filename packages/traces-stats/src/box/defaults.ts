/**
 * `box` supply-defaults (plan E10.4), following plotly.js' box defaults. The sample, points and
 * layout parts are shared with `violin` (E10.5).
 *
 * Two things Plotly does at other stages happen here, in the layout defaults, because they need
 * every trace:
 *
 * - **Implicit positions.** A box without `x` (vertical) sits at `x0`, else at its trace name on a
 *   category axis (or a numeric / date name on a linear, log / date axis), else at its index among
 *   the box traces (Plotly's `getPosArrays`); an untyped axis is typed from those names (Plotly's
 *   `setAutoType` for box traces). Holochart types axes and collects categories from the traces'
 *   coordinate arrays, so the position is written as a one-element array: `trace.x = [position]`
 *   with `trace._posImplicit = true` (calc then places every sample there).
 * - **Grouping.** Each trace's index among the visible box traces (`_boxNum`, Plotly's `t.num`),
 *   their count and, in `group` mode, the offset groups of each alignment group, so cross-trace calc
 *   (which runs per subplot) lays out boxes of different subplots on one axis alike.
 */
import {
  autoType,
  isArrayLike,
  isDateString,
  isValidColor,
  toRGBA,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';

/** Box or violin. */
export type BoxKind = 'box' | 'violin';

/** Private `fullLayout` keys written by {@link supplyGroupingDefaults}, per trace type. */
export const LAYOUT_KEYS = {
  box: { count: '_numBoxes', alignment: '_boxAlignment' },
  violin: { count: '_numViolins', alignment: '_violinAlignment' },
} as const;

/** Private trace keys. */
export const TRACE_KEYS = {
  /** Index among the visible traces of the type (Plotly's `t.num`). */
  num: '_boxNum',
  /** Index of the trace's offset group in its alignment group (`group` mode with offset groups). */
  offsetIndex: '_offsetIndex',
  /** The position array was written by the layout defaults (one element: the position). */
  implicit: '_posImplicit',
  /** Precomputed statistics (`q1`, `median`, `q3`) instead of samples. */
  precomputed: '_hasPreCompStats',
} as const;

function objectAt(v: unknown, key: string): Readonly<Record<string, unknown>> | undefined {
  const c = v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined;
  return c !== null && typeof c === 'object' && !Array.isArray(c)
    ? (c as Record<string, unknown>)
    : undefined;
}

/** 0: not an array (or empty), 1: a flat array, 2: an array of (non-empty) arrays. */
function dims(v: unknown): 0 | 1 | 2 {
  if (!isArrayLike(v) || v.length === 0) return 0;
  const first = v[0];
  return isArrayLike(first) && first.length > 0 ? 2 : 1;
}

/** Plotly's `Lib.minRowLength`: the shortest row of a 2D array, the length of a 1D one. */
function minRowLength(v: unknown): number {
  if (!isArrayLike(v)) return 0;
  if (dims(v) === 2) {
    let n = Infinity;
    for (let i = 0; i < v.length; i++) {
      const row = v[i];
      n = Math.min(n, isArrayLike(row) ? row.length : 0);
    }
    return Number.isFinite(n) ? n : 0;
  }
  return v.length;
}

function hasCategory(rows: ArrayLike<unknown>): boolean {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (isArrayLike(row) && autoType(row) === 'category') return true;
  }
  return false;
}

/**
 * Samples (or precomputed statistics), orientation and the implicit position (Plotly's
 * `handleSampleDefaults`). Returns false (and hides the trace) without data.
 */
export function supplySampleDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
  kind: BoxKind,
): boolean {
  const y = ctx.coerce('y');
  const x = ctx.coerce('x');
  let statLength = 0;
  let precomputed = false;
  if (kind === 'box') {
    const q1 = ctx.coerce('q1');
    const median = ctx.coerce('median');
    const q3 = ctx.coerce('q3');
    precomputed = [q1, median, q3].every((v) => isArrayLike(v) && v.length > 0);
    statLength = Math.min(minRowLength(q1), minRowLength(median), minRowLength(q3));
  }
  traceOut[TRACE_KEYS.precomputed] = precomputed;

  const yDims = dims(y);
  const xDims = dims(x);
  const yLen = minRowLength(y);
  const xLen = minRowLength(x);
  const xRows = isArrayLike(x) ? x.length : 0;
  const yRows = isArrayLike(y) ? y.length : 0;
  let orientation: 'v' | 'h' = 'v';
  let length = 0;
  if (precomputed) {
    const set = (key: string) => traceIn[key] !== undefined && traceIn[key] !== null;
    switch (`${xDims}${yDims}`) {
      case '00':
        orientation = (set('y0') || set('dy')) && !(set('x0') || set('dx')) ? 'h' : 'v';
        length = statLength;
        break;
      case '10':
        length = Math.min(statLength, xLen);
        break;
      case '20':
        orientation = 'h';
        length = Math.min(statLength, xRows);
        break;
      case '01':
        orientation = 'h';
        length = Math.min(statLength, yLen);
        break;
      case '02':
        length = Math.min(statLength, yRows);
        break;
      case '12':
        length = Math.min(statLength, xLen, yRows);
        break;
      case '21':
        orientation = 'h';
        length = Math.min(statLength, xRows, yLen);
        break;
      case '22':
        if (!hasCategory(x as ArrayLike<unknown>) && hasCategory(y as ArrayLike<unknown>)) {
          orientation = 'h';
          length = Math.min(statLength, xRows, yLen);
        } else {
          length = Math.min(statLength, xLen, yRows);
        }
        break;
      default:
        // '11' is ill-defined (Plotly draws nothing).
        length = 0;
    }
  } else if (yDims > 0) {
    length = xDims > 0 ? Math.min(xLen, yLen) : yLen;
  } else if (xDims > 0) {
    orientation = 'h';
    length = xLen;
  }
  if (!length) {
    traceOut.visible = false;
    return false;
  }
  traceOut['_length'] = length;
  const o = ctx.coerce<'v' | 'h'>('orientation', orientation);
  const [posDims, posLetter] = o === 'h' ? [yDims, 'y'] : [xDims, 'x'];
  if (posDims === 0) {
    if (precomputed) {
      ctx.coerce(`${posLetter}0`, 0);
      ctx.coerce(`d${posLetter}`, 1);
    } else {
      ctx.coerce(`${posLetter}0`);
    }
  }
  return true;
}

/** Colors and widths of the shape (`line.*`, `fillcolor`). */
export function supplyOutlineDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): { lineColor: string; lineWidth: number; fillColor: string } {
  const markerColor = objectAt(traceIn, 'marker')?.['color'];
  const lineColor = ctx.coerce<string>(
    'line.color',
    isValidColor(markerColor) ? markerColor : ctx.defaultColor,
  );
  const lineWidth = ctx.coerce<number>('line.width');
  const fillColor = ctx.coerce<string>('fillcolor', withOpacity(lineColor, 0.5));
  return { lineColor, lineWidth, fillColor };
}

/** Plotly's `Color.addOpacity`: the color with alpha `opacity` (CSS `rgba()`). */
export function withOpacity(color: string, opacity: number): string {
  const c = toRGBA(color);
  if (!c) return color;
  const [r, g, b] = [c[0], c[1], c[2]].map((v) => Math.round(v * 255));
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Points mode, jitter, position and markers (Plotly's `handlePointsDefaults`). `key` is
 * `boxpoints` (box) or `points` (violin).
 */
export function supplyPointsDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
  key: 'boxpoints' | 'points',
  lineColor: string,
): void {
  const markerIn = objectAt(traceIn, 'marker');
  const outlierColorSet = isValidColor(markerIn?.['outliercolor']);
  const lineOutlierColor = ctx.coerce('marker.line.outliercolor');
  let modeDflt: unknown = 'outliers';
  if (traceOut[TRACE_KEYS.precomputed] === true) modeDflt = 'all';
  else if (outlierColorSet || lineOutlierColor !== undefined) modeDflt = 'suspectedoutliers';
  const mode = ctx.coerce(key, modeDflt);
  if (mode) {
    ctx.coerce('jitter', mode === 'all' ? 0.3 : 0);
    ctx.coerce('pointpos', mode === 'all' ? -1.5 : 0);
    ctx.coerce('marker.outliercolor');
    ctx.coerce('marker.symbol');
    ctx.coerce('marker.opacity');
    ctx.coerce('marker.size');
    ctx.coerce('marker.angle');
    const markerColor = ctx.coerce<string>('marker.color', lineColor);
    ctx.coerce('marker.line.color');
    ctx.coerce('marker.line.width');
    if (mode === 'suspectedoutliers') {
      ctx.coerce('marker.line.outliercolor', markerColor);
      ctx.coerce('marker.line.outlierwidth');
    }
    for (const which of ['selected', 'unselected']) {
      ctx.coerce(`${which}.marker.color`);
      ctx.coerce(`${which}.marker.opacity`);
    }
    ctx.coerce('text');
  } else {
    delete traceOut['marker'];
  }
  ctx.coerce('hoveron');
}

/** Supply box defaults (Plotly's box `supplyDefaults`). */
export function supplyBoxDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  if (!supplySampleDefaults(traceIn, traceOut, ctx, 'box')) return;
  const precomputed = traceOut[TRACE_KEYS.precomputed] === true;
  if (precomputed) {
    ctx.coerce('lowerfence');
    ctx.coerce('upperfence');
  }
  const { lineColor } = supplyOutlineDefaults(traceIn, traceOut, ctx);

  let boxmeanDflt: unknown = false;
  if (precomputed) {
    const mean = ctx.coerce('mean');
    const sd = ctx.coerce('sd');
    if (isArrayLike(mean) && mean.length > 0) {
      boxmeanDflt = isArrayLike(sd) && sd.length > 0 ? 'sd' : true;
    }
  }
  ctx.coerce('whiskerwidth');
  const sizemode = ctx.coerce('sizemode');
  let boxmean: unknown;
  if (sizemode === 'quartiles') boxmean = ctx.coerce('boxmean', boxmeanDflt);
  ctx.coerce('showwhiskers', sizemode === 'quartiles');
  if (sizemode === 'sd' || boxmean === 'sd') ctx.coerce('sdmultiple');
  ctx.coerce('width');
  ctx.coerce('quartilemethod');

  let notchedDflt: boolean;
  if (precomputed) {
    const notchspan = ctx.coerce('notchspan');
    notchedDflt = isArrayLike(notchspan) && notchspan.length > 0;
  } else {
    const w = traceIn['notchwidth'];
    notchedDflt = typeof w === 'number' && w >= 0 && w <= 0.5;
  }
  if (ctx.coerce('notched', notchedDflt)) ctx.coerce('notchwidth');

  supplyPointsDefaults(traceIn, traceOut, ctx, 'boxpoints', lineColor);
  ctx.coerce('offsetgroup');
  ctx.coerce('alignmentgroup');
  ctx.coerce('zorder');
}

// ---- Layout-level defaults ------------------------------------------------------------------------

/** Layout key of an axis id: `'x2'` → `'xaxis2'`. */
function axisKey(id: string): string {
  return `${id.charAt(0)}axis${id.slice(1)}`;
}

/** Whether a (defaulted) trace is a box or violin. */
export function isBoxLike(trace: FullTrace): boolean {
  return trace.type === 'box' || trace.type === 'violin';
}

/** The position axis letter of a box or violin. */
export function positionLetter(trace: FullTrace): 'x' | 'y' {
  return trace['orientation'] === 'h' ? 'y' : 'x';
}

/** The position axis id of a box or violin. */
export function positionAxisId(trace: FullTrace): string {
  const letter = positionLetter(trace);
  const id = trace[`${letter}axis`];
  return typeof id === 'string' ? id : letter;
}

/** A sample trace with neither a position array nor `x0` / `y0` (Plotly's `isBoxWithoutPositionCoords`). */
function withoutPositions(trace: FullTrace): boolean {
  if (!isBoxLike(trace) || trace.visible !== true) return false;
  if (trace[TRACE_KEYS.precomputed] === true) return false;
  const letter = positionLetter(trace);
  const input = (trace._input ?? {}) as Record<string, unknown>;
  return !isArrayLike(input[letter]) && trace[`${letter}0`] === undefined;
}

/** The data core types an axis from, for one trace (its `typingData`), or undefined. */
function typingData(trace: FullTrace, letter: 'x' | 'y'): unknown[] | undefined {
  const v = trace[letter];
  if (isArrayLike(v) && v.length > 0) return Array.from(v);
  const v0 = trace[`${letter}0`];
  if (v0 !== undefined && v0 !== null && v0 !== 0 && v0 !== '' && v0 !== false) return [v0];
  return undefined;
}

/**
 * The type an axis will get: its `type` when set, else detected like core's axis defaults (and
 * Plotly's `setAutoType`): from the first trace with data on it, or — when that is a box or violin
 * without positions — from the names of every such trace on the axis.
 */
function positionAxisType(
  id: string,
  layoutIn: Readonly<Record<string, unknown>>,
  fullData: readonly FullTrace[],
): string {
  const letter = id.charAt(0) as 'x' | 'y';
  const axIn = objectAt(layoutIn, axisKey(id));
  const set = axIn?.['type'];
  if (typeof set === 'string' && set !== '-') return set;
  const onAxis = fullData.filter(
    (t) =>
      t.visible !== false &&
      t._module?.categories.includes('cartesian') === true &&
      (typeof t[`${letter}axis`] === 'string' ? t[`${letter}axis`] : letter) === id,
  );
  for (const trace of onAxis) {
    if (withoutPositions(trace) && positionLetter(trace) === letter) {
      const names = onAxis
        .filter((t) => isBoxLike(t) && positionLetter(t) === letter)
        .map((t) => {
          const v = t[letter];
          if (isArrayLike(v) && v.length > 0 && t[TRACE_KEYS.implicit] !== true) return v[0];
          return t['name'] ?? 'text';
        });
      const opts: { autotypenumbers?: 'convert types' | 'strict' } = {};
      if (axIn?.['autotypenumbers'] === 'strict') opts.autotypenumbers = 'strict';
      return autoType(names, opts);
    }
    const data = typingData(trace, letter);
    if (data) {
      if (trace.type === 'histogram') return 'linear';
      return autoType(data);
    }
  }
  return 'linear';
}

function isNumericName(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  return typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v));
}

/**
 * Layout defaults shared by box and violin: trace numbers, alignment / offset groups and implicit
 * positions (see the module comment).
 */
export function supplyGroupingDefaults(
  kind: BoxKind,
  layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  const keys = LAYOUT_KEYS[kind];
  const traces = ctx.fullData.filter((t) => t.type === kind && t.visible === true);
  const group = layoutOut[`${kind}mode`] === 'group';
  const alignment: Record<string, string[]> = {};
  const types = new Map<string, string>();
  traces.forEach((trace, num) => {
    trace[TRACE_KEYS.num] = num;
    trace[TRACE_KEYS.offsetIndex] = 0;
    const axisId = positionAxisId(trace);
    if (group) {
      const offsetgroup = String(trace['offsetgroup'] ?? '');
      const key = `${axisId}|${String(trace['orientation'])}|${String(trace['alignmentgroup'] ?? '')}`;
      const list = (alignment[key] ??= []);
      if (offsetgroup !== '') {
        if (!list.includes(offsetgroup)) list.push(offsetgroup);
        trace[TRACE_KEYS.offsetIndex] = list.indexOf(offsetgroup);
      }
    }
    if (!withoutPositions(trace)) return;
    let type = types.get(axisId);
    if (type === undefined) {
      type = positionAxisType(axisId, layoutIn, ctx.fullData);
      types.set(axisId, type);
    }
    const name = trace['name'];
    const fits =
      name !== undefined &&
      (type === 'category' ||
        type === 'multicategory' ||
        ((type === 'linear' || type === 'log') && isNumericName(name)) ||
        (type === 'date' && isDateString(name)));
    trace[positionLetter(trace)] = [fits ? name : num];
    trace[TRACE_KEYS.implicit] = true;
  });
  // A user `x0` also needs to reach the axis' categories.
  for (const trace of traces) {
    const letter = positionLetter(trace);
    if (trace[TRACE_KEYS.precomputed] === true || trace[TRACE_KEYS.implicit] === true) continue;
    const input = (trace._input ?? {}) as Record<string, unknown>;
    if (isArrayLike(input[letter])) continue;
    const pos0 = trace[`${letter}0`];
    if (pos0 === undefined) continue;
    trace[letter] = [pos0];
    trace[TRACE_KEYS.implicit] = true;
  }
  layoutOut[keys.count] = traces.length;
  layoutOut[keys.alignment] = alignment;
}
