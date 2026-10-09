/**
 * The screen model of a chord trace (backlog G8, ADR-029): the ring of `calc.layout` in the
 * trace's domain, and everything the view draws and hover tests, in container px (top-left
 * origin) — the node arcs, the group arcs, the ribbons as polygons, their colors and the labels.
 *
 * ## Radii
 *
 * The ring is centered in the domain. From the outside in: the group labels and the ring of
 * group arcs (when `node.group` is given), the node labels, the ring of node arcs, and the
 * ribbons, which end `link.gap` inside it. The node ring takes what the labels leave: radial
 * labels get the width of the longest one, but no more than {@link LABEL_SHARE} of the room, and
 * longer ones are cut with an ellipsis.
 *
 * ## Colors
 *
 * A node takes `node.color`, else a colorway color: its group's when the trace has groups, its
 * own otherwise. A ribbon takes `link.color`, else the color of its source or target node
 * (`link.colorsource`; `'gradient'` cuts it into strips that go from one to the other), at
 * `link.opacity`. While something is hovered, the ribbons it is about take their hover color and
 * the others are dimmed (see `plot.ts`).
 *
 * The last model is cached per calc for `hoverPoints`.
 */
import { toRGBA, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import type { RGBA, TextFont, TextFontWeight, TextRunLines } from '@mk7s/holochart-render';
import { labelContent, measureLabel, rgbaToCss } from '@mk7s/holochart-traces-basic';
import type { ChordCalc, ChordCalcLink } from './calc.ts';
import {
  hillOutline,
  outlineBounds,
  ribbonAnchor,
  ribbonOutline,
  ribbonStrips,
  type Outline,
  type RibbonShape,
} from './geometry.ts';
import { fitsTangential, placeLabels, TEXT_PAD, type LabelOrientation } from './labels.ts';
import type { ChordArc, ChordGroupArc, ChordRibbon } from './layout.ts';

/** Line height of the labels, as a multiple of the font size. */
export const LINE_HEIGHT = 1.2;
/** The most of the domain's half size that radial labels may take. */
export const LABEL_SHARE = 0.4;
/** How much more opaque a ribbon is while hovered, by default. */
export const HOVER_ALPHA = 0.25;
/** Alpha factor of the ribbons a hover is not about. */
export const DIM = 0.15;
/** Strips of a gradient ribbon. */
export const GRADIENT_STRIPS = 24;

const FALLBACK: RGBA = [0.39, 0.43, 0.98, 1];

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The arc of a node, as drawn. */
export interface NodeArc {
  /** Node index (`pointNumber`). */
  readonly i: number;
  readonly arc: ChordArc;
  readonly color: RGBA;
  readonly css: string;
  readonly lineColor: RGBA;
  readonly lineWidth: number;
  readonly customdata: unknown;
}

/** The arc of a group, as drawn. */
export interface GroupArc {
  /** Group index. */
  readonly g: number;
  readonly arc: ChordGroupArc;
  readonly name: string;
  readonly color: RGBA;
  readonly css: string;
}

/** The ribbon of a link, as drawn. */
export interface Ribbon {
  /** Position in `calc.links`. */
  readonly k: number;
  readonly link: ChordCalcLink;
  readonly ribbon: ChordRibbon;
  /** The whole ribbon, container px: what hover tests. */
  readonly outline: Outline;
  readonly bounds: readonly [number, number, number, number];
  /** What is filled: the outline, or the strips of a gradient ribbon, with a color each. */
  readonly parts: readonly Outline[];
  readonly colors: readonly RGBA[];
  /** The colors while hovered. */
  readonly hover: readonly RGBA[];
  /** The ribbon's one color (a gradient's: its source end) as CSS, for labels and events. */
  readonly css: string;
  /** Hover label anchor, container px. */
  readonly ax: number;
  readonly ay: number;
  readonly customdata: unknown;
}

/** A label, container px. */
export interface RingLabel {
  readonly text: string;
  readonly runs?: TextRunLines;
  readonly font: TextFont;
  readonly color: RGBA;
  readonly x: number;
  readonly y: number;
  /** Degrees clockwise on screen. */
  readonly angle: number;
  readonly anchor: 'left' | 'center' | 'right';
  /** Longest line drawn, px (longer text ends in an ellipsis); unset for no limit. */
  readonly maxWidth?: number;
}

/** The radii of the rings, px from the center. */
export interface ChordRadii {
  /** Where the ribbons end: at their source, and at their target. */
  readonly source: number;
  readonly target: number;
  /** The ring of node arcs. */
  readonly inner: number;
  readonly outer: number;
  /** The ring of group arcs; both 0 without one. */
  readonly groupInner: number;
  readonly groupOuter: number;
}

export interface ChordModel {
  readonly calc: ChordCalc;
  readonly trace: FullTrace;
  readonly rect: Rect;
  readonly cx: number;
  readonly cy: number;
  readonly radii: ChordRadii;
  /** Node arcs in ring order, and each node's position among them (−1 for none). */
  readonly nodes: readonly NodeArc[];
  readonly nodeAt: Int32Array;
  readonly groups: readonly GroupArc[];
  /** Ribbons in link order, and each link's position among them (−1 for none). */
  readonly ribbons: readonly Ribbon[];
  readonly ribbonAt: Int32Array;
  /** Positions in {@link ribbons} in drawing order: the widest first, so thin ones stay on top. */
  readonly order: readonly number[];
  readonly orientation: LabelOrientation | 'none';
  readonly labels: readonly RingLabel[];
  /** Arrowhead length of the directed ribbons, px. */
  readonly arrow: number;
}

type Container = Readonly<Record<string, unknown>>;

/** A container of the trace (`{}` when it has none). */
export function part(trace: Container, key: string): Container {
  const v = trace[key];
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Container) : {};
}

/** Entry `i` of an array attribute, or the scalar. */
export function pick(v: unknown, i: number): unknown {
  return Array.isArray(v) || ArrayBuffer.isView(v) ? (v as ArrayLike<unknown>)[i] : v;
}

const css = (v: unknown): RGBA | undefined =>
  (typeof v === 'string' ? toRGBA(v) : null) ?? undefined;

const px = (v: unknown, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : dflt;

/** The colorway of the figure. */
function colorwayOf(fullLayout: FullLayout | undefined): RGBA[] {
  const way = fullLayout?.['colorway'];
  const colors: RGBA[] = [];
  for (const c of Array.isArray(way) ? way : []) {
    const rgba = css(c);
    if (rgba) colors.push(rgba);
  }
  return colors.length > 0 ? colors : [FALLBACK];
}

/**
 * The color of every node (see the module comment): `node.color`, else the colorway by group
 * (a node without a group after the groups) or by node.
 */
export function nodeColors(
  calc: ChordCalc,
  trace: FullTrace,
  fullLayout: FullLayout | undefined,
): RGBA[] {
  const way = colorwayOf(fullLayout);
  const given = part(trace, 'node')['color'];
  const groups = calc.groupNames.length;
  return Array.from({ length: calc.nodes }, (_, i) => {
    const own = css(pick(given, i));
    if (own) return own;
    if (groups === 0) return way[i % way.length]!;
    const g = calc.group[i]!;
    return way[(g >= 0 ? g : groups + i) % way.length]!;
  });
}

/** The color of every group: `groups.color`, else the colorway. */
export function groupColors(
  calc: ChordCalc,
  trace: FullTrace,
  fullLayout: FullLayout | undefined,
): RGBA[] {
  const way = colorwayOf(fullLayout);
  const given = part(trace, 'groups')['color'];
  return calc.groupNames.map((_, g) => css(pick(given, g)) ?? way[g % way.length]!);
}

const mix = (a: RGBA, b: RGBA, t: number): RGBA => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
  a[3] + (b[3] - a[3]) * t,
];

/** A defaulted font container → the text primitive's font and color. */
export function fontOf(container: Container): { font: TextFont; color: RGBA } {
  const size = container['size'];
  const weight = container['weight'];
  const shadow = container['shadow'];
  return {
    font: {
      family: typeof container['family'] === 'string' ? container['family'] : 'sans-serif',
      size: typeof size === 'number' && size > 0 ? size : 12,
      ...(weight === 'normal' || weight === 'bold' || typeof weight === 'number'
        ? { weight: weight as TextFontWeight }
        : {}),
      ...(container['style'] === 'italic' ? { style: 'italic' as const } : {}),
      ...(typeof shadow === 'string' && shadow !== 'none' ? { shadow } : {}),
    },
    color: css(container['color']) ?? [0.27, 0.27, 0.27, 1],
  };
}

/** A label's text as the primitive draws it, and its size. */
function measured(text: string, font: TextFont) {
  if (text === '') return { content: undefined, width: 0, height: 0 };
  const content = labelContent(text, font);
  const box = content.text === '' ? { width: 0, height: 0 } : measureLabel(content, LINE_HEIGHT);
  return { content, width: box.width, height: box.height };
}

/** Build the model (see the module comment). */
export function buildModel(
  calc: ChordCalc,
  trace: FullTrace,
  fullLayout: FullLayout | undefined,
  rect: Rect,
): ChordModel {
  const { layout } = calc;
  const node = part(trace, 'node');
  const link = part(trace, 'link');
  const groupsIn = part(trace, 'groups');
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const half = Math.max(0, Math.min(rect.width, rect.height) / 2);

  // ---- Labels: what there is to write, then the room it takes ------------------------------------
  const asked = trace['textorientation'];
  const nodeFont = fontOf(part(trace, 'textfont'));
  const nodeTexts = layout.arcs.map((a) =>
    asked === 'none'
      ? { content: undefined, width: 0, height: 0 }
      : measured(calc.labels[a.node]!, nodeFont.font),
  );
  const ringed = layout.groups.length > 0 && groupsIn['visible'] !== false;
  const groupFont = fontOf(part(groupsIn, 'textfont'));
  const groupTexts = layout.groups.map((g) =>
    ringed
      ? measured(calc.groupNames[g.group]!, groupFont.font)
      : { content: undefined, width: 0, height: 0 },
  );
  const tallest = (list: readonly { height: number }[]): number =>
    list.reduce((m, t) => Math.max(m, t.height), 0);
  const groupLine = tallest(groupTexts);
  const groupThickness = ringed ? px(groupsIn['thickness'], 8) : 0;
  const groupGap = ringed ? px(groupsIn['gap'], 4) : 0;
  const groupOuter = Math.max(0, half - (groupLine > 0 ? groupLine + 2 * TEXT_PAD : 0));
  const groupInner = Math.max(0, groupOuter - groupThickness);
  // What is left for the node labels and the node ring.
  const room = Math.max(0, groupInner - groupGap);

  const nodeLine = tallest(nodeTexts);
  const widest = nodeTexts.reduce((m, t) => Math.max(m, t.width), 0);
  const tangentialRoom = nodeLine > 0 ? nodeLine + 2 * TEXT_PAD : 0;
  let orientation: LabelOrientation | 'none' = 'none';
  let labelRoom = 0;
  let maxWidth: number | undefined;
  if (nodeLine > 0) {
    const fits = (): boolean =>
      layout.arcs.every((a, p) =>
        fitsTangential(
          nodeTexts[p]!.width,
          Math.abs(a.end - a.start),
          room - tangentialRoom + TEXT_PAD,
        ),
      );
    orientation =
      asked === 'radial' || asked === 'tangential' ? asked : fits() ? 'tangential' : 'radial';
    if (orientation === 'tangential') labelRoom = tangentialRoom;
    else {
      const most = Math.max(0, half * LABEL_SHARE - 2 * TEXT_PAD);
      if (widest > most) maxWidth = most;
      labelRoom = Math.min(widest, most) + 2 * TEXT_PAD;
    }
  }
  const outer = Math.max(0, room - labelRoom);
  const inner = Math.max(0, outer - px(node['thickness'], 12));
  const gap = px(link['gap'], 2);
  const radii: ChordRadii = {
    source: Math.max(0, inner - gap),
    target: Math.max(0, inner - (calc.directed ? px(link['targetgap'], gap) : gap)),
    inner,
    outer,
    groupInner: ringed ? groupInner : 0,
    groupOuter: ringed ? groupOuter : 0,
  };
  const arrow = calc.directed ? px(link['arrowlen'], 0) : 0;

  // ---- Arcs --------------------------------------------------------------------------------------
  const colors = nodeColors(calc, trace, fullLayout);
  const line = part(node, 'line');
  const nodes = layout.arcs.map((arc): NodeArc => {
    const i = arc.node;
    const color = colors[i]!;
    const width = Number(pick(line['width'], i));
    return {
      i,
      arc,
      color,
      css: rgbaToCss(color),
      lineColor: css(pick(line['color'], i)) ?? [0, 0, 0, 0],
      lineWidth: Number.isFinite(width) && width > 0 ? width : 0,
      customdata: pick(node['customdata'], i),
    };
  });
  const ofGroup = groupColors(calc, trace, fullLayout);
  const groups = ringed
    ? layout.groups.map((arc): GroupArc => {
        const color = ofGroup[arc.group]!;
        return {
          g: arc.group,
          arc,
          name: calc.groupNames[arc.group]!,
          color,
          css: rgbaToCss(color),
        };
      })
    : [];

  // ---- Ribbons -----------------------------------------------------------------------------------
  const opacity = Math.min(1, px(link['opacity'], 0.6));
  const from = link['colorsource'];
  const ribbonAt = new Int32Array(calc.links.length).fill(-1);
  const ribbons = layout.ribbons.map((ribbon, at): Ribbon => {
    const l = calc.links[ribbon.link]!;
    ribbonAt[ribbon.link] = at;
    const shape: RibbonShape = {
      cx,
      cy,
      sourceRadius: radii.source,
      targetRadius: ribbon.self ? radii.source : radii.target,
      sourceStart: ribbon.sourceStart,
      sourceEnd: ribbon.sourceEnd,
      targetStart: ribbon.targetStart,
      targetEnd: ribbon.targetEnd,
      arrow,
    };
    const outline = ribbon.self
      ? hillOutline(cx, cy, radii.source, ribbon.sourceStart, ribbon.sourceEnd)
      : ribbonOutline(shape);
    const own = css(pick(link['color'], l.index));
    const a = colors[l.source]!;
    const b = colors[l.target]!;
    const gradient = !own && from === 'gradient' && !ribbon.self && a.some((v, c) => v !== b[c]);
    const parts = gradient ? ribbonStrips(shape, GRADIENT_STRIPS) : [outline];
    const base = parts.map((_, j): RGBA => {
      const c = own ?? (gradient ? mix(a, b, (j + 0.5) / parts.length) : from === 'target' ? b : a);
      return [c[0], c[1], c[2], c[3] * opacity];
    });
    const lit = css(pick(link['hovercolor'], l.index));
    const hover = base.map((c): RGBA => lit ?? [c[0], c[1], c[2], Math.min(1, c[3] + HOVER_ALPHA)]);
    const [ax, ay] = ribbonAnchor(shape, ribbon.self);
    return {
      k: ribbon.link,
      link: l,
      ribbon,
      outline,
      bounds: outlineBounds(outline),
      parts,
      colors: base,
      hover,
      css: rgbaToCss(base[0]!),
      ax,
      ay,
      customdata: pick(link['customdata'], l.index),
    };
  });
  const size = (r: Ribbon): number => r.link.value + r.link.reverse;
  const order = ribbons
    .map((_, at) => at)
    .sort((p, q) => size(ribbons[q]!) - size(ribbons[p]!) || p - q);

  // ---- Label places ------------------------------------------------------------------------------
  const labels: RingLabel[] = [];
  if (orientation !== 'none') {
    const arcs = layout.arcs.map((a, p) => ({
      start: a.start,
      end: a.end,
      width: maxWidth === undefined ? nodeTexts[p]!.width : Math.min(nodeTexts[p]!.width, maxWidth),
      height: nodeTexts[p]!.height,
    }));
    for (const place of placeLabels(arcs, cx, cy, outer, orientation)) {
      const t = nodeTexts[place.arc]!;
      const content = t.content!;
      // A cut label is drawn as plain text: the ellipsis is worked out on its plain form.
      const cut = maxWidth !== undefined && t.width > maxWidth;
      labels.push({
        text: content.text,
        ...(content.runs && !cut ? { runs: content.runs } : {}),
        font: content.font,
        color: nodeFont.color,
        x: place.x,
        y: place.y,
        angle: place.angle,
        anchor: place.anchor,
        ...(cut ? { maxWidth } : {}),
      });
    }
  }
  if (ringed && groupLine > 0) {
    const arcs = layout.groups.map((g, p) => ({
      start: g.start,
      end: g.end,
      width: groupTexts[p]!.width,
      height: groupTexts[p]!.height,
    }));
    for (const place of placeLabels(arcs, cx, cy, groupOuter, 'tangential')) {
      const content = groupTexts[place.arc]!.content!;
      labels.push({
        text: content.text,
        ...(content.runs ? { runs: content.runs } : {}),
        font: content.font,
        color: groupFont.color,
        x: place.x,
        y: place.y,
        angle: place.angle,
        anchor: place.anchor,
      });
    }
  }

  return {
    calc,
    trace,
    rect,
    cx,
    cy,
    radii,
    nodes,
    nodeAt: layout.arcOf,
    groups,
    ribbons,
    ribbonAt,
    order,
    orientation,
    labels,
    arrow,
  };
}

const models = new WeakMap<ChordCalc, ChordModel>();

const sameRect = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** The memoized model of `calc`: rebuilt when the trace, the layout or the rect changed. */
export function modelFor(
  calc: ChordCalc,
  trace: FullTrace,
  fullLayout: FullLayout | undefined,
  rect: Rect,
): ChordModel {
  const hit = models.get(calc);
  if (hit && hit.trace === trace && sameRect(hit.rect, rect)) return hit;
  const model = buildModel(calc, trace, fullLayout, rect);
  models.set(calc, model);
  return model;
}

/** The trace's rect in container px (its domain; the plot area or the viewport otherwise). */
export function traceRect(ctx: {
  readonly domain?: { readonly rect: Rect } | undefined;
  readonly plotArea?: Rect | undefined;
  readonly viewport: { readonly size: { width: number; height: number } };
}): Rect {
  const size = ctx.viewport.size;
  const r = ctx.domain?.rect ?? ctx.plotArea ?? { x: 0, y: 0, ...size };
  return { x: r.x, y: r.y, width: Math.max(0, r.width), height: Math.max(0, r.height) };
}
