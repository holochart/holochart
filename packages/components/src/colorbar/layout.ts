/**
 * Colorbar layout (plan E5.3), pure given a text measure: which bars are drawn (one per color
 * axis, one per trace with its own `showscale`), and for each the box, the gradient, the outline,
 * the ticks and labels and the title, in container px.
 *
 * A colorbar is a linear axis over `[cmin, cmax]`: ticks and labels come from core's tick machinery
 * through the axes component's {@link axisGeometry}, so the whole axis tick API (`tickmode`,
 * `dtick`, `tickvals`, `tickformat`, prefixes, exponents, `ticklabelposition`, …) behaves exactly
 * as on cartesian axes.
 *
 * ## Box model (vertical; horizontal swaps the directions)
 *
 * ```
 * ┌ border ─────────────────────────────┐   the box is `len` long (fraction of the plot height,
 * │ ypad                                │   or px) and as wide as its content; `x`/`y` and the
 * │ title (side: top)                   │   anchors place the whole box, like the legend
 * │ ┌outline┐ ticks labels  title(right)│
 * │ │ bar   │                           │
 * │ └───────┘                           │
 * │ title (side: bottom)          ypad  │
 * └ xpad ───────────────────────────────┘
 * ```
 */
import { createScale, type FullAxis, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import type { RGBA, ViewportRect } from '@mk7s/holochart-render';
import type { ColorbarSpec, MarginPush, TraceModule } from '@mk7s/holochart-runtime';
import {
  axisGeometry,
  axisTicks,
  type AxisLike,
  type LabelItem,
  type RectItem,
} from '../axes/geometry.ts';
import { anchoredMarginPush, anchoredOrigin, type AnchoredBox } from '../shared/placement.ts';
import {
  inheritFont,
  measureBlock,
  rgba,
  styledText,
  textFont,
  type FullFont,
  type MeasureLine,
} from '../shared/text.ts';

/** Gap between the bar (or its labels) and the title, px. */
export const TITLE_GAP = 4;
/** Longest gradient strip, px: interpolated segments are drawn as strips at most this long. */
export const STRIP_PX = 1;

/** The defaulted colorbar attributes (see `colorbarAttributes` in traces-basic). */
export interface FullColorbar {
  orientation: 'h' | 'v';
  thicknessmode: 'fraction' | 'pixels';
  thickness: number;
  lenmode: 'fraction' | 'pixels';
  len: number;
  x: number;
  xref: 'container' | 'paper';
  xanchor: 'left' | 'center' | 'right';
  xpad: number;
  y: number;
  yref: 'container' | 'paper';
  yanchor: 'top' | 'middle' | 'bottom';
  ypad: number;
  outlinecolor: string;
  outlinewidth: number;
  bordercolor: string;
  borderwidth: number;
  bgcolor: string;
  ticks: '' | 'inside' | 'outside';
  ticklen: number;
  tickwidth: number;
  tickcolor: string;
  ticklabelposition: string;
  ticklabeloverflow: string;
  showticklabels: boolean;
  tickfont?: Partial<FullFont>;
  tickangle: number | 'auto';
  title: { text: string; font?: Partial<FullFont>; side: 'right' | 'top' | 'bottom' };
  [key: string]: unknown;
}

/** Plotly's colorbar defaults, for attributes a (hand-built) spec leaves out. */
const DEFAULTS: FullColorbar = {
  orientation: 'v',
  thicknessmode: 'pixels',
  thickness: 30,
  lenmode: 'fraction',
  len: 1,
  x: 1.02,
  xref: 'paper',
  xanchor: 'left',
  xpad: 10,
  y: 0.5,
  yref: 'paper',
  yanchor: 'middle',
  ypad: 10,
  outlinecolor: '#444',
  outlinewidth: 1,
  bordercolor: '#444',
  borderwidth: 0,
  bgcolor: 'rgba(0,0,0,0)',
  ticks: '',
  ticklen: 5,
  tickwidth: 1,
  tickcolor: '#444',
  ticklabelposition: 'outside',
  ticklabeloverflow: 'hide past div',
  showticklabels: true,
  tickangle: 'auto',
  title: { text: '', side: 'top' },
};

/** A spec's attributes with defaults filled in (horizontal bars get their own position defaults). */
export function fullColorbar(attributes: Readonly<Record<string, unknown>>): FullColorbar {
  const cb = { ...DEFAULTS, ...attributes } as FullColorbar;
  if (cb.orientation === 'h') {
    if (attributes['x'] === undefined) cb.x = 0.5;
    if (attributes['xanchor'] === undefined) cb.xanchor = 'center';
    if (attributes['y'] === undefined) cb.y = cb.yref === 'paper' ? 1.02 : 1;
    if (attributes['yanchor'] === undefined) cb.yanchor = cb.yref === 'paper' ? 'bottom' : 'top';
  }
  const title = (attributes['title'] ?? {}) as Partial<FullColorbar['title']>;
  cb.title = {
    text: title.text ?? '',
    side: title.side ?? (cb.orientation === 'h' ? 'right' : 'top'),
    ...(title.font ? { font: title.font } : {}),
  };
  return cb;
}

/** One colorbar request with the trace it came from (for keys and diagnostics). */
export interface ColorbarEntry {
  /** `coloraxis` id, or `trace<N>` for a trace's own bar. */
  key: string;
  spec: ColorbarSpec;
}

/** The module a trace uses, from the draw context when available (it has the render parts). */
export type ModuleOf = (trace: FullTrace) => Pick<TraceModule, 'colorbar'> | undefined;

/**
 * The colorbars to draw: each visible trace's module `colorbar` hook, one bar per color axis (the
 * first trace referencing it wins) and one per trace with its own `showscale`, in trace order.
 * A throwing hook is skipped so one broken trace never hides the others.
 */
export function colorbarEntries(
  fullData: readonly FullTrace[],
  fullLayout: FullLayout,
  moduleOf: ModuleOf,
): ColorbarEntry[] {
  const out: ColorbarEntry[] = [];
  const seen = new Set<string>();
  for (const trace of fullData) {
    if (trace.visible !== true) continue;
    const module = moduleOf(trace);
    if (typeof module?.colorbar !== 'function') continue;
    let spec: ColorbarSpec | null;
    try {
      spec = module.colorbar(trace, { fullLayout });
    } catch {
      continue;
    }
    if (!spec || !(spec.cmax >= spec.cmin) || spec.colorscale.length === 0) continue;
    const key = spec.coloraxis ?? `trace${trace._index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, spec });
  }
  return out;
}

/** Everything one colorbar draws, container px. */
export interface ColorbarScene {
  /** The whole box (background, border and padding included). */
  box: { left: number; top: number; width: number; height: number };
  /** The colored area. */
  bar: { x0: number; y0: number; x1: number; y1: number };
  /** Background (with the border), gradient strips / blocks, outline, tick marks. */
  rects: RectItem[];
  /** Border per rect (same order as `rects`; transparent / 0 where none). */
  borders: { color: RGBA; width: number }[];
  labels: LabelItem[];
}

function lerp(a: RGBA, b: RGBA, f: number): RGBA {
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
    a[3] + (b[3] - a[3]) * f,
  ];
}

function sameColor(a: RGBA, b: RGBA): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/**
 * The colored area as rects along `[a0, a1]` (container px of t = 0 and t = 1) across `[c0, c1]`.
 * A segment between two stops of the same color — a discrete (stepped) scale, where stops repeat
 * positions to make hard edges — is one block; interpolated segments become strips at most
 * {@link STRIP_PX} long, colored at their middle (sRGB interpolation, like the GPU LUT).
 */
export function gradientRects(
  colorscale: readonly (readonly [number, string])[],
  a0: number,
  a1: number,
  c0: number,
  c1: number,
  vertical: boolean,
): RectItem[] {
  const stops = colorscale
    .map(([p, c]) => [Math.min(1, Math.max(0, p)), rgba(c, [0, 0, 0, 1])] as const)
    .sort((a, b) => a[0] - b[0]);
  const out: RectItem[] = [];
  const length = Math.abs(a1 - a0);
  const push = (t0: number, t1: number, color: RGBA): void => {
    const p0 = a0 + (a1 - a0) * t0;
    const p1 = a0 + (a1 - a0) * t1;
    const lo = Math.min(p0, p1);
    const hi = Math.max(p0, p1);
    out.push(
      vertical
        ? { x0: c0, x1: c1, y0: lo, y1: hi, color }
        : { x0: lo, x1: hi, y0: c0, y1: c1, color },
    );
  };
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return out;
  if (first[0] > 0) push(0, first[0], first[1]);
  for (let i = 1; i < stops.length; i++) {
    const [p0, col0] = stops[i - 1] as (typeof stops)[number];
    const [p1, col1] = stops[i] as (typeof stops)[number];
    const span = p1 - p0;
    if (span <= 0) continue;
    if (sameColor(col0, col1)) {
      push(p0, p1, col0);
      continue;
    }
    const n = Math.max(1, Math.ceil((span * length) / STRIP_PX));
    for (let k = 0; k < n; k++) {
      push(p0 + (span * k) / n, p0 + (span * (k + 1)) / n, lerp(col0, col1, (k + 0.5) / n));
    }
  }
  if (last[0] < 1) push(last[0], 1, last[1]);
  return out;
}

/** A hand-built full axis for the colorbar's tick machinery (a linear axis over the color domain). */
function colorbarAxis(cb: FullColorbar, tickfont: FullFont, vertical: boolean): FullAxis {
  return {
    ...cb,
    _id: vertical ? 'y' : 'x',
    type: 'linear',
    showline: false,
    linewidth: 0,
    linecolor: 'rgba(0,0,0,0)',
    minor: { ticks: '', showgrid: false },
    tickfont,
    autotickangles: [0, 30, 90],
    ticklabelshift: 0,
    ticklabelstandoff: 0,
    title: { text: '' },
    showdividers: false,
    dividerwidth: 0,
    domain: [0, 1],
    side: vertical ? 'right' : 'bottom',
  } as unknown as FullAxis;
}

/** The inputs of a colorbar layout that do not come from the spec. */
export interface ColorbarEnv {
  fullLayout: Pick<FullLayout, 'font'>;
  size: { width: number; height: number };
  plotArea: Readonly<ViewportRect>;
  measure: MeasureLine;
}

interface Sized {
  width: number;
  height: number;
  build(left: number, top: number): ColorbarScene;
}

/** Lay out one colorbar relative to a box origin; the size is known before the origin. */
function sizeColorbar(spec: ColorbarSpec, cb: FullColorbar, env: ColorbarEnv): Sized {
  const { size, plotArea, measure } = env;
  const vertical = cb.orientation !== 'h';
  const base = env.fullLayout.font as FullFont;
  const tickfont = inheritFont(cb.tickfont, base);
  const titleFull = inheritFont(cb.title.font, {
    ...base,
    family: tickfont.family,
    size: Math.round(tickfont.size * 1.2),
  });
  const styled = styledText(cb.title.text, textFont(titleFull));
  const tbox = measureBlock(styled.text, styled.font, measure);
  const hasTitle = styled.text !== '';
  const side = cb.title.side;

  const refLen = vertical
    ? cb.yref === 'paper'
      ? plotArea.height
      : size.height
    : cb.xref === 'paper'
      ? plotArea.width
      : size.width;
  const len = Math.max(0, cb.lenmode === 'fraction' ? cb.len * refLen : cb.len);
  const thick = Math.max(
    0,
    cb.thicknessmode === 'fraction'
      ? cb.thickness * (vertical ? plotArea.width : plotArea.height)
      : cb.thickness,
  );
  const bw = cb.borderwidth;
  const ow = cb.outlinewidth;
  const padAlong = vertical ? cb.ypad : cb.xpad;
  const padCross = vertical ? cb.xpad : cb.ypad;
  const full = colorbarAxis(cb, tickfont, vertical);
  const scale = createScale({ type: 'linear', range: [spec.cmin, spec.cmax], length: 1 });

  // Along the bar (local, from the box start): title before / after the bar takes its room.
  const titleAlong = vertical ? tbox.height : tbox.width;
  let a0 = bw + padAlong + ow;
  let a1 = len - bw - padAlong - ow;
  if (hasTitle && vertical && side === 'top') a0 += titleAlong + TITLE_GAP;
  if (hasTitle && vertical && side === 'bottom') a1 -= titleAlong + TITLE_GAP;
  if (hasTitle && !vertical && side === 'right') a1 -= titleAlong + TITLE_GAP;
  a1 = Math.max(a0, a1);
  // Across: horizontal bars put a top title above the bar.
  let c0 = bw + padCross + ow;
  if (hasTitle && !vertical && side === 'top') c0 += tbox.height + TITLE_GAP;
  const barLength = a1 - a0;
  scale.setLength(Math.max(1, barLength));
  const ticks = axisTicks({ type: 'linear', scale, full });

  const build = (left: number, top: number): ColorbarScene => {
    // Container px of the along / across local coordinates.
    const A = (a: number): number => (vertical ? top + a : left + a);
    const C = (c: number): number => (vertical ? left + c : top + c);
    const bar0 = A(a0);
    const bar1 = A(a1);
    const cross0 = C(c0);
    const cross1 = C(c0 + thick);
    // cmin sits at the bottom (vertical) or left (horizontal) end.
    const start = vertical ? bar1 : bar0;
    const end = vertical ? bar0 : bar1;
    const axis: AxisLike = {
      id: full._id,
      letter: vertical ? 'y' : 'x',
      type: 'linear',
      full,
      scale,
      start,
      end,
      l2c: (l) => (vertical ? start - scale.l2p(l) : start + scale.l2p(l)),
    };
    const geo = axisGeometry(axis, { cross: cross1 + ow, sgn: 1 }, ticks, {
      measure,
      width: size.width,
      height: size.height,
    });
    const bar = vertical
      ? { x0: cross0, x1: cross1, y0: bar0, y1: bar1 }
      : { x0: bar0, x1: bar1, y0: cross0, y1: cross1 };
    const rects: RectItem[] = [];
    const borders: { color: RGBA; width: number }[] = [];
    const none = { color: [0, 0, 0, 0] as RGBA, width: 0 };
    rects.push({ x0: 0, y0: 0, x1: 0, y1: 0, color: rgba(cb.bgcolor) }); // box, set below
    borders.push({ color: rgba(cb.bordercolor), width: bw });
    for (const r of gradientRects(spec.colorscale, start, end, cross0, cross1, vertical)) {
      rects.push(r);
      borders.push(none);
    }
    if (ow > 0) {
      rects.push({
        x0: bar.x0 - ow,
        x1: bar.x1 + ow,
        y0: bar.y0 - ow,
        y1: bar.y1 + ow,
        color: [0, 0, 0, 0],
      });
      borders.push({ color: rgba(cb.outlinecolor), width: ow });
    }
    for (const r of geo.rects) {
      rects.push(r);
      borders.push(none);
    }
    const labels = [...geo.labels];
    // Outer edge of the ticks and labels, across.
    const outer = cross1 + ow + geo.extent;
    let contentCross = outer;
    let contentAlong = A(len - bw - padAlong);
    if (hasTitle) {
      const color = rgba(titleFull.color);
      const item = { text: styled.text, font: styled.font, color, angle: 0 };
      if (vertical && side === 'right') {
        labels.push({
          ...item,
          x: outer + TITLE_GAP,
          y: (bar0 + bar1) / 2,
          anchorX: 'center',
          anchorY: 'top',
          angle: -90,
        });
        contentCross = outer + TITLE_GAP + tbox.height;
      } else if (vertical) {
        const y = side === 'top' ? A(bw + padAlong) : bar1 + ow + TITLE_GAP;
        labels.push({ ...item, x: cross0 - ow, y, anchorX: 'left', anchorY: 'top' });
        contentCross = Math.max(contentCross, cross0 - ow + tbox.width);
      } else if (side === 'right') {
        labels.push({
          ...item,
          x: bar1 + ow + TITLE_GAP,
          y: (cross0 + cross1) / 2,
          anchorX: 'left',
          anchorY: 'middle',
        });
        contentAlong = Math.max(contentAlong, bar1 + ow + TITLE_GAP + tbox.width);
      } else {
        const y = side === 'top' ? C(bw + padCross) : outer + TITLE_GAP;
        labels.push({ ...item, x: bar0 - ow, y, anchorX: 'left', anchorY: 'top' });
        if (side === 'bottom') contentCross = outer + TITLE_GAP + tbox.height;
        contentAlong = Math.max(contentAlong, bar0 - ow + tbox.width);
      }
    }
    const crossEnd = contentCross + padCross + bw;
    const alongEnd = Math.max(A(len), contentAlong + padAlong + bw);
    const box = vertical
      ? { left, top, width: crossEnd - left, height: alongEnd - top }
      : { left, top, width: alongEnd - left, height: crossEnd - top };
    rects[0] = {
      x0: box.left,
      y0: box.top,
      x1: box.left + box.width,
      y1: box.top + box.height,
      color: rgba(cb.bgcolor),
    };
    return { box, bar, rects, borders, labels };
  };
  // Measure once at the origin: sizes do not depend on where the box goes.
  const probe = build(0, 0);
  return { width: probe.box.width, height: probe.box.height, build };
}

function anchored(cb: FullColorbar): AnchoredBox {
  return {
    x: cb.x,
    y: cb.y,
    xref: cb.xref,
    yref: cb.yref,
    xanchor: cb.xanchor,
    yanchor: cb.yanchor,
  };
}

/** One colorbar's geometry in container px. */
export function layoutColorbar(spec: ColorbarSpec, env: ColorbarEnv): ColorbarScene {
  const cb = fullColorbar(spec.attributes);
  const sized = sizeColorbar(spec, cb, env);
  const { left, top } = anchoredOrigin(anchored(cb), env.size, env.plotArea, sized);
  return sized.build(Math.round(left), Math.round(top));
}

/** The margin one colorbar needs (paper-referenced placement only, like the legend). */
export function colorbarMarginPush(
  spec: ColorbarSpec,
  env: ColorbarEnv,
  margin: { l: number; r: number; t: number; b: number },
): MarginPush | undefined {
  const cb = fullColorbar(spec.attributes);
  const sized = sizeColorbar(spec, cb, env);
  return anchoredMarginPush(anchored(cb), env.size, margin, sized);
}
