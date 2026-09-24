/** `violin` supply-defaults (plan E10.5), following plotly.js' violin defaults. */
import { isValidColor, type FullTrace, type TraceDefaultsContext } from '@mk7s/holochart-core';
import {
  supplyOutlineDefaults,
  supplyPointsDefaults,
  supplySampleDefaults,
} from '../box/defaults.ts';

function objectAt(v: unknown, key: string): Readonly<Record<string, unknown>> | undefined {
  const c = v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined;
  return c !== null && typeof c === 'object' && !Array.isArray(c)
    ? (c as Record<string, unknown>)
    : undefined;
}

/** Whether the user set a valid width (≥ 0) at `container[key]`. */
function widthSet(container: Readonly<Record<string, unknown>> | undefined, key: string): boolean {
  const v = container?.[key];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/** Supply violin defaults (Plotly's violin `supplyDefaults`). */
export function supplyViolinDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  if (!supplySampleDefaults(traceIn, traceOut, ctx, 'violin')) return;
  ctx.coerce('bandwidth');
  ctx.coerce('side');
  const width = ctx.coerce('width');
  if (!width) {
    ctx.coerce('scalegroup', traceOut['name']);
    ctx.coerce('scalemode');
  }
  const span = ctx.coerce('span');
  ctx.coerce('spanmode', Array.isArray(span) ? 'manual' : undefined);

  const { lineColor, lineWidth, fillColor } = supplyOutlineDefaults(traceIn, traceOut, ctx);
  supplyPointsDefaults(traceIn, traceOut, ctx, 'points', lineColor);

  // The inner box and the mean line are on by default when any of their styles is set (coerce2).
  const boxIn = objectAt(traceIn, 'box');
  const boxLineIn = objectAt(boxIn, 'line');
  const boxStyled =
    (widthSet(boxIn, 'width') && Number(boxIn?.['width']) <= 1) ||
    isValidColor(boxIn?.['fillcolor']) ||
    isValidColor(boxLineIn?.['color']) ||
    widthSet(boxLineIn, 'width');
  if (ctx.coerce('box.visible', boxStyled)) {
    ctx.coerce('box.width');
    ctx.coerce('box.fillcolor', fillColor);
    ctx.coerce('box.line.color', lineColor);
    ctx.coerce('box.line.width', lineWidth);
  } else {
    traceOut['box'] = { visible: false };
  }
  const meanIn = objectAt(traceIn, 'meanline');
  const meanStyled = isValidColor(meanIn?.['color']) || widthSet(meanIn, 'width');
  if (ctx.coerce('meanline.visible', meanStyled)) {
    ctx.coerce('meanline.color', lineColor);
    ctx.coerce('meanline.width', lineWidth);
  } else {
    traceOut['meanline'] = { visible: false };
  }
  ctx.coerce('quartilemethod');
  ctx.coerce('offsetgroup');
  ctx.coerce('alignmentgroup');
  ctx.coerce('zorder');
}
