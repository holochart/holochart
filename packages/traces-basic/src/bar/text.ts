/**
 * Bar labels (plan E9.8): what each bar says (`text` / `texttemplate`) and where it goes
 * (`textposition`, `insidetextanchor`, `textangle`, `constraintext`), ported from plotly.js'
 * `bar/plot.js` (`toMoveInsideBar`, `toMoveOutsideBar`, the `auto` fit tests).
 *
 * Placement is a pure function of the bar's screen box and the measured label, so it is unit
 * tested without a GPU and recomputed when zooming changes the bars' pixel sizes.
 *
 * Labels may be Plotly pseudo-HTML (E2.10): they are measured and drawn as styled runs (see
 * `shared/rich-text.ts`). With `layout.uniformtext` (E4.6), {@link planBarText} reports each
 * label's size so the view can negotiate one size for every bar trace of the chart.
 */
import {
  createTickFormatter,
  isArrayLike,
  toRGBA,
  uniformFontSize,
  uniformTextScale,
  uniformTextSize,
  type FullTrace,
  type RGBA,
  type UniformText,
  type UniformTextItem,
} from '@mk7s/holochart-core';
import {
  measureText,
  type DataTransform,
  type TextFont,
  type TextFontWeight,
  type TextLabel,
} from '@mk7s/holochart-render';
import type { AxisInfo } from '@mk7s/holochart-runtime';
import {
  fadeRuns,
  labelContent,
  measureLabel,
  richLabel,
  scaleRuns,
  type RichLabel,
} from '../shared/rich-text.ts';
import type { BarCalc } from './calc.ts';
import { contrastColor, numberAt } from './style.ts';
import { formatTemplate } from './template.ts';

/** Plotly's `TEXTPAD`: px between a label and the bar edge. */
export const TEXTPAD = 3;

/** Line height of labels as a multiple of the font size (troika block height). */
const LINE_HEIGHT = 1.2;

export type TextPosition = 'inside' | 'outside' | 'auto' | 'none';
export type InsideAnchor = 'end' | 'middle' | 'start';

/** A bar's box in px, y up: `x0/y0` is the base corner, `x1/y1` the end corner. */
export interface BarBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Inputs of {@link placeBarText}. Sizes are the unrotated label block in px. */
export interface TextPlacementOptions {
  readonly position: TextPosition;
  readonly horizontal: boolean;
  /** Outermost bar of its stack (only these may put text outside). */
  readonly outmost: boolean;
  /** Degrees clockwise, or `'auto'`. */
  readonly angle: number | 'auto';
  readonly anchor: InsideAnchor;
  readonly constrainInside: boolean;
  readonly constrainOutside: boolean;
  /** Label size with the inside font. */
  readonly inside: { readonly width: number; readonly height: number };
  /** Label size with the outside font. */
  readonly outside: { readonly width: number; readonly height: number };
  /**
   * Font scale to use instead of the fit scale (`uniformtext` resizing, Plotly's `resizeText`):
   * the label keeps its anchored end (bar end, start or outside edge) and grows or shrinks from it.
   */
  readonly scale?: number;
}

/** Where a label goes: its center in px (y up), rotation and scale. */
export interface PlacedText {
  readonly inside: boolean;
  readonly cx: number;
  readonly cy: number;
  /** Degrees clockwise. */
  readonly rotate: number;
  /** Font scale (≤ 1 when constrained). */
  readonly scale: number;
}

/** Size of a `w × h` box rotated by `degrees`. */
function rotatedSize(w: number, h: number, degrees: number): { x: number; y: number } {
  const a = (degrees * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return { x: w * c + h * s, y: w * s + h * c };
}

const dirSign = (from: number, to: number): number => (to >= from ? 1 : -1);

/**
 * Decide where one bar's label goes (Plotly's `appendBarText`). `auto` puts the label inside when
 * it fits (as is, rotated, or shrunk to the bar's width) and outside otherwise; only outermost
 * bars may have outside labels. Returns `null` for `none` or an empty label.
 */
export function placeBarText(box: BarBox, o: TextPlacementOptions): PlacedText | null {
  let position = o.position;
  if (position === 'none') return null;
  const barWidth = Math.abs(box.x1 - box.x0);
  const barHeight = Math.abs(box.y1 - box.y0);
  if (position === 'auto') {
    if (o.outmost) {
      const { width: w, height: h } = o.inside;
      const fits = w <= barWidth && h <= barHeight;
      const fitsRotated = w <= barHeight && h <= barWidth;
      const fitsShrunk = o.horizontal
        ? barWidth >= w * (barHeight / h)
        : barHeight >= h * (barWidth / w);
      position = w > 0 && h > 0 && (fits || fitsRotated || fitsShrunk) ? 'inside' : 'outside';
    } else position = 'inside';
  } else if (position === 'outside' && !o.outmost) position = 'inside';

  const size = position === 'inside' ? o.inside : o.outside;
  if (!(size.width > 0 && size.height > 0)) return null;
  return position === 'inside' ? moveInside(box, size, o) : moveOutside(box, size, o);
}

function moveInside(
  box: BarBox,
  { width: w, height: h }: { width: number; height: number },
  o: TextPlacementOptions,
): PlacedText {
  let lx = Math.abs(box.x1 - box.x0);
  let ly = Math.abs(box.y1 - box.y0);
  const pad = lx > 2 * TEXTPAD && ly > 2 * TEXTPAD ? TEXTPAD : 0;
  lx -= 2 * pad;
  ly -= 2 * pad;
  let rotate = o.angle === 'auto' ? 0 : o.angle;
  // Plotly: turn the label when it does not fit as is but its orientation matches the bar's.
  if (
    o.angle === 'auto' &&
    !(w <= lx && h <= ly) &&
    (w > lx || h > ly) &&
    (!(w > ly || h > lx) || w < h !== lx < ly)
  ) {
    rotate += 90;
  }
  const t = rotatedSize(w, h, rotate);
  const scale = o.scale ?? (o.constrainInside ? Math.max(0, Math.min(1, lx / t.x, ly / t.y)) : 1);
  let cx = (box.x0 + box.x1) / 2;
  let cy = (box.y0 + box.y1) / 2;
  if (o.anchor !== 'middle') {
    // Distance from the chosen end to the label center, along the bar.
    const extent = ((o.horizontal ? t.x : t.y) * scale) / 2 + pad;
    if (o.horizontal) {
      const dir = dirSign(box.x0, box.x1);
      cx = o.anchor === 'end' ? box.x1 - dir * extent : box.x0 + dir * extent;
    } else {
      const dir = dirSign(box.y0, box.y1);
      cy = o.anchor === 'end' ? box.y1 - dir * extent : box.y0 + dir * extent;
    }
  }
  return { inside: true, cx, cy, rotate, scale };
}

function moveOutside(
  box: BarBox,
  { width: w, height: h }: { width: number; height: number },
  o: TextPlacementOptions,
): PlacedText {
  const lx = Math.abs(box.x1 - box.x0);
  const ly = Math.abs(box.y1 - box.y0);
  const pad = (o.horizontal ? ly : lx) > 2 * TEXTPAD ? TEXTPAD : 0;
  const rotate = o.angle === 'auto' ? 0 : o.angle;
  const t = rotatedSize(w, h, rotate);
  // Constrained outside labels are no wider (across the bar) than the bar.
  const scale =
    o.scale ??
    (o.constrainOutside ? Math.max(0, Math.min(1, o.horizontal ? ly / t.y : lx / t.x)) : 1);
  let cx = (box.x0 + box.x1) / 2;
  let cy = (box.y0 + box.y1) / 2;
  if (o.horizontal) {
    const dir = dirSign(box.x0, box.x1);
    cx = box.x1 + dir * ((t.x * scale) / 2 + pad);
  } else {
    const dir = dirSign(box.y0, box.y1);
    cy = box.y1 + dir * ((t.y * scale) / 2 + pad);
  }
  return { inside: false, cx, cy, rotate, scale };
}

// ---- Label content ------------------------------------------------------------------------------

interface FullFont {
  family?: unknown;
  size?: unknown;
  color?: unknown;
  weight?: unknown;
  style?: unknown;
}

function stringAt(value: unknown, i: number): string {
  const v = isArrayLike(value) ? value[i] : value;
  return v === undefined || v === null ? '' : String(v);
}

function valueAt(value: unknown, i: number): unknown {
  return isArrayLike(value) ? value[i] : value;
}

/** A trace's text position for bar `i`. */
export function textPositionAt(trace: FullTrace, i: number): TextPosition {
  const v = valueAt(trace['textposition'], i);
  return v === 'inside' || v === 'outside' || v === 'none' ? v : 'auto';
}

/** The font of bar `i` (per-bar `size`/`color` resolved). */
export function fontAt(font: unknown, i: number): { font: TextFont; color: RGBA | null } {
  const f = (font ?? {}) as FullFont;
  const color = valueAt(f.color, i);
  const weight = f.weight;
  return {
    font: {
      family: typeof f.family === 'string' ? f.family : 'sans-serif',
      size: numberAt(f.size, i, 12),
      ...(weight === 'normal' || weight === 'bold' || typeof weight === 'number'
        ? { weight: weight as TextFontWeight }
        : {}),
      ...(f.style === 'italic' ? { style: 'italic' as const } : {}),
    },
    color: typeof color === 'string' ? toRGBA(color) : null,
  };
}

/** Axis formatters for label and hover values (hover precision), or `undefined` without axes. */
export interface ValueFormatters {
  readonly position?: (l: number) => string;
  readonly size?: (l: number) => string;
}

/** Hover-precision formatters of the bar's position and size axes. */
export function valueFormatters(
  calc: BarCalc,
  xaxis: AxisInfo | undefined,
  yaxis: AxisInfo | undefined,
): ValueFormatters {
  const [pa, sa] = calc.orientation === 'h' ? [yaxis, xaxis] : [xaxis, yaxis];
  const make = (axis: AxisInfo | undefined) => {
    if (!axis) return undefined;
    const f = createTickFormatter(axis.scale, axis.full);
    return (l: number): string => f.label(l, true).text;
  };
  const size = make(sa);
  const position = make(pa);
  return {
    ...(position ? { position } : {}),
    ...(size
      ? {
          // Sizes are in calc space: linearize for log axes.
          size: (c: number) => size(calc.sizeType === 'log' ? Math.log10(c) : c),
        }
      : {}),
  };
}

/** The data value at bar `i` of a coordinate (implicit `x0 + i·dx` when there is no array). */
export function coordinateAt(trace: FullTrace, letter: 'x' | 'y', i: number): unknown {
  const values = trace[letter];
  if (isArrayLike(values)) return values[i];
  const start = trace[`${letter}0`];
  const step = Number(trace[`d${letter}`] ?? 1);
  return typeof start === 'number' ? start + i * step : start;
}

/**
 * Template variables of bar `i` (also used for hover fields): `value` (the bar's own length,
 * normalized with `barnorm`), `label` (its position), `x`, `y`, `base`, `text`, `customdata`,
 * `meta`, `marker.color`.
 */
export function barValues(
  trace: FullTrace,
  calc: BarCalc,
  i: number,
): { values: Record<string, unknown>; sizeLetter: 'x' | 'y'; posLetter: 'x' | 'y' } {
  const [posLetter, sizeLetter] =
    calc.orientation === 'h' ? (['y', 'x'] as const) : (['x', 'y'] as const);
  const value = calc.bars.value[i];
  const label = calc.positionValues ? calc.positionValues[i] : coordinateAt(trace, posLetter, i);
  const marker = (trace['marker'] ?? {}) as { color?: unknown };
  return {
    posLetter,
    sizeLetter,
    values: {
      value,
      label,
      [posLetter]: label,
      [sizeLetter]: value,
      base: calc.bars.base[i],
      text: stringAt(trace['text'], i),
      customdata: valueAt(trace['customdata'], i),
      meta: trace['meta'],
      marker: { color: valueAt(marker.color, i) },
    },
  };
}

/** The label string of bar `i`: `texttemplate` when set, else `text`. */
export function barLabel(
  trace: FullTrace,
  calc: BarCalc,
  i: number,
  formatters: ValueFormatters = {},
): string {
  const template = stringAt(trace['texttemplate'], i);
  if (!template) return stringAt(trace['text'], i);
  const { values, posLetter, sizeLetter } = barValues(trace, calc, i);
  const labels: Record<string, string> = {};
  const value = calc.bars.value[i]!;
  if (formatters.size && Number.isFinite(value)) {
    labels['value'] = labels[sizeLetter] = formatters.size(value);
  }
  const pos = calc.pos[i]!;
  if (formatters.position && Number.isFinite(pos)) {
    labels['label'] = labels[posLetter] = formatters.position(pos);
  }
  return formatTemplate(template, { values, labels });
}

/**
 * Label block size of `text` in `font`, in px (unrotated). Pseudo-HTML is measured as drawn (tags
 * removed, styled runs laid out); plain text as before.
 */
export function labelSize(text: string, font: TextFont): { width: number; height: number } {
  const rich = richLabel(text, font);
  if (rich) return measureLabel(rich, LINE_HEIGHT);
  const m = measureText(text, font, LINE_HEIGHT);
  return { width: m.width, height: m.height };
}

/**
 * Autorange room (px) for `outside` labels past the bar ends: one line for vertical bars, the
 * widest label for horizontal ones (a Holochart addition: Plotly clips them instead).
 */
export function outsideTextPadding(trace: FullTrace, calc: BarCalc): number {
  const position = trace['textposition'];
  const outside = isArrayLike(position)
    ? Array.prototype.includes.call(position, 'outside')
    : position === 'outside';
  if (!outside) return 0;
  let pad = 0;
  for (let i = 0; i < calc.length; i++) {
    if (textPositionAt(trace, i) !== 'outside') continue;
    const text = barLabel(trace, calc, i);
    if (!text) continue;
    const { font } = fontAt(trace['outsidetextfont'], i);
    const size = calc.orientation === 'h' ? labelSize(text, font).width : font.size * LINE_HEIGHT;
    pad = Math.max(pad, size + 2 * TEXTPAD);
  }
  return pad;
}

// ---- Labels for the text primitive --------------------------------------------------------------

/** Everything {@link barTextLabels} needs besides the trace and calc. */
export interface BarTextContext {
  /** Linear → viewport px (y up). */
  readonly transform: Readonly<DataTransform>;
  /** Visible linear range of the (x, y) axes, to clip bars that run off screen. */
  readonly xRange: readonly [number, number] | undefined;
  readonly yRange: readonly [number, number] | undefined;
  /** Bar fills before opacity (4 per bar), for contrasting inside text. */
  readonly fill: Float32Array;
  readonly background: RGBA;
  readonly formatters: ValueFormatters;
  /** Linear coordinate the size axis starts from for bars below a log axis. */
  readonly floor: number;
  /** Active selection, for selected / unselected text colors. */
  readonly selected: ReadonlySet<number> | null;
  /**
   * `layout.uniformtext` (E4.6); off when unset. With a mode, fonts are raised to `minsize`
   * before the fit tests and labels are drawn at the negotiated uniform size.
   */
  readonly uniformText?: UniformText;
}

function clip(v: number, range: readonly [number, number] | undefined): number {
  if (!range) return v;
  const lo = Math.min(range[0], range[1]);
  const hi = Math.max(range[0], range[1]);
  return v < lo ? lo : v > hi ? hi : v;
}

function selectionTextColor(trace: FullTrace, selected: boolean): RGBA | null {
  const style = trace[selected ? 'selected' : 'unselected'] as
    { textfont?: { color?: unknown } } | undefined;
  const c = style?.textfont?.color;
  return typeof c === 'string' ? toRGBA(c) : null;
}

/** One bar's label after placement, before its final size is known. */
interface PlannedLabel {
  readonly box: BarBox;
  readonly options: TextPlacementOptions;
  readonly placed: PlacedText;
  readonly content: RichLabel;
  readonly color: RGBA;
  /** Explicit run colors are multiplied by this (selection dimming). */
  readonly fade: number;
}

/** Bar labels placed at their fit scale; sizes are settled by {@link BarTextPlan.labels}. */
export interface BarTextPlan {
  /**
   * `{ fontSize, scale }` of every placed label, for the cross-trace uniform size (Plotly's
   * `recordMinTextSize`); empty when `uniformtext` is off.
   */
  readonly items: readonly UniformTextItem[];
  /**
   * The labels for the text primitive. `uniform` is the negotiated size of all bar traces
   * (`uniformTextSize` over every trace's {@link BarTextPlan.items}); it defaults to this trace's
   * own and is ignored when `uniformtext` is off.
   */
  labels(uniform?: number): TextLabel[];
}

const QUANTUM = 4;

/**
 * Place every bar's label (Plotly's `appendBarText`) at its fit scale. Labels are positioned in
 * linear coordinates (the label center) so the text primitive maps them through the same
 * transform as the bars. Empty labels are skipped.
 */
export function planBarText(trace: FullTrace, calc: BarCalc, ctx: BarTextContext): BarTextPlan {
  const planned: PlannedLabel[] = [];
  const items: UniformTextItem[] = [];
  const t = ctx.transform;
  const uniformText = ctx.uniformText;
  const uniformOn = uniformText !== undefined && uniformText.mode !== false;
  const labels = (uniform?: number): TextLabel[] => {
    const size = uniformOn ? (uniform ?? uniformTextSize(items, uniformText)) : undefined;
    const out: TextLabel[] = [];
    planned.forEach((p, k) => {
      let placed = p.placed;
      if (uniformOn) {
        // Plotly's `resizeText`; its text transform never scales up (`scale < 1` only).
        const scale = Math.min(1, uniformTextScale(items[k]!, size, uniformText));
        // The label keeps its anchored end (bar end, start or outside edge) at the new size.
        if (scale !== placed.scale) placed = placeBarText(p.box, { ...p.options, scale })!;
      }
      if (!(placed.scale > 0)) return;
      out.push(drawnLabel(p, placed, t));
    });
    return out;
  };
  if (!(t.scaleX !== 0 && t.scaleY !== 0)) return { items, labels };
  const horizontal = calc.orientation === 'h';
  const angleIn = trace['textangle'];
  const angle = typeof angleIn === 'number' ? angleIn : 'auto';
  const anchorIn = trace['insidetextanchor'];
  const anchor: InsideAnchor = anchorIn === 'middle' || anchorIn === 'start' ? anchorIn : 'end';
  const constraint = trace['constraintext'] ?? 'both';
  const constrainInside = constraint === 'both' || constraint === 'inside';
  const constrainOutside = constraint === 'both' || constraint === 'outside';
  const [pRange, sRange] = horizontal ? [ctx.yRange, ctx.xRange] : [ctx.xRange, ctx.yRange];
  const { bars } = calc;

  for (let i = 0; i < calc.length; i++) {
    const position = textPositionAt(trace, i);
    if (position === 'none') continue;
    const c = bars.center[i]!;
    const w = bars.width[i]!;
    let s0 = calc.s0[i]!;
    const s1 = calc.s1[i]!;
    if (s0 === -Infinity) s0 = ctx.floor;
    if (!Number.isFinite(c) || !Number.isFinite(s0) || !Number.isFinite(s1)) continue;
    const text = barLabel(trace, calc, i, ctx.formatters);
    if (!text) continue;

    // Screen box (y up) of the visible part of the bar.
    const p0 = clip(c - w / 2, pRange);
    const p1 = clip(c + w / 2, pRange);
    const a = clip(s0, sRange);
    const b = clip(s1, sRange);
    const box: BarBox = horizontal
      ? {
          x0: a * t.scaleX + t.offsetX,
          x1: b * t.scaleX + t.offsetX,
          y0: p0 * t.scaleY + t.offsetY,
          y1: p1 * t.scaleY + t.offsetY,
        }
      : {
          x0: p0 * t.scaleX + t.offsetX,
          x1: p1 * t.scaleX + t.offsetX,
          y0: a * t.scaleY + t.offsetY,
          y1: b * t.scaleY + t.offsetY,
        };
    const inside = fontAt(trace['insidetextfont'], i);
    const outside = fontAt(trace['outsidetextfont'], i);
    if (uniformOn) {
      // Plotly's `ensureUniformFontSize`, before the fit tests.
      inside.font = { ...inside.font, size: uniformFontSize(inside.font.size, uniformText) };
      outside.font = { ...outside.font, size: uniformFontSize(outside.font.size, uniformText) };
    }
    const insideContent = labelContent(text, inside.font);
    const outsideContent =
      outside.font.size === inside.font.size && sameFace(outside.font, inside.font)
        ? insideContent
        : labelContent(text, outside.font);
    const options: TextPlacementOptions = {
      position,
      horizontal,
      outmost: bars.outmost[i] === 1,
      angle,
      anchor,
      constrainInside,
      constrainOutside,
      inside: measureLabel(insideContent, LINE_HEIGHT),
      outside: measureLabel(outsideContent, LINE_HEIGHT),
    };
    const placed = placeBarText(box, options);
    if (!placed) continue;
    // Plotly records squeezed-out labels too (hidden candidates); without a mode they're dropped.
    if (!uniformOn && placed.scale <= 0) continue;
    const { color } = placed.inside ? inside : outside;
    const content = placed.inside ? insideContent : outsideContent;
    let rgba = color ?? (placed.inside ? contrastColor(ctx.fill, i, ctx.background) : null);
    rgba ??= [68 / 255, 68 / 255, 68 / 255, 1];
    let fade = 1;
    if (ctx.selected) {
      const isSelected = ctx.selected.has(i);
      const override = selectionTextColor(trace, isSelected);
      if (override) rgba = override;
      else if (!isSelected) {
        rgba = [rgba[0], rgba[1], rgba[2], rgba[3] * 0.2];
        fade = 0.2;
      }
    }
    planned.push({
      box,
      options: { ...options, position: placed.inside ? 'inside' : 'outside' },
      placed,
      content,
      color: rgba,
      fade,
    });
    if (uniformOn) items.push({ fontSize: content.font.size, scale: placed.scale });
  }
  return { items, labels };
}

function sameFace(a: TextFont, b: TextFont): boolean {
  return a.family === b.family && a.weight === b.weight && a.style === b.style;
}

/** A planned label at its final placement, for the text primitive. */
function drawnLabel(p: PlannedLabel, placed: PlacedText, t: Readonly<DataTransform>): TextLabel {
  const { font, runs } = p.content;
  // Quantize the scaled size so zooming re-typesets labels rarely.
  const size = Math.max(1, Math.floor(font.size * placed.scale * QUANTUM) / QUANTUM);
  const label: TextLabel = {
    text: p.content.text,
    x: (placed.cx - t.offsetX) / t.scaleX,
    y: (placed.cy - t.offsetY) / t.scaleY,
    font: { ...font, size },
    color: p.color,
    anchorX: 'center',
    anchorY: 'middle',
    align: 'center',
    angle: placed.rotate,
    lineHeight: LINE_HEIGHT,
  };
  // Run sizes and shifts are absolute px: scale them with the label (as Plotly scales the element).
  if (runs) label.runs = fadeRuns(scaleRuns(runs, size / font.size), p.fade);
  return label;
}

/**
 * Text labels of every bar at their fit scale (and, with `uniformtext`, this trace's own uniform
 * size), positioned in linear coordinates (see {@link planBarText}).
 */
export function barTextLabels(trace: FullTrace, calc: BarCalc, ctx: BarTextContext): TextLabel[] {
  return planBarText(trace, calc, ctx).labels();
}
