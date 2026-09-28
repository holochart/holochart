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
import { toRGBA, type FullLayout, type FullTrace, type RGBA } from '@mk7s/holochart-core';
import {
  scaleTextRuns,
  type TextFont,
  type TextFontWeight,
  type TextRunLines,
} from '@mk7s/holochart-render';
import {
  labelContent,
  measureLabel,
  transformInsideText,
  type InsideOrientation,
} from '@mk7s/holochart-traces-basic';
import type { HierarchyCalc } from '../hierarchy/calc.ts';
import { DEFAULT_LINE } from '../hierarchy/colors.ts';
import { nodeAttr, nodeContext, nodeText } from '../hierarchy/format.ts';
import { isHierarchyRoot } from '../hierarchy/levels.ts';
import type { Sector, SunburstGeometry, SunburstLayout } from './geometry.ts';

/** Line height of labels as a multiple of the font size (as pie's). */
export const LINE_HEIGHT = 1.2;

/** Labels whose fitted font is smaller than this many px are not drawn (they would be specks). */
const MIN_FONT_SIZE = 1;

type FontContainer = Readonly<Record<string, unknown>> | undefined;

function container(trace: FullTrace, key: string): FontContainer {
  const c = trace[key];
  return c !== null && typeof c === 'object' ? (c as Record<string, unknown>) : undefined;
}

/** The first truthy value of `key` along a font chain (Plotly's `castOption(a) || …`). */
function chain(fonts: readonly FontContainer[], key: string, i: number): unknown {
  for (const f of fonts) {
    const v = nodeAttr(f?.[key], i);
    if (v) return v;
  }
  return undefined;
}

function toFont(fonts: readonly FontContainer[], i: number): TextFont {
  const family = chain(fonts, 'family', i);
  const size = Number(chain(fonts, 'size', i));
  const weight = chain(fonts, 'weight', i);
  const style = chain(fonts, 'style', i);
  return {
    family: typeof family === 'string' ? family : 'sans-serif',
    size: Number.isFinite(size) && size > 0 ? size : 12,
    ...(weight === 'normal' || weight === 'bold' || typeof weight === 'number'
      ? { weight: weight as TextFontWeight }
      : {}),
    ...(style === 'italic' ? { style: 'italic' as const } : {}),
  };
}

const WHITE: RGBA = [1, 1, 1, 1];
const DARK: RGBA = toRGBA(DEFAULT_LINE)!;

/**
 * Plotly's `Color.contrast` without amounts: white on dark colors, `#444` on light ones
 * (tinycolor's `isDark`: perceived brightness below 128), translucent colors over white first.
 */
export function contrastColor(color: string): RGBA {
  const c = toRGBA(color) ?? DARK;
  const a = c[3];
  const mix = (v: number): number => v * a + (1 - a);
  const brightness = (mix(c[0]) * 299 + mix(c[1]) * 587 + mix(c[2]) * 114) / 1000;
  return brightness * 255 < 128 ? WHITE : DARK;
}

/** A resolved label font and color. */
export interface LabelFont {
  readonly font: TextFont;
  readonly color: RGBA;
}

/**
 * Plotly's `isOutsideText`: the hierarchy root's label, when nodes are not colorscaled (the root is
 * transparent by default, so its label sits on the background).
 */
export function isOutsideText(calc: Pick<HierarchyCalc, 'colorscale'>, sector: Sector): boolean {
  return !calc.colorscale && isHierarchyRoot(sector.node);
}

/** The font of a sector's label (Plotly's `determineTextFont`). */
export function sectorFont(
  trace: FullTrace,
  calc: Pick<HierarchyCalc, 'colorscale'>,
  sector: Sector,
  fullLayout: FullLayout,
): LabelFont {
  const i = sector.node.i;
  const layoutFont = fullLayout.font as unknown as FontContainer;
  if (isOutsideText(calc, sector)) {
    const fonts = [container(trace, 'outsidetextfont'), container(trace, 'textfont'), layoutFont];
    const color = chain(fonts, 'color', i);
    return {
      font: toFont(fonts, i),
      color: (typeof color === 'string' ? toRGBA(color) : null) ?? DARK,
    };
  }
  const fonts = [container(trace, 'insidetextfont'), container(trace, 'textfont'), layoutFont];
  const custom = nodeAttr(container(trace, 'insidetextfont')?.['color'], i);
  return {
    font: toFont(fonts, i),
    color: (typeof custom === 'string' ? toRGBA(custom) : null) ?? contrastColor(sector.node.color),
  };
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
