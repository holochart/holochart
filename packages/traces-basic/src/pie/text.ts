/**
 * Pie labels and title (plan E9.11), ported from plotly.js' `traces/pie/plot.js`: what each slice
 * says (`textinfo` / `texttemplate`, `formatSliceLabel`), its font (`determineInsideTextFont` /
 * `determineOutsideTextFont`), where it goes (`transformInsideText` with `insidetextorientation`,
 * `transformOutsideText`), how outside labels avoid each other (`scootLabels`) and the leader lines
 * to moved labels (`plotTextLines`), plus the title (`positionTitleInside` / `…Outside`).
 *
 * Holochart addition: after scooting, outside labels are kept inside the figure and apart from
 * each other ({@link fitOutsideLabels}); Plotly lets them overflow (or pushes margins with
 * `automargin`, deferred).
 *
 * Everything here is pure and works in container px (top-left origin, y down, like Plotly's SVG),
 * with angles in Plotly's convention (see `calc.ts`). Text sizes come from the render layer's
 * synchronous metrics oracle, so placement is unit tested without a GPU.
 */
import {
  isArrayLike,
  toRGBA,
  type FullLayout,
  type FullTrace,
  type RGBA,
} from '@mk7s/holochart-core';
import { measureText, type TextFont, type TextFontWeight } from '@mk7s/holochart-render';
import { formatTemplate } from '../bar/template.ts';
import { polar, sliceCenter, type PieCalc, type PieLayout, type PieSlice } from './calc.ts';
import {
  castOption,
  contrastColor,
  DEFAULT_LINE,
  formatPiePercent,
  formatPieValue,
  getFirstFilled,
  isValidTextValue,
  plainText,
} from './helpers.ts';

/** Plotly's `TEXTPAD` (bar constants): px kept between inside labels and the slice edge. */
export const TEXTPAD = 3;

/** Line height of labels as a multiple of the font size (troika block height, as for bars). */
export const LINE_HEIGHT = 1.2;

const TAU = Math.PI * 2;

export type PieTextPosition = 'inside' | 'outside' | 'auto' | 'none';
export type InsideOrientation = 'horizontal' | 'radial' | 'tangential' | 'auto';

/** A text block size in px (unrotated, unscaled). */
export interface TextBox {
  readonly width: number;
  readonly height: number;
}

// ---- Content ------------------------------------------------------------------------------------

/** Template variables of a slice (also hover fields): Plotly's `makeTemplateVariables`. */
export function sliceValues(
  trace: FullTrace,
  calc: PieCalc,
  slice: PieSlice,
): Record<string, unknown> {
  const customdata = trace['customdata'];
  const text = getFirstFilled(trace['text'], slice.pts);
  return {
    label: slice.label,
    value: slice.v,
    percent: calc.vTotal > 0 ? slice.v / calc.vTotal : NaN,
    color: slice.color,
    text: isValidTextValue(text) || text === '' ? text : undefined,
    customdata: isArrayLike(customdata) ? customdata[slice.i] : customdata,
    meta: trace['meta'],
  };
}

/** Formatted `value` and `percent` (Plotly's `valueLabel` / `percentLabel`). */
export function sliceLabels(calc: PieCalc, slice: PieSlice): Record<string, string> {
  return {
    value: formatPieValue(slice.v),
    percent: calc.vTotal > 0 ? formatPiePercent(slice.v / calc.vTotal) : '',
  };
}

/**
 * The label of a slice (Plotly's `formatSliceLabel`), in pseudo-HTML: `texttemplate` when set,
 * else the `textinfo` parts (label, text, value, percent) joined with `<br>`.
 */
export function sliceText(trace: FullTrace, calc: PieCalc, slice: PieSlice): string {
  const template = trace['texttemplate'];
  if (template && (typeof template === 'string' || isArrayLike(template))) {
    const txt = isArrayLike(template) ? template[slice.i] : template;
    if (typeof txt !== 'string' || !txt) return '';
    return formatTemplate(txt, {
      values: sliceValues(trace, calc, slice),
      labels: sliceLabels(calc, slice),
    });
  }
  const info = trace['textinfo'];
  if (typeof info !== 'string' || !info || info === 'none') return '';
  const flags = new Set(info.split('+'));
  const parts: string[] = [];
  if (flags.has('label')) parts.push(slice.label);
  if (flags.has('text')) {
    const tx = getFirstFilled(trace['text'], slice.pts);
    if (isValidTextValue(tx)) parts.push(String(tx));
  }
  if (flags.has('value')) parts.push(formatPieValue(slice.v));
  if (flags.has('percent') && calc.vTotal > 0) parts.push(formatPiePercent(slice.v / calc.vTotal));
  return parts.join('<br>');
}

/** The `textposition` of a slice (first filled entry of an array; `undefined` for a gap). */
export function slicePosition(trace: FullTrace, slice: PieSlice): PieTextPosition | undefined {
  const v = castOption(trace['textposition'], slice.pts);
  return v === 'inside' || v === 'outside' || v === 'auto' || v === 'none' ? v : undefined;
}

// ---- Fonts --------------------------------------------------------------------------------------

type FontContainer = Readonly<Record<string, unknown>> | undefined;

function container(trace: FullTrace, key: string): FontContainer {
  const c = trace[key];
  return c !== null && typeof c === 'object' ? (c as Record<string, unknown>) : undefined;
}

/** The first truthy value of `key` along a font chain (Plotly's `castOption(a) || castOption(b)…`). */
function chain(fonts: readonly FontContainer[], key: string, pts: readonly number[]): unknown {
  for (const f of fonts) {
    const v = castOption(f?.[key], pts);
    if (v) return v;
  }
  return undefined;
}

function toFont(fonts: readonly FontContainer[], pts: readonly number[]): TextFont {
  const family = chain(fonts, 'family', pts);
  const size = Number(chain(fonts, 'size', pts));
  const weight = chain(fonts, 'weight', pts);
  const style = chain(fonts, 'style', pts);
  return {
    family: typeof family === 'string' ? family : 'sans-serif',
    size: Number.isFinite(size) && size > 0 ? size : 12,
    ...(weight === 'normal' || weight === 'bold' || typeof weight === 'number'
      ? { weight: weight as TextFontWeight }
      : {}),
    ...(style === 'italic' ? { style: 'italic' as const } : {}),
  };
}

function colorOf(v: unknown): RGBA | null {
  return typeof v === 'string' ? toRGBA(v) : null;
}

/** A resolved label font and color. */
export interface LabelFont {
  readonly font: TextFont;
  readonly color: RGBA;
}

/**
 * Font of an inside label (Plotly's `determineInsideTextFont`): `insidetextfont`, then `textfont`,
 * then `layout.font`; the color contrasts with the slice unless one was set.
 */
export function insideFont(trace: FullTrace, slice: PieSlice, fullLayout: FullLayout): LabelFont {
  const fonts = [
    container(trace, 'insidetextfont'),
    container(trace, 'textfont'),
    fullLayout.font as unknown as FontContainer,
  ];
  const custom = colorOf(castOption(container(trace, 'insidetextfont')?.['color'], slice.pts));
  const fill = toRGBA(slice.color) ?? DEFAULT_LINE;
  return { font: toFont(fonts, slice.pts), color: custom ?? contrastColor(fill) };
}

/** Font of an outside label (Plotly's `determineOutsideTextFont`). */
export function outsideFont(trace: FullTrace, slice: PieSlice, fullLayout: FullLayout): LabelFont {
  const fonts = [
    container(trace, 'outsidetextfont'),
    container(trace, 'textfont'),
    fullLayout.font as unknown as FontContainer,
  ];
  return {
    font: toFont(fonts, slice.pts),
    color: colorOf(chain(fonts, 'color', slice.pts)) ?? DEFAULT_LINE,
  };
}

function titleFont(trace: FullTrace): LabelFont {
  const title = container(trace, 'title');
  const font = (title?.['font'] ?? undefined) as FontContainer;
  return {
    font: toFont([font], [0]),
    color: colorOf(castOption(font?.['color'], [0])) ?? DEFAULT_LINE,
  };
}

/** Label block size of plain `text` in `font`, px (unrotated). */
export function textBox(text: string, font: TextFont): TextBox {
  const m = measureText(text, font, LINE_HEIGHT);
  return { width: m.width, height: m.height };
}

/** Size of the title block (Plotly's `prerenderTitles`). */
export function titleBlockSize(trace: FullTrace, text: string): TextBox {
  return textBox(plainText(text), titleFont(trace).font);
}

// ---- Inside text (Plotly's transformInsideText) -------------------------------------------------

/** Where a label goes relative to its slice (Plotly's text transform). */
export interface SliceTextTransform {
  /** Font scale, ≤ 1 when shrunk to fit (0 = not drawn). */
  scale: number;
  /** Radius fraction of the text center along `textPosAngle` (or the bisector). */
  rCenter: number;
  /** Rotation, degrees clockwise. */
  rotate: number;
  /** Angle (Plotly convention) of the radius the label sits on; the bisector when unset. */
  textPosAngle?: number;
  /** Extra offset in px (outside labels). */
  x?: number;
  y?: number;
  outside?: boolean;
}

/** The slice geometry inside-text placement needs. */
export interface SliceShape {
  readonly startAngle: number;
  readonly stopAngle: number;
  readonly midAngle: number;
  readonly halfAngle: number;
  /** `1 − hole`. */
  readonly ring: number;
  readonly rInscribed: number;
}

function isCrossing(s: SliceShape, angle: number): boolean {
  const a = s.startAngle;
  const b = s.stopAngle;
  return (a > angle && angle > b) || (a < angle && angle < b);
}

function calcRCenter(a: number, b: number): number {
  return Math.cos(b) - a * b;
}

function calcRotate(t: number): number {
  return (((180 / Math.PI) * t + 720) % 180) - 90;
}

function calcMaxHalfSize(a: number, halfAngle: number, r: number, ring: number): number {
  const q = a + 1 / (2 * Math.tan(halfAngle));
  return r * Math.min(1 / (Math.sqrt(q * q + 0.5) + q), ring / (Math.sqrt(a * a + ring / 2) + a));
}

function calcRadTransform(
  box: TextBox,
  r: number,
  ring: number,
  halfAngle: number,
  midAngle: number,
): SliceTextTransform {
  const rr = Math.max(0, r - 2 * TEXTPAD);
  const a = box.width / box.height;
  const s = calcMaxHalfSize(a, halfAngle, rr, ring);
  return {
    scale: (s * 2) / box.height,
    rCenter: calcRCenter(a, s / rr),
    rotate: calcRotate(midAngle),
  };
}

function calcTanTransform(
  box: TextBox,
  r: number,
  ring: number,
  halfAngle: number,
  midAngle: number,
): SliceTextTransform {
  const rr = Math.max(0, r - 2 * TEXTPAD);
  const a = box.height / box.width;
  const s = calcMaxHalfSize(a, halfAngle, rr, ring);
  return {
    scale: (s * 2) / box.width,
    rCenter: calcRCenter(a, s / rr),
    rotate: calcRotate(midAngle + Math.PI / 2),
  };
}

/**
 * The largest placement of a label inside its slice for `orientation` (Plotly's
 * `transformInsideText`): horizontal text inscribed in the slice's inscribed circle, radial or
 * tangential text as large as the ring allows; `auto` takes the largest. A scale < 1 means the
 * label must shrink to fit.
 */
export function transformInsideText(
  box: TextBox,
  s: SliceShape,
  r: number,
  orientation: InsideOrientation,
): SliceTextTransform {
  if (s.startAngle === s.stopAngle) {
    return { rCenter: 1 - s.rInscribed, scale: 0, rotate: 0, textPosAngle: 0 };
  }
  const isCircle = s.ring === 1 && Math.abs(Math.abs(s.startAngle - s.stopAngle) - TAU) < 1e-9;
  const isAuto = orientation === 'auto';
  const isHorizontal = orientation === 'horizontal';
  const isTangential = orientation === 'tangential';
  const isRadial = orientation === 'radial';
  const all: SliceTextTransform[] = [];

  if (!isAuto) {
    const consider = (angle: number, key: 'tan' | 'rad'): void => {
      if (!isCrossing(s, angle)) return;
      const dStart = Math.abs(angle - s.startAngle);
      const dStop = Math.abs(angle - s.stopAngle);
      const closest = dStart < dStop ? dStart : dStop;
      const t =
        key === 'tan'
          ? calcTanTransform(box, r, s.ring, closest, 0)
          : calcRadTransform(box, r, s.ring, closest, Math.PI / 2);
      t.textPosAngle = angle;
      all.push(t);
    };
    if (isHorizontal || isTangential) {
      for (let i = 4; i >= -4; i -= 2) consider(Math.PI * i, 'tan'); // top
      for (let i = 4; i >= -4; i -= 2) consider(Math.PI * (i + 1), 'tan'); // bottom
    }
    if (isHorizontal || isRadial) {
      for (let i = 4; i >= -4; i -= 2) consider(Math.PI * (i + 1.5), 'rad'); // left
      for (let i = 4; i >= -4; i -= 2) consider(Math.PI * (i + 0.5), 'rad'); // right
    }
  }

  const mid = (s.startAngle + s.stopAngle) / 2;
  if (isCircle || isAuto || isHorizontal) {
    // The text rectangle inscribed in a circle inscribed in the slice (an underestimate).
    const diameter = Math.hypot(box.width, box.height);
    const t: SliceTextTransform = {
      scale: (s.rInscribed * r * 2) / diameter,
      rCenter: 1 - s.rInscribed,
      rotate: 0,
      textPosAngle: mid,
    };
    if (t.scale >= 1) return t;
    all.push(t);
  }
  if (isAuto || isRadial) {
    all.push({ ...calcRadTransform(box, r, s.ring, s.halfAngle, s.midAngle), textPosAngle: mid });
  }
  if (isAuto || isTangential) {
    all.push({ ...calcTanTransform(box, r, s.ring, s.halfAngle, s.midAngle), textPosAngle: mid });
  }

  let id = 0;
  let maxScale = 0;
  for (let k = 0; k < all.length; k++) {
    const scale = all[k]!.scale;
    if (maxScale < scale) {
      maxScale = scale;
      id = k;
    }
    // Non-auto orientations respect the test order.
    if (!isAuto && maxScale >= 1) break;
  }
  return all[id] ?? { rCenter: 1 - s.rInscribed, scale: 0, rotate: 0, textPosAngle: mid };
}

/**
 * An outside label next to the slice's outer edge midpoint `pxmid` (px relative to the center,
 * y down), pushed away diagonally so it clears the edge (Plotly's `transformOutsideText`).
 */
export function transformOutsideText(
  box: TextBox,
  pxmid: readonly [number, number],
): SliceTextTransform {
  const [x, y] = pxmid;
  let dx = box.width / 2;
  let dy = box.height / 2;
  if (x < 0) dx *= -1;
  if (y < 0) dy *= -1;
  const ratio = y === 0 ? (x === 0 ? 0 : Infinity) : (x * x) / (y * y);
  return {
    scale: 1,
    rCenter: 1,
    rotate: 0,
    x: dx + (Math.abs(dy) * (dx > 0 ? 1 : -1)) / 2,
    y: Number.isFinite(ratio) ? dy / (1 + ratio) : 0,
    outside: true,
  };
}

// ---- Outside label collisions (Plotly's scootLabels) --------------------------------------------

/** Placement state of one visible slice's label (Plotly's calcdata point fields). */
export interface LabelPoint {
  /** Index in `calc.slices`. */
  readonly index: number;
  readonly pts: readonly number[];
  readonly pull: number;
  /** Outer edge points relative to the center (y down): bisector, and both ends. */
  readonly pxmid: readonly [number, number];
  readonly px0: readonly [number, number];
  readonly px1: readonly [number, number];
  /** The slice's (pulled) center. */
  readonly cxFinal: number;
  readonly cyFinal: number;
  /** Outside labels only: vertical extent of the label, before `labelExtraY`. */
  yLabelMin?: number;
  yLabelMid?: number;
  yLabelMax?: number;
  /** Outside labels: horizontal extent, before `labelExtraX`. */
  xLabelMin?: number;
  xLabelMax?: number;
  labelExtraX: number;
  labelExtraY: number;
}

/**
 * Move outside labels apart vertically, quadrant by quadrant from the equator outwards, and (with
 * a `pull` array) away from slices pulled further than theirs (Plotly's `scootLabels`). Mutates
 * `labelExtraX` / `labelExtraY`.
 *
 * @param quadrants Visible slices by `[pxmid.y < 0 ? 0 : 1][pxmid.x < 0 ? 0 : 1]`.
 */
export function scootLabels(quadrants: LabelPoint[][][], pull: unknown): void {
  const pullArray = isArrayLike(pull);
  const pullOf = (p: LabelPoint): number => Number(castOption(pull, p.pts)) || 0;
  let yHalf = 0;
  let farthestY: (a: number, b: number) => number = Math.min;
  let farthestX: (a: number, b: number) => number = Math.min;
  let yDiffSign = -1;
  let xDiffSign = -1;
  let wholeSide: LabelPoint[] = [];

  const scootOne = (thisPt: LabelPoint, prevPt: LabelPoint | undefined): void => {
    const thisInnerY = (yHalf ? thisPt.yLabelMin : thisPt.yLabelMax)!;
    const thisOuterY = (yHalf ? thisPt.yLabelMax : thisPt.yLabelMin)!;
    const thisSliceOuterY = thisPt.cyFinal + farthestY(thisPt.px0[1], thisPt.px1[1]);
    if (prevPt) {
      const prevOuterY = prevPt.labelExtraY + (yHalf ? prevPt.yLabelMax! : prevPt.yLabelMin!);
      const newExtraY = prevOuterY - thisInnerY;
      // Only move labels vertically to clear other labels.
      if (newExtraY * yDiffSign > 0) thisPt.labelExtraY = newExtraY;
    }
    // Clearing slices is only needed with array pulls.
    if (!pullArray) return;
    for (let i = 0; i < wholeSide.length; i++) {
      const otherPt = wholeSide[i]!;
      // Only a slice pulled more than this one can overlap its label.
      if (otherPt === thisPt || pullOf(thisPt) >= pullOf(otherPt)) continue;
      if ((thisPt.pxmid[1] - otherPt.pxmid[1]) * yDiffSign > 0) {
        // Closer to the equator (all of these come first): move the label vertically away.
        const otherOuterY = otherPt.cyFinal + farthestY(otherPt.px0[1], otherPt.px1[1]);
        const newExtraY = otherOuterY - thisInnerY - thisPt.labelExtraY;
        if (newExtraY * yDiffSign > 0) thisPt.labelExtraY += newExtraY;
      } else if ((thisOuterY + thisPt.labelExtraY - thisSliceOuterY) * yDiffSign > 0) {
        // Farther from the equator: move horizontally, with room for the leader lines between.
        const xBuffer = 3 * xDiffSign * Math.abs(i - wholeSide.indexOf(thisPt));
        const otherOuterX = otherPt.cxFinal + farthestX(otherPt.px0[0], otherPt.px1[0]);
        const newExtraX =
          otherOuterX + xBuffer - (thisPt.cxFinal + thisPt.pxmid[0]) - thisPt.labelExtraX;
        if (newExtraX * xDiffSign > 0) thisPt.labelExtraX += newExtraX;
      }
    }
  };

  for (yHalf = 0; yHalf < 2; yHalf++) {
    const equatorFirst = yHalf
      ? (a: LabelPoint, b: LabelPoint) => a.pxmid[1] - b.pxmid[1]
      : (a: LabelPoint, b: LabelPoint) => b.pxmid[1] - a.pxmid[1];
    farthestY = yHalf ? Math.max : Math.min;
    yDiffSign = yHalf ? 1 : -1;
    for (let xHalf = 0; xHalf < 2; xHalf++) {
      farthestX = xHalf ? Math.max : Math.min;
      xDiffSign = xHalf ? 1 : -1;
      const thisQuad = quadrants[yHalf]![xHalf]!;
      thisQuad.sort(equatorFirst);
      const oppositeQuad = quadrants[1 - yHalf]![xHalf]!;
      wholeSide = oppositeQuad.concat(thisQuad);
      const outside = thisQuad.filter((p) => p.yLabelMid !== undefined);
      // The bottom half avoids the first label of the top half.
      const firstOpposite = yHalf ? oppositeQuad.find((p) => p.yLabelMid !== undefined) : undefined;
      for (let i = 0; i < outside.length; i++) {
        const prev = i ? outside[i - 1] : firstOpposite;
        scootOne(outside[i]!, prev);
      }
    }
  }
}

/**
 * Keep outside labels inside the figure and apart from each other (Holochart addition, after
 * {@link scootLabels}): labels are shifted horizontally into `[0, width]`, then vertically — top
 * to bottom so none crosses the top edge or overlaps a label above it, then bottom to top for the
 * bottom edge. Labels that overlap horizontally end up separated vertically.
 */
export function fitOutsideLabels(
  points: readonly LabelPoint[],
  size: { readonly width: number; readonly height: number },
): void {
  const labels = points.filter((p) => p.yLabelMid !== undefined);
  for (const p of labels) {
    const x0 = p.xLabelMin! + p.labelExtraX;
    const x1 = p.xLabelMax! + p.labelExtraX;
    if (x1 - x0 >= size.width) p.labelExtraX += size.width / 2 - (x0 + x1) / 2;
    else if (x0 < 0) p.labelExtraX -= x0;
    else if (x1 > size.width) p.labelExtraX -= x1 - size.width;
  }
  const top = (p: LabelPoint): number => p.yLabelMin! + p.labelExtraY;
  const bottom = (p: LabelPoint): number => p.yLabelMax! + p.labelExtraY;
  const overlapX = (a: LabelPoint, b: LabelPoint): boolean =>
    a.xLabelMin! + a.labelExtraX < b.xLabelMax! + b.labelExtraX &&
    b.xLabelMin! + b.labelExtraX < a.xLabelMax! + a.labelExtraX;
  const sorted = [...labels].sort(
    (a, b) => a.yLabelMid! + a.labelExtraY - (b.yLabelMid! + b.labelExtraY),
  );
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    let minTop = 0;
    for (let j = 0; j < i; j++) {
      const q = sorted[j]!;
      if (overlapX(p, q)) minTop = Math.max(minTop, bottom(q));
    }
    if (top(p) < minTop) p.labelExtraY += minTop - top(p);
  }
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    let maxBottom = size.height;
    for (let j = i + 1; j < sorted.length; j++) {
      const q = sorted[j]!;
      if (overlapX(p, q)) maxBottom = Math.min(maxBottom, top(q));
    }
    if (bottom(p) > maxBottom) p.labelExtraY -= bottom(p) - maxBottom;
  }
}

/**
 * The leader line from a slice's outer edge to its moved label (Plotly's `plotTextLines`), as
 * container px points; `null` when the label did not move.
 */
export function leaderLine(p: LabelPoint): [number, number][] | null {
  if (!p.labelExtraX && !p.labelExtraY) return null;
  const sx = p.cxFinal + p.pxmid[0];
  const sy = p.cyFinal + p.pxmid[1];
  const finalX = ((p.yLabelMax! - p.yLabelMin!) * (p.pxmid[0] < 0 ? -1 : 1)) / 4;
  const pts: [number, number][] = [[sx, sy]];
  if (p.labelExtraX) {
    const yFromX = (p.labelExtraX * p.pxmid[1]) / p.pxmid[0];
    const yNet = p.yLabelMid! + p.labelExtraY - sy;
    if (Math.abs(yFromX) > Math.abs(yNet)) {
      const x1 = sx + (yNet * p.pxmid[0]) / p.pxmid[1];
      pts.push([x1, sy + yNet], [sx + p.labelExtraX + finalX, sy + yNet]);
    } else {
      const x1 = sx + p.labelExtraX;
      pts.push([x1, sy + yFromX], [x1, sy + yNet], [x1 + finalX, sy + yNet]);
    }
  } else {
    const y = p.yLabelMid! + p.labelExtraY;
    pts.push([sx, y], [sx + finalX, y]);
  }
  // Stop at the label's near edge (labels are centered on their anchor, unlike Plotly's
  // start/end-anchored text), so the line never runs through the text.
  if (p.xLabelMin !== undefined && p.xLabelMax !== undefined) {
    const left = p.pxmid[0] < 0;
    const edge = left ? p.xLabelMax + p.labelExtraX + 2 : p.xLabelMin + p.labelExtraX - 2;
    for (let i = 1; i < pts.length; i++) {
      const q = pts[i]!;
      if (left ? q[0] < edge : q[0] > edge) q[0] = edge;
    }
  }
  return pts;
}

// ---- Whole-trace layout -------------------------------------------------------------------------

/** One placed label, in container px. */
export interface PieLabel {
  /** Plain text (pseudo-HTML simplified). */
  readonly text: string;
  /** Anchor point in container px (y down). */
  readonly x: number;
  readonly y: number;
  readonly anchorX: 'left' | 'center' | 'right';
  readonly anchorY: 'top' | 'middle' | 'bottom';
  /** Degrees clockwise. */
  readonly angle: number;
  /** Font with the fitted size. */
  readonly font: TextFont;
  readonly color: RGBA;
  /** Index in `calc.slices`, or -1 for the title. */
  readonly slice: number;
  readonly outside: boolean;
}

/** One leader line. */
export interface PieLeaderLine {
  readonly points: readonly (readonly [number, number])[];
  readonly color: RGBA;
  readonly width: number;
}

/** Everything the view draws as text. */
export interface PieTextLayout {
  readonly labels: PieLabel[];
  readonly lines: PieLeaderLine[];
}

function orientationOf(trace: FullTrace): InsideOrientation {
  const o = trace['insidetextorientation'];
  return o === 'horizontal' || o === 'radial' || o === 'tangential' ? o : 'auto';
}

function scaledFont(font: TextFont, scale: number): TextFont {
  const s = Number.isFinite(scale) ? Math.min(1, Math.max(0, scale)) : 1;
  // Quantized so tiny layout changes don't re-typeset labels.
  return { ...font, size: Math.max(1, Math.floor(font.size * s * 4) / 4) };
}

/**
 * Place every slice label and the title of a laid-out pie (Plotly's pie `plot` text part), in
 * container px. Hidden slices and slices without text get no label.
 */
export function layoutPieText(
  trace: FullTrace,
  calc: PieCalc,
  fullLayout: FullLayout,
): PieTextLayout {
  const layout = calc.layout;
  const labels: PieLabel[] = [];
  const lines: PieLeaderLine[] = [];
  if (!layout) return { labels, lines };
  const { r } = layout;
  const orientation = orientationOf(trace);
  const quadrants: LabelPoint[][][] = [
    [[], []],
    [[], []],
  ];
  const points: LabelPoint[] = [];
  const pending: {
    point: LabelPoint;
    text: string;
    box: TextBox;
    font: LabelFont;
    t: SliceTextTransform;
    slice: PieSlice;
  }[] = [];

  calc.slices.forEach((slice, index) => {
    if (slice.hidden || !Number.isFinite(slice.midAngle)) return;
    const [cxFinal, cyFinal] = sliceCenter(slice, layout);
    const lo = Math.min(slice.startAngle, slice.stopAngle);
    const hi = Math.max(slice.startAngle, slice.stopAngle);
    const rel = (a: number): [number, number] => [r * Math.sin(a), -r * Math.cos(a)];
    const point: LabelPoint = {
      index,
      pts: slice.pts,
      pull: slice.pull,
      pxmid: rel(slice.midAngle),
      px0: rel(lo),
      px1: rel(hi),
      cxFinal,
      cyFinal,
      labelExtraX: 0,
      labelExtraY: 0,
    };
    quadrants[point.pxmid[1] < 0 ? 0 : 1]![point.pxmid[0] < 0 ? 0 : 1]!.push(point);
    points.push(point);

    const position = slicePosition(trace, slice);
    if (position === 'none') return;
    const text = plainText(sliceText(trace, calc, slice));
    if (!text) return;
    let font =
      position === 'outside'
        ? outsideFont(trace, slice, fullLayout)
        : insideFont(trace, slice, fullLayout);
    let box = textBox(text, font.font);
    let t: SliceTextTransform;
    if (position === 'outside') t = transformOutsideText(box, point.pxmid);
    else {
      t = transformInsideText(box, { ...slice, ring: calc.ring }, r, orientation);
      if (position === 'auto' && t.scale < 1) {
        font = outsideFont(trace, slice, fullLayout);
        box = textBox(text, font.font);
        t = transformOutsideText(box, point.pxmid);
      }
    }
    const xy =
      t.textPosAngle === undefined
        ? point.pxmid
        : ([r * Math.sin(t.textPosAngle), -r * Math.cos(t.textPosAngle)] as const);
    const targetX = cxFinal + xy[0] * t.rCenter + (t.x ?? 0);
    const targetY = cyFinal + xy[1] * t.rCenter + (t.y ?? 0);
    if (t.outside) {
      point.yLabelMin = targetY - box.height / 2;
      point.yLabelMid = targetY;
      point.yLabelMax = targetY + box.height / 2;
      point.xLabelMin = targetX - box.width / 2;
      point.xLabelMax = targetX + box.width / 2;
    }
    pending.push({ point, text, box, font, t: { ...t, x: targetX, y: targetY }, slice });
  });

  if (pending.some((p) => p.t.outside)) {
    scootLabels(quadrants, trace['pull']);
    fitOutsideLabels(points, layout);
  }

  for (const { point, text, font, t, slice } of pending) {
    if (!(t.scale > 0)) continue;
    labels.push({
      text,
      x: t.x! + (t.outside ? point.labelExtraX : 0),
      y: t.y! + (t.outside ? point.labelExtraY : 0),
      anchorX: 'center',
      anchorY: 'middle',
      angle: t.rotate,
      font: scaledFont(font.font, t.scale),
      color: font.color,
      slice: point.index,
      outside: t.outside === true,
    });
    if (!t.outside) continue;
    const line = leaderLine(point);
    if (!line) continue;
    const lineFont = outsideFont(trace, slice, fullLayout);
    lines.push({ points: line, color: lineFont.color, width: Math.min(2, lineFont.font.size / 8) });
  }

  const title = titleLabel(trace, calc, layout);
  if (title) labels.push(title);
  return { labels, lines };
}

/**
 * The title label (Plotly's `positionTitleInside` / `positionTitleOutside`): centered in the hole
 * for `middle center`, else above or below the pie (clear of the largest pull), aligned with its
 * left edge, center or right edge; shrunk to fit the hole, or the domain width and title space.
 */
export function titleLabel(trace: FullTrace, calc: PieCalc, layout: PieLayout): PieLabel | null {
  const title = container(trace, 'title');
  const text = typeof title?.['text'] === 'string' ? title['text'] : '';
  if (!text) return null;
  const position = typeof title?.['position'] === 'string' ? title['position'] : 'top center';
  const { font, color } = titleFont(trace);
  const plain = plainText(text);
  const box = calc.titleBox ?? textBox(plain, font);
  if (!(box.width > 0 && box.height > 0)) return null;
  const { cx, cy, r } = layout;
  const hole = 1 - calc.ring;
  if (position === 'middle center') {
    const scale = (hole * r * 2) / Math.hypot(box.width, box.height);
    if (!(scale > 0)) return null;
    return {
      text: plain,
      x: cx,
      y: cy,
      anchorX: 'center',
      anchorY: 'middle',
      angle: 0,
      font: scaledFont(font, scale),
      color,
      slice: -1,
      outside: false,
    };
  }
  const reach = (1 + calc.maxPull) * r;
  let x = cx;
  let y = cy;
  let anchorY: PieLabel['anchorY'] = 'middle';
  if (position.includes('top')) {
    y -= reach;
    anchorY = 'bottom';
  } else if (position.includes('bottom')) {
    y += reach;
    anchorY = 'top';
  }
  let maxWidth = layout.domain.width / 2;
  let anchorX: PieLabel['anchorX'] = 'center';
  if (position.includes('left')) {
    maxWidth += r;
    x -= reach;
    anchorX = 'left';
  } else if (position.includes('right')) {
    maxWidth += r;
    x += reach;
    anchorX = 'right';
  } else maxWidth *= 2;
  const space = Math.min(box.height, layout.domain.height / 2);
  const scale = Math.min(maxWidth / box.width, space / box.height);
  if (!(scale > 0)) return null;
  return {
    text: plain,
    x,
    y,
    anchorX,
    anchorY,
    angle: 0,
    font: scaledFont(font, scale),
    color,
    slice: -1,
    outside: true,
  };
}

/** Container px of a slice's hover anchor (Plotly: along the bisector, `1 − rInscribed` out). */
export function hoverAnchor(slice: PieSlice, layout: PieLayout): [number, number] {
  const [x, y] = sliceCenter(slice, layout);
  return polar(x, y, layout.r * (1 - slice.rInscribed), slice.midAngle);
}
