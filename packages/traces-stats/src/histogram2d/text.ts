/**
 * Cell labels of 2D histograms (`texttemplate` + `textfont`, plan E10.2), following plotly.js
 * `heatmap/plot.js`: one label per non-empty cell at its center, `%{z}` / `%{x}` / `%{y}` filled
 * from the cell (bin centers; `%{z}` preformatted like hover), drawn in `textfont.color` or, when
 * unset, black or white for contrast with the cell color. With `textfont.size: 'auto'` the size is
 * the largest (up to `layout.font.size`) at which the widest label fits the smallest cell.
 *
 * Pure: labels are in data space (linear coordinates), so zoom only moves them; the automatic
 * size depends on the cell size in px and is recomputed by the view when that changes.
 */
import { toRGBA, type FullLayout, type FullTrace, type RGBA } from '@mk7s/holochart-core';
import {
  sampleColorscale,
  textContrastColor,
  type DataTransform,
  type TextFont,
  type TextLabel,
} from '@mk7s/holochart-render';
import { formatTemplate, type AxisInfo } from '@mk7s/holochart-runtime';
import type { Histogram2dCalc } from './calc.ts';
import type { ZColorMapping } from './colorscale.ts';
import { axisHoverText, dataValue, zText } from './hover.ts';

/** Plotly's `LINE_SPACING`: line advance as a multiple of the font size. */
const LINE_SPACING = 1.3;

/** One label before its size is known. */
export interface CellText {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly lines: number;
  /** Longest line, in characters (Plotly sizes by characters). */
  readonly chars: number;
  readonly color: RGBA;
}

/** The labels of every cell (see the module comment), in data space. */
export function cellTexts(
  calc: Histogram2dCalc,
  trace: FullTrace,
  mapping: ZColorMapping,
  axes: { xaxis: AxisInfo | undefined; yaxis: AxisInfo | undefined },
  fullLayout: FullLayout,
  options: { skipBorder?: boolean } = {},
): CellText[] {
  const template = trace['texttemplate'];
  if (typeof template !== 'string' || template === '') return [];
  const font = (trace['textfont'] ?? {}) as Record<string, unknown>;
  const fixed = typeof font['color'] === 'string' ? toRGBA(font['color']) : undefined;
  const background = toRGBA(String(fullLayout.plot_bgcolor ?? '#fff')) ?? [1, 1, 1, 1];
  const span = mapping.zmax - mapping.zmin;
  const out: CellText[] = [];
  const { nx, ny } = calc;
  // histogram2dcontour skips its padding bins (Plotly).
  const b = options.skipBorder === true ? 1 : 0;
  for (let j = b; j < ny - b; j++) {
    const yl = calc.y.centers[j]!;
    for (let i = b; i < nx - b; i++) {
      const xl = calc.x.centers[i]!;
      const z = calc.z[j * nx + i]!;
      const empty = !Number.isFinite(z);
      const text = formatTemplate(
        template,
        {
          values: {
            x: dataValue(axes.xaxis, xl),
            y: dataValue(axes.yaxis, yl),
            z: empty ? '' : z,
          },
          labels: {
            x: axisHoverText(axes.xaxis, xl, trace['xhoverformat']),
            y: axisHoverText(axes.yaxis, yl, trace['yhoverformat']),
            z: zText(z, trace['zhoverformat']),
          },
          fullData: trace,
        },
        { fallback: '' },
      );
      if (!text) continue;
      let color: RGBA;
      if (fixed) color = fixed;
      else if (empty) color = textContrastColor(background);
      else {
        let t = span > 0 ? (z - mapping.zmin) / span : 0.5;
        if (mapping.reversescale) t = 1 - t;
        color = textContrastColor(sampleColorscale(mapping.colorscale, t));
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

/**
 * Plotly's automatic cell-label size: the smallest cell (in px, less the gaps), divided by the
 * widest label's characters (× half the line spacing) and by its lines (× the line spacing),
 * capped at `layout.font.size`. 0 when labels cannot fit.
 */
export function autoCellFontSize(
  calc: Histogram2dCalc,
  texts: readonly CellText[],
  transform: Readonly<DataTransform>,
  gaps: { xgap: number; ygap: number },
  maxSize: number,
): number {
  if (texts.length === 0) return 0;
  let minW = Infinity;
  let minH = Infinity;
  for (let i = 0; i < calc.nx; i++) {
    const w = Math.abs((calc.x.edges[i + 1]! - calc.x.edges[i]!) * transform.scaleX);
    if (w > 0 && w < minW) minW = w;
  }
  for (let j = 0; j < calc.ny; j++) {
    const h = Math.abs((calc.y.edges[j + 1]! - calc.y.edges[j]!) * transform.scaleY);
    if (h > 0 && h < minH) minH = h;
  }
  if (!Number.isFinite(minW) || !Number.isFinite(minH)) return maxSize;
  let maxL = 1;
  let maxC = 1;
  for (const t of texts) {
    maxL = Math.max(maxL, t.lines);
    maxC = Math.max(maxC, t.chars);
  }
  const w = (minW - gaps.xgap) / maxC / (LINE_SPACING / 2);
  const h = (minH - gaps.ygap) / maxL / LINE_SPACING;
  const size = Math.min(Math.floor(w), Math.floor(h), maxSize);
  return size > 0 && Number.isFinite(size) ? size : 0;
}

/** Render labels for a size: centered on each cell. */
export function cellLabels(texts: readonly CellText[], font: TextFont): TextLabel[] {
  return texts.map((t) => ({
    text: t.text,
    x: t.x,
    y: t.y,
    color: t.color,
    font,
    anchorX: 'center',
    anchorY: 'middle',
    align: 'center',
    lineHeight: LINE_SPACING,
  }));
}
