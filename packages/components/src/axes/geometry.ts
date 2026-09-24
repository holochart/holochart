/**
 * Axis geometry (plan E3.4): where the axis line, tick marks, tick labels, dividers, title, grid
 * and zero line of one cartesian axis go, in container px (top-left origin). Pure: the only impure
 * input, text measurement, is injected, so every decision here is unit-testable.
 *
 * ## Frame
 *
 * An axis is drawn against one edge of the plot area (its `anchor` axis' domain edge, or a paper
 * `position` for `anchor: 'free'`), pushed outward by `margin.pad`. `sgn` is the outward
 * direction across the axis in container px: +1 for bottom x axes and right y axes, −1 for top x
 * and left y axes. Everything "outside" (line, outside ticks, labels, title) stacks outward from
 * the edge; inside ticks and labels go the other way. The automargin need of an axis is how far
 * its outermost element reaches past the edge.
 *
 * Lines and ticks are axis-aligned rects: the rect primitive snaps their edges to device pixels,
 * so 1 px lines stay crisp at any DPR (E2.7). Dashed grid lines use the line primitive instead
 * (dash patterns), with centers snapped by the view.
 */
import {
  computeTicks,
  createScale,
  layoutTickLabels,
  multicategoryLevels,
  type AxisType,
  type FullAxis,
  type Scale,
  type Tick,
} from '@mk7s/holochart-core';
import type {
  RGBA,
  TextAnchorX,
  TextAnchorY,
  TextFont,
  TextRunLines,
} from '@mk7s/holochart-render';
import {
  LINE_HEIGHT,
  measureStyled,
  rgba,
  styledText,
  textFont,
  type FullFont,
  type MeasureLine,
} from '../shared/text.ts';

/** The parts of the runtime's `AxisInfo` the geometry needs (tests pass plain objects). */
export interface AxisLike {
  readonly id: string;
  readonly letter: 'x' | 'y';
  readonly type: AxisType;
  readonly full: FullAxis;
  readonly scale: Scale;
  /** Container px of `range[0]` and `range[1]` along the axis. */
  readonly start: number;
  readonly end: number;
  l2c(l: number): number;
}

/** An axis-aligned rect in container px. */
export interface RectItem {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: RGBA;
}

/** A dashed line segment in container px (center line). */
export interface DashItem {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: RGBA;
  width: number;
  dash: string;
}

/** A text label in container px. */
export interface LabelItem {
  text: string;
  x: number;
  y: number;
  anchorX: TextAnchorX;
  anchorY: TextAnchorY;
  /** Degrees, clockwise on screen (Plotly `tickangle`). */
  angle: number;
  font: TextFont;
  color: RGBA;
  /** Alignment of the lines of a multi-line label (default: follows `anchorX`). */
  align?: 'left' | 'center' | 'right';
  /** Rich text runs (E2.10; see `styledText`); `text` is then the plain equivalent. */
  runs?: TextRunLines;
}

/** Where an axis (or a mirror of it) is drawn. */
export interface AxisFrame {
  /** Cross-axis container px of the edge the axis is drawn on (already pushed out by `pad`). */
  cross: number;
  /** Outward direction across the axis in container px. */
  sgn: 1 | -1;
}

/** A mirrored axis line (and ticks with `mirror: 'ticks' | 'allticks'`). */
export interface MirrorFrame extends AxisFrame {
  ticks: boolean;
}

/** Everything drawn for one axis except its grid (see {@link gridGeometry}). */
export interface AxisGeometry {
  /** Axis lines, tick marks and dividers. */
  rects: RectItem[];
  /** Tick labels (row 1 and multicategory row 2) and the title. */
  labels: LabelItem[];
  /** How far past `frame.cross` (outward) the outermost element reaches, in px (≥ 0). */
  extent: number;
  /** The tick-label angle in use (after `tickangle: 'auto'`). */
  angle: number;
}

/** Gap between tick marks (or the axis line) and tick labels, px. */
export const LABEL_GAP = 3;
/** Gap between the two label rows of a multicategory axis, px. */
export const ROW_GAP = 4;
/** Default distance between tick labels and the axis title when `title.standoff` is unset, px. */
export const TITLE_STANDOFF = 10;

const DEG = Math.PI / 180;

/** Bounds of a label box relative to its anchor (screen px, +y down), after rotation. */
export interface LabelBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Bounds of a `w × h` text box anchored at the origin by `anchorX`/`anchorY`, rotated clockwise
 * by `angle` degrees about the anchor (the text primitive's convention).
 */
export function labelBounds(
  w: number,
  h: number,
  anchorX: TextAnchorX,
  anchorY: TextAnchorY,
  angle: number,
): LabelBounds {
  const x0 = anchorX === 'left' ? 0 : anchorX === 'center' ? -w / 2 : -w;
  const y0 = anchorY === 'top' ? 0 : anchorY === 'middle' ? -h / 2 : -h;
  const c = Math.cos(angle * DEG);
  const s = Math.sin(angle * DEG);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of [
    [x0, y0],
    [x0 + w, y0],
    [x0, y0 + h],
    [x0 + w, y0 + h],
  ] as const) {
    // Clockwise on screen with +y down.
    const rx = x * c - y * s;
    const ry = x * s + y * c;
    minX = Math.min(minX, rx);
    maxX = Math.max(maxX, rx);
    minY = Math.min(minY, ry);
    maxY = Math.max(maxY, ry);
  }
  return { minX, maxX, minY, maxY };
}

/** Normalize an angle to (−180, 180]. */
function normAngle(a: number): number {
  let r = a % 360;
  if (r <= -180) r += 360;
  if (r > 180) r -= 360;
  return r;
}

/**
 * Anchors of a tick label so its box starts at the label line (`cross`, outward `sgn`), like
 * Plotly: unrotated x labels hang centered under the tick; rotated x labels start (or end) at the
 * tick; y labels are right/left aligned; other rotations are centered on the tick. Returns the
 * anchors and the extra outward shift that keeps the rotated box off the label line.
 */
export function tickLabelAnchor(
  letter: 'x' | 'y',
  sgn: 1 | -1,
  angle: number,
  w: number,
  h: number,
): { anchorX: TextAnchorX; anchorY: TextAnchorY; shift: number } {
  const a = normAngle(angle);
  if (letter === 'x') {
    if (a === 0 || a === 180) {
      return { anchorX: 'center', anchorY: sgn > 0 ? 'top' : 'bottom', shift: 0 };
    }
    // Clockwise text hangs down-right from its start: start at the tick below the axis, end at
    // the tick above it.
    const startAtTick = a > 0 === sgn > 0;
    const shift = (h / 2) * Math.abs(Math.cos(a * DEG));
    return { anchorX: startAtTick ? 'left' : 'right', anchorY: 'middle', shift };
  }
  if (a === 0 || a === 180) {
    return { anchorX: sgn > 0 ? 'left' : 'right', anchorY: 'middle', shift: 0 };
  }
  // Rotated y labels: centered, pushed out by half their rotated width.
  const b = labelBounds(w, h, 'center', 'middle', a);
  return { anchorX: 'center', anchorY: 'middle', shift: (b.maxX - b.minX) / 2 };
}

/**
 * The ticks of an axis (core `computeTicks`). Works around the runtime building multicategory
 * scales from joined `'group/item'` category strings (no `multicategories`): the group is then
 * split off the label so the second label row and dividers still work.
 */
export function axisTicks(axis: Pick<AxisLike, 'type' | 'scale' | 'full'>): Tick[] {
  const ticks = computeTicks(axis.scale, axis.full);
  // A scale built from plain categories has one empty group per category.
  const grouped = axis.scale.multicategories.some(([g]) => g !== '');
  if (axis.type !== 'multicategory' || grouped) return ticks;
  for (const t of ticks) {
    if (t.minor === true || (t.text2 !== undefined && t.text2 !== '')) continue;
    const cut = t.text.indexOf('/');
    if (cut < 0) continue;
    t.text2 = t.text.slice(0, cut);
    t.text = t.text.slice(cut + 1);
  }
  return ticks;
}

/**
 * A copy of `scale` with its own range and length, so ticks can be computed for a hypothetical
 * layout (automargin) without touching the runtime's scale.
 */
export function cloneScale(scale: Scale, length: number): Scale {
  const copy = createScale({
    type: scale.type,
    range: scale.range,
    length,
    ...(scale.categories.length > 0 ? { categories: scale.categories } : {}),
    ...(scale.multicategories.length > 0 ? { multicategories: scale.multicategories } : {}),
  });
  return copy;
}

function inRange(axis: AxisLike, p: number): boolean {
  const lo = Math.min(axis.start, axis.end);
  const hi = Math.max(axis.start, axis.end);
  return p >= lo - 0.5 && p <= hi + 0.5;
}

/** Options for {@link axisGeometry}. */
export interface AxisGeometryOptions {
  measure: MeasureLine;
  /** Figure size (for `ticklabeloverflow: 'hide past div'`). */
  width: number;
  height: number;
  /** Mirrors of the axis line (`mirror`). */
  mirrors?: readonly MirrorFrame[];
  /** Extend the main axis line past both ends by this many px (to join the counter axis line). */
  lineOverhang?: number;
}

interface PlacedLabel {
  item: LabelItem;
  bounds: LabelBounds;
}

function place(
  item: LabelItem,
  w: number,
  h: number,
  out: PlacedLabel[],
  labels: LabelItem[],
): PlacedLabel {
  const placed = { item, bounds: labelBounds(w, h, item.anchorX, item.anchorY, item.angle) };
  out.push(placed);
  labels.push(item);
  return placed;
}

/** Outward reach of a placed label past `cross`, px. */
function reach(p: PlacedLabel, letter: 'x' | 'y', cross: number, sgn: 1 | -1): number {
  const { item, bounds } = p;
  if (letter === 'x')
    return sgn * ((sgn > 0 ? item.y + bounds.maxY : item.y + bounds.minY) - cross);
  return sgn * ((sgn > 0 ? item.x + bounds.maxX : item.x + bounds.minX) - cross);
}

/** Along-axis span of a placed label, container px. */
function alongSpan(p: PlacedLabel, letter: 'x' | 'y'): [number, number] {
  const { item, bounds } = p;
  return letter === 'x'
    ? [item.x + bounds.minX, item.x + bounds.maxX]
    : [item.y + bounds.minY, item.y + bounds.maxY];
}

/**
 * Lines, ticks, labels and title of one axis (everything but the grid), plus the outward extent
 * automargin needs. `ticks` are the axis' ticks (see {@link axisTicks}).
 */
export function axisGeometry(
  axis: AxisLike,
  frame: AxisFrame,
  ticks: readonly Tick[],
  options: AxisGeometryOptions,
): AxisGeometry {
  const f = axis.full;
  const letter = axis.letter;
  const { cross, sgn } = frame;
  const rects: RectItem[] = [];
  const labels: LabelItem[] = [];
  const placed: PlacedLabel[] = [];
  let extent = 0;
  const bump = (d: number): void => {
    if (d > extent) extent = d;
  };

  // along = position along the axis, c0/c1 = cross-axis span.
  const rect = (a0: number, a1: number, c0: number, c1: number, color: RGBA): void => {
    const lo = Math.min(a0, a1);
    const hi = Math.max(a0, a1);
    const clo = Math.min(c0, c1);
    const chi = Math.max(c0, c1);
    rects.push(
      letter === 'x'
        ? { x0: lo, x1: hi, y0: clo, y1: chi, color }
        : { x0: clo, x1: chi, y0: lo, y1: hi, color },
    );
  };

  const lo = Math.min(axis.start, axis.end);
  const hi = Math.max(axis.start, axis.end);
  const lw = f.showline ? f.linewidth : 0;
  const lineColor = rgba(f.linecolor);
  const overhang = options.lineOverhang ?? 0;
  if (lw > 0) {
    rect(lo - overhang, hi + overhang, cross, cross + sgn * lw, lineColor);
    bump(lw);
  }
  const mirrors = options.mirrors ?? [];
  for (const m of mirrors) {
    if (lw > 0) rect(lo - overhang, hi + overhang, m.cross, m.cross + m.sgn * lw, lineColor);
  }

  // Tick marks.
  const major = ticks.filter((t) => t.minor !== true);
  const minor = ticks.filter((t) => t.minor === true);
  const tickColor = rgba(f.tickcolor);
  const marks = (
    list: readonly Tick[],
    placement: '' | 'inside' | 'outside',
    len: number,
    width: number,
    color: RGBA,
    fr: AxisFrame,
    lineW: number,
  ): void => {
    if (placement === '' || len <= 0 || width <= 0) return;
    for (const t of list) {
      if (t.noTick === true) continue;
      const p = axis.l2c(t.l);
      if (!Number.isFinite(p) || !inRange(axis, p)) continue;
      const c0 = placement === 'outside' ? fr.cross + fr.sgn * lineW : fr.cross;
      const c1 = placement === 'outside' ? c0 + fr.sgn * len : c0 - fr.sgn * len;
      rect(p - width / 2, p + width / 2, c0, c1, color);
    }
  };
  const ticksPlacement = f.ticks as '' | 'inside' | 'outside';
  const minorPlacement = f.minor.ticks as '' | 'inside' | 'outside';
  const minorLen = f.minor.ticklen ?? f.ticklen * 0.6;
  const minorWidth = f.minor.tickwidth ?? f.tickwidth;
  const minorColor = rgba(f.minor.tickcolor ?? f.tickcolor);
  marks(major, ticksPlacement, f.ticklen, f.tickwidth, tickColor, frame, lw);
  marks(minor, minorPlacement, minorLen, minorWidth, minorColor, frame, lw);
  const mirrorTicks = mirrors.filter((m) => m.ticks);
  for (const m of mirrorTicks) {
    marks(major, ticksPlacement, f.ticklen, f.tickwidth, tickColor, m, lw);
    marks(minor, minorPlacement, minorLen, minorWidth, minorColor, m, lw);
  }
  const outsideTicks = Math.max(
    ticksPlacement === 'outside' ? f.ticklen : 0,
    minorPlacement === 'outside' ? minorLen : 0,
  );
  bump(lw + outsideTicks);

  // Tick labels.
  let angle = 0;
  const tickfont = f.tickfont as FullFont;
  const position = String(f.ticklabelposition);
  const inside = position.startsWith('inside');
  const labelSgn = (inside ? -sgn : sgn) as 1 | -1;
  let labelOuter = cross + sgn * (lw + outsideTicks);
  if (f.showticklabels) {
    const shown = major.filter((t) => t.text !== '');
    const baseFont = textFont(tickfont);
    const texts = shown.map((t) => styledText(t.text, baseFont).text);
    const positions = shown.map((t) => axis.l2c(t.labelL ?? t.l) + f.ticklabelshift);
    const lineMeasure = (line: string): number => options.measure(line, baseFont);
    const tickangle = f.tickangle as number | 'auto';
    const lay = layoutTickLabels({
      positions,
      texts: texts.map((t) => t.replace(/\n/g, '<br>')),
      measure: lineMeasure,
      fontSize: tickfont.size,
      axisLetter: letter,
      tickangle,
      autotickangles: f.autotickangles as number[],
    });
    angle = lay.angle;
    const startCross = inside
      ? cross - sgn * ((ticksPlacement === 'inside' ? f.ticklen : 0) + LABEL_GAP)
      : cross + sgn * (lw + outsideTicks + LABEL_GAP);
    const base = startCross + labelSgn * f.ticklabelstandoff;
    const color = rgba(tickfont.color);
    const limits: [number, number] =
      f.ticklabeloverflow === 'allow'
        ? [-Infinity, Infinity]
        : f.ticklabeloverflow === 'hide past domain'
          ? [lo - 0.5, hi + 0.5]
          : [-0.5, (letter === 'x' ? options.width : options.height) + 0.5];
    let row1Reach = 0;
    shown.forEach((t, i) => {
      if (lay.visible[i] !== true) return;
      const p = positions[i] as number;
      if (!Number.isFinite(p) || !inRange(axis, axis.l2c(t.labelL ?? t.l))) return;
      const styled = styledText(t.text, textFont(tickfont, t.fontScale ?? 1));
      const { text, font } = styled;
      const box = measureStyled(styled, options.measure);
      const anchor = tickLabelAnchor(letter, labelSgn, angle, box.width, box.height);
      let { anchorX, anchorY } = anchor;
      // `ticklabelposition: '… left' | '… right' | '… top' | '… bottom'` moves labels beside the
      // tick instead of centering them on it (unrotated labels only).
      if (angle === 0) {
        if (letter === 'x' && position.endsWith('left')) anchorX = 'right';
        else if (letter === 'x' && position.endsWith('right')) anchorX = 'left';
        else if (letter === 'y' && position.endsWith('top')) anchorY = 'bottom';
        else if (letter === 'y' && position.endsWith('bottom')) anchorY = 'top';
      }
      const c = base + labelSgn * anchor.shift;
      const item: LabelItem = {
        text,
        x: letter === 'x' ? p : c,
        y: letter === 'x' ? c : p,
        anchorX,
        anchorY,
        angle,
        font,
        color,
        ...(styled.runs ? { runs: styled.runs } : {}),
      };
      const bounds = labelBounds(box.width, box.height, anchorX, anchorY, angle);
      const candidate = { item, bounds };
      const [s0, s1] = alongSpan(candidate, letter);
      if (s0 < limits[0] || s1 > limits[1]) return;
      place(item, box.width, box.height, placed, labels);
      row1Reach = Math.max(row1Reach, reach(candidate, letter, base, labelSgn));
    });

    // Multicategory: group labels on a second row, dividers between groups.
    let rowsEnd = base + labelSgn * row1Reach;
    if (axis.type === 'multicategory') {
      const levels = multicategoryLevels(axis.scale, ticks);
      const row2 = rowsEnd + labelSgn * ROW_GAP;
      let row2Reach = 0;
      for (const g of levels.groups) {
        const p = axis.l2c(g.l);
        if (g.text === '' || !inRange(axis, p)) continue;
        const styled = styledText(g.text, textFont(tickfont));
        const { text, font } = styled;
        const box = measureStyled(styled, options.measure);
        const anchor = tickLabelAnchor(letter, labelSgn, 0, box.width, box.height);
        const item: LabelItem = {
          text,
          x: letter === 'x' ? p : row2,
          y: letter === 'x' ? row2 : p,
          anchorX: anchor.anchorX,
          anchorY: anchor.anchorY,
          angle: 0,
          font,
          color,
          ...(styled.runs ? { runs: styled.runs } : {}),
        };
        const pl = place(item, box.width, box.height, placed, labels);
        row2Reach = Math.max(row2Reach, reach(pl, letter, row2, labelSgn));
      }
      if (row2Reach > 0) rowsEnd = row2 + labelSgn * row2Reach;
      if (f.showdividers && f.dividerwidth > 0) {
        const dc = rgba(f.dividercolor);
        for (const l of levels.dividers) {
          const p = axis.l2c(l);
          rect(p - f.dividerwidth / 2, p + f.dividerwidth / 2, cross, rowsEnd, dc);
        }
      }
    }
    if (!inside) labelOuter = rowsEnd;
  }
  for (const p of placed) {
    if (!inside) bump(reach(p, letter, cross, sgn));
  }

  // Title.
  const title = f.title as { text?: string; font?: FullFont; standoff?: number };
  const styled = title.font ? styledText(title.text ?? '', textFont(title.font)) : undefined;
  const titleText = styled?.text ?? '';
  if (styled && titleText !== '' && title.font) {
    const font = styled.font;
    const runs = styled.runs ? { runs: styled.runs } : {};
    const box = measureStyled(styled, options.measure);
    const standoff = title.standoff ?? TITLE_STANDOFF;
    const outer = sgn * Math.max(sgn * labelOuter, sgn * (cross + sgn * (lw + outsideTicks)));
    const c = outer + sgn * standoff;
    const mid = (axis.start + axis.end) / 2;
    const item: LabelItem =
      letter === 'x'
        ? {
            text: titleText,
            x: mid,
            y: c,
            anchorX: 'center',
            anchorY: sgn > 0 ? 'top' : 'bottom',
            angle: 0,
            font,
            color: rgba(title.font.color),
            ...runs,
          }
        : {
            text: titleText,
            x: c,
            y: mid,
            anchorX: 'center',
            // Rotated −90° (reads upward): the box' bottom faces +x.
            anchorY: sgn > 0 ? 'top' : 'bottom',
            angle: -90,
            font,
            color: rgba(title.font.color),
            ...runs,
          };
    const pl = place(item, box.width, box.height, placed, labels);
    bump(reach(pl, letter, cross, sgn));
  }
  return { rects, labels, extent: Math.max(0, extent), angle };
}

/** Grid lines, minor grid lines and the zero line of an axis across one subplot. */
export interface GridGeometry {
  /** Solid minor, then major grid lines. */
  rects: RectItem[];
  /** The zero line, if shown (drawn above every grid line of the subplot). */
  zero: RectItem[];
  /** Dashed grid lines (`griddash` other than `solid`). */
  dashed: DashItem[];
}

/**
 * Grid geometry of `axis` across the cross-axis span `[c0, c1]` (container px) of one subplot.
 * `edges` are cross positions along the axis (container px) where an axis line sits: grid lines
 * within 1 px of them are skipped, as is a grid line under the zero line.
 */
export function gridGeometry(
  axis: AxisLike,
  ticks: readonly Tick[],
  c0: number,
  c1: number,
  edges: readonly number[] = [],
): GridGeometry {
  const f = axis.full;
  const rects: RectItem[] = [];
  const zero: RectItem[] = [];
  const dashed: DashItem[] = [];
  const letter = axis.letter;
  const near = (p: number, list: readonly number[]): boolean =>
    list.some((e) => Math.abs(e - p) < 1);

  const [r0, r1] = axis.scale.range;
  const zeroOk =
    f.zeroline &&
    axis.type === 'linear' &&
    Math.min(r0, r1) <= 0 &&
    Math.max(r0, r1) >= 0 &&
    f.zerolinewidth > 0;
  const zeroP = zeroOk ? axis.l2c(0) : NaN;
  const showZero = zeroOk && Number.isFinite(zeroP) && !near(zeroP, edges);

  const add = (
    p: number,
    width: number,
    color: RGBA,
    dash: string,
    out: RectItem[] = rects,
  ): void => {
    if (dash !== '' && dash !== 'solid') {
      dashed.push(
        letter === 'x'
          ? { x0: p, x1: p, y0: c0, y1: c1, color, width, dash }
          : { x0: c0, x1: c1, y0: p, y1: p, color, width, dash },
      );
      return;
    }
    const a0 = p - width / 2;
    const a1 = p + width / 2;
    out.push(
      letter === 'x'
        ? { x0: a0, x1: a1, y0: Math.min(c0, c1), y1: Math.max(c0, c1), color }
        : { x0: Math.min(c0, c1), x1: Math.max(c0, c1), y0: a0, y1: a1, color },
    );
  };

  const lines = (minor: boolean): void => {
    const show = minor ? f.minor.showgrid : f.showgrid;
    const width = minor ? (f.minor.gridwidth ?? f.gridwidth) : f.gridwidth;
    if (!show || width <= 0) return;
    const color = rgba(minor ? (f.minor.gridcolor ?? f.gridcolor) : f.gridcolor);
    const dash = String(minor ? (f.minor.griddash ?? f.griddash) : f.griddash);
    for (const t of ticks) {
      if ((t.minor === true) !== minor || t.noTick === true) continue;
      const p = axis.l2c(t.l);
      if (!Number.isFinite(p) || !inRange(axis, p) || near(p, edges)) continue;
      if (showZero && Math.abs(p - zeroP) < 1) continue;
      add(p, width, color, dash);
    }
  };
  lines(true);
  lines(false);
  if (showZero) add(zeroP, f.zerolinewidth, rgba(f.zerolinecolor), 'solid', zero);
  return { rects, zero, dashed };
}

/** Line height used for label boxes (matches the text primitive's `lineHeight`). */
export const LABEL_LINE_HEIGHT = LINE_HEIGHT;
