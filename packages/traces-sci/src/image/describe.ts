/**
 * Accessible description of images (plan E17.1): the picture's size in pixels, its color model and
 * where it is placed.
 */
import {
  formatPlainNumber,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import { axisHoverText } from '@mk7s/holochart-traces-stats';
import type { ImageCalc } from './calc.ts';

/** `describe()` of image traces. */
export function describeImage(ctx: DescribeContext<ImageCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const name = traceNameText(trace['name'], ctx.index);
  if (calc.w === 0 || calc.h === 0) return { kind: 'image', summary: `Image "${name}": no data.` };
  const what = calc.source === undefined ? `${calc.colormodel.toUpperCase()} pixels` : 'a picture';
  const at = (axis: DescribeContext<ImageCalc>['xaxis'], l: number): string =>
    axis ? axisHoverText(axis, l, undefined) : formatPlainNumber(l);
  const x = `${at(ctx.xaxis, calc.xEdges[0])} to ${at(ctx.xaxis, calc.xEdges[1])}`;
  const y = `${at(ctx.yaxis, calc.yEdges[0])} to ${at(ctx.yaxis, calc.yEdges[1])}`;
  return {
    kind: 'image',
    summary: `Image "${name}": ${calc.w} × ${calc.h} ${what}, spanning x ${x} and y ${y}.`,
  };
}
