/**
 * `histogram` supply-defaults (plan E10.1), following plotly.js' histogram defaults: the samples
 * and orientation, aggregation, bins, grouping, then bar styling shared with `bar`. Bin groups are
 * formed across traces in the layout defaults ({@link supplyHistogramLayoutDefaults}).
 */
import {
  isArrayLike,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';
import { bar, supplyBarStyleDefaults } from '@mk7s/holochart-traces-basic';
import { supplyBinGroups } from '../shared/bins.ts';

function lengthOf(v: unknown): number | undefined {
  return isArrayLike(v) ? v.length : undefined;
}

/** Supply histogram defaults. Sets `_length` (the sample count). */
export function supplyHistogramDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const nx = lengthOf(ctx.coerce('x'));
  const ny = lengthOf(ctx.coerce('y'));
  const cumulative = ctx.coerce<boolean>('cumulative.enabled');
  if (cumulative) {
    ctx.coerce('cumulative.direction');
    ctx.coerce('cumulative.currentbin');
  }
  const orientation = ctx.coerce<string>(
    'orientation',
    ny !== undefined && nx === undefined ? 'h' : 'v',
  );
  const [sampleLetter, aggLetter] = orientation === 'h' ? ['y', 'x'] : ['x', 'y'];
  const length =
    nx !== undefined && ny !== undefined
      ? Math.min(nx, ny)
      : (lengthOf(traceOut[sampleLetter]) ?? 0);
  if (!length) {
    traceOut.visible = false;
    return;
  }
  traceOut['_length'] = length;

  if (isArrayLike(traceOut[aggLetter])) ctx.coerce('histfunc');
  ctx.coerce('histnorm');
  // Bins: group-level values are resolved across traces (see `supplyBinGroups`).
  ctx.coerce(`autobin${sampleLetter}`);
  ctx.coerce(`nbins${sampleLetter}`);
  ctx.coerce(`${sampleLetter}bins.start`);
  ctx.coerce(`${sampleLetter}bins.end`);
  ctx.coerce(`${sampleLetter}bins.size`);
  ctx.coerce('bingroup');
  ctx.coerce('offsetgroup');
  ctx.coerce('alignmentgroup');
  ctx.coerce('zorder');

  supplyBarStyleDefaults(traceIn, traceOut, ctx);
}

/**
 * Layout defaults: the `barmode` family and `coloraxis` (bar's), then the bin groups of every
 * binned trace (Plotly's histogram `crossTraceDefaults`).
 */
export function supplyHistogramLayoutDefaults(
  layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  bar.supplyLayoutDefaults?.(layoutIn, layoutOut, ctx);
  supplyBinGroups(ctx.fullData, layoutOut);
}
