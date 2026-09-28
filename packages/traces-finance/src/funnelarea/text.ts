/**
 * Funnelarea labels and title (plan E12.6; plotly.js `funnelarea/plot.js`): each stage's label is
 * pie's (`textinfo` / `texttemplate`, pie's inside font with a color contrasting the stage),
 * centered in the largest rectangle inside the trapezoid and shrunk to fit it (bar's
 * `toMoveInsideBar`, horizontal, constrained); the title sits above the funnel, left, centered or
 * right, shrunk to the domain's width and at most half its height.
 *
 * Positions are container px (y down); the view flips them into the overlay.
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import { localeOf, toRGBA, type RGBA } from '@mk7s/holochart-core';
import { scaleTextRuns, type TextFont, type TextRunLines } from '@mk7s/holochart-render';
import {
  castOption,
  insideFont,
  labelContent,
  measureLabel,
  placeBarText,
  sliceText,
} from '@mk7s/holochart-traces-basic';
import { LINE_HEIGHT, titleFont, titleText, type FunnelareaCalc } from './calc.ts';

/** One placed label, container px. */
export interface FunnelareaLabel {
  /** Plain text (pseudo-HTML simplified). */
  readonly text: string;
  /** Anchor point, container px (y down). */
  readonly x: number;
  readonly y: number;
  readonly anchorX: 'left' | 'center' | 'right';
  readonly anchorY: 'top' | 'middle' | 'bottom';
  /** Font at the drawn size. */
  readonly font: TextFont;
  /** Styled runs at the drawn size, when the label mixes styles. */
  readonly runs?: TextRunLines;
  readonly color: RGBA;
  /** Index in `calc.slices`, or -1 for the title. */
  readonly slice: number;
}

const DEFAULT_LINE: RGBA = [68 / 255, 68 / 255, 68 / 255, 1];

/** A label's font and runs at `scale` (≤ 1), quantized so small changes don't re-typeset. */
function scaled(
  content: { font: TextFont; runs?: TextRunLines },
  scale: number,
): { font: TextFont; runs?: TextRunLines } {
  const s = Math.min(1, Math.max(0, scale));
  const font = { ...content.font, size: Math.max(1, Math.floor(content.font.size * s * 4) / 4) };
  if (!content.runs) return { font };
  return { font, runs: scaleTextRuns(content.runs, font.size / content.font.size) };
}

/** Every stage label of a laid-out funnel area (hidden stages and empty labels skipped). */
export function funnelareaLabels(
  trace: FullTrace,
  calc: FunnelareaCalc,
  fullLayout: FullLayout,
): FunnelareaLabel[] {
  const layout = calc.layout;
  const out: FunnelareaLabel[] = [];
  if (!layout) return out;
  const { cx, cy } = layout;
  calc.slices.forEach((slice, index) => {
    const c = slice.corners;
    if (slice.hidden || !c) return;
    if (castOption(trace['textposition'], slice.pts) === 'none') return;
    const raw = sliceText(trace, calc, slice, localeOf(fullLayout));
    if (!raw) return;
    const font = insideFont(trace, slice, fullLayout);
    const content = labelContent(raw, font.font);
    if (!content.text) return;
    const size = measureLabel(content, LINE_HEIGHT);
    // The largest rectangle inside the trapezoid (y up for bar's placement: negate y).
    const placed = placeBarText(
      {
        x0: cx + Math.max(c.tl[0], c.bl[0]),
        x1: cx + Math.min(c.tr[0], c.br[0]),
        y0: -(cy + c.bl[1]),
        y1: -(cy + c.tl[1]),
      },
      {
        position: 'inside',
        horizontal: true,
        outmost: true,
        angle: 0,
        anchor: 'middle',
        constrainInside: true,
        constrainOutside: false,
        inside: size,
        outside: size,
      },
    );
    if (!placed || !(placed.scale > 0)) return;
    out.push({
      text: content.text,
      x: placed.cx,
      y: -placed.cy,
      anchorX: 'center',
      anchorY: 'middle',
      ...scaled(content, placed.scale),
      color: font.color,
      slice: index,
    });
  });
  const title = titleLabel(trace, calc);
  if (title) out.push(title);
  return out;
}

/**
 * The title (Plotly's `positionTitleOutside` for funnel areas): above the funnel, aligned with
 * its left edge, center or right edge, shrunk (never grown) to the available width and the title
 * space (at most half the domain's height).
 */
export function titleLabel(trace: FullTrace, calc: FunnelareaCalc): FunnelareaLabel | null {
  const text = titleText(trace);
  const layout = calc.layout;
  if (!text || !layout) return null;
  const font = titleFont(trace);
  const colorIn = ((trace['title'] as { font?: { color?: unknown } } | undefined)?.font ?? {})
    .color;
  const color = (typeof colorIn === 'string' ? toRGBA(colorIn) : null) ?? DEFAULT_LINE;
  const content = labelContent(text, font);
  const box = calc.titleBox ?? measureLabel(content, LINE_HEIGHT);
  if (!(box.width > 0 && box.height > 0)) return null;
  const position = (trace['title'] as { position?: unknown } | undefined)?.position;
  const where = typeof position === 'string' ? position : 'top center';
  const { cx, cy, r } = layout;
  let x = cx;
  let anchorX: FunnelareaLabel['anchorX'] = 'center';
  let maxWidth = layout.domain.width / 2;
  if (where.includes('left')) {
    maxWidth += r;
    x -= r;
    anchorX = 'left';
  } else if (where.includes('right')) {
    maxWidth += r;
    x += r;
    anchorX = 'right';
  } else maxWidth *= 2;
  const space = Math.min(box.height, layout.domain.height / 2);
  const scale = Math.min(1, maxWidth / box.width, space / box.height);
  if (!(scale > 0)) return null;
  return {
    text: content.text,
    x,
    y: cy - calc.halfHeight,
    anchorX,
    anchorY: 'bottom',
    ...scaled(content, scale),
    color,
    slice: -1,
  };
}
