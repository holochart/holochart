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

/**
 * Free-axis `shift` and `autoshift` (plan E3.9, Plotly's `axShifts` in `axes.draw`), tracked in
 * draw order. Plotly semantics:
 *
 * - `shift` moves a free y axis sideways by that many px (negative: left).
 * - `autoshift` axes are pushed outward past everything drawn before them on the same side of the
 *   same overlaid axis: the axis they overlay (its line, ticks, labels and title) and earlier
 *   autoshift axes, each also contributing its own `shift` and half its line width.
 *
 * Call {@link begin} before laying out an axis (it returns the axis' shift in container px across
 * the axis) and {@link end} after, with the axis' outward depth.
 */
export class AxisShifts {
  readonly #acc = new Map<string, number>();
  /** Axes that autoshift axes overlay: they push the autoshift axes out. */
  readonly #overlaid = new Set<string>();

  constructor(axes: Iterable<AxisLike>) {
    for (const axis of axes) {
      const o = overlayOf(axis);
      if (axis.full.autoshift === true && o !== undefined) this.#overlaid.add(o);
    }
  }

  /** Whether the axis moves axes drawn after it (Plotly's `_shiftPusher`). */
  #pusher(axis: AxisLike): boolean {
    const o = overlayOf(axis);
    return (
      axis.full.autoshift === true ||
      this.#overlaid.has(axis.id) ||
      (o !== undefined && this.#overlaid.has(o))
    );
  }

  #key(axis: AxisLike): string {
    const o = overlayOf(axis);
    const base = String(axis.full.anchor) !== 'free' && o === undefined ? axis.id : (o ?? axis.id);
    return `${base}\u0000${sideOf(axis)}`;
  }

  #push(axis: AxisLike, px: number, outward: boolean): void {
    const key = this.#key(axis);
    const signed = outward
      ? sideOf(axis) === 'right' || sideOf(axis) === 'bottom'
        ? px
        : -px
      : px;
    this.#acc.set(key, (this.#acc.get(key) ?? 0) + signed);
  }

  /** The shift (container px, + is right / down) of `axis`, before it is laid out. */
  begin(axis: AxisLike): number {
    const f = axis.full;
    const shift = typeof f.shift === 'number' && Number.isFinite(f.shift) ? f.shift : 0;
    if (axis.letter !== 'y') return 0;
    const free = String(f.anchor) === 'free';
    if (this.#pusher(axis) && free) {
      let half = f.showline ? f.linewidth / 2 : 0;
      if (f.ticks === 'inside') half += f.ticklen;
      this.#push(axis, half, true);
      this.#push(axis, shift, false);
    }
    if (f.autoshift === true && free) return this.#acc.get(this.#key(axis)) ?? 0;
    return free ? shift : 0;
  }

  /** Whether the axis neither moves nor pushes other axes (margins can skip measuring it). */
  passive(axis: AxisLike): boolean {
    return axis.letter !== 'y' || !this.#pusher(axis);
  }

  /** After laying out `axis`: `depth` px of line, ticks, labels and title push later axes out. */
  end(axis: AxisLike, depth: number): void {
    if (axis.letter === 'y' && this.#pusher(axis)) this.#push(axis, Math.max(0, depth), true);
  }
}

function overlayOf(axis: AxisLike): string | undefined {
  const o: unknown = axis.full.overlaying;
  return typeof o === 'string' && o !== '' && o !== 'free' && o !== axis.id ? o : undefined;
}
