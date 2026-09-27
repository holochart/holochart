/**
 * Accessible description of heatmaps (plan E17.1): the grid size, the value range and where the
 * highest value is; the table lists the cells with a value (first rows only).
 */
import {
  formatPlainNumber,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import { axisHoverText } from '@mk7s/holochart-traces-stats';
import type { HeatmapCalc } from './calc.ts';

/** `describe()` of heatmap traces. */
export function describeHeatmap(ctx: DescribeContext<HeatmapCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const kind = 'heatmap';
  const name = traceNameText(trace['name'], ctx.index);
  if (calc.nx === 0 || calc.ny === 0) return { kind, summary: `Heatmap "${name}": no data.` };
  const xt = (i: number): string =>
    axisHoverText(ctx.xaxis, calc.x.centers[i]!, trace['xhoverformat']);
  const yt = (j: number): string =>
    axisHoverText(ctx.yaxis, calc.y.centers[j]!, trace['yhoverformat']);
  let best = -1;
  for (let c = 0; c < calc.z.length; c++) {
    const v = calc.z[c]!;
    if (Number.isFinite(v) && (best < 0 || v > calc.z[best]!)) best = c;
  }
  let summary = `Heatmap "${name}": ${calc.nx} × ${calc.ny} cells.`;
  if (best >= 0) {
    const [lo, hi] = calc.zExtent;
    summary += ` Values from ${formatPlainNumber(lo)} to ${formatPlainNumber(hi)}; highest at x ${xt(best % calc.nx)}, y ${yt(Math.floor(best / calc.nx))}.`;
  }
  const rows: string[][] = [];
  let total = 0;
  for (let j = 0; j < calc.ny; j++) {
    for (let i = 0; i < calc.nx; i++) {
      const v = calc.z[j * calc.nx + i]!;
      if (!Number.isFinite(v)) continue;
      total++;
      if (rows.length < ctx.maxRows) rows.push([xt(i), yt(j), formatPlainNumber(v)]);
    }
  }
  return { kind, summary, table: { caption: name, columns: ['x', 'y', 'z'], rows, total } };
}
