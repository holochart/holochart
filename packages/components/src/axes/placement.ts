/**
 * Where each cartesian axis is drawn (plan E3.4): `side`, `anchor` (including `'free'` with
 * `position`), `mirror`, and `margin.pad`, resolved to {@link AxisFrame}s in container px. Pure.
 */
import type { ViewportRect } from '@mk7s/holochart-render';
import type { AxisFrame, AxisLike, MirrorFrame } from './geometry.ts';

/** Which figure margin an axis reaches into, when it sits on the plot-area edge. */
export type MarginSide = 'l' | 'r' | 't' | 'b';

/** A subplot as far as placement is concerned. */
export interface SubplotLike {
  readonly id: string;
  readonly xaxis: AxisLike;
  readonly yaxis: AxisLike;
  readonly rect: Readonly<ViewportRect>;
}

/** Resolved placement of one axis. */
export interface AxisPlacement {
  frame: AxisFrame;
  mirrors: MirrorFrame[];
  /** The figure margin the axis grows into (`undefined` when it sits inside the plot area). */
  margin: MarginSide | undefined;
  /** The counter axis the axis is drawn against (`undefined` for `anchor: 'free'`). */
  counter: AxisLike | undefined;
  /** Width of the counter axis' line, so the two lines join at the corner. */
  overhang: number;
}

function domainOf(axis: AxisLike): [number, number] {
  const d = axis.full.domain as readonly number[];
  const a = d[0] ?? 0;
  const b = d[1] ?? 1;
  return a <= b ? [a, b] : [b, a];
}

/** The side an axis is drawn on, normalized per letter. */
function sideOf(axis: AxisLike): 'bottom' | 'top' | 'left' | 'right' {
  const side = String(axis.full.side);
  if (axis.letter === 'x') return side === 'top' ? 'top' : 'bottom';
  return side === 'right' ? 'right' : 'left';
}

/**
 * The margin an axis grows into, from domains only (so it can be decided before layout, in
 * `pushMargin`): an anchored axis whose counter axis' domain reaches the matching plot-area edge,
 * or a free axis at `position` 0 or 1 on its side.
 */
export function axisMarginSide(
  axis: AxisLike,
  axes: ReadonlyMap<string, AxisLike>,
): MarginSide | undefined {
  const side = sideOf(axis);
  const anchor = String(axis.full.anchor);
  let lo: number;
  let hi: number;
  if (anchor === 'free') {
    const p = axis.full.position;
    lo = p;
    hi = p;
  } else {
    const counter = axes.get(anchor);
    if (!counter) return undefined;
    [lo, hi] = domainOf(counter);
  }
  switch (side) {
    case 'bottom':
      return lo <= 0 ? 'b' : undefined;
    case 'top':
      return hi >= 1 ? 't' : undefined;
    case 'left':
      return lo <= 0 ? 'l' : undefined;
    case 'right':
      return hi >= 1 ? 'r' : undefined;
  }
}

/** Whether `automargin` lets an axis on `side` grow that margin. */
export function automarginAllows(automargin: unknown, side: MarginSide): boolean {
  if (automargin === true) return true;
  if (typeof automargin !== 'string' || automargin === '') return false;
  const flags = automargin.split('+');
  const dim = side === 'l' || side === 'r' ? 'width' : 'height';
  const name = { l: 'left', r: 'right', t: 'top', b: 'bottom' }[side];
  return flags.includes(dim) || flags.includes(name);
}

/**
 * Resolve the frame and mirrors of `axis`. `subplots` are the cartesian subplots (for
 * `mirror: 'all' | 'allticks'`), `area` the plot area and `pad` the figure's `margin.pad`.
 */
export function axisPlacement(
  axis: AxisLike,
  axes: ReadonlyMap<string, AxisLike>,
  subplots: Iterable<SubplotLike>,
  area: Readonly<ViewportRect>,
  pad: number,
): AxisPlacement {
  const f = axis.full;
  const side = sideOf(axis);
  const anchor = String(f.anchor);
  const counter = anchor === 'free' ? undefined : axes.get(anchor);
  const x = axis.letter === 'x';
  const sgn: 1 | -1 = side === 'bottom' || side === 'right' ? 1 : -1;
  let edge: number;
  let opposite: number | undefined;
  if (counter) {
    // Counter start/end: x → left/right, y → bottom/top (container px).
    const near = side === 'bottom' || side === 'left' ? counter.start : counter.end;
    edge = near;
    opposite = side === 'bottom' || side === 'left' ? counter.end : counter.start;
  } else {
    const p = f.position;
    edge = x ? area.y + (1 - p) * area.height : area.x + p * area.width;
  }
  const frame: AxisFrame = { cross: edge + sgn * pad, sgn };

  const mirrors: MirrorFrame[] = [];
  const mirror = f.mirror;
  const ticks = mirror === 'ticks' || mirror === 'allticks';
  if (mirror === true || mirror === 'ticks') {
    if (opposite !== undefined)
      mirrors.push({ cross: opposite - sgn * pad, sgn: -sgn as 1 | -1, ticks });
  } else if (mirror === 'all' || mirror === 'allticks') {
    const seen = new Set<number>([Math.round(edge)]);
    for (const sp of subplots) {
      const mine = x ? sp.xaxis : sp.yaxis;
      if (mine.id !== axis.id) continue;
      const c = x ? sp.yaxis : sp.xaxis;
      // For x: start = bottom (outward +1), end = top (outward −1); for y: start = left (−1).
      const ends: [number, 1 | -1][] = x
        ? [
            [c.start, 1],
            [c.end, -1],
          ]
        : [
            [c.start, -1],
            [c.end, 1],
          ];
      for (const [pos, s] of ends) {
        const key = Math.round(pos);
        if (seen.has(key)) continue;
        seen.add(key);
        mirrors.push({ cross: pos + s * pad, sgn: s, ticks });
      }
    }
  }
  const overhang = counter?.full.showline === true ? counter.full.linewidth : 0;
  return { frame, mirrors, margin: axisMarginSide(axis, axes), counter, overhang };
}

/** Cross positions (container px, along the counter direction) of the lines drawn by `p`. */
export function lineCrossings(p: AxisPlacement, pad: number): number[] {
  const out = [p.frame.cross - p.frame.sgn * pad];
  for (const m of p.mirrors) out.push(m.cross - m.sgn * pad);
  return out;
}
