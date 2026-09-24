/**
 * Scatter cross-trace calc (plan E9.4): stacked areas (plotly.js `scatter/cross_trace_calc.js`)
 * and fill linking (`scatter/link_traces.js`), once per subplot with every visible scatter trace
 * on it, in trace order.
 *
 * - **Linking.** A `tonext*` fill fills to the previous visible trace on the subplot with the same
 *   `stackgroup` (unstacked traces link among themselves). The first trace of each such group is
 *   marked too: its `tonext*` fill reaches the axis, which the autorange includes.
 * - **Stacking.** The traces of each `stackgroup` stack in trace order along their value axis
 *   (y for `orientation: 'v'`), with the group's `groupnorm` and `stackgaps` (see
 *   `shared/stack/area.ts`). Only numeric (linear or log) value axes stack, as in Plotly.
 *
 * The calc's `x` / `y` are replaced by the stacked positions of the points; the coordinates calc
 * produced are kept in `stack.raw`, so a rerun (when another member changed) restacks from them.
 *
 * ## Changed report
 *
 * The runtime reruns this for the whole subplot when any scatter trace on it was recalculated, and
 * redraws only the traces it returns (see `TraceModule.crossTraceCalc`): others keep their update
 * plan, including the streaming `plan.append`. A calc is *fresh* when `calc` / `calcAppend` made
 * it this pass (it has no `link` yet: only this function sets one); else it is the calc the
 * previous run mutated, and it is compared with what it held then. A trace is reported when:
 *
 * - it is fresh and stacked (its coordinates were replaced by stacked ones) — a fresh unstacked
 *   trace is not: the runtime already gives it a calc (or append) plan for what calc produced;
 * - it is not fresh and its drawn state moved: its `x` / `y` values, whether it is stacked, its
 *   stack (path, values, slots, orientation, `groupnorm`), whether it is the first of its group,
 *   or its fill link (a different or no previous trace, a previous trace that is itself reported
 *   or whose drawn path options or draw order changed — the `tonext*` boundary moved).
 *
 * An unreported calc that was not fresh gets back its previous arrays, stack and error bars, so
 * nothing downstream (views, memos keyed on array identity, hover indexes) sees a change. Its new
 * `link` stays (equal to the old one, with the current full traces).
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { AxisInfo, CrossTraceContext, CrossTraceEntry } from '@mk7s/holochart-runtime';
import { calcErrorBars } from '../shared/error-bars/index.ts';
import { traceRenderOrder } from '../shared/render-order.ts';
import { sameValues, stackAreas, type AreaStackInput } from '../shared/stack/index.ts';
import type { ScatterCalc, ScatterLink, ScatterStack } from './calc.ts';
import { stackGroupOptions, type StackGroupOptions } from './defaults.ts';
import { linksToPrevious } from './fill.ts';

function groupOf(entry: CrossTraceEntry<ScatterCalc>): string {
  const g = entry.trace['stackgroup'];
  return typeof g === 'string' ? g : '';
}

/** Linear coordinate → calc value on the value axis (stacking adds data values, not logs). */
function toCalc(axis: AxisInfo, l: number): number {
  return axis.type === 'log' ? 10 ** l : l;
}

/** Calc value → linear coordinate (NaN where a log axis cannot show it). */
function toLinear(axis: AxisInfo, c: number): number {
  if (axis.type !== 'log') return c;
  return c > 0 ? Math.log10(c) : NaN;
}

/** What a calc held before this run, to tell whether the run changed it. */
interface CalcState {
  /** Made by `calc` / `calcAppend` this pass (no link yet), so nothing to compare with. */
  readonly fresh: boolean;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly errorX: ScatterCalc['errorX'];
  readonly errorY: ScatterCalc['errorY'];
  readonly stack: ScatterStack | undefined;
  readonly link: ScatterLink | undefined;
}

function snapshot(calc: ScatterCalc): CalcState {
  return {
    fresh: calc.link === undefined,
    x: calc.x,
    y: calc.y,
    errorX: calc.errorX,
    errorY: calc.errorY,
    stack: calc.stack,
    link: calc.link,
  };
}

/** Whether two stacks draw the same (the raw coordinates are compared through `x` / `y`). */
function sameStack(a: ScatterStack | undefined, b: ScatterStack | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.orientation === b.orientation &&
    a.normalized === b.normalized &&
    sameValues(a.path.x, b.path.x) &&
    sameValues(a.path.y, b.path.y) &&
    sameValues(a.value, b.value) &&
    sameValues(a.slotIndex, b.slotIndex)
  );
}

/**
 * What a `tonext*` fill reads from the trace it fills to, besides its calc: the drawn path options
 * (as `fill-trace.ts` builds them: `line.shape`, `line.smoothing`, `connectgaps`) and its draw
 * order (the fill draws in that trace's group).
 */
function previousKey(trace: FullTrace, index: number): string {
  const line = (trace['line'] ?? {}) as { shape?: unknown; smoothing?: unknown };
  return JSON.stringify([
    line.shape,
    line.smoothing,
    trace['connectgaps'],
    traceRenderOrder(trace, index),
  ]);
}

/** Whether a fill link is unchanged, given the calcs reported changed so far. */
function sameLink(
  a: ScatterLink | undefined,
  b: ScatterLink | undefined,
  changed: ReadonlySet<ScatterCalc>,
): boolean {
  if (!a || !b) return a === b;
  if (a.first !== b.first) return false;
  const p = a.previous;
  const q = b.previous;
  if (!p || !q) return p === q;
  return (
    p.calc === q.calc &&
    p.index === q.index &&
    !changed.has(q.calc) &&
    (p.trace === q.trace || previousKey(p.trace, p.index) === previousKey(q.trace, q.index))
  );
}

/**
 * Scatter `crossTraceCalc`: fill links and stacked areas; returns the data indices of the traces
 * whose views must redraw (see the module docs).
 */
export function scatterCrossTraceCalc(
  entries: readonly CrossTraceEntry<ScatterCalc>[],
  ctx: CrossTraceContext,
): number[] {
  const before = entries.map((e) => snapshot(e.calc));
  // Restore unstacked coordinates first: group membership or options may have changed.
  for (const e of entries) {
    const raw = e.calc.stack?.raw;
    if (!raw) continue;
    e.calc.x = raw.x;
    e.calc.y = raw.y;
    e.calc.stack = undefined;
    e.calc.errorX = calcErrorBars(e.trace, 'x', raw.x, ctx.xaxis.type);
    e.calc.errorY = calcErrorBars(e.trace, 'y', raw.y, ctx.yaxis.type);
  }

  const previous = new Map<string, CrossTraceEntry<ScatterCalc>>();
  const stacks = new Map<string, CrossTraceEntry<ScatterCalc>[]>();
  for (const e of entries) {
    const group = groupOf(e);
    const prev = previous.get(group);
    const link: ScatterLink = {
      first: prev === undefined,
      ...(prev && linksToPrevious(e.trace['fill'])
        ? { previous: { calc: prev.calc, trace: prev.trace, index: prev.index } }
        : {}),
    };
    e.calc.link = link;
    previous.set(group, e);
    if (group !== '') {
      const members = stacks.get(group);
      if (members) members.push(e);
      else stacks.set(group, [e]);
    }
  }

  for (const members of stacks.values()) {
    const first = members[0] as CrossTraceEntry<ScatterCalc>;
    const opts = stackGroupOptions(ctx.fullLayout, first.trace);
    if (opts) stackGroup(members, opts, ctx);
  }

  // Report what moved; give what did not its previous arrays back (in trace order: a link
  // reaches back to a trace whose verdict is known).
  const changed: number[] = [];
  const changedCalcs = new Set<ScatterCalc>();
  entries.forEach(({ calc, index }, k) => {
    const was = before[k] as CalcState;
    const moved = was.fresh
      ? calc.stack !== undefined
      : !sameValues(was.x, calc.x) ||
        !sameValues(was.y, calc.y) ||
        !sameStack(was.stack, calc.stack) ||
        !sameLink(was.link, calc.link, changedCalcs);
    if (moved) {
      changed.push(index);
      changedCalcs.add(calc);
    } else if (!was.fresh) {
      calc.x = was.x;
      calc.y = was.y;
      calc.errorX = was.errorX;
      calc.errorY = was.errorY;
      calc.stack = was.stack;
    }
  });
  return changed;
}

/** Stack one group's traces (in trace order) and write their stacked coordinates. */
function stackGroup(
  members: readonly CrossTraceEntry<ScatterCalc>[],
  opts: StackGroupOptions,
  ctx: CrossTraceContext,
): void {
  const vertical = opts.orientation === 'v';
  const valueAxis = vertical ? ctx.yaxis : ctx.xaxis;
  if (valueAxis.type !== 'linear' && valueAxis.type !== 'log') return;
  const inputs: AreaStackInput[] = members.map(({ calc }) => {
    const pos = vertical ? calc.x : calc.y;
    const val = vertical ? calc.y : calc.x;
    return { pos, size: val.map((l) => toCalc(valueAxis, l)) };
  });
  const outputs = stackAreas(inputs, { groupnorm: opts.groupnorm, stackgaps: opts.stackgaps });
  members.forEach(({ calc, trace }, k) => {
    const out = outputs[k]!;
    const raw = { x: calc.x, y: calc.y };
    const top = out.top.map((c) => toLinear(valueAxis, c));
    const pointTop = out.pointTop.map((c) => toLinear(valueAxis, c));
    const pos = vertical ? raw.x : raw.y;
    // Points that stack nowhere (bad position or size) are not drawn.
    const placed = pos.map((p, i) => (Number.isFinite(pointTop[i]) ? p : NaN));
    calc.x = vertical ? placed : pointTop;
    calc.y = vertical ? pointTop : placed;
    const slotIndex = out.index.map((i, j) => (out.gap[j] ? -1 : i));
    calc.stack = {
      raw,
      path: vertical ? { x: out.pos, y: top } : { x: top, y: out.pos },
      value: out.pointValue,
      slotIndex,
      orientation: opts.orientation,
      normalized: opts.groupnorm !== '',
    };
    // Error bars sit on the stacked points.
    calc.errorX = calcErrorBars(trace, 'x', calc.x, ctx.xaxis.type);
    calc.errorY = calcErrorBars(trace, 'y', calc.y, ctx.yaxis.type);
  });
}
