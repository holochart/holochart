/**
 * `uirevision` semantics (plan E1.8): keep what the user did with the chart (zoom, pan, legend
 * toggles) across `react` calls, for as long as the app's `uirevision` stays the same.
 *
 * Plotly's model: every GUI-driven edit records the *input* value it overwrote ("pre-GUI" value).
 * On `react(next)`, a record survives only if
 *
 * 1. the governing `uirevision` is defined and unchanged — trace paths use `trace.uirevision`,
 *    falling back to `layout.uirevision`; layout paths use `layout.uirevision`; and
 * 2. `next` still holds the pre-GUI value at that path, i.e. the app did not set it itself. An app
 *    that sets `xaxis.range` explicitly wins over the user's zoom.
 *
 * Surviving records write their GUI value into a copy of `next`; the rest are forgotten, so a
 * later `react` that restores the old `uirevision` does not resurrect stale zoom state.
 *
 * Intended flow in the update API (E7.1): a zoom calls
 * `recordGuiEdit(state, { kind: 'layout' }, 'xaxis.range', inputBefore, newRange)` (and likewise
 * `xaxis.autorange`) before relayouting `current`. `react(next)` then runs
 * `effective = applyUirevision(current, next, state)` and diffs `current` against `effective`.
 */
import type { FigureInput } from '../defaults/types.ts';
import { getIn, parsePath, stringifyPath, type PathSegment } from '../path/path.ts';
import { isPlainObject } from '../util/objects.ts';
import { deepEqual, own } from './equal.ts';

/** What a GUI edit applied to: the layout, or one trace (identified by `uid` when it has one). */
export type GuiTarget = { kind: 'layout' } | { kind: 'trace'; uid?: string; index: number };

/** One recorded GUI edit. */
export interface GuiEdit {
  /** The input value before the first GUI edit of this path (`undefined` if it was unset). */
  readonly preGui: unknown;
  /** The value the GUI last set. */
  gui: unknown;
}

/**
 * Recorded GUI edits of one chart. Mutable by design: {@link recordGuiEdit} adds to it and
 * {@link applyUirevision} prunes records that no longer apply.
 */
export interface UiState {
  /** Layout edits by normalized attribute path. */
  readonly layout: Map<string, GuiEdit>;
  /** Trace edits by trace key (`uid:<uid>`, or `#<index>` for traces without a uid), then path. */
  readonly traces: Map<string, Map<string, GuiEdit>>;
}

/** An empty {@link UiState} for a new chart. */
export function createUiState(): UiState {
  return { layout: new Map(), traces: new Map() };
}

function uidOf(trace: unknown): string | undefined {
  const uid = isPlainObject(trace) ? trace['uid'] : undefined;
  return typeof uid === 'string' && uid !== '' ? uid : undefined;
}

function traceKey(target: { uid?: string; index: number }): string {
  return target.uid !== undefined && target.uid !== '' ? `uid:${target.uid}` : `#${target.index}`;
}

/**
 * Index of the trace a key refers to. Index keys only name uid-less traces: a trace that gained a
 * uid is a different identity as far as the app is concerned.
 */
function findTrace(data: readonly unknown[], key: string): number | undefined {
  if (key.startsWith('uid:')) {
    const uid = key.slice(4);
    const i = data.findIndex((t) => uidOf(t) === uid);
    return i < 0 ? undefined : i;
  }
  const i = Number(key.slice(1));
  return i < data.length && uidOf(data[i]) === undefined ? i : undefined;
}

/**
 * Record a GUI-driven edit so {@link applyUirevision} can preserve it. Repeated edits of the same
 * path keep the first pre-GUI value (it is what the app last asked for) and update the GUI value.
 *
 * @param target - The layout, or the trace edited (`uid` when the input trace has one; records of
 * uid-less traces follow the index).
 * @param path - Attribute path, e.g. `'xaxis.range'`, `'visible'`.
 * @param preGuiValue - The input value at `path` before the edit (`undefined` if unset).
 * @param guiValue - The value the GUI set.
 * @throws If `path` is not a valid attribute path.
 */
export function recordGuiEdit(
  state: UiState,
  target: GuiTarget,
  path: string,
  preGuiValue: unknown,
  guiValue: unknown,
): void {
  const key = stringifyPath(parsePath(path));
  let edits = state.layout;
  if (target.kind === 'trace') {
    const tk = traceKey(target);
    const existing = state.traces.get(tk);
    edits = existing ?? new Map<string, GuiEdit>();
    if (!existing) state.traces.set(tk, edits);
  }
  const rec = edits.get(key);
  if (rec) rec.gui = guiValue;
  else edits.set(key, { preGui: preGuiValue, gui: guiValue });
}

/** A revision is "kept" only when it is set and equal (by value) on both sides. */
function revisionKept(oldRev: unknown, newRev: unknown): boolean {
  return oldRev !== undefined && oldRev !== null && deepEqual(oldRev, newRev);
}

const FAIL: unique symbol = Symbol('fail');

/**
 * Copy-on-write `setIn`: returns a new root with fresh containers along `segs` and everything else
 * shared. Returns {@link FAIL} when an intermediate value is not a plain object or array, since
 * overwriting it would destroy app data.
 */
function setInCopy(obj: unknown, segs: readonly PathSegment[], i: number, value: unknown): unknown {
  if (i === segs.length) return value;
  const seg = segs[i] as PathSegment;
  let copy: Record<PathSegment, unknown>;
  if (obj === undefined || obj === null) {
    copy = (typeof seg === 'number' ? [] : {}) as Record<PathSegment, unknown>;
  } else if (Array.isArray(obj)) copy = obj.slice() as unknown as Record<PathSegment, unknown>;
  else if (isPlainObject(obj)) copy = { ...obj };
  else return FAIL;
  const child = setInCopy(own(copy, seg), segs, i + 1, value);
  if (child === FAIL) return FAIL;
  if (child === undefined && !Array.isArray(copy)) delete copy[seg];
  else copy[seg] = child;
  return copy;
}

/**
 * Apply the surviving edits in `edits` to `container`; prune the others. Returns the (possibly
 * copied) container.
 */
function applyEdits(container: unknown, edits: Map<string, GuiEdit>, keep: boolean): unknown {
  let out = container;
  for (const [path, rec] of edits) {
    const current = getIn(container, path);
    if (!keep || !deepEqual(current, rec.preGui)) {
      edits.delete(path);
      continue;
    }
    if (deepEqual(current, rec.gui)) continue;
    const written = setInCopy(out, parsePath(path), 0, rec.gui);
    if (written === FAIL) edits.delete(path);
    else out = written;
  }
  return out;
}

/**
 * Carry recorded GUI edits over to the next figure (see the module docs for the rules).
 *
 * Never mutates `prev` or `next`: returns `next` itself when nothing needs writing, else a copy
 * that shares every untouched object and array with `next`. Prunes `state` of edits that no longer
 * apply.
 *
 * @param prev - The figure currently shown; supplies the old `uirevision` values and the old trace
 * identities.
 * @param next - The figure passed to `react`.
 */
export function applyUirevision(prev: FigureInput, next: FigureInput, state: UiState): FigureInput {
  const prevLayout = isPlainObject(prev.layout) ? prev.layout : undefined;
  const nextLayout = isPlainObject(next.layout) ? next.layout : undefined;
  const oldLayoutRev = prevLayout?.['uirevision'];
  const newLayoutRev = nextLayout?.['uirevision'];

  let layoutOut: unknown = next.layout;
  if (state.layout.size > 0) {
    layoutOut = applyEdits(next.layout, state.layout, revisionKept(oldLayoutRev, newLayoutRev));
  }

  const prevData = Array.isArray(prev.data) ? prev.data : [];
  const nextData = Array.isArray(next.data) ? next.data : [];
  let dataOut: unknown[] | undefined;
  for (const [key, edits] of state.traces) {
    const pi = findTrace(prevData, key);
    const ni = findTrace(nextData, key);
    const oldTrace: unknown = pi === undefined ? undefined : prevData[pi];
    const newTrace: unknown = ni === undefined ? undefined : nextData[ni];
    if (ni === undefined || !isPlainObject(oldTrace) || !isPlainObject(newTrace)) {
      state.traces.delete(key);
      continue;
    }
    const oldRev = oldTrace['uirevision'] ?? oldLayoutRev;
    const newRev = newTrace['uirevision'] ?? newLayoutRev;
    const written = applyEdits(newTrace, edits, revisionKept(oldRev, newRev));
    if (written !== newTrace) {
      dataOut ??= nextData.slice();
      dataOut[ni] = written;
    }
    if (edits.size === 0) state.traces.delete(key);
  }

  if (layoutOut === next.layout && dataOut === undefined) return next;
  const out: FigureInput = { ...next };
  if (layoutOut !== next.layout) out.layout = layoutOut;
  if (dataOut !== undefined) out.data = dataOut;
  return out;
}
