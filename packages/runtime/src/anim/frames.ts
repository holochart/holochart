/**
 * Frames (plan E7.4), following plotly.js: the frame list (`addFrames` / `deleteFrames`), frame
 * lookup and `baseframe` chains (`computeFrame`), what an `animate` target names, and the defaults
 * of the animation options. Pure functions; the timing and queue live in `animation.ts`.
 */
import { EASINGS, isPlainObject } from '@mk7s/holochart-core';
import type { AttributeUpdate } from '../plan.ts';
import type {
  AnimateTarget,
  AnimationOptions,
  ComputedFrame,
  Frame,
  FrameOptions,
  TransitionOptions,
} from './types.ts';

type Obj = Record<string, unknown>;

/** Layout arrays of objects that frames merge item by item (Plotly's layout array containers). */
const LAYOUT_ARRAYS: ReadonlySet<string> = new Set([
  'annotations',
  'shapes',
  'images',
  'sliders',
  'updatemenus',
  'selections',
]);
/** Trace arrays of objects merged item by item (`splom` / `parcoords` dimensions). */
const TRACE_ARRAYS: ReadonlySet<string> = new Set(['dimensions']);

/** The frames of a figure as a list (anything but an array has none). */
export function frameList(frames: unknown): readonly unknown[] {
  return Array.isArray(frames) ? frames : [];
}

/** A frame's name: its `name` as a string, or `'frame <i>'` for unnamed frames of the figure. */
export function frameName(frame: unknown, index: number): string {
  const name = isPlainObject(frame) ? frame['name'] : undefined;
  return name === undefined || name === null ? `frame ${index}` : String(name);
}

/** Frames by name (a later frame with the same name wins, like Plotly's frame hash). */
export function frameIndex(frames: readonly unknown[]): Map<string, Frame> {
  const index = new Map<string, Frame>();
  frames.forEach((frame, i) => {
    if (isPlainObject(frame)) index.set(frameName(frame, i), frame as Frame);
  });
  return index;
}

/**
 * Plotly's `addFrames`: frames with a name already in the list replace it in place; others are
 * inserted at `indices[i]` (clamped; default: appended in order). Names and groups become
 * strings; unnamed frames are named `'frame <n>'` with a counter (`next`) until the name is free.
 * Items that are not objects are skipped. Returns the new list.
 */
export function insertFrames(
  frames: readonly unknown[],
  list: readonly unknown[],
  indices: readonly (number | null | undefined)[] | undefined,
  next: () => number,
): unknown[] {
  const out = [...frames];
  const names = frameIndex(frames);
  const ops: { index: number; frame: Frame; replace: boolean }[] = [];
  const big = Number.MAX_SAFE_INTEGER - list.length;
  list.forEach((item, i) => {
    if (!isPlainObject(item)) return;
    const frame: Obj = { ...item };
    if (frame['name'] === undefined || frame['name'] === null) {
      let name: string;
      do name = `frame ${next()}`;
      while (names.has(name));
      frame['name'] = name;
    } else frame['name'] = String(frame['name']);
    if (frame['group'] !== undefined && frame['group'] !== null) {
      frame['group'] = String(frame['group']);
    }
    const at = indices?.[i];
    ops.push({
      index: typeof at === 'number' && Number.isFinite(at) ? at : big + i,
      frame: frame as Frame,
      replace: names.has(frame['name'] as string),
    });
  });
  ops.sort((a, b) => a.index - b.index);
  for (const op of ops) {
    const name = op.frame.name as string;
    if (op.replace) {
      const i = out.findLastIndex((f, k) => isPlainObject(f) && frameName(f, k) === name);
      if (i >= 0) {
        out[i] = op.frame;
        continue;
      }
    }
    out.splice(Math.min(Math.max(0, Math.trunc(op.index)), out.length), 0, op.frame);
  }
  return out;
}

/**
 * Plotly's `deleteFrames`: remove frames by index (all of them without `indices`).
 *
 * @throws RangeError for an index outside the list.
 */
export function removeFrames(
  frames: readonly unknown[],
  indices: readonly number[] | null | undefined,
): unknown[] {
  if (!indices) return [];
  const out = [...frames];
  const sorted = [...new Set(indices)].sort((a, b) => b - a);
  for (const i of sorted) {
    if (!Number.isInteger(i) || i < 0 || i >= out.length) {
      throw new RangeError(`deleteFrames: frame index ${i} is out of range`);
    }
    out.splice(i, 1);
  }
  return out;
}

/**
 * Deep-merge `src` into a copy of `target` like Plotly's `extendDeepNoArrays`: objects merge,
 * arrays and other values replace — except the arrays named in `arrays`, whose object items merge
 * by index (`null` clears an item).
 */
function extend(target: unknown, src: Obj, arrays?: ReadonlySet<string>): Obj {
  const out: Obj = isPlainObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(src)) {
    if (value === undefined) continue;
    const current = out[key];
    if (isPlainObject(value)) out[key] = extend(current, value);
    else if (arrays?.has(key) && Array.isArray(value) && Array.isArray(current)) {
      const items = [...(current as unknown[])];
      value.forEach((item, i) => {
        if (item === null) items[i] = null;
        else if (isPlainObject(item)) items[i] = extend(items[i], item);
      });
      out[key] = items;
    } else out[key] = value;
  }
  return out;
}

/** A frame's `traces` as a list: a number → `[n]`; missing → `0 … count - 1`. */
function tracesOf(traces: unknown, count: number): (number | null | undefined)[] {
  if (typeof traces === 'number') return [traces];
  if (Array.isArray(traces) && traces.length > 0) return traces as (number | null | undefined)[];
  return Array.from({ length: count }, (_, i) => i);
}

/** Merge `frame` over a computed frame (Plotly's `computeFrame` step). */
function mergeFrame(out: { data: Obj[]; traces: number[]; layout?: Obj }, frame: Frame): void {
  if (isPlainObject(frame.layout)) out.layout = extend(out.layout, frame.layout, LAYOUT_ARRAYS);
  if (!Array.isArray(frame.data)) return;
  const data = frame.data as unknown[];
  const traces = tracesOf(frame.traces, data.length);
  data.forEach((trace, k) => {
    const index = traces[k];
    if (index === null || index === undefined) return;
    let slot = out.traces.indexOf(index);
    if (slot < 0) {
      slot = out.traces.push(index) - 1;
      out.data.push({});
    }
    if (isPlainObject(trace)) out.data[slot] = extend(out.data[slot], trace, TRACE_ARRAYS);
  });
}

/**
 * Plotly's `computeFrame`: frame `name` with its `baseframe` chain applied (deepest base first;
 * the chain stops at a missing name or a cycle). `undefined` when there is no such frame.
 */
export function computeFrame(
  index: ReadonlyMap<string, Frame>,
  name: string,
): ComputedFrame | undefined {
  const chain: Frame[] = [];
  const seen = new Set<string>();
  let frame = index.get(name);
  if (!frame) return undefined;
  while (frame && !seen.has(name)) {
    chain.push(frame);
    seen.add(name);
    const base = frame.baseframe;
    if (base === undefined || base === null) break;
    name = String(base);
    frame = index.get(name);
  }
  return merged(chain.reverse());
}

/** A frame object given to `animate` directly: used as is (`baseframe` ignored). */
export function inlineFrame(frame: Frame): ComputedFrame {
  return merged([frame]);
}

function merged(frames: readonly Frame[]): ComputedFrame {
  const out: { data: Obj[]; traces: number[]; layout?: Obj } = { data: [], traces: [] };
  for (const f of frames) mergeFrame(out, f);
  return {
    ...(out.traces.length > 0 ? { data: out.data, traces: out.traces } : {}),
    ...(out.layout ? { layout: out.layout } : {}),
  };
}

/**
 * Attribute strings of a frame's changes (the `update` form): nested objects become paths; the
 * arrays named in `arrays` merge item by item (`annotations[1].text`).
 */
export function flattenFrame(
  patch: unknown,
  arrays: ReadonlySet<string>,
  prefix = '',
  out: Obj = {},
): Obj {
  if (!isPlainObject(patch)) return out;
  for (const [key, value] of Object.entries(patch)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (isPlainObject(value)) flattenFrame(value, new Set(), path, out);
    else if (prefix === '' && arrays.has(key) && Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item === null) out[`${path}[${i}]`] = null;
        else if (isPlainObject(item)) flattenFrame(item, new Set(), `${path}[${i}]`, out);
      });
    } else if (value !== undefined) out[path] = value;
  }
  return out;
}

/**
 * The edits a computed frame makes: per trace index (indices outside `0 … traceCount - 1` are
 * reported to `warn` and skipped) and to the layout.
 */
export function frameEdits(
  frame: ComputedFrame,
  traceCount: number,
  warn: (message: string) => void,
): { traces: Map<number, AttributeUpdate>; layout: AttributeUpdate } {
  const traces = new Map<number, AttributeUpdate>();
  frame.traces?.forEach((index, k) => {
    if (!Number.isInteger(index) || index < 0 || index >= traceCount) {
      warn(`[holochart] animate: frame trace index ${index} is out of range; ignored.`);
      return;
    }
    traces.set(index, flattenFrame(frame.data?.[k], TRACE_ARRAYS));
  });
  return { traces, layout: flattenFrame(frame.layout, LAYOUT_ARRAYS) };
}

/** A frame `animate` plays: by name (`null`: a frame object passed directly) and computed. */
export interface TargetFrame {
  readonly name: string | null;
  readonly byName: boolean;
  readonly frame: ComputedFrame;
}

/**
 * The frames an `animate` target names (Plotly semantics): `null` / `undefined` → every frame in
 * order; a string or number → the frames whose `group` matches (not a frame name); a frame object
 * → that frame; a list → frame names and frame objects (other items are skipped).
 *
 * @throws Error naming the first frame name that does not exist (nothing is played then).
 */
export function resolveTarget(target: AnimateTarget, frames: readonly unknown[]): TargetFrame[] {
  const index = frameIndex(frames);
  const byName = (name: string): TargetFrame => {
    const frame = computeFrame(index, name);
    if (!frame) throw new Error(`animate failure: frame not found: "${name}"`);
    return { name, byName: true, frame };
  };
  if (target === null || target === undefined) {
    return frames.flatMap((f, i) => (isPlainObject(f) ? [byName(frameName(f, i))] : []));
  }
  if (typeof target === 'string' || typeof target === 'number') {
    const group = String(target);
    return frames.flatMap((f, i) =>
      isPlainObject(f) && String(f['group']) === group ? [byName(frameName(f, i))] : [],
    );
  }
  if (isPlainObject(target)) {
    return [{ name: null, byName: false, frame: inlineFrame(target as Frame) }];
  }
  if (!Array.isArray(target)) return [];
  const out: TargetFrame[] = [];
  for (const item of target as readonly unknown[]) {
    if (typeof item === 'string' || typeof item === 'number') out.push(byName(String(item)));
    else if (isPlainObject(item)) {
      out.push({ name: null, byName: false, frame: inlineFrame(item as Frame) });
    }
  }
  return out;
}

/**
 * Plotly's `fromcurrent`: when frame `current` is in the list — not first, not last — play only
 * what follows it (frame objects are kept).
 */
export function fromCurrent(list: readonly TargetFrame[], current: string | null): TargetFrame[] {
  const i = list.findIndex((f) => f.byName && f.name === current);
  if (i <= 0 || i >= list.length - 1) return [...list];
  return list.filter((f, k) => !f.byName || k > i);
}

function duration(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 500;
}

/** Frame options with Plotly's defaults (duration 500, redraw true). */
export function frameOptions(value: unknown): Required<FrameOptions> {
  const v = isPlainObject(value) ? value : {};
  return {
    duration: duration(v['duration']),
    redraw: typeof v['redraw'] === 'boolean' ? v['redraw'] : true,
  };
}

/** Transition options with Plotly's defaults (500 ms, `cubic-in-out`, `'layout first'`). */
export function transitionOptions(value: unknown): Required<TransitionOptions> {
  const v = isPlainObject(value) ? value : {};
  const easing = v['easing'];
  return {
    duration: duration(v['duration']),
    easing: (EASINGS as readonly unknown[]).includes(easing) ? (easing as string) : 'cubic-in-out',
    ordering: v['ordering'] === 'traces first' ? 'traces first' : 'layout first',
  };
}

/** Animation options with Plotly's defaults; `frame(i)` / `transition(i)` per played frame. */
export interface ResolvedAnimation {
  readonly mode: 'immediate' | 'next' | 'afterall';
  readonly direction: 'forward' | 'reverse';
  readonly fromcurrent: boolean;
  frame(i: number): Required<FrameOptions>;
  /** The transition into frame `i`, its duration capped at the frame's. */
  transition(i: number): Required<TransitionOptions>;
}

export function animationOptions(options: AnimationOptions | undefined): ResolvedAnimation {
  const o: Obj = isPlainObject(options) ? options : {};
  const pick = (value: unknown, i: number): unknown =>
    Array.isArray(value) ? (value[i] ?? value[0]) : value;
  const mode = o['mode'];
  const frame = (i: number): Required<FrameOptions> => frameOptions(pick(o['frame'], i));
  return {
    mode: mode === 'immediate' || mode === 'next' ? mode : 'afterall',
    direction: o['direction'] === 'reverse' ? 'reverse' : 'forward',
    fromcurrent: o['fromcurrent'] === true,
    frame,
    transition: (i) => {
      const t = transitionOptions(pick(o['transition'], i));
      return { ...t, duration: Math.min(t.duration, frame(i).duration) };
    },
  };
}
