/**
 * Update planner (plan E1.7): map changed attribute paths to the minimal set of pipeline stages
 * to re-run, using each attribute's declared `editType`.
 *
 * Supply-defaults always re-runs on update (it is cheap and keeps `full*` consistent); the plan
 * decides which of the expensive stages after it are needed.
 */
import type { FullLayout, FullTrace } from '../defaults/types.ts';
import { parsePath } from '../path/path.ts';
import type { Registry } from '../registry/types.ts';
import { forEachAttr, inheritedEditType, walkPath } from '../schema/walk.ts';
import type { EditFlag, ObjectNode, SchemaNode } from '../schema/types.ts';

/** A pipeline stage an update can trigger. */
export type Stage = Exclude<EditFlag, 'none' | 'calcIfAutorange'>;

/** Stages in pipeline order. */
export const STAGE_ORDER: readonly Stage[] = [
  'calc',
  'crossTraceCalc',
  'layout',
  'ticks',
  'plot',
  'style',
  'legend',
  'colorbars',
  'modebar',
  'camera',
];

/** A changed attribute: a trace attribute (of a given type) or a layout attribute. */
export type Change =
  | { target: 'trace'; type: string; path: string; traceIndex?: number }
  | { target: 'layout'; path: string };

/** Options for {@link planUpdate}. */
export interface PlanOptions {
  registry: Registry;
  /** Used to resolve `calcIfAutorange` for trace changes with a `traceIndex`. */
  fullData?: readonly FullTrace[];
  fullLayout?: FullLayout;
  /** Log the plan (config.debug). */
  debug?: boolean;
  /** Logger used in debug mode (default `console.debug`). */
  log?: (message: string) => void;
}

const subtreeCache = new WeakMap<SchemaNode, readonly EditFlag[]>();

/** Union of the edit types of every attribute under a container (e.g. relayout of `xaxis`). */
function subtreeFlags(node: SchemaNode, inherited: readonly EditFlag[]): readonly EditFlag[] {
  if (node.kind === 'attr') return inheritedEditType([node]) ?? inherited;
  const cached = subtreeCache.get(node);
  if (cached) return cached;
  const own = inheritedEditType([node]) ?? inherited;
  const flags = new Set<EditFlag>(own);
  const container = node.kind === 'items' ? node : (node as ObjectNode);
  forEachAttr(container, (_path, _spec, chain) => {
    for (const f of inheritedEditType(chain) ?? own) flags.add(f);
  });
  const out = [...flags];
  // Without its own editType the result depends on the ancestors, so it can't be cached per node.
  if (node.editType !== undefined) subtreeCache.set(node, out);
  return out;
}

/**
 * The edit flags for `path` within `schema`: the attribute's own (or inherited) `editType`, or the
 * union over the subtree when `path` names a container. Unknown paths get `['calc']`, the safe
 * choice.
 */
export function editFlagsForPath(schema: ObjectNode, path: string): readonly EditFlag[] {
  let walked;
  try {
    walked = walkPath(schema, parsePath(path));
  } catch {
    return ['calc'];
  }
  if (!walked) return ['calc'];
  const inherited = inheritedEditType([schema, ...walked.chain]) ?? ['calc'];
  return walked.node.kind === 'attr' ? inherited : subtreeFlags(walked.node, inherited);
}

function autoranged(change: Change, opts: PlanOptions): boolean {
  if (change.target !== 'trace' || change.traceIndex === undefined) return true;
  const trace = opts.fullData?.[change.traceIndex];
  const layout = opts.fullLayout;
  if (!trace || !layout) return true;
  for (const [attr, family] of [
    ['xaxis', 'xaxis'],
    ['yaxis', 'yaxis'],
  ] as const) {
    const id = trace[attr];
    if (typeof id !== 'string') continue;
    const ax = layout[family + id.slice(1)] as { autorange?: unknown } | undefined;
    if (!ax || ax.autorange !== false) return true;
  }
  return false;
}

/**
 * Merge the edit flags of every changed path into the set of stages to run.
 *
 * `calcIfAutorange` becomes `calc` when an axis of the changed trace autoranges (or when that
 * cannot be determined), else `plot`. `none` contributes nothing. The returned set holds only the
 * declared stages; use {@link expandStages} for the full downstream closure a pipeline executes.
 *
 * @example
 * ```ts
 * planUpdate([{ target: 'trace', type: 'scatter', path: 'marker.color' }], { registry }); // {'style'}
 * planUpdate([{ target: 'layout', path: 'xaxis.range' }], { registry });                  // {'ticks','plot'}
 * ```
 */
export function planUpdate(changes: Iterable<Change>, opts: PlanOptions): Set<Stage> {
  const stages = new Set<Stage>();
  const lines: string[] = [];
  for (const change of changes) {
    const schema =
      change.target === 'layout'
        ? opts.registry.getLayoutSchema()
        : opts.registry.getTraceSchema(change.type);
    const flags: readonly EditFlag[] = schema ? editFlagsForPath(schema, change.path) : ['calc'];
    const added: Stage[] = [];
    for (const f of flags) {
      if (f === 'none') continue;
      const stage: Stage =
        f === 'calcIfAutorange' ? (autoranged(change, opts) ? 'calc' : 'plot') : f;
      stages.add(stage);
      added.push(stage);
    }
    if (opts.debug === true) {
      const where = change.target === 'layout' ? 'layout' : `${change.type}`;
      lines.push(`  ${where}.${change.path}: ${flags.join('+')} → ${added.join(', ') || '∅'}`);
    }
  }
  if (opts.debug === true) {
    const log = opts.log ?? ((m: string) => console.debug(m));
    const ordered = STAGE_ORDER.filter((s) => stages.has(s));
    log(`[holochart] update plan: ${ordered.join(', ') || 'no stages'}\n${lines.join('\n')}`);
  }
  return stages;
}

const DOWNSTREAM: Readonly<Record<Stage, readonly Stage[]>> = {
  calc: ['crossTraceCalc', 'layout', 'ticks', 'plot', 'style', 'legend', 'colorbars'],
  crossTraceCalc: ['layout', 'ticks', 'plot', 'style'],
  layout: ['ticks', 'plot'],
  ticks: [],
  plot: ['style'],
  style: [],
  legend: [],
  colorbars: [],
  modebar: [],
  camera: [],
};

/**
 * The stages a pipeline must execute for a plan, including everything downstream of each planned
 * stage (e.g. `calc` implies `layout`, `plot`, …), in pipeline order.
 */
export function expandStages(stages: Iterable<Stage>): Stage[] {
  const all = new Set<Stage>();
  for (const s of stages) {
    all.add(s);
    for (const d of DOWNSTREAM[s]) all.add(d);
  }
  return STAGE_ORDER.filter((s) => all.has(s));
}

/**
 * Plan a `restyle`: every attribute path in `update` applied to the given traces.
 *
 * @param update - Attribute strings to new values, e.g. `{ 'marker.color': 'red' }`.
 * @param traceIndices - Traces the update applies to (all traces when omitted).
 */
export function planRestyle(
  update: Readonly<Record<string, unknown>>,
  fullData: readonly FullTrace[],
  opts: PlanOptions,
  traceIndices: readonly number[] = fullData.map((_, i) => i),
): Set<Stage> {
  const changes: Change[] = [];
  for (const i of traceIndices) {
    const trace = fullData[i];
    if (!trace) continue;
    for (const path of Object.keys(update)) {
      changes.push({ target: 'trace', type: trace.type, path, traceIndex: i });
    }
  }
  return planUpdate(changes, { ...opts, fullData });
}

/** Plan a `relayout`: every attribute path in `update`. */
export function planRelayout(
  update: Readonly<Record<string, unknown>>,
  opts: PlanOptions,
): Set<Stage> {
  return planUpdate(
    Object.keys(update).map((path) => ({ target: 'layout', path })),
    opts,
  );
}
