/**
 * Accessible description of 2D histograms (plan E17.1): the grid size, how many samples were
 * binned, and the fullest cell with its bin ranges; the table lists the non-empty cells (first
 * rows only).
 */
import {
  countText,
  formatPlainNumber,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import type { Histogram2dCalc } from './calc.ts';
import { binRangeText } from './hover.ts';

/** `describe()` of histogram2d and histogram2dcontour. */
export function describeHistogram2d(ctx: DescribeContext<Histogram2dCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const contour = trace.type === 'histogram2dcontour';
  const kind = contour ? '2D density contour' : '2D histogram';
  const name = traceNameText(trace['name'], ctx.index);
  const label = contour ? '2D density contour' : '2D histogram';
  if (calc.nx === 0 || calc.ny === 0) {
    return { kind, summary: `${label} "${name}": no data.` };
  }
  const xr = (i: number): string => binRangeText(calc.x, i, ctx.xaxis, trace['xhoverformat']);
  const yr = (j: number): string => binRangeText(calc.y, j, ctx.yaxis, trace['yhoverformat']);
  let best = -1;
  for (let c = 0; c < calc.z.length; c++) {
    const v = calc.z[c]!;
    if (Number.isFinite(v) && (best < 0 || v > calc.z[best]!)) best = c;
  }
  let summary = `${label} "${name}": ${countText(calc.binned, 'sample')} in ${calc.nx} × ${calc.ny} bins.`;
  if (best >= 0) {
    const i = best % calc.nx;
    const j = Math.floor(best / calc.nx);
    summary += ` Highest value ${formatPlainNumber(calc.z[best]!)} at x ${xr(i)}, y ${yr(j)}.`;
  }
  const rows: string[][] = [];
  let total = 0;
  for (let j = 0; j < calc.ny; j++) {
    for (let i = 0; i < calc.nx; i++) {
      const v = calc.z[j * calc.nx + i]!;
      if (!Number.isFinite(v) || v === 0) continue;
      total++;
      if (rows.length < ctx.maxRows) rows.push([xr(i), yr(j), formatPlainNumber(v)]);
    }
  }
  return {
    kind,
    summary,
    table: { caption: name, columns: ['x', 'y', 'z'], rows, total },
  };
}
