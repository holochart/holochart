/**
 * Automargin for cartesian axes (plan E4.2): how far each axis' tick labels, ticks, line and title
 * reach into the figure margin, as a runtime margin push. Pure given a text measure.
 */
import type { FullLayout } from '@mk7s/holochart-core';
import type { MarginPush } from '@mk7s/holochart-runtime';
import type { MeasureLine } from '../shared/text.ts';
import { axisGeometry, axisTicks, cloneScale, type AxisLike } from './geometry.ts';
import { AxisShifts, automarginAllows, axisMarginSide, type MarginSide } from './placement.ts';

/** One axis' margin requirement. */
export interface AxisMarginNeed {
  axis: string;
  side: MarginSide;
  /** Margin in px the axis needs on `side` (plot edge → outermost element, including `pad`). */
  need: number;
}

/**
 * Margin needs of every visible axis with `automargin` that sits on the plot-area edge. Uses each
 * axis' current scale; a scale that has no length yet (first layout pass) is measured at
 * `lengthHint(axis)` px instead, on a copy.
 */
export function axisMarginNeeds(
  axes: ReadonlyMap<string, AxisLike>,
  fullLayout: Pick<FullLayout, 'margin'>,
  size: { width: number; height: number },
  measure: MeasureLine,
  lengthHint?: (axis: AxisLike) => number,
): AxisMarginNeed[] {
  const out: AxisMarginNeed[] = [];
  const pad = fullLayout.margin.pad;
  const shifts = new AxisShifts(axes.values());
  for (const axis of axes.values()) {
    const f = axis.full;
    if (!f.visible) continue;
    // Free y axes moved by `shift` / `autoshift` (E3.9) reach further into the margin, and axes
    // that push others need their depth measured even without automargin.
    const shift = shifts.begin(axis);
    const side = axisMarginSide(axis, axes);
    const wanted = side !== undefined && automarginAllows(f.automargin, side);
    if (!wanted && shifts.passive(axis)) continue;
    let subject: AxisLike = axis;
    if (!(axis.scale.length > 1) && lengthHint) {
      const scale = cloneScale(axis.scale, Math.max(1, lengthHint(axis)));
      // Only the along-axis mapping matters for ticks and label boxes.
      subject = {
        id: axis.id,
        letter: axis.letter,
        type: axis.type,
        full: axis.full,
        scale,
        // Container-like px (y grows downward), so overflow checks see on-screen positions.
        start: axis.letter === 'x' ? 0 : scale.length,
        end: axis.letter === 'x' ? scale.length : 0,
        l2c: (l) => (axis.letter === 'x' ? scale.l2p(l) : scale.length - scale.l2p(l)),
      };
    }
    const outwardSgn: 1 | -1 =
      side !== undefined
        ? side === 'b' || side === 'r'
          ? 1
          : -1
        : String(f.side) === 'right' || String(f.side) === 'bottom'
          ? 1
          : -1;
    const geo = axisGeometry(subject, { cross: 0, sgn: outwardSgn }, axisTicks(subject), {
      measure,
      width: size.width,
      height: size.height,
    });
    shifts.end(axis, geo.extent);
    if (!wanted || side === undefined) continue;
    const reach = geo.extent + outwardSgn * shift;
    if (reach > 0) out.push({ axis: axis.id, side, need: Math.ceil(pad + reach) });
  }
  return out;
}

/** Fold needs into one push per side (the largest need wins). */
export function marginPushOf(needs: readonly AxisMarginNeed[]): MarginPush | undefined {
  if (needs.length === 0) return undefined;
  const push: { l?: number; r?: number; t?: number; b?: number } = {};
  for (const n of needs) push[n.side] = Math.max(push[n.side] ?? 0, n.need);
  return push;
}

/**
 * Sides whose need exceeds the margin in use by more than half a pixel (the layout must run again
 * with the measured push; see `axes.ts`).
 */
export function unmetNeeds(
  needs: readonly AxisMarginNeed[],
  margin: { readonly l: number; readonly r: number; readonly t: number; readonly b: number },
): AxisMarginNeed[] {
  return needs.filter((n) => n.need > margin[n.side] + 0.5);
}
