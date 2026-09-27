/** `funnel` supply-defaults (plan E12.5), following plotly.js' `funnel/defaults.js`. */
import {
  isArrayLike,
  toRGBA,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';
import { hasColorscale, supplyColorscaleDefaults } from '@mk7s/holochart-traces-basic';
import { supplyAlignmentGroups, supplyCoordinates, supplyTextDefaults } from '../bars/defaults.ts';

/**
 * Plotly's default connector fill: the marker color at half its opacity (black at half opacity
 * when the marker has per-bar colors).
 */
export function connectorFillColor(markerColor: unknown): string {
  const c = (typeof markerColor === 'string' ? toRGBA(markerColor) : null) ?? [0, 0, 0, 1];
  const [r, g, b] = [c[0], c[1], c[2]].map((v) => Math.round(v * 255));
  return `rgba(${r}, ${g}, ${b}, ${+(0.5 * c[3]).toFixed(3)})`;
}

/**
 * Supply funnel defaults: coordinates (hidden without data), `orientation` (`'h'` unless only `y`
 * is given), the bar extent and groups, labels (`textinfo` `'value'`, or `'text+value'` with a
 * `text` array, only without a `texttemplate`), bar's marker and the connector.
 */
export function supplyFunnelDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  if (supplyCoordinates(traceOut, ctx) === 0) {
    traceOut.visible = false;
    return;
  }
  const onlyY = traceOut['y'] !== undefined && traceOut['x'] === undefined;
  ctx.coerce('orientation', onlyY ? 'v' : 'h');
  ctx.coerce('offset');
  ctx.coerce('width');
  ctx.coerce('offsetgroup');
  ctx.coerce('alignmentgroup');
  const text = ctx.coerce('text');
  if (supplyTextDefaults(traceIn, traceOut, ctx) !== 'none') {
    const template = ctx.coerce('texttemplate');
    if (!template) ctx.coerce('textinfo', isArrayLike(text) ? 'text+value' : 'value');
  }

  const markerIn = traceIn['marker'] as Record<string, unknown> | undefined;
  const markerColor = ctx.coerce('marker.color', ctx.defaultColor);
  if (hasColorscale(markerIn)) {
    supplyColorscaleDefaults(markerIn, ctx.coerce, 'marker.', { inTrace: true, showscale: true });
  }
  ctx.coerce('marker.opacity');
  ctx.coerce('marker.line.color', '#444');
  const lineIn = markerIn?.['line'] as Record<string, unknown> | undefined;
  if (hasColorscale(lineIn)) {
    supplyColorscaleDefaults(lineIn, ctx.coerce, 'marker.line.', {
      inTrace: true,
      showscale: false,
    });
  }
  ctx.coerce('marker.line.width');

  if (ctx.coerce('connector.visible')) {
    ctx.coerce('connector.fillcolor', connectorFillColor(markerColor));
    if (ctx.coerce('connector.line.width')) {
      ctx.coerce('connector.line.color');
      ctx.coerce('connector.line.dash');
    }
  }
  ctx.coerce('zorder');
}

/** Layout defaults: the offset groups of each alignment group (grouped bars across subplots). */
export function supplyFunnelLayoutDefaults(
  _layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  supplyAlignmentGroups('funnel', layoutOut, ctx);
}
