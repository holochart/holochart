/**
 * Bubble chart helpers (plan E9.5). Bubble sizes follow Plotly's `makeBubbleSizeFn` (see
 * `markerDiameters` in `calc.ts`): with `marker.sizemode: 'area'` a value `v` draws a marker of
 * diameter `2·sqrt(v / 2 / sizeref)` px, with `'diameter'` one of `v / sizeref` px.
 */

/** Options for {@link bubbleSizeref}. */
export interface BubbleSizerefOptions {
  /** The `marker.sizemode` the sizeref is for. Default `'area'`. */
  readonly sizemode?: 'area' | 'diameter';
}

/**
 * The `marker.sizeref` that draws the largest of `sizes` as a bubble `maxPx` CSS px across, so
 * data of any magnitude maps to a readable range of marker sizes. For `sizemode: 'area'` (the
 * usual bubble setting) this is Plotly's documented `2 · max(size) / maxPx²`; for `'diameter'`
 * it is `max(size) / maxPx`.
 *
 * Non-numeric, non-finite and non-positive sizes are ignored; with no positive size (or a
 * non-positive `maxPx`) the result is 1, Plotly's default.
 *
 * @example
 * ```ts
 * const size = [12, 40, 7, 95];
 * createChart(el, {
 *   data: [{ x, y, mode: 'markers', marker: { size, sizemode: 'area', sizeref: bubbleSizeref(size, 60) } }],
 * });
 * ```
 */
export function bubbleSizeref(
  sizes: ArrayLike<unknown>,
  maxPx: number,
  options: BubbleSizerefOptions = {},
): number {
  let max = 0;
  for (let i = 0; i < sizes.length; i++) {
    const raw = sizes[i];
    // Numeric strings count, as in Plotly's calcdata conversion of `marker.size`.
    const v = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    if (Number.isFinite(v) && v > max) max = v;
  }
  if (!(max > 0) || !(maxPx > 0) || !Number.isFinite(maxPx)) return 1;
  return options.sizemode === 'diameter' ? max / maxPx : (2 * max) / (maxPx * maxPx);
}
