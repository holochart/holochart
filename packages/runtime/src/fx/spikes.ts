/**
 * Spike lines (plan E3.10, Plotly's `createSpikelines`): which hovered point each axis' spike
 * follows, and the lines and dots to draw, in container px. Pure: the hover layer draws the result
 * as DOM (SVG) over the canvas, so showing, moving or hiding spikes never re-renders a trace.
 *
 * - `showspikes` per axis; `layout.spikedistance` limits how far (px) the spiked point may be from
 *   the pointer (`-1`: no limit, `0`: no spikes).
 * - `spikemode`: `toaxis` (point → axis line), `across` (the whole span of the subplots sharing the
 *   axis), `marker` (a dot on the axis line), combined with `+`.
 * - `spikesnap`: `hovered data` and `data` put the spike through the point, `cursor` through the
 *   pointer. `data` also spikes the closest point within `spikedistance` when no label shows.
 * - Each line is drawn over a background line 2 px wider in the plot background color, as Plotly
 *   does, so it stays visible over traces of its own color.
 */
import { toRGBA, type FullLayout } from '@mk7s/holochart-core';
import type { AxisInfo, HoverPoint, SubplotInfo } from '../contracts.ts';
import type { Rect } from './geometry.ts';
import type { Found, HoverEntry } from './hover.ts';

/** One spike line segment (container px). */
export interface SpikeLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly width: number;
  readonly color: string;
  /** SVG `stroke-dasharray` (`''` for solid). */
  readonly dash: string;
}

/** A spike marker dot on an axis line (container px). */
export interface SpikeDot {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly color: string;
}

/** Everything the spikes of one hover draw, back to front. */
export interface SpikeScene {
  readonly lines: readonly SpikeLine[];
  readonly dots: readonly SpikeDot[];
}

export const NO_SPIKES: SpikeScene = { lines: [], dots: [] };

/** The spiked point of one axis letter. */
export interface SpikePoint {
  readonly entry: HoverEntry;
  readonly point: HoverPoint;
  /** Point position (container px). */
  readonly x: number;
  readonly y: number;
  readonly color: string;
}

/** What spike geometry needs from the chart. */
export interface SpikeFrame {
  readonly fullLayout: FullLayout;
  /** Every cartesian axis by id (counter axes of anchored axes). */
  readonly axes: ReadonlyMap<string, AxisInfo>;
  readonly subplots: readonly SubplotInfo[];
  /** The plot area (container px). */
  readonly plotArea: Rect;
}

// ---- Colors ---------------------------------------------------------------------------------------

type RGB = readonly [number, number, number];

function rgbOf(color: string | undefined, under?: RGB): RGB | undefined {
  const c = color === undefined ? null : toRGBA(color);
  if (!c) return undefined;
  const a = c[3];
  if (a >= 1 || !under) return [c[0], c[1], c[2]];
  return [
    c[0] * a + under[0] * (1 - a),
    c[1] * a + under[1] * (1 - a),
    c[2] * a + under[2] * (1 - a),
  ];
}

function css(c: RGB): string {
  const ch = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgb(${ch(c[0])}, ${ch(c[1])}, ${ch(c[2])})`;
}

/** WCAG relative luminance. */
function luminance(c: RGB): number {
  const lin = (v: number): number => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/** WCAG contrast ratio (tinycolor's `readability`). */
export function readability(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The plot background as seen (Plotly's `Color.combine(plot_bgcolor, paper_bgcolor)` over white):
 * the color of the spike background lines and the reference for the default spike color.
 */
export function spikeBackground(fullLayout: FullLayout): string {
  const white: RGB = [1, 1, 1];
  const paper = rgbOf(fullLayout.paper_bgcolor, white) ?? white;
  return css(rgbOf(fullLayout.plot_bgcolor, paper) ?? paper);
}

/**
 * The default spike color: the point's color, or (Plotly's `Color.contrast`) white on a dark
 * background and `#444` on a light one when the point's color would not stand out.
 */
export function defaultSpikeColor(pointColor: string, background: string): string {
  const bg = rgbOf(background) ?? [1, 1, 1];
  const c = rgbOf(pointColor, bg);
  if (c && readability(c, bg) >= 1.5) return pointColor;
  // tinycolor's isDark: perceived brightness below 128/255.
  const brightness = (bg[0] * 299 + bg[1] * 587 + bg[2] * 114) / 1000;
  return brightness < 0.5 ? '#fff' : '#444';
}

/** Plotly's `Drawing.dashStyle` for a line width. */
export function dashArray(dash: unknown, width: number): string {
  const d = Math.max(Number(width) || 1, 3);
  switch (dash) {
    case undefined:
    case null:
    case '':
    case 'solid':
      return '';
    case 'dot':
      return `${d}px,${d}px`;
    case 'dash':
      return `${3 * d}px,${3 * d}px`;
    case 'longdash':
      return `${5 * d}px,${5 * d}px`;
    case 'dashdot':
      return `${3 * d}px,${d}px,${d}px,${d}px`;
    case 'longdashdot':
      return `${5 * d}px,${2 * d}px,${d}px,${2 * d}px`;
    default:
      // A dash list the user wrote (`5px,10px`).
      return String(dash);
  }
}

// ---- Picking the spiked points ----------------------------------------------------------------

/** Pixel distance from the pointer used to rank spike candidates (Plotly's `spikeDistance`). */
export function spikeDistanceOf(f: Found, cx: number, cy: number): number {
  const d = (f.point as { spikeDistance?: number }).spikeDistance;
  if (typeof d === 'number' && Number.isFinite(d)) return d;
  const r = f.entry.rect;
  return Math.hypot(r.x + f.point.px - cx, r.y + r.height - f.point.py - cy);
}

function axisOf(entry: HoverEntry, letter: 'x' | 'y'): AxisInfo | undefined {
  return letter === 'x' ? entry.subplot?.xaxis : entry.subplot?.yaxis;
}

/** Whether an axis draws spikes. */
export function showsSpikes(axis: AxisInfo | undefined): boolean {
  return (axis?.full as { showspikes?: unknown } | undefined)?.showspikes === true;
}

/**
 * The point the spike of the `letter` axes follows among `found[0..count)` (Plotly's
 * `selectClosestPoint`): the smallest spike distance within `maxDistance` (`-1`: no limit), on an
 * axis with `showspikes`. `preferFirst` lets the first point win outright (Plotly: bar-like traces
 * in `x` / `y` hovermodes).
 */
export function selectSpikePoint(
  found: readonly Found[],
  count: number,
  letter: 'x' | 'y',
  maxDistance: number,
  cx: number,
  cy: number,
  preferFirst = false,
): Found | undefined {
  if (maxDistance === 0) return undefined;
  const limit = maxDistance < 0 ? Infinity : maxDistance;
  let best: Found | undefined;
  let bestD = Infinity;
  for (let i = 0; i < count; i++) {
    const f = found[i] as Found;
    if (!showsSpikes(axisOf(f.entry, letter))) continue;
    const d = preferFirst && i === 0 ? -Infinity : spikeDistanceOf(f, cx, cy);
    if (d <= bestD && d <= limit) {
      best = f;
      bestD = d;
    }
  }
  return best;
}

// ---- Geometry ---------------------------------------------------------------------------------------

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Where an axis line is drawn, across the axis direction (container px; Plotly's
 * `getPxPosition`): beside its anchor axis (outside by `margin.pad`), or at `position` for a free
 * axis (plus `shift` on free y axes).
 */
export function axisLinePosition(axis: AxisInfo, frame: SpikeFrame): number {
  const f = axis.full as Record<string, unknown>;
  const pad = num((frame.fullLayout.margin as { pad?: unknown } | undefined)?.pad, 0);
  const area = frame.plotArea;
  const anchor = String(f['anchor']);
  const counter = anchor === 'free' ? undefined : frame.axes.get(anchor);
  if (axis.letter === 'x') {
    const top = f['side'] === 'top';
    if (counter) return top ? counter.end - pad : counter.start + pad;
    return area.y + (1 - num(f['position'], 0)) * area.height + (top ? -pad : pad);
  }
  const right = f['side'] === 'right';
  if (counter) return right ? counter.end + pad : counter.start - pad;
  return area.x + num(f['position'], 0) * area.width + num(f['shift'], 0) + (right ? pad : -pad);
}

/**
 * The span of `spikemode: 'across'` for an axis: from the lowest to the highest counter-axis edge
 * of every subplot on the axis (Plotly's `_counterDomainMin/Max`), stretched to a free axis'
 * position. For x axes a `[top, bottom]`-sorted pair of y px; for y axes a pair of x px.
 */
export function acrossSpan(axis: AxisInfo, frame: SpikeFrame): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const sp of frame.subplots) {
    const mine = axis.letter === 'x' ? sp.xaxis : sp.yaxis;
    if (mine.id !== axis.id) continue;
    const r = sp.rect;
    const a = axis.letter === 'x' ? r.y : r.x;
    const b = axis.letter === 'x' ? r.y + r.height : r.x + r.width;
    lo = Math.min(lo, a);
    hi = Math.max(hi, b);
  }
  if (String(axis.full.anchor) === 'free') {
    const p = axisLinePosition(axis, frame);
    lo = Math.min(lo, p);
    hi = Math.max(hi, p);
  }
  return [lo, hi];
}

/**
 * The spike lines and dots for the spiked points of the x axes (`v`, a vertical line) and the y
 * axes (`h`, a horizontal line). `pointer` is used with `spikesnap: 'cursor'`.
 */
export function spikeGeometry(
  frame: SpikeFrame,
  points: { readonly v?: SpikePoint | undefined; readonly h?: SpikePoint | undefined },
  pointer: { readonly x: number; readonly y: number },
): SpikeScene {
  if (!points.v && !points.h) return NO_SPIKES;
  const background = spikeBackground(frame.fullLayout);
  const lines: SpikeLine[] = [];
  const dots: SpikeDot[] = [];
  const add = (letter: 'x' | 'y', sp: SpikePoint): void => {
    const axis = letter === 'x' ? sp.entry.subplot?.xaxis : sp.entry.subplot?.yaxis;
    if (!axis) return;
    const f = axis.full as Record<string, unknown>;
    const cursor = f['spikesnap'] === 'cursor';
    const px = cursor ? pointer.x : sp.x;
    const py = cursor ? pointer.y : sp.y;
    const mode = typeof f['spikemode'] === 'string' ? f['spikemode'] : 'toaxis';
    const width = num(f['spikethickness'], 3);
    const color =
      typeof f['spikecolor'] === 'string' && f['spikecolor'] !== ''
        ? f['spikecolor']
        : defaultSpikeColor(sp.color, background);
    const edge = axisLinePosition(axis, frame);
    let from: number | undefined;
    let to: number | undefined;
    if (mode.includes('toaxis')) {
      from = edge;
      to = letter === 'x' ? py : px;
    }
    if (mode.includes('across')) [from, to] = acrossSpan(axis, frame);
    if (from !== undefined && to !== undefined && Number.isFinite(from) && Number.isFinite(to)) {
      const seg =
        letter === 'x'
          ? { x1: px, x2: px, y1: from, y2: to }
          : { x1: from, x2: to, y1: py, y2: py };
      // Background first (drawn under), then the spike itself.
      lines.push({ ...seg, width: width + 2, color: background, dash: '' });
      lines.push({ ...seg, width, color, dash: dashArray(f['spikedash'], width) });
    }
    if (mode.includes('marker')) {
      if (letter === 'x') {
        const top = f['side'] === 'top';
        dots.push({ cx: px, cy: edge + (top ? width : -width), r: width, color });
      } else {
        const right = f['side'] === 'right';
        dots.push({ cx: edge + (right ? -width : width), cy: py, r: width, color });
      }
    }
  };
  if (points.h) add('y', points.h);
  if (points.v) add('x', points.v);
  return { lines, dots };
}
