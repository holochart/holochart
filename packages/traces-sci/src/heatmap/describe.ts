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
import { heatmapZStats, type HeatmapCalc } from './calc.ts';

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
  // From calc: a description is rebuilt after every run, and a pass over 16.7M cells takes 40 ms.
  const { maxAt: best, finite: total } = heatmapZStats(calc.z);
  let summary = `Heatmap "${name}": ${calc.nx} × ${calc.ny} cells.`;
  if (best >= 0) {
    const [lo, hi] = calc.zExtent;
    summary += ` Values from ${formatPlainNumber(lo)} to ${formatPlainNumber(hi)}; highest at x ${xt(best % calc.nx)}, y ${yt(Math.floor(best / calc.nx))}.`;
  }
  const { nx, z } = calc;
  const size = nx * calc.ny;
  const cell = (c: number): string[] => [
    xt(c % nx),
    yt(Math.floor(c / nx)),
    formatPlainNumber(z[c]!),
  ];
  const rows: string[][] = [];
  for (let c = 0; c < size && rows.length < Math.min(ctx.maxRows, total); c++) {
    if (Number.isFinite(z[c]!)) rows.push(cell(c));
  }
  // Row `k` of all `total` rows: the grid index of every listed cell, built on first use.
  let cells: Int32Array | undefined;
  const row = (k: number): string[] => {
    if (total === size) return cell(k);
    if (!cells) {
      cells = new Int32Array(total);
      for (let c = 0, m = 0; c < size; c++) if (Number.isFinite(z[c]!)) cells[m++] = c;
    }
    return cell(cells[k]!);
  };
  return {
    kind,
    summary,
    table: { caption: name, columns: ['x', 'y', 'z'], rows, total, row },
    insight: {
      kind: 'grid',
      nx: calc.nx,
      ny: calc.ny,
      z: calc.z,
      xText: xt,
      yText: yt,
      formatValue: formatPlainNumber,
    },
  };
}
