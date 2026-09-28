/**
 * Sunburst labels (plan E13.2), ported from plotly.js' `traces/sunburst/plot.js` and `helpers.js`:
 * what each sector says (`textinfo` / `texttemplate`, see `../hierarchy/format.ts`), its font
 * (`determineTextFont`: the transparent root's label sits on the background and uses
 * `outsidetextfont`; the others use `insidetextfont` with a color contrasting their sector) and where
 * it goes: pie's `transformInsideText` with `insidetextorientation`, fitted to the sector with its
 * outer radius as the pie radius, and shrunk (never grown) to fit.
 *
 * Pure and in container px (top-left origin, y down), with angles in pie's convention (see
 * `geometry.ts`); text sizes come from the render layer's synchronous metrics, so placement is unit
 * tested without a GPU. Labels may be Plotly pseudo-HTML (E2.10): mixed styles become styled runs.
 */
import type { FullLayout, FullTrace, RGBA } from '@mk7s/holochart-core';
import { scaleTextRuns, type TextFont, type TextRunLines } from '@mk7s/holochart-render';
import {
  labelContent,
  measureLabel,
  transformInsideText,
  type InsideOrientation,
} from '@mk7s/holochart-traces-basic';
import type { HierarchyCalc } from '../hierarchy/calc.ts';
import { nodeContext, nodeText } from '../hierarchy/format.ts';
import {
  isOutsideNode,
  LINE_HEIGHT,
  MIN_FONT_SIZE,
  nodeFont,
  type LabelFont,
} from '../hierarchy/text.ts';
import type { Sector, SunburstGeometry, SunburstLayout } from './geometry.ts';

export { contrastColor, LINE_HEIGHT, type LabelFont } from '../hierarchy/text.ts';

/**
 * Plotly's `isOutsideText`: the hierarchy root's label, when nodes are not colorscaled (the root is
 * transparent by default, so its label sits on the background).
 */
export function isOutsideText(calc: Pick<HierarchyCalc, 'colorscale'>, sector: Sector): boolean {
  return isOutsideNode(calc.colorscale, sector.node);
}

/** The font of a sector's label (Plotly's `determineTextFont`). */
export function sectorFont(
  trace: FullTrace,
  calc: Pick<HierarchyCalc, 'colorscale'>,
  sector: Sector,
  fullLayout: FullLayout,
): LabelFont {
  return nodeFont(trace, calc.colorscale, sector.node, fullLayout);
}

/** One placed label, in container px. */
export interface SectorLabel {
  /** Plain text (pseudo-HTML simplified). */
  readonly text: string;
  /** Center of the label in container px (y down). */
  readonly x: number;
  readonly y: number;
  /** Degrees clockwise. */
  readonly angle: number;
  /** Font with the fitted size. */
  readonly font: TextFont;
  /** Styled runs at the fitted size (E2.10), when the label mixes styles. */
  readonly runs?: TextRunLines;
  readonly color: RGBA;
  /** Index of the sector in `geometry.sectors`. */
  readonly sector: number;
}

function orientationOf(trace: FullTrace): InsideOrientation {
  const o = trace['insidetextorientation'];
  return o === 'horizontal' || o === 'radial' || o === 'tangential' ? o : 'auto';
}

/**
 * Place the label of every sector of `geometry` (Plotly's sunburst `plot` text part), in container
 * px. Sectors without text, or whose label would shrink below 1 px, get none.
 */
export function layoutSunburstText(
  trace: FullTrace,
  calc: HierarchyCalc,
  geometry: SunburstGeometry,
  layout: Pick<SunburstLayout, 'cx' | 'cy'>,
  fullLayout: FullLayout,
): SectorLabel[] {
  const hierarchy = calc.hierarchy;
  if (!hierarchy) return [];
  const ctx = nodeContext(hierarchy, geometry.entry, fullLayout);
  const orientation = orientationOf(trace);
  const labels: SectorLabel[] = [];
  geometry.sectors.forEach((s, index) => {
    if (!(s.r1 > 0) || s.x1 === s.x0) return;
    const raw = nodeText(trace, s.node, ctx);
    if (!raw) return;
    const { font, color } = sectorFont(trace, calc, s, fullLayout);
    const content = labelContent(raw, font);
    if (!content.text) return;
    const box = measureLabel(content, LINE_HEIGHT);
    if (!(box.width > 0 && box.height > 0)) return;
    const t = transformInsideText(box, s, s.r1, orientation);
    const scale = Math.min(1, Math.max(0, Number.isFinite(t.scale) ? t.scale : 0));
    const base = content.font;
    // Quantized so tiny layout changes don't re-typeset labels.
    const size = Math.floor(base.size * scale * 4) / 4;
    if (!(size >= MIN_FONT_SIZE)) return;
    const a = t.textPosAngle ?? s.midAngle;
    const reach = s.r1 * t.rCenter;
    labels.push({
      text: content.text,
      x: layout.cx + reach * Math.sin(a),
      y: layout.cy - reach * Math.cos(a),
      angle: t.rotate,
      font: { ...base, size },
      ...(content.runs ? { runs: scaleTextRuns(content.runs, size / base.size) } : {}),
      color,
      sector: index,
    });
  });
  return labels;
}
