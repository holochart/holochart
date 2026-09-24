/**
 * Multi-run ("rich") text layout for the text primitive (plan E2.10): a label given as lines of
 * styled runs is laid out on the CPU and drawn as one batch member per run, because troika cannot
 * mix fonts, weights or sizes inside one text object.
 *
 * Runs are measured with the synchronous metrics oracle using each run's own face (bold, italic,
 * size), so run positions match what layout measured and, within kerning across run boundaries,
 * what troika draws (E2.18). Every run member is typeset with its origin on its baseline
 * (`anchorX: 'left'`, `anchorY: 'top-baseline'`); this module computes where each baseline goes
 * relative to the label anchor so that anchors, alignment and line spacing behave like a
 * single-run label:
 *
 * - Lines advance by `lineHeight` × the label's (base) font size, whatever the run sizes (Plotly
 *   also spaces `<br>` lines by the text element's size).
 * - Horizontal: the block is as wide as its widest line (trailing whitespace excluded, like
 *   troika); `anchorX` places the block, `align` each line inside it.
 * - Vertical: `baseline` puts the first baseline on the anchor (exact); `top`, `middle` and
 *   `bottom` use troika's line box (half-leading above the ascent), with the ascent and descent
 *   from the oracle's vertical metrics of the base face.
 * - Baseline shifts (`<sup>` / `<sub>`) move a run within its line; they do not change the block.
 *
 * Pure: no troika, no WebGL.
 */
import type { RGBA } from '../types.ts';
import type { TextFont } from './text-fonts.ts';
import {
  getDefaultFontMetricsOracle,
  TEXT_DEFAULT_LINE_HEIGHT,
  type FontMetricsOracle,
} from './text-metrics.ts';
import { parseLinePosition } from './text-style.ts';

/** A clickable link of a run (`<a href target>` in Plotly text). */
export interface TextLink {
  /** A sanitized URL (see core's `sanitizeHref`). */
  readonly href: string;
  /** Browsing context, e.g. `_blank` (default), `_self`. */
  readonly target?: string;
}

/**
 * One styled run of a rich label. Fields left unset inherit from the label (font fields, color);
 * decoration lines add to the label's `font.lineposition`.
 */
export interface TextRun {
  /** The run's text (one line: no `\n`). */
  readonly text: string;
  /** Font overrides: family, absolute size in px, weight, style, extra decoration lines. */
  readonly font?: Readonly<
    Partial<Pick<TextFont, 'family' | 'size' | 'weight' | 'style' | 'lineposition'>>
  >;
  /** sRGB 0–1 RGBA; default: the label's color. */
  readonly color?: RGBA;
  /** Baseline shift in px, +up (`<sup>`), −down (`<sub>`). Default 0. */
  readonly shift?: number;
  /** Clickable link (hit-test with {@link textLinkAt}). */
  readonly link?: TextLink;
}

/** A label's runs: one array per line. */
export type TextRunLines = readonly (readonly TextRun[])[];

/** Base style a run layout is computed against (the label's resolved style). */
export interface TextRunBase {
  /** The label's font (runs override fields of it). */
  font: TextFont;
  /** Line advance as a multiple of `font.size`. Default {@link TEXT_DEFAULT_LINE_HEIGHT}. */
  lineHeight?: number;
  /** Default `left`. */
  anchorX?: 'left' | 'center' | 'right';
  /** Default `baseline`. */
  anchorY?: 'top' | 'middle' | 'bottom' | 'baseline';
  /** Line alignment in the block. Default: follows `anchorX`. */
  align?: 'left' | 'center' | 'right';
}

/** One positioned run of a {@link TextRunLayout}. Coordinates are px, +x right, +y up. */
export interface TextRunLayoutItem {
  readonly run: TextRun;
  /** Line index. */
  readonly line: number;
  /** The font the run is drawn with (base font merged with the run's overrides). */
  readonly font: TextFont;
  /** Left end of the run's baseline, relative to the label anchor (before rotation). */
  readonly x: number;
  readonly y: number;
  /** Advance width (trailing whitespace included). */
  readonly width: number;
  /** Ascent / descent of the run's font (for hit boxes). */
  readonly ascent: number;
  readonly descent: number;
}

/** Result of {@link layoutTextRuns}. */
export interface TextRunLayout {
  readonly items: readonly TextRunLayoutItem[];
  /** Widest line (trailing whitespace excluded), px. */
  readonly width: number;
  /** `lines × lineHeight × size`, px (like troika's block height). */
  readonly height: number;
  readonly lineCount: number;
}

/** The font a run is drawn with: `base` with the run's overrides; decoration lines are merged. */
export function textRunFont(base: TextFont, run: TextRun): TextFont {
  const f = run.font;
  if (!f) return base;
  const out: TextFont = { ...base };
  if (f.family !== undefined) out.family = f.family;
  if (f.size !== undefined) out.size = f.size;
  if (f.weight !== undefined) out.weight = f.weight;
  if (f.style !== undefined) out.style = f.style;
  if (f.lineposition !== undefined) {
    const a = parseLinePosition(base.lineposition);
    const b = parseLinePosition(f.lineposition);
    const flags = [
      (a.under || b.under) && 'under',
      (a.over || b.over) && 'over',
      (a.through || b.through) && 'through',
    ].filter(Boolean);
    out.lineposition = flags.length > 0 ? flags.join('+') : 'none';
  }
  return out;
}

const ALIGN_FACTOR = { left: 0, center: 0.5, right: 1 } as const;

/**
 * Lay out rich lines against a base style: every run's baseline origin relative to the label
 * anchor, plus the block size. Empty lines still take a line advance.
 */
export function layoutTextRuns(
  lines: TextRunLines,
  base: TextRunBase,
  oracle: FontMetricsOracle = getDefaultFontMetricsOracle(),
): TextRunLayout {
  const font = base.font;
  const lineHeight =
    base.lineHeight !== undefined && base.lineHeight > 0
      ? base.lineHeight
      : TEXT_DEFAULT_LINE_HEIGHT;
  // measureText applies the variant's size scale, like the primitive does.
  const baseMetrics = oracle.measureText('', font, lineHeight);
  const advance = baseMetrics.lineHeight;
  const lineCount = Math.max(1, lines.length);

  interface Pending {
    run: TextRun;
    line: number;
    font: TextFont;
    x: number;
    width: number;
    shift: number;
    ascent: number;
    descent: number;
  }
  const pending: Pending[] = [];
  const lineWidths: number[] = [];
  const sizeScale = font.size > 0 ? baseMetrics.lineHeight / (font.size * lineHeight) : 1;
  for (let l = 0; l < lines.length; l++) {
    const runs = lines[l] as readonly TextRun[];
    let x = 0;
    let visible = 0;
    for (const run of runs) {
      if (run.text === '') continue;
      const f = textRunFont(font, run);
      const width = oracle.measureAdvance(run.text, f);
      const m = oracle.measureText('', f);
      if (run.text.trim() !== '') visible = x + oracle.measureWidth(run.text, f);
      pending.push({
        run,
        line: l,
        font: f,
        x,
        width,
        shift: (run.shift ?? 0) * sizeScale,
        ascent: m.ascent,
        descent: m.descent,
      });
      x += width;
    }
    lineWidths.push(visible);
  }
  const width = lineWidths.reduce((a, b) => Math.max(a, b), 0);
  const anchorX = base.anchorX ?? 'left';
  const align = base.align ?? anchorX;
  const left = -width * ALIGN_FACTOR[anchorX];
  const height = lineCount * advance;
  // Troika's line box: the first baseline sits half the leading plus the ascent below the top.
  const topToBaseline = (advance + baseMetrics.ascent - baseMetrics.descent) / 2;
  const anchorY = base.anchorY ?? 'baseline';
  const firstBaseline =
    anchorY === 'baseline'
      ? 0
      : anchorY === 'top'
        ? -topToBaseline
        : anchorY === 'middle'
          ? height / 2 - topToBaseline
          : height - topToBaseline;
  const items = pending.map((p) => ({
    run: p.run,
    line: p.line,
    font: p.font,
    x: left + (width - (lineWidths[p.line] ?? 0)) * ALIGN_FACTOR[align] + p.x,
    y: firstBaseline - p.line * advance + p.shift,
    width: p.width,
    ascent: p.ascent,
    descent: p.descent,
  }));
  return { items, width, height, lineCount };
}

/**
 * The link under a point, for pointer handling: `dx`, `dy` are the point's offset from the label
 * anchor in screen px (+y down), before the label's `offset` and rotation (`angle`, degrees
 * clockwise) are undone here. `null` when no linked run is there.
 */
export function textLinkAt(
  lines: TextRunLines,
  base: TextRunBase & { angle?: number; offset?: readonly [number, number] },
  dx: number,
  dy: number,
  oracle?: FontMetricsOracle,
): TextLink | null {
  if (!lines.some((line) => line.some((r) => r.link))) return null;
  const layout = layoutTextRuns(lines, base, oracle);
  const ox = dx - (base.offset?.[0] ?? 0);
  const oy = -(dy - (base.offset?.[1] ?? 0));
  // Undo the clockwise screen rotation (a counter-clockwise one in the y-up frame).
  const a = ((base.angle ?? 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = ox * c - oy * s;
  const y = ox * s + oy * c;
  for (const item of layout.items) {
    const link = item.run.link;
    if (!link) continue;
    if (
      x >= item.x &&
      x <= item.x + item.width &&
      y >= item.y - item.descent &&
      y <= item.y + item.ascent
    ) {
      return link;
    }
  }
  return null;
}

/** Runs with the alpha of their own colors multiplied by `alpha` (runs without one follow the label). */
export function fadeTextRuns(runs: TextRunLines, alpha: number): TextRunLines {
  if (alpha === 1) return runs;
  return runs.map((line) =>
    line.map((r) =>
      r.color ? { ...r, color: [r.color[0], r.color[1], r.color[2], r.color[3] * alpha] } : r,
    ),
  );
}

/**
 * Runs scaled by `k` (a label shrunk to fit, or resized by `uniformtext`): run sizes and baseline
 * shifts are absolute px, so they scale with the label's font.
 */
export function scaleTextRuns(runs: TextRunLines, k: number): TextRunLines {
  if (k === 1) return runs;
  return runs.map((line) =>
    line.map((r) =>
      r.font?.size === undefined && r.shift === undefined
        ? r
        : {
            ...r,
            ...(r.font?.size !== undefined ? { font: { ...r.font, size: r.font.size * k } } : {}),
            ...(r.shift !== undefined ? { shift: r.shift * k } : {}),
          },
    ),
  );
}

/** The parts of a pointer event (the runtime's `ComponentPointerEvent`) link handling uses. */
export interface TextLinkPointerEvent {
  readonly type: string;
  readonly button: number;
  cursor: string | undefined;
}

/** Open a link like Plotly's SVG `<a>`: in `target` (default `_blank`), without an opener. */
export function openTextLink(link: TextLink): void {
  if (typeof window !== 'undefined') window.open(link.href, link.target ?? '_blank', 'noopener');
}

/**
 * Pointer handling over a link, for `handlePointer` of component and trace views: `move` shows a
 * pointer cursor, a primary `click` opens the link, and `down` / `up` / `dblclick` are taken so
 * the gesture doesn't zoom, pan or toggle anything. Returns whether the event was handled
 * (`false` without a link, and for `wheel` and `leave`).
 */
export function handleTextLinkPointer(event: TextLinkPointerEvent, link: TextLink | null): boolean {
  if (!link || event.type === 'wheel' || event.type === 'leave') return false;
  if (event.type === 'move') event.cursor = 'pointer';
  else if (event.type === 'click' && event.button === 0) openTextLink(link);
  return true;
}
