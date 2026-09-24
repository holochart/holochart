/**
 * Axis scale constraints (plan E3.9): Plotly's `constraints.enforce` as a pure function.
 *
 * The groups come from supply-defaults (`fullLayout._axisConstraintGroups`,
 * `defaults/constraints.ts`): within a group, px per unit ÷ the axis' ratio must be the same for
 * every axis. {@link enforceConstraints} takes each axis' current range, domain and pixel length
 * and returns the ranges and domains that meet the constraints; the caller applies them.
 */

/**
 * One constraint group (`fullLayout._axisConstraintGroups` item): axis id → ratio. A string ratio
 * has one `x`/`y` prefix per plot-aspect factor (cross-letter links), resolved with the plot size.
 */
export type ConstraintGroup = Readonly<Record<string, number | string>>;

/** The state of one axis that {@link enforceConstraints} reads. */
export interface ConstraintAxisState {
  /** Linear range in use ([r0, r1], r0 > r1 when reversed). */
  range: readonly [number, number];
  /** The axis' domain as given (before any constraint shrank it). */
  domain: readonly [number, number];
  /** Pixel length of the axis at that domain. */
  length: number;
  constrain: 'range' | 'domain';
  constraintoward: string;
  /**
   * Plotly `_constraintShrinkable`: this update did not set this axis' range, so it may zoom in
   * to match the axes that were set.
   */
  shrinkable?: boolean;
}

/** Output of {@link enforceConstraints}: only the ranges and domains that changed. */
export interface ConstraintResult {
  ranges: Map<string, [number, number]>;
  domains: Map<string, [number, number]>;
}

/** Fraction along an axis (from its left / bottom end) of each `constraintoward` value. */
export const FROM_BL: Readonly<Record<string, number>> = Object.freeze({
  left: 0,
  center: 0.5,
  right: 1,
  bottom: 0,
  middle: 0.5,
  top: 1,
});

/** Plotly's `ALMOST_EQUAL`: scales within this factor count as equal. */
const ALMOST_EQUAL = 1 - 1e-6;

const PREFIX = /^[xy]*/;

/**
 * Plotly `scaleZoom`: scale `range` by `factor` (> 1 zooms out) about the point at
 * `centerFraction` of the way from `range[0]` to `range[1]`.
 */
export function scaleZoom(
  range: readonly [number, number],
  factor: number,
  centerFraction: number,
): [number, number] {
  const [r0, r1] = range;
  const center = r0 + (r1 - r0) * centerFraction;
  return [center + (r0 - center) * factor, center + (r1 - center) * factor];
}

/** Plotly `finalRatios`: resolve prefixed ratio strings with the plot aspect (height / width). */
function finalRatios(
  group: ConstraintGroup,
  plot: { width: number; height: number },
): Map<string, number> {
  const aspect = plot.height / plot.width;
  const out = new Map<string, number>();
  for (const [id, ratio] of Object.entries(group)) {
    if (typeof ratio !== 'string') {
      out.set(id, ratio);
      continue;
    }
    const prefix = (PREFIX.exec(ratio) as RegExpExecArray)[0];
    let value = Number(ratio.slice(prefix.length));
    const factor = prefix.charAt(0) === 'y' ? aspect : 1 / aspect;
    for (let i = 0; i < prefix.length; i++) value *= factor;
    out.set(id, value);
  }
  return out;
}

/** Plotly `updateDomain`: shrink `domain` by `factor` about the `toward` point. */
function shrinkDomain(
  domain: readonly [number, number],
  factor: number,
  toward: number,
): [number, number] {
  const [d0, d1] = domain;
  const anchor = d0 + (d1 - d0) * toward;
  return [anchor + (d0 - anchor) / factor, anchor + (d1 - anchor) / factor];
}

/**
 * Plotly's `constraints.enforce`: make px per unit ÷ ratio equal across each constraint group.
 *
 * Per group, each axis' normalized scale is |px per unit| ÷ its ratio. A group whose scales are
 * already equal (within 1e-6) is left alone unless an axis uses `constrain: 'domain'`. The target
 * scale is the smallest normalized scale among axes that are `domain`-constrained or not
 * `shrinkable` (if every axis is shrinkable, the smallest overall); every other axis is changed
 * by `factor` = its scale ÷ the target:
 *
 * - `constrain: 'range'`: the range grows (or shrinks, for `factor < 1`) about its
 *   `constraintoward` point ({@link scaleZoom});
 * - `constrain: 'domain'`: the domain shrinks by `factor` about its `constraintoward` point; when
 *   `factor < 1` (growing the domain cannot magnify) the range is zoomed instead.
 *
 * Differences from Plotly: the function is stateless — `range` and `domain` are taken as
 * Plotly's `_inputRange` / `_inputDomain` (the caller restores the input domain before calling
 * again) — and Plotly's re-padding of autoranged `domain`-constrained axes (which recomputes the
 * autorange padding for the shrunk domain) is not done. Axes missing from `axes`, and axes with an
 * empty range, zero length or a non-positive ratio, are ignored.
 */
export function enforceConstraints(
  groups: readonly ConstraintGroup[],
  axes: ReadonlyMap<string, ConstraintAxisState>,
  plot: { width: number; height: number },
): ConstraintResult {
  const result: ConstraintResult = { ranges: new Map(), domains: new Map() };
  for (const group of groups) {
    const ratios = finalRatios(group, plot);
    const scales = new Map<string, number>();
    let minScale = Infinity;
    let maxScale = 0;
    let matchScale = Infinity;
    let hasDomain = false;
    for (const [id, ratio] of ratios) {
      const ax = axes.get(id);
      if (!ax) continue;
      const scale = ax.length / Math.abs(ax.range[1] - ax.range[0]) / ratio;
      if (!Number.isFinite(scale) || scale <= 0) continue;
      scales.set(id, scale);
      minScale = Math.min(minScale, scale);
      maxScale = Math.max(maxScale, scale);
      if (ax.constrain === 'domain' || ax.shrinkable !== true) {
        matchScale = Math.min(matchScale, scale);
      }
      if (ax.constrain === 'domain') hasDomain = true;
    }
    if (scales.size === 0 || (minScale > ALMOST_EQUAL * maxScale && !hasDomain)) continue;
    // Every axis shrinkable: no range was set, so none should move to the others.
    if (!Number.isFinite(matchScale)) matchScale = minScale;

    for (const [id, scale] of scales) {
      const ax = axes.get(id) as ConstraintAxisState;
      if (scale === matchScale && ax.constrain !== 'domain') continue;
      const factor = scale / matchScale;
      const toward = FROM_BL[ax.constraintoward] ?? 0.5;
      if (ax.constrain === 'domain' && factor >= 1) {
        const domain = shrinkDomain(ax.domain, factor, toward);
        if (domain[0] !== ax.domain[0] || domain[1] !== ax.domain[1]) {
          result.domains.set(id, domain);
        }
      } else if (factor !== 1) {
        result.ranges.set(id, scaleZoom(ax.range, factor, toward));
      }
    }
  }
  return result;
}
