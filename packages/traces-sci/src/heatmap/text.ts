/**
 * Annotated heatmaps: cell labels (`texttemplate` + `textfont`, plan E11.1), following plotly.js
 * `heatmap/plot.js`. One label per cell at its center (the given `x` / `y` or the middle of the
 * cell), with `%{z}` (preformatted like hover; empty on gaps), `%{x}`, `%{y}` (axis-formatted) and
 * `%{text}` (2D `text`, or per point with column data). Labels are drawn in `textfont.color` or,
 * when unset, black or white — whichever contrasts with the cell's color (with the plot background
 * on gaps), as plotly.js' `Color.contrast`. Sizing (`textfont.size: 'auto'`) is histogram2d's.
 *
 * Pure: labels are in data space (linear coordinates), so zoom only moves them. Grids of more than
 * {@link MAX_LABELLED_CELLS} cells get no labels (they could not be read at any size anyway).
 */
import {
  localeOf,
  toRGBA,
  type FullLayout,
  type FullTrace,
  type RGBAColor,
} from '@mk7s/holochart-core';
import { sampleColorscale, textContrastColor } from '@mk7s/holochart-render';
import { formatTemplate, type AxisInfo } from '@mk7s/holochart-runtime';
import {
  axisHoverText,
  dataValue,
  zText,
  type CellText,
  type ZColorMapping,
} from '@mk7s/holochart-traces-stats';
import type { HeatmapCalc } from './calc.ts';
import { cellText } from './hover.ts';

/** Largest grid that gets cell labels: 256². */
export const MAX_LABELLED_CELLS = 65_536;

/** The labels of every cell (see the module comment), in data space. */
export function heatmapCellTexts(
  calc: HeatmapCalc,
  trace: FullTrace,
  mapping: ZColorMapping,
  axes: { xaxis: AxisInfo | undefined; yaxis: AxisInfo | undefined },
  fullLayout: FullLayout,
): CellText[] {
  const template = trace['texttemplate'];
  if (typeof template !== 'string' || template === '') return [];
  const { nx, ny } = calc;
  if (nx * ny > MAX_LABELLED_CELLS) return [];
  const font = (trace['textfont'] ?? {}) as Record<string, unknown>;
  const fixed = typeof font['color'] === 'string' ? toRGBA(font['color']) : undefined;
  const background = toRGBA(String(fullLayout.plot_bgcolor ?? '#fff')) ?? [1, 1, 1, 1];
  const span = mapping.zmax - mapping.zmin;
  const out: CellText[] = [];
  const locale = localeOf(fullLayout);
  for (let j = 0; j < ny; j++) {
    const yl = calc.y.centers[j]!;
    for (let i = 0; i < nx; i++) {
      const xl = calc.x.centers[i]!;
      const z = calc.z[j * nx + i]!;
      const empty = !Number.isFinite(z);
      const t = cellText(calc, trace, 'text', i, j);
      const text = formatTemplate(
        template,
        {
          values: {
            x: dataValue(axes.xaxis, xl),
            y: dataValue(axes.yaxis, yl),
            z: empty ? '' : z,
            text: t === undefined || t === null || t === false ? '' : t,
          },
          labels: {
            x: axisHoverText(axes.xaxis, xl, trace['xhoverformat']),
            y: axisHoverText(axes.yaxis, yl, trace['yhoverformat']),
            z: zText(z, trace['zhoverformat'], locale),
          },
          fullData: trace,
        },
        { fallback: '', locale },
      );
      if (!text) continue;
      let color: RGBAColor;
      if (fixed) color = fixed;
      else if (empty) color = textContrastColor(background);
      else {
        let s = span > 0 ? (z - mapping.zmin) / span : 0.5;
        if (mapping.reversescale) s = 1 - s;
        color = textContrastColor(sampleColorscale(mapping.colorscale, s));
      }
      const lines = text.split('<br>');
      out.push({
        text: lines.join('\n'),
        x: xl,
        y: yl,
        lines: lines.length,
        chars: Math.max(...lines.map((l) => l.length)),
        color,
      });
    }
  }
  return out;
}
