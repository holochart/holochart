/**
 * Annotation geometry (plan E5.4), pure given a text measure: reference conversions (data,
 * `domain`, paper, pixel tails), anchors, the rotated text box, the arrow clipped at the box and
 * backed off for `standoff` and its heads, all in container px.
 *
 * Follows plotly.js `annotations/draw.js` and `draw_arrow_head.js`: the arrow runs from the text
 * box edge to the anchor point `x`/`y` (the head); the text sits at the tail (`ax`/`ay`, px from the
 * head or a position in `axref`/`ayref` units); `xshift`/`yshift` move everything.
 */
import type { TextAnchorX, TextAnchorY } from '@mk7s/holochart-render';
import type { RGBA } from '@mk7s/holochart-render';
import {
  ARROWHEADS,
  arrowGeometry,
  inRotatedBox as inBox,
  rotatedBoxCorners as boxCorners,
  rotatedBoxExit as exitDistance,
  rotateScreenPoint as rotate,
  type ArrowGeometry,
  type ArrowOptions,
  type RotatedBox,
  type ScreenPoint2D as Point,
} from '@mk7s/holochart-render';
import { FACET_LABEL_NAME, SUBPLOT_TITLE_NAME, type FullLayout } from '@mk7s/holochart-core';
import type { AxisInfo, MarginPush } from '@mk7s/holochart-runtime';
import type { LabelItem } from '../axes/geometry.ts';
import {
  fadeRuns,
  measureStyled,
  rgba,
  styledText,
  textFont,
  type MeasureLine,
} from '../shared/text.ts';
import type { FullAnnotation } from './schema.ts';

const DEG = Math.PI / 180;

// The pure arrow and rotated-box geometry lives in render (shared with the 3D add-on); re-exported
// here under its original names.
export { ARROWHEADS, arrowGeometry, boxCorners, exitDistance, inBox, rotate };
export type { ArrowGeometry, ArrowOptions, Point, RotatedBox };

/** The axis parts reference conversions need. */
export type AxisRef = Pick<AxisInfo, 'letter' | 'scale' | 'full' | 'start' | 'end' | 'l2c'>;

/** Where annotations are placed: figure size, plot area and the laid-out axes. */
export interface AnnotationEnv {
  size: { width: number; height: number };
  plotArea: { x: number; y: number; width: number; height: number };
  axes: ReadonlyMap<string, AxisRef>;
  measure: MeasureLine;
}

/** A parsed reference: paper, pixel, or an axis in data or domain units. */
export type ParsedRef =
  { kind: 'paper' } | { kind: 'pixel' } | { kind: 'data' | 'domain'; axis: string };

/** Parse `'paper'`, `'pixel'`, `'x2'`, `'y domain'`, … (`'x1'` means `'x'`). */
export function parseRef(ref: string): ParsedRef | undefined {
  if (ref === 'paper') return { kind: 'paper' };
  if (ref === 'pixel') return { kind: 'pixel' };
  const m = /^([xy])(\d*)( domain)?$/.exec(ref.trim());
  if (!m) return undefined;
  const n = m[2] === '1' ? '' : (m[2] as string);
  return { kind: m[3] ? 'domain' : 'data', axis: `${m[1] as string}${n}` };
}

function domainOf(axis: AxisRef): [number, number] {
  const d = axis.full.domain as readonly number[] | undefined;
  return [d?.[0] ?? 0, d?.[1] ?? 1];
}

/** Center of a reference along `letter`, in that reference's units (default `x`/`y`). */
export function refCenter(ref: string, letter: 'x' | 'y', env: AnnotationEnv): unknown {
  const r = parseRef(ref);
  if (r?.kind !== 'data') return 0.5;
  const axis = env.axes.get(r.axis);
  if (!axis || axis.letter !== letter) return undefined;
  const [r0, r1] = axis.scale.range;
  return axis.scale.l2r((r0 + r1) / 2);
}

/**
 * A position in `ref` units → container px along `letter` (x: from the left, y: from the top).
 * `undefined` for pixel refs, unknown axes and non-finite values.
 */
export function refToPx(
  ref: string,
  value: unknown,
  letter: 'x' | 'y',
  env: AnnotationEnv,
): number | undefined {
  const r = parseRef(ref);
  if (!r || r.kind === 'pixel') return undefined;
  const area = env.plotArea;
  const frac = (f: number): number =>
    letter === 'x' ? area.x + f * area.width : area.y + (1 - f) * area.height;
  if (r.kind === 'paper') {
    const v = Number(value);
    return Number.isFinite(v) ? frac(v) : undefined;
  }
  const axis = env.axes.get(r.axis);
  if (!axis || axis.letter !== letter) return undefined;
  if (r.kind === 'domain') {
    const v = Number(value);
    const [d0, d1] = domainOf(axis);
    return Number.isFinite(v) ? frac(d0 + v * (d1 - d0)) : undefined;
  }
  const l = axis.scale.r2l(value);
  const p = Number.isFinite(l) ? axis.l2c(l) : NaN;
  return Number.isFinite(p) ? p : undefined;
}

/** Container px along `letter` → a position in `ref` units (inverse of {@link refToPx}). */
export function pxToRef(ref: string, px: number, letter: 'x' | 'y', env: AnnotationEnv): unknown {
  const r = parseRef(ref);
  if (!r || r.kind === 'pixel') return undefined;
  const area = env.plotArea;
  const f = letter === 'x' ? (px - area.x) / area.width : 1 - (px - area.y) / area.height;
  if (r.kind === 'paper') return f;
  const axis = env.axes.get(r.axis);
  if (!axis || axis.letter !== letter) return undefined;
  if (r.kind === 'domain') {
    const [d0, d1] = domainOf(axis);
    return d1 !== d0 ? (f - d0) / (d1 - d0) : 0;
  }
  const p = letter === 'x' ? px - axis.start : axis.start - px;
  return axis.scale.l2r(axis.scale.p2l(p));
}

/** Whether `px` lies on the visible span of a data reference (other refs are always shown). */
function onAxis(ref: string, px: number, env: AnnotationEnv): boolean {
  const r = parseRef(ref);
  if (r?.kind !== 'data') return true;
  const axis = env.axes.get(r.axis);
  if (!axis) return false;
  const lo = Math.min(axis.start, axis.end);
  const hi = Math.max(axis.start, axis.end);
  return px >= lo - 1 && px <= hi + 1;
}

/**
 * Resolve `auto` anchors (Plotly): `center`/`middle` with an arrow or a data reference, otherwise
 * by thirds of the paper / domain position.
 */
export function resolveAnchors(
  a: Pick<FullAnnotation, 'xanchor' | 'yanchor' | 'xref' | 'yref' | 'x' | 'y'>,
  arrow: boolean,
): { x: 'left' | 'center' | 'right'; y: 'top' | 'middle' | 'bottom' } {
  const byThirds = (ref: string, v: unknown): number | undefined => {
    if (arrow || parseRef(ref)?.kind === 'data') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  let x: 'left' | 'center' | 'right' = 'center';
  if (a.xanchor !== 'auto') x = a.xanchor;
  else {
    const f = byThirds(a.xref, a.x);
    if (f !== undefined) x = f <= 1 / 3 ? 'left' : f >= 2 / 3 ? 'right' : 'center';
  }
  let y: 'top' | 'middle' | 'bottom' = 'middle';
  if (a.yanchor !== 'auto') y = a.yanchor;
  else {
    const f = byThirds(a.yref, a.y);
    if (f !== undefined) y = f <= 1 / 3 ? 'bottom' : f >= 2 / 3 ? 'top' : 'middle';
  }
  return { x, y };
}

/** Everything one annotation draws, container px. */
export interface AnnotationGeometry {
  /** `_index` of the annotation (its position in `layout.annotations`). */
  index: number;
  /** Arrow head point (the anchor, after shifts). */
  head: Point;
  /** Text anchor / arrow tail (after shifts). */
  tail: Point;
  /** The text box, border and padding included. */
  box: RotatedBox;
  /** Background color and border (colors already multiplied by `opacity`). */
  bgcolor: RGBA;
  bordercolor: RGBA;
  borderwidth: number;
  label: LabelItem | undefined;
  arrow: ArrowGeometry | undefined;
  arrowcolor: RGBA;
  arrowwidth: number;
}

/** Offsets (px) applied while dragging: to the anchor (`head`) or to the tail only. */
export interface DragOffset {
  head?: Point;
  tail?: Point;
}

function faded(c: RGBA, opacity: number): RGBA {
  return [c[0], c[1], c[2], c[3] * opacity];
}

/**
 * The geometry of one annotation, or `undefined` when it is hidden, its references don't resolve,
 * or its data-referenced anchor is outside the visible axis range (Plotly hides those).
 */
export function annotationGeometry(
  a: FullAnnotation,
  env: AnnotationEnv,
  drag?: DragOffset,
): AnnotationGeometry | undefined {
  if (a.visible === false) return undefined;
  const x = a.x ?? refCenter(a.xref, 'x', env);
  const y = a.y ?? refCenter(a.yref, 'y', env);
  let hx = refToPx(a.xref, x, 'x', env);
  let hy = refToPx(a.yref, y, 'y', env);
  if (hx === undefined || hy === undefined) return undefined;
  if (!drag?.head && (!onAxis(a.xref, hx, env) || !onAxis(a.yref, hy, env))) return undefined;
  if (drag?.head) {
    hx += drag.head.x;
    hy += drag.head.y;
  }

  // Tail: px from the head, or its own reference (then it does not follow a dragged head).
  const arrow = a.showarrow === true;
  let tx = hx;
  let ty = hy;
  if (arrow) {
    const pxX = a.axref === 'pixel' ? Number(a.ax ?? -10) : undefined;
    const pxY = a.ayref === 'pixel' ? Number(a.ay ?? -30) : undefined;
    tx =
      pxX !== undefined
        ? hx + (Number.isFinite(pxX) ? pxX : 0)
        : (refToPx(a.axref, a.ax, 'x', env) ?? hx);
    ty =
      pxY !== undefined
        ? hy + (Number.isFinite(pxY) ? pxY : 0)
        : (refToPx(a.ayref, a.ay, 'y', env) ?? hy);
    if (drag?.tail) {
      tx += drag.tail.x;
      ty += drag.tail.y;
    }
  }
  const sx = a.xshift;
  const sy = -a.yshift;
  const head = { x: hx + sx, y: hy + sy };
  const tail = { x: tx + sx, y: ty + sy };

  // Text box.
  const styled = styledText(a.text, textFont(a.font));
  const { text, font } = styled;
  const tb = measureStyled(styled, env.measure);
  const innerW = a.width ?? tb.width;
  const innerH = a.height ?? tb.height;
  const pad = a.borderwidth + a.borderpad;
  const outerW = Math.round(innerW + 2 * pad);
  const outerH = Math.round(innerH + 2 * pad);
  const angle = a.textangle;
  const c = Math.abs(Math.cos(angle * DEG));
  const s = Math.abs(Math.sin(angle * DEG));
  const bw = c * outerW + s * outerH;
  const bh = s * outerW + c * outerH;
  const anchors = resolveAnchors(a, arrow && (tail.x !== head.x || tail.y !== head.y));
  const cx = tail.x + (anchors.x === 'left' ? bw / 2 : anchors.x === 'right' ? -bw / 2 : 0);
  const cy = tail.y + (anchors.y === 'top' ? bh / 2 : anchors.y === 'bottom' ? -bh / 2 : 0);
  const box: RotatedBox = { cx, cy, hw: outerW / 2, hh: outerH / 2, angle };

  const opacity = a.opacity;
  let label: LabelItem | undefined;
  if (text !== '') {
    // Text block inside the box, per align / valign (box-local, then rotated with the box).
    const lx =
      a.align === 'left'
        ? -(innerW - tb.width) / 2
        : a.align === 'right'
          ? (innerW - tb.width) / 2
          : 0;
    const ly =
      a.valign === 'top'
        ? -(innerH - tb.height) / 2
        : a.valign === 'bottom'
          ? (innerH - tb.height) / 2
          : 0;
    const off = rotate(lx, ly, angle);
    label = {
      text,
      x: cx + off.x,
      y: cy + off.y,
      anchorX: 'center' as TextAnchorX,
      anchorY: 'middle' as TextAnchorY,
      angle,
      font,
      color: faded(rgba(a.font.color, [0, 0, 0, 1]), opacity),
      align: a.align,
      ...(styled.runs ? { runs: fadeRuns(styled.runs, opacity) } : {}),
    };
  }
  const arrowGeo = arrow
    ? arrowGeometry(tail, head, box, {
        arrowside: a.arrowside,
        arrowhead: a.arrowhead,
        startarrowhead: a.startarrowhead,
        arrowsize: a.arrowsize,
        startarrowsize: a.startarrowsize,
        arrowwidth: a.arrowwidth,
        standoff: a.standoff,
        startstandoff: a.startstandoff,
      })
    : undefined;
  return {
    index: a._index,
    head,
    tail,
    box,
    bgcolor: faded(rgba(a.bgcolor), opacity),
    bordercolor: faded(rgba(a.bordercolor), opacity),
    borderwidth: a.borderwidth,
    label,
    arrow: arrowGeo,
    arrowcolor: faded(rgba(a.arrowcolor, [0.27, 0.27, 0.27, 1]), opacity),
    arrowwidth: a.arrowwidth,
  };
}

/** What a container point hits: the text box, the arrow head (drag handle), or nothing. */
export function hitAnnotation(
  g: AnnotationGeometry,
  x: number,
  y: number,
): 'box' | 'head' | undefined {
  if (g.arrow && Math.hypot(x - g.head.x, y - g.head.y) <= Math.max(6, g.arrowwidth * 3)) {
    return 'head';
  }
  return inBox(g.box, x, y, 1) ? 'box' : undefined;
}

/**
 * Top-margin push of the subplot titles `makeSubplots` adds (named `SUBPLOT_TITLE_NAME`) and of
 * Express's facet labels (`FACET_LABEL_NAME`): those on the top row sit above the plot area, in
 * the top margin, and need their box height there.
 * A Holochart extension: Plotly annotations never push margins (plotly.py relies on its 100 px
 * top margin), but the default look's thin top band would clip them. Like a top legend, the push
 * stacks under a reserved (container-referenced, `automargin`) figure title.
 */
export function subplotTitlePush(
  fullLayout: FullLayout,
  measure: MeasureLine,
): MarginPush | undefined {
  const list = fullLayout['annotations'];
  if (!Array.isArray(list)) return undefined;
  let t = 0;
  for (const a of list as FullAnnotation[]) {
    const name = (a as { name?: unknown }).name;
    if ((name !== SUBPLOT_TITLE_NAME && name !== FACET_LABEL_NAME) || a.visible === false) continue;
    // makeSubplots puts them at the top of their cell: only the top row (y = 1) is in the margin.
    if (a.yref !== 'paper' || typeof a.y !== 'number' || Math.abs(a.y - 1) > 1e-9) continue;
    // Only boxes that rise from their anchor (bottom-anchored, unrotated) take room above it.
    if (a.yanchor !== 'bottom' || a.textangle !== 0 || a.showarrow) continue;
    const box = measureStyled(styledText(a.text, textFont(a.font)), measure);
    const pad = a.borderwidth + a.borderpad;
    const above = Math.round((a.height ?? box.height) + 2 * pad) + a.yshift;
    if (box.height > 0 && above > t) t = above;
  }
  return t > 0 ? { t: Math.ceil(t) } : undefined;
}
