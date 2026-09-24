/**
 * Accessible descriptions of box and violin traces (plan E17.1): the box count, the sample count
 * and the range of the medians, plus a table of every box's five-number summary and mean,
 * formatted like the axes' hover labels.
 */
import { getIn } from '@mk7s/holochart-core';
import {
  accessibleText,
  countText,
  formatAxisValue,
  traceNameText,
  type AxisInfo,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import { boxAxes, calcToLinear, type BoxCalc } from './calc.ts';

function axisTitle(axis: AxisInfo | undefined, fallback: string): string {
  return accessibleText(axis ? getIn(axis.full, 'title.text') : undefined) || fallback;
}

/** The `describe()` of box (and violin) traces. */
export function describeBox(ctx: DescribeContext<BoxCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const horizontal = calc.orientation === 'h';
  const [pa, va] = boxAxes(calc.orientation, ctx.xaxis, ctx.yaxis);
  const shape = calc.kind === 'violin' ? 'violin' : 'box';
  const label = `${horizontal ? 'Horizontal ' : ''}${shape}`;
  const name = traceNameText(trace['name'], ctx.index);
  const fp = (l: number): string => formatAxisValue(pa, l);
  const fv = (c: number): string => formatAxisValue(va, calcToLinear(calc.valType, c));
  const { stats, count } = calc;

  let samples = 0;
  for (let b = 0; b < count; b++) samples += stats.n[b]!;
  let summary = `${label.charAt(0).toUpperCase()}${label.slice(1)} plot "${name}": ${countText(count, shape, shape === 'box' ? 'boxes' : 'violins')}`;
  summary += calc.precomputed
    ? ' from precomputed statistics.'
    : `, ${countText(samples, 'sample')}.`;
  if (count > 0) {
    let low = 0;
    let high = 0;
    for (let b = 1; b < count; b++) {
      if (stats.med[b]! < stats.med[low]!) low = b;
      if (stats.med[b]! > stats.med[high]!) high = b;
    }
    summary +=
      count > 1
        ? ` Medians from ${fv(stats.med[low]!)} at ${fp(calc.pos[low]!)} to ${fv(stats.med[high]!)} at ${fp(calc.pos[high]!)}.`
        : ` Median ${fv(stats.med[0]!)}, quartiles ${fv(stats.q1[0]!)} to ${fv(stats.q3[0]!)}.`;
  }

  const [pl, vl] = horizontal ? ['y', 'x'] : ['x', 'y'];
  const valueTitle = axisTitle(va, vl);
  const columns = [
    axisTitle(pa, pl),
    'samples',
    `min ${valueTitle}`,
    'q1',
    'median',
    'q3',
    'max',
    'mean',
  ];
  const rows: string[][] = [];
  for (let b = 0; b < Math.min(count, ctx.maxRows); b++) {
    rows.push([
      fp(calc.pos[b]!),
      String(stats.n[b]!),
      fv(stats.min[b]!),
      fv(stats.q1[b]!),
      fv(stats.med[b]!),
      fv(stats.q3[b]!),
      fv(stats.max[b]!),
      fv(stats.mean[b]!),
    ]);
  }
  return {
    kind: horizontal ? `horizontal ${shape}` : shape,
    summary,
    table: { caption: name, columns, rows, total: count },
  };
}
