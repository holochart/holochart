/**
 * Shape geometry (plan E5.5), pure: reference conversions, outlines and fills, labels.
 *
 * ## Coordinate classes (why zoom and pan only change transforms)
 *
 * Each dimension of a shape is stored in one of two spaces: the **linear coordinates of a data
 * axis** (a scaled `xref: 'x'` dimension) or **container px** (paper, domain and `pixel`-sized
 * dimensions, which don't move with the axes' ranges). Linear → px is affine per axis, so the view
 * uploads geometry once and maps it with a transform built from the axis' current scale: a zoom or
 * pan re-uploads nothing unless a curve needs finer flattening (scales are quantized to powers of
 * two for that) or the shape has `pixel` dimensions anchored to a data axis.
 *
 * Positions follow plotly.js `shapes/helpers.js`: on log axes shape positions are data values
 * (`d2l`), elsewhere range values (`r2l`: category names or fractional indices, dates or ms).
 */
import type { RGBA } from '@mk7s/holochart-render';
import type { AxisExtremes } from '@mk7s/holochart-core';
import { formatTemplate, linearExtremes, type AxisInfo } from '@mk7s/holochart-runtime';
import { parseRef } from '../annotations/layout.ts';
import type { LabelItem } from '../axes/geometry.ts';
import { axisAffine } from '../shared/layers.ts';
import { rgba, styledText, textFont } from '../shared/text.ts';
import { ellipsePoints, flattenPath, parsePath, type ParsedPath } from './path.ts';
import type { FullShape } from './schema.ts';

const DEG = Math.PI / 180;

/** The axis parts shapes need. */
export type ShapeAxis = Pick<
  AxisInfo,
  'id' | 'letter' | 'type' | 'scale' | 'full' | 'start' | 'end'
>;

/** Where shapes are placed. */
export interface ShapeEnv {
  readonly plotArea: { x: number; y: number; width: number; height: number };
  readonly axes: ReadonlyMap<string, ShapeAxis>;
}

/** How one dimension (x or y) of a shape maps between its reference, its class space and px. */
export interface ShapeDim {
  /** The data axis whose linear coordinates the geometry uses; `undefined`: container px. */
  readonly axis: ShapeAxis | undefined;
  /** The axis of an axis or `domain` reference (its subplot hosts `below` shapes). */
  readonly owner: ShapeAxis | undefined;
  /** The data axis the shape is clipped to (data references only, as in Plotly). */
  readonly clip: ShapeAxis | undefined;
  /** The reference is `paper`. */
  readonly paper: boolean;
  /** `pixel` size mode: values are px offsets from the anchor. */
  readonly pixel: boolean;
  /** Value in reference units (or px offset) → class coordinate (NaN when invalid). */
  toClass(value: unknown): number;
  /** Class coordinate at a fraction of the reference (defaults for missing positions). */
  at(f: number): number;
  /** Class coordinate → container px (x from the left, y from the top). */
  toPx(u: number): number;
  /** Container px → value in reference units (or px offset), for drags. */
  fromPx(px: number): unknown;
  /** |px per class unit| now. */
  readonly scale: number;
}

/** Linear coordinate of a shape position on `axis`. */
function toLinear(axis: ShapeAxis, v: unknown): number {
  if (typeof v === 'string' && axis.type !== 'category' && axis.type !== 'multicategory') {
    v = v.replace('_', ' ');
  }
  return axis.type === 'log' ? axis.scale.d2l(v) : axis.scale.r2l(v);
}

/** Linear coordinate → shape position (inverse of {@link toLinear}). */
function fromLinear(axis: ShapeAxis, l: number): unknown {
  return axis.type === 'log' ? 10 ** l : axis.scale.l2r(l);
}

/**
 * A shape dimension for `ref` along `letter`, or `undefined` when the reference is invalid or its
 * axis doesn't exist.
 */
export function shapeDim(
  ref: string,
  letter: 'x' | 'y',
  pixel: boolean,
  anchor: unknown,
  env: ShapeEnv,
): ShapeDim | undefined {
  const r = parseRef(ref);
  if (!r || r.kind === 'pixel') return undefined;
  const axis = r.kind === 'paper' ? undefined : env.axes.get(r.axis);
  if (r.kind !== 'paper' && (!axis || axis.letter !== letter)) return undefined;
  const area = env.plotArea;
  const [d0, d1] =
    r.kind === 'domain' && axis ? ((axis.full.domain as [number, number]) ?? [0, 1]) : [0, 1];
  // Reference fraction → px (domain fractions go through the axis domain).
  const fracPx = (f: number): number => {
    const g = d0 + f * (d1 - d0);
    return letter === 'x' ? area.x + g * area.width : area.y + (1 - g) * area.height;
  };
  const pxFrac = (px: number): number => {
    const g = letter === 'x' ? (px - area.x) / area.width : 1 - (px - area.y) / area.height;
    return d1 !== d0 ? (g - d0) / (d1 - d0) : 0;
  };
  const data = r.kind === 'data' ? axis : undefined;
  const aff = data ? axisAffine(data) : undefined;
  const refToClass = (v: unknown): number => (data ? toLinear(data, v) : fracPx(Number(v)));
  const refAt = (f: number): number => {
    if (!data) return fracPx(f);
    const [r0, r1] = data.scale.range;
    return r0 + f * (r1 - r0);
  };
  const common = { owner: axis, clip: data, paper: r.kind === 'paper' };
  if (pixel) {
    const sgn = letter === 'x' ? 1 : -1;
    const a = anchor === undefined || anchor === null ? refAt(0.5) : refToClass(anchor);
    const origin = aff ? a * aff.m + aff.b : a;
    return {
      ...common,
      axis: undefined,
      pixel: true,
      toClass: (v) => origin + sgn * Number(v),
      at: (f) => origin + sgn * f * 10,
      toPx: (u) => u,
      fromPx: (px) => sgn * (px - origin),
      scale: 1,
    };
  }
  if (data && aff) {
    return {
      ...common,
      axis: data,
      pixel: false,
      toClass: (v) => toLinear(data, v),
      at: refAt,
      toPx: (u) => u * aff.m + aff.b,
      fromPx: (px) => fromLinear(data, (px - aff.b) / aff.m),
      scale: Math.abs(aff.m),
    };
  }
  return {
    ...common,
    axis: undefined,
    pixel: false,
    toClass: (v) => fracPx(Number(v)),
    at: fracPx,
    toPx: (u) => u,
    fromPx: pxFrac,
    scale: 1,
  };
}

/** Round a px-per-unit scale up to a power of two, so flattening changes only every 2× zoom. */
export function quantizeScale(s: number): number {
  return s > 0 && Number.isFinite(s) ? 2 ** Math.ceil(Math.log2(s)) : 1;
}

/** A ring or polyline in class coordinates. */
export interface Ring {
  x: number[];
  y: number[];
  closed: boolean;
}

/** Everything drawn for one shape. */
export interface ShapeGeometry {
  /** `_index` of the shape. */
  readonly index: number;
  readonly shape: FullShape;
  readonly x: ShapeDim;
  readonly y: ShapeDim;
  /** Outline rings (closed for rect, circle and closed subpaths), class coordinates. */
  readonly rings: Ring[];
  /** Fill the rings (closing open ones). */
  readonly filled: boolean;
  readonly fillRule: 'simple' | 'evenodd' | 'nonzero';
  readonly fillColor: RGBA;
  readonly lineColor: RGBA;
  readonly lineWidth: number;
  readonly dash: string;
  /** Endpoints (line) or box corners (rect, circle) in class coordinates: `[x0, y0, x1, y1]`. */
  readonly ends: readonly [number, number, number, number] | undefined;
  readonly label: LabelItem | undefined;
}

const pathCache = new Map<string, ParsedPath>();

/** Parse a shape path once (paths are re-used across zoom, pan and redraws). */
export function cachedPath(d: string): ParsedPath {
  let p = pathCache.get(d);
  if (!p) {
    if (pathCache.size > 256) pathCache.clear();
    p = parsePath(d);
    pathCache.set(d, p);
  }
  return p;
}

/**
 * One shape's geometry in class coordinates, or `undefined` when it draws nothing (hidden, invalid
 * reference, empty path). `override` replaces positions during a drag preview.
 */
export function shapeGeometry(
  s: FullShape,
  env: ShapeEnv,
  override?: Partial<Pick<FullShape, 'x0' | 'x1' | 'y0' | 'y1' | 'path' | 'xanchor' | 'yanchor'>>,
): ShapeGeometry | undefined {
  if (s.visible !== true) return undefined;
  const src = override ? { ...s, ...override } : s;
  const x = shapeDim(s.xref, 'x', s.xsizemode === 'pixel', src.xanchor, env);
  const y = shapeDim(s.yref, 'y', s.ysizemode === 'pixel', src.yanchor, env);
  if (!x || !y) return undefined;
  const rings: Ring[] = [];
  let ends: [number, number, number, number] | undefined;
  if (s.type === 'path') {
    const d = src.path;
    if (typeof d !== 'string' || d === '') return undefined;
    const flat = flattenPath(cachedPath(d).segments, {
      mapX: (v) => x.toClass(v),
      mapY: (v) => y.toClass(v),
      scaleX: quantizeScale(x.scale),
      scaleY: quantizeScale(y.scale),
    });
    rings.push(...flat);
  } else {
    const pos = (v: unknown, dim: ShapeDim, f: number): number =>
      v === undefined || v === null ? dim.at(f) : dim.toClass(v);
    ends = [pos(src.x0, x, 0.25), pos(src.y0, y, 0.25), pos(src.x1, x, 0.75), pos(src.y1, y, 0.75)];
    if (!ends.every(Number.isFinite)) return undefined;
    const [x0, y0, x1, y1] = ends;
    if (s.type === 'line') rings.push({ x: [x0, x1], y: [y0, y1], closed: false });
    else if (s.type === 'rect')
      rings.push({ x: [x0, x1, x1, x0], y: [y0, y0, y1, y1], closed: true });
    else {
      const e = ellipsePoints(
        (x0 + x1) / 2,
        (y0 + y1) / 2,
        Math.abs(x1 - x0) / 2,
        Math.abs(y1 - y0) / 2,
        quantizeScale(x.scale),
        quantizeScale(y.scale),
      );
      rings.push({ ...e, closed: true });
    }
  }
  if (rings.length === 0) return undefined;
  const alpha = (c: RGBA): RGBA => [c[0], c[1], c[2], c[3] * s.opacity];
  const fillColor = alpha(rgba(s.fillcolor));
  const lineColor = alpha(rgba(s.line.color));
  return {
    index: s._index,
    shape: s,
    x,
    y,
    rings,
    filled: s.type !== 'line' && fillColor[3] > 0,
    fillRule: s.type === 'path' ? s.fillrule : 'simple',
    fillColor,
    lineColor,
    lineWidth: s.line.width,
    dash: s.line.dash,
    ends,
    label: shapeLabel(s, src, x, y, rings, ends),
  };
}

/** Container px bounds `[x0, y0, x1, y1]` (unsorted for lines and boxes) the label is placed on. */
function labelFrame(
  x: ShapeDim,
  y: ShapeDim,
  rings: readonly Ring[],
  ends: readonly number[] | undefined,
): [number, number, number, number] {
  if (ends) return [x.toPx(ends[0]!), y.toPx(ends[1]!), x.toPx(ends[2]!), y.toPx(ends[3]!)];
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings) {
    r.x.forEach((u, i) => {
      const px = x.toPx(u);
      const py = y.toPx(r.y[i]!);
      x0 = Math.min(x0, px);
      x1 = Math.max(x1, px);
      y0 = Math.min(y0, py);
      y1 = Math.max(y1, py);
    });
  }
  return [x0, y0, x1, y1];
}

/** Template variables of a shape label (Plotly's `label_texttemplate.js`), from class ends. */
function templateValues(
  s: FullShape,
  src: Partial<FullShape>,
  x: ShapeDim,
  y: ShapeDim,
  ends: readonly number[],
): Record<string, unknown> {
  const [x0, y0, x1, y1] = ends as [number, number, number, number];
  // Differences in the reference's units: linear for axes (dates in ms), px offsets when pixel-sized.
  const diff = (dim: ShapeDim, a: number, b: number): number =>
    dim.axis ? b - a : Number(dim.fromPx(dim.toPx(b))) - Number(dim.fromPx(dim.toPx(a)));
  const dx = diff(x, x0, x1);
  const dy = diff(y, y0, y1);
  const line = s.type === 'line';
  return {
    x0: src.x0 ?? x.fromPx(x.toPx(x0)),
    x1: src.x1 ?? x.fromPx(x.toPx(x1)),
    y0: src.y0 ?? y.fromPx(y.toPx(y0)),
    y1: src.y1 ?? y.fromPx(y.toPx(y1)),
    xcenter: x.fromPx(x.toPx((x0 + x1) / 2)),
    ycenter: y.fromPx(y.toPx((y0 + y1) / 2)),
    dx,
    dy,
    ...(line
      ? { length: Math.hypot(dx, dy), slope: dy / dx }
      : { width: Math.abs(dx), height: Math.abs(dy) }),
  };
}

function shapeLabel(
  s: FullShape,
  src: Partial<FullShape>,
  x: ShapeDim,
  y: ShapeDim,
  rings: readonly Ring[],
  ends: readonly number[] | undefined,
): LabelItem | undefined {
  const l = s.label;
  const raw =
    l.texttemplate !== '' && ends
      ? formatTemplate(l.texttemplate, { values: templateValues(s, src, x, y, ends) })
      : l.text;
  if (!raw) return undefined;
  const frame = labelFrame(x, y, rings, ends);
  if (!frame.every(Number.isFinite)) return undefined;
  const styled = styledText(raw, textFont(l.font));
  const place = labelPosition(s.type, frame, l);
  return {
    text: styled.text,
    x: place.x,
    y: place.y,
    anchorX: place.anchorX,
    anchorY: l.yanchor,
    angle: place.angle,
    font: styled.font,
    color: rgba(l.font.color, [0, 0, 0, 1]),
  };
}

/**
 * Label anchor point, horizontal anchor and angle (plotly.js `shapes/display_labels.js`,
 * `calcTextPosition`): lines place it at the start, middle or end, padded perpendicular to the line
 * when the angle follows it; other shapes at one of 9 positions of their box, padded inwards.
 */
export function labelPosition(
  type: FullShape['type'],
  frame: readonly [number, number, number, number],
  l: Pick<FullShape['label'], 'textposition' | 'textangle' | 'xanchor' | 'yanchor' | 'padding'>,
): { x: number; y: number; anchorX: 'left' | 'center' | 'right'; angle: number } {
  const [x0, y0, x1, y1] = frame;
  const pos = l.textposition;
  const pad = l.padding;
  let angle = 0;
  if (l.textangle !== 'auto') angle = l.textangle;
  else if (type === 'line') {
    // Along the line, but never upside down.
    angle = Math.atan2(y1 - y0, x1 - x0) / DEG;
    if (angle > 90) angle -= 180;
    else if (angle < -90) angle += 180;
  }
  let x: number;
  let y: number;
  let anchorX = l.xanchor;
  if (type === 'line') {
    const t = pos === 'start' ? 0 : pos === 'end' ? 1 : 0.5;
    x = x0 + t * (x1 - x0);
    y = y0 + t * (y1 - y0);
    if (anchorX === 'auto') {
      const dir = Math.sign(x1 - x0);
      const flip = l.textangle === 'auto' ? 1 : -1;
      const toward = (d: number): 'left' | 'center' | 'right' =>
        d > 0 ? 'left' : d < 0 ? 'right' : 'center';
      anchorX =
        pos === 'start' ? toward(dir * flip) : pos === 'end' ? toward(-dir * flip) : 'center';
    }
    const dy = { bottom: -1, middle: 0, top: 1 }[l.yanchor];
    if (l.textangle === 'auto') {
      const a = angle * DEG;
      x += -pad * Math.sin(a) * dy;
      y += pad * Math.cos(a) * dy;
    } else {
      x += pad * { left: 1, center: 0, right: -1 }[anchorX];
      y += pad * dy;
    }
  } else {
    // Horizontal padding gets 3 px extra to look balanced (Plotly).
    const padX = pad + 3;
    if (pos.endsWith('right')) {
      x = Math.max(x0, x1) - padX;
      if (anchorX === 'auto') anchorX = 'right';
    } else if (pos.endsWith('left')) {
      x = Math.min(x0, x1) + padX;
      if (anchorX === 'auto') anchorX = 'left';
    } else {
      x = (x0 + x1) / 2;
      if (anchorX === 'auto') anchorX = 'center';
    }
    y = pos.startsWith('top')
      ? Math.min(y0, y1)
      : pos.startsWith('bottom')
        ? Math.max(y0, y1)
        : (y0 + y1) / 2;
    if (l.yanchor === 'bottom') y -= pad;
    else if (l.yanchor === 'top') y += pad;
  }
  return { x, y, anchorX, angle };
}

// ---- Autorange (Plotly `shapes/calc_autorange.js`) ---------------------------------------------

/** The coordinates of `letter` in a path, control points included (Plotly's `extractPathCoords`). */
function pathValues(d: string, letter: 'x' | 'y'): PathValueList {
  const out: unknown[] = [];
  for (const seg of cachedPath(d).segments) out.push(...seg[letter]);
  return out;
}
type PathValueList = readonly unknown[];

/** Extremes of one shape dimension on its data axis, or `undefined` (paper/domain/invalid). */
function dimExtremes(
  s: FullShape,
  letter: 'x' | 'y',
  axes: ReadonlyMap<string, ShapeAxis>,
): { axis: ShapeAxis; extremes: AxisExtremes } | undefined {
  const r = parseRef(letter === 'x' ? s.xref : s.yref);
  if (!r || r.kind !== 'data') return undefined;
  const axis = axes.get(r.axis);
  if (!axis || axis.letter !== letter) return undefined;
  const ppad = (s.line?.width ?? 0) / 2;
  const v0 = letter === 'x' ? s.x0 : s.y0;
  const v1 = letter === 'x' ? s.x1 : s.y1;
  const pixel = (letter === 'x' ? s.xsizemode : s.ysizemode) === 'pixel';
  if (pixel) {
    // The anchor, padded by the shape's px extent on each side (positive offsets go right / up).
    const anchor = toLinear(axis, letter === 'x' ? s.xanchor : s.yanchor);
    if (!Number.isFinite(anchor)) return undefined;
    const offsets = (s.type === 'path' && s.path ? pathValues(s.path, letter) : [v0, v1])
      .map(Number)
      .filter(Number.isFinite);
    const lo = Math.min(0, ...offsets);
    const hi = Math.max(0, ...offsets);
    return {
      axis,
      extremes: { min: [{ l: anchor, padPx: -lo + ppad }], max: [{ l: anchor, padPx: hi + ppad }] },
    };
  }
  const values = (s.type === 'path' && s.path ? pathValues(s.path, letter) : [v0, v1])
    .map((v) => toLinear(axis, v))
    .filter(Number.isFinite);
  if (values.length === 0) return undefined;
  return { axis, extremes: linearExtremes(values, ppad) };
}

/**
 * Autorange contributions of shapes referenced to data axes, by axis id (Plotly's
 * `shapes/calc_autorange.js`): each visible shape's positions (every path coordinate, control
 * points included) padded by half its line width; `pixel`-sized dimensions add their anchor padded
 * by their px extent. Paper and domain references don't count, and nothing counts without traces.
 */
export function shapeExtremes(
  shapes: readonly FullShape[],
  axes: ReadonlyMap<string, ShapeAxis>,
  traceCount: number,
): Record<string, AxisExtremes> | undefined {
  if (traceCount === 0) return undefined;
  const out: Record<string, AxisExtremes> = {};
  for (const s of shapes) {
    if (s.visible !== true) continue;
    for (const letter of ['x', 'y'] as const) {
      const d = dimExtremes(s, letter, axes);
      if (!d) continue;
      const acc = (out[d.axis.id] ??= { min: [], max: [] });
      acc.min.push(...d.extremes.min);
      acc.max.push(...d.extremes.max);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
