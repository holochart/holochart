/**
 * Pie hover (plan E9.11, E6.1; ADR-010: CPU, 2D), following plotly.js' pie `attachFxHandlers` and
 * `event_data.js`. Pies are domain traces: the runtime asks them on every hover with the pointer
 * in container px (`query.cx` / `query.cy`), and they return the slice under it with distance 0.
 *
 * The hit test is exact against the drawn wedge — pulled out by its `pull`, with the donut hole cut
 * out — using the arc primitive's own geometry (`computeArcShape` + `arcSDF`). The label anchors
 * on the slice's bisector, `1 − rInscribed` of the radius out (Plotly).
 */
import type { FullTrace } from '@mk7s/holochart-core';
import { arcSDF, computeArcShape } from '@mk7s/holochart-render';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import { sliceCenter, type PieCalc, type PieLayout, type PieSlice } from './calc.ts';
import { castOption, isValidTextValue } from './helpers.ts';
import { hoverAnchor, sliceLabels, sliceValues } from './text.ts';

/** Whether the container point `(x, y)` lies on `slice` of a laid-out pie. */
export function sliceContains(
  slice: PieSlice,
  calc: PieCalc,
  layout: PieLayout,
  x: number,
  y: number,
): boolean {
  if (slice.hidden || !Number.isFinite(slice.midAngle) || !(layout.r > 0)) return false;
  const shape = computeArcShape({
    innerRadius: (1 - calc.ring) * layout.r,
    outerRadius: layout.r,
    startAngle: Math.PI / 2 - slice.startAngle,
    endAngle: Math.PI / 2 - slice.stopAngle,
  });
  if (!shape) return false;
  const [cx, cy] = sliceCenter(slice, layout);
  // Relative to the wedge center, y up.
  return arcSDF(x - cx, cy - y, shape) <= 0;
}

/** The slice under a container point, or `undefined`. */
export function sliceAt(calc: PieCalc, x: number, y: number): PieSlice | undefined {
  const layout = calc.layout;
  if (!layout) return undefined;
  // Later slices draw on top (pulled slices may overlap their neighbours): test them first.
  for (let k = calc.slices.length - 1; k >= 0; k--) {
    const slice = calc.slices[k]!;
    if (sliceContains(slice, calc, layout, x, y)) return slice;
  }
  return undefined;
}

const ALL_FLAGS = 'label+text+value+percent+name';

/**
 * Hover label text from `hoverinfo` flags (Plotly's pie hover): label, text (`hovertext`, else
 * `text`), value and percent, one per line. The `name` flag is the runtime's.
 */
export function pieHoverText(
  trace: FullTrace,
  calc: PieCalc,
  slice: PieSlice,
  hovertext: unknown,
): string {
  let info = castOption(trace['hoverinfo'], slice.pts);
  if (info === undefined || info === 'all') info = ALL_FLAGS;
  if (typeof info !== 'string' || info === 'none' || info === 'skip') return '';
  const flags = new Set(info.split('+'));
  const lines: string[] = [];
  if (flags.has('label')) lines.push(slice.label);
  if (flags.has('text') && isValidTextValue(hovertext)) lines.push(String(hovertext));
  const labels = sliceLabels(calc, slice);
  if (flags.has('value')) lines.push(labels['value']!);
  if (flags.has('percent') && labels['percent']) lines.push(labels['percent']);
  return lines.join('<br>');
}

/** The pie `hoverPoints`: the slice under `query.cx` / `query.cy`, if any. */
export function pieHoverPoints(
  calc: PieCalc,
  trace: FullTrace,
  query: HoverQuery,
  _ctx: HoverContext,
): HoverPoint[] {
  const layout = calc.layout;
  if (!layout) return [];
  // Figure height: overlay px are from the bottom, container px from the top.
  const height = query.cy !== undefined ? query.py + query.cy : layout.height;
  const x = query.cx ?? query.px;
  const y = query.cy ?? height - query.py;
  const slice = sliceAt(calc, x, y);
  if (!slice) return [];

  const [ax, ay] = hoverAnchor(slice, layout);
  const hovertext = castOption(trace['hovertext'] || trace['text'], slice.pts);
  const values = sliceValues(trace, calc, slice);
  const fields: Record<string, unknown> = {
    ...values,
    text: hovertext,
    v: slice.v,
    pointNumbers: slice.pts,
    curveNumber: typeof trace._index === 'number' ? trace._index : undefined,
  };
  if (slice.pts.length === 1) fields['pointNumber'] = fields['i'] = slice.pts[0];
  return [
    {
      pointIndex: slice.i,
      pointIndices: slice.pts,
      distance: 0,
      px: ax,
      py: height - ay,
      ...(isValidTextValue(hovertext) ? { text: String(hovertext) } : {}),
      color: slice.color,
      fields,
      labels: sliceLabels(calc, slice),
      hoverText: pieHoverText(trace, calc, slice, hovertext),
    },
  ];
}
