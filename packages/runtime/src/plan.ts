/**
 * Update API semantics (plan E7.1) and the mapping from core's edit-type plan (E1.7) to what the
 * runtime re-runs. Pure: no chart state, no renderer.
 */
import {
  getIn,
  isPlainObject,
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
        const inUse = (fullLayout?.[axis] as { range?: unknown } | undefined)?.range;
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
