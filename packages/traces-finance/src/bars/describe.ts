/**
 * Accessible descriptions of the bar-like financial traces (plan E17.1): a summary line and a
 * table of the first bars (position and value columns), formatted like the axes' hover labels.
 */
import { getIn } from '@mk7s/holochart-core';
import {
  accessibleText,
  countText,
  formatAxisValue,
  formatPlainNumber,
  traceNameText,
  type AxisInfo,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import type { BarCalc } from '@mk7s/holochart-traces-basic';

function axisTitle(axis: AxisInfo | undefined, fallback: string): string {
  return accessibleText(axis ? getIn(axis.full, 'title.text') : undefined) || fallback;
}

/** Formatters of a bar-like calc's position (linear) and size (calc space) values. */
export function describeFormatters(ctx: DescribeContext<BarCalc>): {
  position: (l: number) => string;
  size: (c: number) => string;
} {
  const { calc } = ctx;
  const [pa, sa] = calc.orientation === 'h' ? [ctx.yaxis, ctx.xaxis] : [ctx.xaxis, ctx.yaxis];
  return {
    position: (l) => formatAxisValue(pa, l),
    size: (c) =>
      sa ? formatAxisValue(sa, calc.sizeType === 'log' ? Math.log10(c) : c) : formatPlainNumber(c),
  };
}

/**
 * A description with `summary` after the trace kind, name and bar count, and a table with the
 * position and `columns` per bar (`row(i)` gives those cells).
 */
export function describeBarLike(
  ctx: DescribeContext<BarCalc>,
  kind: string,
  summary: string,
  columns: readonly string[],
  row: (i: number) => readonly string[],
): TraceDescription {
  const { trace, calc } = ctx;
  const name = traceNameText(trace['name'], ctx.index);
  const pa = calc.orientation === 'h' ? ctx.yaxis : ctx.xaxis;
  const letter = calc.orientation === 'h' ? 'y' : 'x';
  const f = describeFormatters(ctx);
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  const rows: string[][] = [];
  for (let i = 0; i < Math.min(calc.length, ctx.maxRows); i++) {
    rows.push([f.position(calc.pos[i]!), ...row(i)]);
  }
  return {
    kind,
    summary: `${label} "${name}": ${countText(calc.length, 'bar')}.${summary ? ` ${summary}` : ''}`,
    table: {
      caption: name,
      columns: [axisTitle(pa, letter), ...columns],
      rows,
      total: calc.length,
    },
  };
}
