/**
 * Placing a box by an anchor point in container or paper fractions (legend, colorbar, …) and the
 * margin such a box needs to stay inside the figure.
 */
import type { ViewportRect } from '@mk7s/holochart-render';
import type { MarginPush } from '@mk7s/holochart-runtime';

/** A box anchored at `x`/`y` (fractions of the container or of the plot area). */
export interface AnchoredBox {
  readonly x: number;
  readonly y: number;
  readonly xref: 'container' | 'paper';
  readonly yref: 'container' | 'paper';
  /** Resolved anchors (no `auto`). */
  readonly xanchor: 'left' | 'center' | 'right';
  readonly yanchor: 'top' | 'middle' | 'bottom';
}

/** Fraction of the box on the far side of the anchor point, per anchor. */
export function anchorFraction(anchor: string): number {
  return anchor === 'right' || anchor === 'bottom'
    ? 1
    : anchor === 'center' || anchor === 'middle'
      ? 0.5
      : 0;
}

/** The anchor point in container px. */
export function anchorPoint(
  a: Pick<AnchoredBox, 'x' | 'y' | 'xref' | 'yref'>,
  size: { width: number; height: number },
  plotArea: Readonly<ViewportRect>,
): { x: number; y: number } {
  return {
    x: a.xref === 'paper' ? plotArea.x + a.x * plotArea.width : a.x * size.width,
    y: a.yref === 'paper' ? plotArea.y + (1 - a.y) * plotArea.height : (1 - a.y) * size.height,
  };
}

/** Top-left corner of a `box`-sized box anchored as `a`, container px. */
export function anchoredOrigin(
  a: AnchoredBox,
  size: { width: number; height: number },
  plotArea: Readonly<ViewportRect>,
  box: { width: number; height: number },
): { left: number; top: number } {
  const p = anchorPoint(a, size, plotArea);
  return {
    left: p.x - anchorFraction(a.xanchor) * box.width,
    top: p.y - anchorFraction(a.yanchor) * box.height,
  };
}

/**
 * Margin a paper-anchored box needs to stay inside the figure, solving Plotly-style for the plot
 * size the pushed margin leaves: e.g. a box at `x = 1.02` anchored left needs
 * `r = (0.02·(W − l) + w) / 1.02`. `margin` holds the figure's base margins. Container-referenced
 * directions push nothing.
 */
export function anchoredMarginPush(
  a: AnchoredBox,
  size: { width: number; height: number },
  margin: { l: number; r: number; t: number; b: number },
  box: { width: number; height: number },
): MarginPush | undefined {
  if (box.width <= 0 || box.height <= 0) return undefined;
  const push: { l?: number; r?: number; t?: number; b?: number } = {};
  if (a.xref === 'paper') {
    const fx = anchorFraction(a.xanchor);
    const x = a.x;
    const right = x > 0 ? ((x - 1) * (size.width - margin.l) + (1 - fx) * box.width) / x : Infinity;
    if (right > 0 && Number.isFinite(right)) push.r = Math.ceil(right);
    const left = x < 1 ? (fx * box.width - x * (size.width - margin.r)) / (1 - x) : Infinity;
    if (left > 0 && Number.isFinite(left)) push.l = Math.ceil(left);
  }
  if (a.yref === 'paper') {
    const fy = anchorFraction(a.yanchor);
    const y = a.y;
    const bottom =
      y < 1 ? ((1 - fy) * box.height - y * (size.height - margin.t)) / (1 - y) : Infinity;
    if (bottom > 0 && Number.isFinite(bottom)) push.b = Math.ceil(bottom);
    const top = y > 0 ? (fy * box.height - (1 - y) * (size.height - margin.b)) / y : Infinity;
    if (top > 0 && Number.isFinite(top)) push.t = Math.ceil(top);
  }
  return Object.keys(push).length > 0 ? push : undefined;
}
