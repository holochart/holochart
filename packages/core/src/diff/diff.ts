/**
 * Figure diffing for `react` (plan E1.8): compare the previous and next figure *input* and report
 * the changed attribute paths, so the update planner (E1.7) can re-run only the stages they
 * invalidate, and the scene can keep the objects of traces that merely moved.
 *
 * Rules, and why:
 *
 * - **Data arrays compare by reference.** `data_array` attributes, array values of `arrayOk`
 *   attributes and dataset columns are never walked: same reference ⇒ unchanged, even if mutated
 *   in place. Changing `layout.datarevision` marks every data array changed, which is the escape
 *   hatch for apps that mutate in place. Small arrays (`range`, `colorway`, colorscales) compare by
 *   value, so fresh literals on every React render are not edits.
 * - **Leaf paths.** A container that appears or disappears is walked as if the missing side were
 *   `{}`, because under defaults a missing container means the same as an empty one; reporting the
 *   container itself would plan the union of its whole subtree (usually `calc`) for a change such
 *   as adding `marker: { color }`. Items arrays (`annotations`) are different: an item's existence
 *   is visible, so an appearing/disappearing item is reported as `annotations[i]`.
 * - **Unknown attributes still diff.** Paths outside the schema are reported like any other and
 *   plan as `calc` (see `editFlagsForPath`). Arrays there compare by reference, since nothing says
 *   they are small.
 * - Keys starting with `_` are internal (`_input`, `_index`) and ignored, as in Plotly.
 *
 * Only the input is compared, so an object mutated in place and passed again (`prev === next`)
 * cannot show a change. The update API should hand `react` new objects (the usual immutability
 * contract of React/Vue) or bump `datarevision` for in-place data edits.
 */
import { isColumnRef } from '../data/datasets.ts';
import type { FigureInput } from '../defaults/types.ts';
import { planUpdate, type Change, type PlanOptions, type Stage } from '../edit/plan.ts';
import { stringifyPath, type PathSegment } from '../path/path.ts';
import type { Registry } from '../registry/types.ts';
import { resolveChild } from '../schema/walk.ts';
import type { AttrSpec, ItemsNode, ObjectNode, SchemaNode } from '../schema/types.ts';
import { isPlainObject } from '../util/objects.ts';
import { MAX_DEPTH, deepEqual, isArrayLike, own } from './equal.ts';

/** A trace present in both figures: index `from` in the previous `data`, `to` in the next. */
export interface TraceMatch {
  from: number;
  to: number;
}

/** How the traces of two figures correspond (see {@link matchTraces}). */
export interface TraceMatching {
  /** Indices in the next `data` of traces with no previous counterpart (build new objects). */
  added: number[];
  /** Indices in the previous `data` of traces with no next counterpart (dispose their objects). */
  removed: number[];
  /** Every matched pair, sorted by `to`. Matched traces keep their scene objects. */
  matched: TraceMatch[];
  /** The matched pairs whose index changed (`from !== to`), sorted by `to`. */
  moved: TraceMatch[];
}

/** Result of {@link diffFigures}. */
export interface FigureDiff {
  /**
   * Changed attributes, ready for `planUpdate`. Trace changes carry `traceIndex` = index in the
   * NEXT `data`. An added trace is reported as a change of its `type` (which plans `calc`) at its
   * next index; a removed trace likewise, without `traceIndex`.
   */
  changes: Change[];
  /** Trace correspondence: which traces were added, removed, kept or moved. */
  traces: TraceMatching;
  /** `config` changed (by value). Config is read at creation time, so the chart must be re-created. */
  configChanged: boolean;
  /** `frames` changed (by reference; frames can hold whole datasets). */
  framesChanged: boolean;
  /**
   * Names of `datasets` entries that were added, removed, or had a column added, removed or
   * replaced (or every dataset when `datarevision` changed). Traces reading a changed column
   * through `'@column'` references already appear in `changes`.
   */
  datasetsChanged: string[];
  /** Nothing at all changed; `react` can return without touching the pipeline. */
  empty: boolean;
}

const EMPTY: Readonly<Record<string, unknown>> = Object.freeze({});
const EMPTY_ARRAY: readonly unknown[] = Object.freeze([]);

/**
 * Stages that depend on trace order: stacking/grouping (`crossTraceCalc`), draw order (`plot`),
 * colorway colors cycled by index (`style`) and legend order.
 */
const ORDER_STAGES: readonly Stage[] = ['crossTraceCalc', 'plot', 'style', 'legend'];

/** The effective trace type, defaulted exactly like supply-defaults does. */
function traceType(trace: Readonly<Record<string, unknown>>): string {
  const t = trace['type'];
  return typeof t === 'string' && t !== '' ? t : 'scatter';
}

function uidOf(trace: Readonly<Record<string, unknown>>): string | undefined {
  const uid = own(trace, 'uid');
  return typeof uid === 'string' && uid !== '' ? uid : undefined;
}

function asRecord(v: unknown): Readonly<Record<string, unknown>> {
  return isPlainObject(v) ? v : EMPTY;
}

function asData(v: unknown): readonly unknown[] {
  return Array.isArray(v) ? v : EMPTY_ARRAY;
}

const byTo = (a: TraceMatch, b: TraceMatch): number => a.to - b.to;

/**
 * Match the traces of two `data` arrays.
 *
 * Traces with a `uid` match only the trace with the same `uid`. Traces without one (and repeats of
 * a uid already seen in the same `data`, which cannot identify anything) match by position among
 * the other such traces: the k-th uid-less previous trace pairs with the k-th uid-less next trace, so
 * deleting a uid'd trace does not shift the pairing of the rest. A pair whose effective `type`
 * differs is reported as removed + added, since a trace module's scene objects cannot be reused by
 * another module.
 */
export function matchTraces(
  prevData: readonly unknown[],
  nextData: readonly unknown[],
): TraceMatching {
  // `Array.from` (not `map`) so holes in a sparse `data` array become `{}` traces, as they do in
  // supply-defaults, instead of holes that `forEach` below would skip.
  const prev = Array.from(prevData, asRecord);
  const next = Array.from(nextData, asRecord);
  const prevByUid = new Map<string, number>();
  const prevPositional: number[] = [];
  prev.forEach((t, i) => {
    const uid = uidOf(t);
    if (uid === undefined || prevByUid.has(uid)) prevPositional.push(i);
    else prevByUid.set(uid, i);
  });

  const matched: TraceMatch[] = [];
  const added: number[] = [];
  const nextPositional: number[] = [];
  const pair = (from: number, to: number): void => {
    if (traceType(prev[from] ?? EMPTY) === traceType(next[to] ?? EMPTY)) matched.push({ from, to });
    else added.push(to);
  };

  const nextUids = new Set<string>();
  next.forEach((t, j) => {
    const uid = uidOf(t);
    if (uid === undefined || nextUids.has(uid)) {
      nextPositional.push(j);
      return;
    }
    nextUids.add(uid);
    const i = prevByUid.get(uid);
    if (i === undefined) added.push(j);
    else pair(i, j);
  });
  nextPositional.forEach((j, k) => {
    const i = prevPositional[k];
    if (i === undefined) added.push(j);
    else pair(i, j);
  });

  const removed: number[] = [];
  const kept = new Set(matched.map((m) => m.from));
  for (let i = 0; i < prev.length; i++) if (!kept.has(i)) removed.push(i);
  matched.sort(byTo);
  added.sort((a, b) => a - b);
  return { added, removed, matched, moved: matched.filter((m) => m.from !== m.to) };
}

/** Changed columns of one dataset: a set of column names, or `'all'`. */
type ChangedColumns = ReadonlySet<string> | 'all';

function diffDatasets(
  prev: FigureInput['datasets'],
  next: FigureInput['datasets'],
  dataRev: boolean,
): Map<string, ChangedColumns> {
  const out = new Map<string, ChangedColumns>();
  const a = asRecord(prev);
  const b = asRecord(next);
  if (a === b && !dataRev) return out;
  for (const name of unionKeys(a, b)) {
    const ta = own(a, name);
    const tb = own(b, name);
    if (dataRev) {
      out.set(name, 'all');
      continue;
    }
    if (ta === tb) continue;
    if (!isPlainObject(ta) || !isPlainObject(tb)) {
      out.set(name, 'all');
      continue;
    }
    const cols = new Set<string>();
    for (const col of unionKeys(ta, tb)) if (own(ta, col) !== own(tb, col)) cols.add(col);
    if (cols.size > 0) out.set(name, cols);
  }
  return out;
}

/** Own keys of `a`, then those of `b` not in `a`, without allocating a set. */
function unionKeys(a: object, b: object): string[] {
  const keys = Object.keys(a);
  if (a === b) return keys;
  for (const k of Object.keys(b)) if (!Object.hasOwn(a, k)) keys.push(k);
  return keys;
}

interface Ctx {
  /** `layout.datarevision` changed: every data array counts as changed. */
  readonly dataRev: boolean;
  /** Changed columns of the dataset the current trace reads, if any. */
  readonly columns: ChangedColumns | undefined;
  /** Walk into identical subtrees too (to find data arrays / column references). */
  readonly deep: boolean;
  readonly segs: PathSegment[];
  readonly emit: (path: string) => void;
}

function columnChanged(v: unknown, spec: AttrSpec, ctx: Ctx): boolean {
  if (ctx.columns === undefined || !isColumnRef(v, spec)) return false;
  return ctx.columns === 'all' || ctx.columns.has(v.slice(1));
}

function emitHere(ctx: Ctx): void {
  ctx.emit(stringifyPath(ctx.segs));
}

function diffNode(
  a: unknown,
  b: unknown,
  node: SchemaNode | undefined,
  ctx: Ctx,
  depth: number,
): void {
  if (a === b && !ctx.deep) return;
  if (depth > MAX_DEPTH) {
    if (a !== b) emitHere(ctx);
    return;
  }
  if (node?.kind === 'attr') return diffAttr(a, b, node, ctx);
  if (node?.kind === 'items') return diffItems(a, b, node, ctx, depth);
  const aObj = isPlainObject(a);
  const bObj = isPlainObject(b);
  if ((aObj || a === undefined) && (bObj || b === undefined) && (aObj || bObj || node)) {
    return diffObject(aObj ? a : EMPTY, bObj ? b : EMPTY, node, ctx, depth);
  }
  if (node === undefined) return diffUnknown(a, b, ctx);
  // A schema container replaced by (or replacing) a non-object value.
  if (!deepEqual(a, b)) emitHere(ctx);
}

function diffObject(
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
  node: ObjectNode | undefined,
  ctx: Ctx,
  depth: number,
  skip?: string,
): void {
  for (const key of unionKeys(a, b)) {
    if (key.startsWith('_') || key === skip) continue;
    ctx.segs.push(key);
    diffNode(own(a, key), own(b, key), node && resolveChild(node, key), ctx, depth + 1);
    ctx.segs.pop();
  }
}

function diffItems(a: unknown, b: unknown, node: ItemsNode, ctx: Ctx, depth: number): void {
  if ((a !== undefined && !Array.isArray(a)) || (b !== undefined && !Array.isArray(b))) {
    if (!deepEqual(a, b)) emitHere(ctx);
    return;
  }
  const aa = a ?? EMPTY_ARRAY;
  const bb = b ?? EMPTY_ARRAY;
  const n = Math.max(aa.length, bb.length);
  for (let i = 0; i < n; i++) {
    ctx.segs.push(i);
    const ai: unknown = aa[i];
    const bi: unknown = bb[i];
    if (i >= aa.length || i >= bb.length) emitHere(ctx);
    else if (isPlainObject(ai) && isPlainObject(bi)) diffObject(ai, bi, node.item, ctx, depth + 1);
    else if (!deepEqual(ai, bi)) emitHere(ctx);
    ctx.segs.pop();
  }
}

function diffAttr(a: unknown, b: unknown, spec: AttrSpec, ctx: Ctx): void {
  if (spec.valType === 'data_array' || spec.arrayOk === true) {
    if (isArrayLike(a) || isArrayLike(b)) {
      if (a !== b || ctx.dataRev) emitHere(ctx);
      return;
    }
    if (columnChanged(b, spec, ctx) || !deepEqual(a, b)) emitHere(ctx);
    return;
  }
  if (!deepEqual(a, b)) emitHere(ctx);
}

function diffUnknown(a: unknown, b: unknown, ctx: Ctx): void {
  if (isArrayLike(a) || isArrayLike(b)) {
    if (a !== b || ctx.dataRev) emitHere(ctx);
    return;
  }
  // Attributes unknown to the schema are never resolved (see `resolveDataRefs`), so a column
  // change cannot reach them.
  if (!deepEqual(a, b)) emitHere(ctx);
}

/**
 * Diff two figure inputs (plan E1.8). Never mutates its arguments and never reads the contents of
 * data arrays, so its cost is proportional to the size of the spec, not of the data.
 *
 * @param prev - The figure currently shown (as input, i.e. before defaults).
 * @param next - The figure passed to `react`.
 * @param registry - Supplies trace and layout schemas, which decide which values are data arrays.
 *
 * @example
 * ```ts
 * const d = diffFigures(prev, next, registry);
 * if (!d.empty) {
 *   const stages = planDiff(d, { registry, fullData, fullLayout });
 *   // reuse scene objects for d.traces.matched, build d.traces.added, dispose d.traces.removed
 * }
 * ```
 */
export function diffFigures(prev: FigureInput, next: FigureInput, registry: Registry): FigureDiff {
  const changes: Change[] = [];
  const prevLayout = asRecord(prev.layout);
  const nextLayout = asRecord(next.layout);
  const dataRev = !deepEqual(own(prevLayout, 'datarevision'), own(nextLayout, 'datarevision'));
  const datasets = diffDatasets(prev.datasets, next.datasets, dataRev);

  diffObject(
    prevLayout,
    nextLayout,
    registry.getLayoutSchema(),
    {
      dataRev,
      columns: undefined,
      deep: dataRev,
      segs: [],
      emit: (path) => changes.push({ target: 'layout', path }),
    },
    0,
  );

  const prevData = asData(prev.data);
  const nextData = asData(next.data);
  const traces = matchTraces(prevData, nextData);

  for (const { from, to } of traces.matched) {
    const a = asRecord(prevData[from]);
    const b = asRecord(nextData[to]);
    const type = traceType(b);
    const ds = own(b, 'dataset');
    const columns = typeof ds === 'string' ? datasets.get(ds) : undefined;
    const ctx: Ctx = {
      dataRev,
      columns,
      deep: dataRev || columns !== undefined,
      segs: [],
      emit: (path) => changes.push({ target: 'trace', type, path, traceIndex: to }),
    };
    // Matched traces have the same effective type; a raw `type` going from unset to 'scatter' is
    // not a change.
    diffObject(a, b, registry.getTraceSchema(type), ctx, 0, 'type');
  }
  for (const i of traces.removed) {
    changes.push({ target: 'trace', type: traceType(asRecord(prevData[i])), path: 'type' });
  }
  for (const j of traces.added) {
    changes.push({
      target: 'trace',
      type: traceType(asRecord(nextData[j])),
      path: 'type',
      traceIndex: j,
    });
  }

  const configChanged = !deepEqual(prev.config, next.config);
  const framesChanged = prev.frames !== next.frames;
  const datasetsChanged = [...datasets.keys()];
  return {
    changes,
    traces,
    configChanged,
    framesChanged,
    datasetsChanged,
    empty:
      changes.length === 0 &&
      traces.moved.length === 0 &&
      !configChanged &&
      !framesChanged &&
      datasetsChanged.length === 0,
  };
}

/**
 * The stages to run for a diff: `planUpdate` over its changes, plus the order-dependent stages
 * (stacking, draw order, colorway cycling, legend order) when traces moved. Moves are not
 * attribute changes, so `planUpdate(diff.changes)` alone would miss them.
 *
 * Like `planUpdate`, returns only the declared stages; pass the result to `expandStages` for the
 * downstream closure.
 */
export function planDiff(diff: FigureDiff, opts: PlanOptions): Set<Stage> {
  const stages = planUpdate(diff.changes, opts);
  if (diff.traces.moved.length > 0) for (const s of ORDER_STAGES) stages.add(s);
  return stages;
}
