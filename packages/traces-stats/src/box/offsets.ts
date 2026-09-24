/**
 * Box and violin widths and group offsets (plotly.js `box/cross_trace_calc.js`,
 * `setPositionOffset`), as a pure function of the traces on one position axis, plus the
 * position-axis autorange padding they need (room for the shapes and for points drawn beside them).
 */
import type { AxisExtremes } from '@mk7s/holochart-core';
import { distinctValues } from '../shared/stats.ts';

/** One trace's input to {@link layoutOffsets}. */
export interface OffsetInput {
  /** Linear positions of the trace's boxes. */
  readonly pos: ArrayLike<number>;
  /** `width` (0: automatic). */
  readonly width: number;
  /** Index among the visible traces of the type (Plotly's `t.num`). */
  readonly num: number;
  /** Index of its offset group within its alignment group. */
  readonly offsetIndex: number;
  /** Number of named offset groups in its alignment group (0: none). */
  readonly offsetGroups: number;
  /** Violins: which side is drawn. Boxes: `'both'`. */
  readonly side: 'both' | 'positive' | 'negative';
  /** The trace draws points (a points mode and at least one shown point on this axis). */
  readonly hasPoints: boolean;
  readonly pointpos: number;
  readonly jitter: number;
  /** Marker diameter (px). */
  readonly markerSize: number;
}

/** Layout options from `layout.<kind>mode`, `<kind>gap`, `<kind>groupgap`. */
export interface OffsetOptions {
  readonly mode: 'group' | 'overlay';
  readonly gap: number;
  readonly groupgap: number;
  /** Visible traces of the type in the figure (Plotly's `_numBoxes` / `_numViolins`). */
  readonly total: number;
  /** Category axes: positions are one slot apart whatever the data. */
  readonly category: boolean;
}

/** Where one trace's boxes sit around their positions, in position-axis linear units. */
export interface OffsetOutput {
  /** Half the slot of one position (Plotly's `dPos`). */
  readonly dPos: number;
  /** Center offset of this trace's boxes from their positions. */
  readonly bPos: number;
  /** Box half-width. */
  readonly bdPos: number;
  /** Half-width around the box center that hovers it. */
  readonly wHover: number;
  /** Position-axis extremes: the boxes plus room for points beside them. */
  readonly extremes: AxisExtremes;
}

/** Lay out the boxes of several traces sharing a position axis and orientation. */
export function layoutOffsets(
  inputs: readonly OffsetInput[],
  options: OffsetOptions,
): OffsetOutput[] {
  const all: number[] = [];
  for (const input of inputs) for (let i = 0; i < input.pos.length; i++) all.push(input.pos[i]!);
  const dv = distinctValues(all);
  const minDiff = options.category ? 1 : dv.minDiff;
  const dPos0 = minDiff / 2;
  const group = options.mode === 'group' && options.total > 1;
  const groupFraction = 1 - options.gap;
  const groupGapFraction = 1 - options.groupgap;

  return inputs.map((input) => {
    let dPos: number;
    let bdPos: number;
    let bPos: number;
    let wHover: number;
    if (input.width) {
      dPos = bdPos = wHover = input.width / 2;
      bPos = 0;
    } else {
      dPos = dPos0;
      if (group) {
        const num = input.offsetGroups || options.total;
        const shift = input.offsetGroups ? input.offsetIndex : input.num;
        bdPos = (dPos * groupFraction * groupGapFraction) / num;
        bPos = 2 * dPos * (-0.5 + (shift + 0.5) / num) * groupFraction;
        wHover = (dPos * groupFraction) / num;
      } else {
        bdPos = dPos * groupFraction * groupGapFraction;
        bPos = 0;
        wHover = dPos;
      }
    }
    return { dPos, bPos, bdPos, wHover, extremes: positionExtremes(input, dPos, bPos, bdPos) };
  });
}

/** Plotly's position-axis `findExtremes` call of `setPositionOffset`. */
function positionExtremes(
  input: OffsetInput,
  dPos: number,
  bPos: number,
  bdPos: number,
): AxisExtremes {
  const width = input.width;
  const edge = bPos + bdPos;
  let pushplus: number;
  let pushminus: number;
  let edgeplus: number;
  let edgeminus: number;
  let padded = Boolean(width);
  if (input.side === 'positive') {
    pushplus = dPos * (width ? 1 : 0.5);
    edgeplus = edge;
    pushminus = edgeminus = bPos;
  } else if (input.side === 'negative') {
    pushplus = edgeplus = bPos;
    pushminus = dPos * (width ? 1 : 0.5);
    edgeminus = edge;
  } else {
    pushplus = pushminus = dPos;
    edgeplus = edgeminus = edge;
  }
  let vpadplus = pushplus;
  let vpadminus = pushminus;
  let ppadplus = 0;
  let ppadminus = 0;
  if (input.hasPoints) {
    const { pointpos, jitter } = input;
    const ms = input.markerSize / 2;
    if (pointpos + jitter >= 0) {
      const pp = edge * (pointpos + jitter);
      if (pp > pushplus) {
        padded = true;
        ppadplus = ms;
        vpadplus = pp;
      } else if (pp > edgeplus) {
        ppadplus = ms;
      }
    }
    if (pointpos - jitter <= 0) {
      const pm = -edge * (pointpos - jitter);
      if (pm > pushminus) {
        padded = true;
        ppadminus = ms;
        vpadminus = pm;
      } else if (pm > edgeminus) {
        ppadminus = ms;
      }
    }
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < input.pos.length; i++) {
    const p = input.pos[i]!;
    if (!Number.isFinite(p)) continue;
    lo = Math.min(lo, p);
    hi = Math.max(hi, p);
  }
  if (lo > hi) return { min: [], max: [] };
  const point = (l: number, padPx: number) =>
    padded ? { l, padPx, extrapad: true } : { l, padPx };
  return { min: [point(lo - vpadminus, ppadminus)], max: [point(hi + vpadplus, ppadplus)] };
}
