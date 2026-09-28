/**
 * Funnelarea labels and title (plan E12.6; plotly.js `funnelarea/plot.js`): each stage's label is
 * pie's (`textinfo` / `texttemplate`, pie's inside font with a color contrasting the stage),
 * centered in the largest rectangle inside the trapezoid and shrunk to fit it (bar's
 * `toMoveInsideBar`, horizontal, constrained); the title sits above the funnel, left, centered or
 * right, shrunk to the domain's width and at most half its height.
 *
 * With `layout.uniformtext` (E4.6) the stage labels follow Plotly's funnelarea `plot` and `style`:
 * fonts are raised to `minsize` before the fit (`ensureUniformFontSize`), every label is recorded
 * (`recordMinTextSize`, per trace type: funnel areas negotiate among themselves, not with pies)
 * and drawn at the negotiated size (`resizeText`), labels squeezed below `minsize` dropped in
 * `hide` mode. The title is not part of it (as in Plotly).
 *
 * Positions are container px (y down); the view flips them into the overlay.
 */
import type { FullLayout, FullTrace, UniformText, UniformTextItem } from '@mk7s/holochart-core';
import {
  localeOf,
  toRGBA,
  uniformFontSize,
  uniformTextOf,
  uniformTextScale,
  uniformTextSize,
  type RGBA,
} from '@mk7s/holochart-core';
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

/** Options of {@link layoutFunnelareaText}. */
export interface FunnelareaTextOptions {
  /** `layout.uniformtext` to apply; default: the one of `fullLayout`. */
  readonly uniformText?: UniformText;
  /** The size negotiated across funnel areas; default: this trace's own. */
  readonly uniformSize?: number;
}

/** The labels of a funnel area and what `uniformtext` negotiates with. */
export interface FunnelareaTextLayout {
  readonly labels: FunnelareaLabel[];
  /**
   * `{ fontSize, scale }` of every stage label, hidden candidates included (Plotly's
   * `recordMinTextSize`); empty when `uniformtext` is off.
   */
  readonly items: readonly UniformTextItem[];
  /** The uniform size the stage labels were drawn with (`undefined` when off). */
  readonly uniformSize: number | undefined;
}

/** Every stage label of a laid-out funnel area (hidden stages and empty labels skipped). */
export function funnelareaLabels(
  trace: FullTrace,
  calc: FunnelareaCalc,
  fullLayout: FullLayout,
  options: FunnelareaTextOptions = {},
): FunnelareaLabel[] {
  return layoutFunnelareaText(trace, calc, fullLayout, options).labels;
}

/** The stage labels and title of a laid-out funnel area, with its `uniformtext` items. */
export function layoutFunnelareaText(
  trace: FullTrace,
  calc: FunnelareaCalc,
  fullLayout: FullLayout,
  options: FunnelareaTextOptions = {},
): FunnelareaTextLayout {
  const layout = calc.layout;
  const out: FunnelareaLabel[] = [];
  const items: UniformTextItem[] = [];
  const u = options.uniformText ?? uniformTextOf(fullLayout);
  if (!layout) return { labels: out, items, uniformSize: undefined };
  const { cx, cy } = layout;
  const pending: {
    content: ReturnType<typeof labelContent>;
    x: number;
    y: number;
    scale: number;
    color: RGBA;
    slice: number;
  }[] = [];
  calc.slices.forEach((slice, index) => {
    const c = slice.corners;
    if (slice.hidden || !c) return;
    if (castOption(trace['textposition'], slice.pts) === 'none') return;
    const raw = sliceText(trace, calc, slice, localeOf(fullLayout));
    if (!raw) return;
    const font = insideFont(trace, slice, fullLayout);
    // Plotly's `ensureUniformFontSize` (no-op without `uniformtext`), before the fit.
    const content = labelContent(raw, { ...font.font, size: uniformFontSize(font.font.size, u) });
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
    if (!placed) return;
    // Plotly records every label, squeezed-out ones included (hidden candidates).
    if (u.mode) items.push({ fontSize: content.font.size, scale: placed.scale });
    else if (!(placed.scale > 0)) return;
    pending.push({
      content,
      x: placed.cx,
      y: -placed.cy,
      scale: placed.scale,
      color: font.color,
      slice: index,
    });
  });
  const uniformSize = u.mode ? (options.uniformSize ?? uniformTextSize(items, u)) : undefined;
  pending.forEach((p, k) => {
    // Plotly's `resizeText`: every label at the uniform size, hidden candidates dropped in `hide`
    // (never grown past its own font, as bar's and pie's).
    const scale = u.mode ? uniformTextScale(items[k]!, uniformSize, u) : p.scale;
    if (!(scale > 0)) return;
    out.push({
      text: p.content.text,
      x: p.x,
      y: p.y,
      anchorX: 'center',
      anchorY: 'middle',
      ...scaled(p.content, scale),
      color: p.color,
      slice: p.slice,
    });
  });
  const title = titleLabel(trace, calc);
  if (title) out.push(title);
  return { labels: out, items, uniformSize };
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
