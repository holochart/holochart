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
 */
import type { AxisInfo, CrossTraceContext, CrossTraceEntry } from '@mk7s/holochart-runtime';
import { calcErrorBars } from '../shared/error-bars/index.ts';
import { stackAreas, type AreaStackInput } from '../shared/stack/index.ts';
import type { ScatterCalc, ScatterLink } from './calc.ts';
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

/** Scatter `crossTraceCalc`: fill links and stacked areas (see the module docs). */
export function scatterCrossTraceCalc(
  entries: readonly CrossTraceEntry<ScatterCalc>[],
  ctx: CrossTraceContext,
): void {
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
