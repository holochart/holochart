/**
 * Tick-label collision avoidance (plan E3.3): automatic rotation (`tickangle: 'auto'`, tried in
 * `autotickangles` order, as in Plotly) and automatic skipping when even the best angle overlaps.
 *
 * Text measurement is the only impure input (it needs font metrics), so it is passed in as a
 * function; the axis renderer supplies one backed by its glyph metrics.
 */

/** Plotly's line height for multi-line labels, relative to the font size. */
export const LINE_SPACING = 1.3;

/** Input of {@link layoutTickLabels}. */
export interface TickLabelLayoutInput {
  /** Label anchor positions along the axis, in px (the tick positions, or `labelL` in px). */
  positions: ArrayLike<number>;
  /** Label texts, parallel to `positions`. Empty labels are ignored. Lines split on `<br>`. */
  texts: readonly string[];
  /** Width in px of one line of text in the tick font. */
  measure: (text: string) => number;
  /** Tick font size in px (label height is `lines × fontSize × LINE_SPACING`). */
  fontSize: number;
  /** Which axis: x-axis labels sit side by side, y-axis labels are stacked. */
  axisLetter: 'x' | 'y';
  /** The axis `tickangle`. `'auto'` rotates x-axis labels only, as in Plotly. */
  tickangle: number | 'auto';
  /** Candidate angles for `'auto'`, in order of preference. Default `[0, 30, 90]`. */
  autotickangles?: readonly number[];
  /** Minimum gap between neighbouring labels in px. Default `fontSize / 4`. */
  gap?: number;
  /** Hide labels that would still overlap at the chosen angle. Default `true`. */
  autoskip?: boolean;
}

/** Result of {@link layoutTickLabels}. */
export interface TickLabelLayout {
  /** Rotation in degrees (clockwise, as `tickangle`). */
  angle: number;
  /** Per input label: draw it? (`false` for empty labels and auto-skipped ones.) */
  visible: boolean[];
}

const DEG = Math.PI / 180;

function stripTags(line: string): string {
  return line.replace(/<[^>]*>/g, '');
}

/**
 * Distance along the axis two identical `w × h` label boxes rotated by `angle` need so they do
 * not overlap: translated boxes stay apart when separated along either box edge direction.
 */
export function requiredLabelSpacing(
  w: number,
  h: number,
  angle: number,
  axisLetter: 'x' | 'y',
): number {
  const c = Math.abs(Math.cos(angle * DEG));
  const s = Math.abs(Math.sin(angle * DEG));
  // Along-axis components of the box's text direction and normal.
  const along = axisLetter === 'x' ? c : s;
  const across = axisLetter === 'x' ? s : c;
  const byWidth = along > 1e-9 ? w / along : Infinity;
  const byHeight = across > 1e-9 ? h / across : Infinity;
  return Math.min(byWidth, byHeight);
}

/**
 * Choose a label angle and which labels to show so neighbouring labels do not overlap.
 *
 * With `tickangle: 'auto'` on an x axis, the first angle of `autotickangles` whose rotated labels
 * fit the smallest spacing between neighbours wins (the most compact one if none fits). Then, if
 * labels still overlap and `autoskip` is on, only every k-th non-empty label is kept, with k the
 * smallest stride that fits (the first label is always kept).
 */
export function layoutTickLabels(input: TickLabelLayoutInput): TickLabelLayout {
  const { positions, texts, measure, fontSize, axisLetter } = input;
  const gap = input.gap ?? fontSize / 4;
  const visible = texts.map((t) => t !== '');
  const shown: { i: number; p: number }[] = [];
  let w = 0;
  let lines = 1;
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i] as string;
    const p = positions[i];
    if (text === '' || p === undefined || !Number.isFinite(p)) {
      visible[i] = false;
      continue;
    }
    const parts = text.split(/<br\s*\/?>/i);
    lines = Math.max(lines, parts.length);
    for (const part of parts) w = Math.max(w, measure(stripTags(part)));
    shown.push({ i, p });
  }
  const h = lines * fontSize * LINE_SPACING;

  shown.sort((a, b) => a.p - b.p);
  let spacing = Infinity;
  for (let k = 1; k < shown.length; k++) {
    spacing = Math.min(spacing, (shown[k] as { p: number }).p - (shown[k - 1] as { p: number }).p);
  }
  const need = (angle: number): number => requiredLabelSpacing(w, h, angle, axisLetter) + gap;

  let angle: number;
  if (input.tickangle !== 'auto') angle = input.tickangle;
  else if (axisLetter === 'y') angle = 0;
  else {
    const candidates = input.autotickangles?.length ? input.autotickangles : [0, 30, 90];
    const fit = candidates.find((a) => need(a) <= spacing);
    angle =
      fit ??
      candidates.reduce((best, a) => (need(a) < need(best) ? a : best), candidates[0] as number);
  }

  if (input.autoskip !== false && shown.length > 1 && need(angle) > spacing) {
    const stride = spacing > 0 ? Math.ceil(need(angle) / spacing) : shown.length;
    for (let k = 0; k < shown.length; k++) {
      if (k % stride !== 0) visible[(shown[k] as { i: number }).i] = false;
    }
  }
  return { angle, visible };
}
