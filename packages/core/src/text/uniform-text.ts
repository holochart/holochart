/**
 * Uniform text sizing (plan E4.6): `layout.uniformtext.{mode, minsize}` for labels inside bars and
 * pie slices, ported from plotly.js (`lib.ensureUniformFontSize`, `bar/uniform_text.js`).
 *
 * Per trace type (all bar traces together, all pie traces together, across subplots):
 *
 * 1. Every label is laid out with a font of at least `minsize` ({@link uniformFontSize}), which
 *    gives it a fit scale (≤ 1 when shrunk to fit its bar or slice).
 * 2. Its drawn size is `scale × fontSize`; labels smaller than `minsize` are "hidden candidates".
 *    The type's uniform size is the smallest `max(size, minsize)` over the other labels
 *    ({@link uniformTextSize}).
 * 3. Every label is then drawn at that size (`scale = uniform / fontSize`); in `hide` mode the
 *    hidden candidates are not drawn, in `show` mode they are drawn at the uniform size too
 *    ({@link uniformTextScale}).
 *
 * Pure: the traces measure and place their labels; this module only does the size negotiation.
 */

/** `layout.uniformtext.mode`. */
export type UniformTextMode = false | 'hide' | 'show';

/** Defaulted `layout.uniformtext`. */
export interface UniformText {
  readonly mode: UniformTextMode;
  /** Minimum size in px (0: none). */
  readonly minsize: number;
}

/** A label's size before negotiation: its font size and the scale its placement gave it. */
export interface UniformTextItem {
  readonly fontSize: number;
  readonly scale: number;
}

const OFF: UniformText = { mode: false, minsize: 0 };

/** The defaulted `layout.uniformtext` of a full layout (off when absent or invalid). */
export function uniformTextOf(fullLayout: Readonly<Record<string, unknown>>): UniformText {
  const u = fullLayout['uniformtext'] as { mode?: unknown; minsize?: unknown } | undefined;
  const mode = u?.mode === 'hide' || u?.mode === 'show' ? u.mode : false;
  if (!mode) return OFF;
  const minsize = typeof u?.minsize === 'number' && u.minsize > 0 ? u.minsize : 0;
  return { mode, minsize };
}

/** Plotly's `ensureUniformFontSize`: a label font is never smaller than `minsize` (mode on). */
export function uniformFontSize(size: number, u: UniformText): number {
  return u.mode ? Math.max(size, u.minsize) : size;
}

/** Whether a label is a hidden candidate: drawn smaller than `minsize` (`recordMinTextSize`). */
export function isUniformTextHidden(item: UniformTextItem, u: UniformText): boolean {
  return u.mode !== false && item.scale * item.fontSize < u.minsize;
}

/**
 * The uniform size of a trace type (`_barText_minsize`): the smallest `max(size, minsize)` over
 * the labels that aren't hidden candidates; `undefined` when the mode is off, and `Infinity` when
 * every label is a hidden candidate.
 */
export function uniformTextSize(
  items: Iterable<UniformTextItem>,
  u: UniformText,
): number | undefined {
  if (!u.mode) return undefined;
  let min = Infinity;
  for (const item of items) {
    const size = item.scale * item.fontSize;
    if (size < u.minsize) continue;
    min = Math.min(min, Math.max(size, u.minsize));
  }
  return min;
}

/**
 * The final scale of one label (`resizeText`): 0 for a hidden candidate in `hide` mode, else
 * `uniform / fontSize`. Unchanged when the mode is off or the uniform size is 0 or unset (as in
 * Plotly, a label squeezed to nothing with `minsize: 0` disables the negotiation). When every
 * label was a hidden candidate, `show` draws them at `minsize`.
 */
export function uniformTextScale(
  item: UniformTextItem,
  uniform: number | undefined,
  u: UniformText,
): number {
  if (!u.mode || !uniform || !(item.fontSize > 0)) return item.scale;
  if (isUniformTextHidden(item, u) && u.mode === 'hide') return 0;
  const size = Number.isFinite(uniform) ? uniform : u.minsize;
  return size / item.fontSize;
}
