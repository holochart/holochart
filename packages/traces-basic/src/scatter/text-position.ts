/**
 * Scatter text labels (plan E9.3): Plotly `textposition` → anchor and pixel offset for the
 * render package's text primitive, ported from plotly.js `Drawing.textPointPosition`, plus a
 * pseudo-HTML → plain-text reduction. Scatter labels with markup are drawn as rich text (E2.10,
 * see `shared/rich-text.ts`); {@link plainText} remains for plain-text consumers (table cells).
 */

/** The nine Plotly `textposition` values; `middle center` is the default. */
export const TEXT_POSITIONS: readonly string[] = [
  'top left',
  'top center',
  'top right',
  'middle left',
  'middle center',
  'middle right',
  'bottom left',
  'bottom center',
  'bottom right',
];

/**
 * Plotly's `LINE_SPACING`: line advance as a multiple of the font size. Set it as the labels'
 * `lineHeight` so multi-line spacing matches the offsets computed by {@link textPlacement}.
 */
export const TEXT_LINE_HEIGHT = 1.3;

/** Anchor and offset of one label, ready to spread into a render `TextLabel`/`TextStyle`. */
export interface TextPlacement {
  anchorX: 'left' | 'center' | 'right';
  /** Always the baseline of the first line: Plotly positions SVG text by its first baseline. */
  anchorY: 'baseline';
  /** `[dx, dy]` in screen px from the point, +y down. */
  offset: [number, number];
}

// Plotly's TEXTOFFSETSIGN: horizontal keys are SVG text-anchor values, vertical ones +y down.
const SIGN_H = { start: 1, end: -1, middle: 0 } as const;
const SIGN_V = { top: -1, bottom: 1, middle: 0 } as const;
const ANCHOR_X = { start: 'left', end: 'right', middle: 'center' } as const;

/**
 * Place a point's text label like Plotly's `Drawing.textPointPosition`.
 *
 * `left` puts the text to the LEFT of the point (its right edge at the anchor), `top` above it,
 * clearing the marker by `markerRadius / 0.8 + 1` px.
 *
 * @param position - A `textposition` value; matched by substring, unknown words mean `middle`.
 * @param fontSize - Font size in px.
 * @param markerRadius - Marker radius in px, or 0 when markers are not drawn.
 * @param lineCount - Number of text lines (see {@link lineCount}).
 */
export function textPlacement(
  position: string,
  fontSize: number,
  markerRadius: number,
  lineCount: number,
): TextPlacement {
  const v = position.includes('top') ? 'top' : position.includes('bottom') ? 'bottom' : 'middle';
  const h = position.includes('left') ? 'end' : position.includes('right') ? 'start' : 'middle';
  // Plotly tests truthiness; `> 0` also keeps NaN (and nonsense negatives) out.
  const r = markerRadius > 0 ? markerRadius / 0.8 + 1 : 0;
  const numLines = (Math.max(1, lineCount) - 1) * TEXT_LINE_HEIGHT + 1;
  const sv = SIGN_V[v];
  const dx = SIGN_H[h] * r;
  // 0.75·fontSize approximates the cap height, so `middle` centers one line on the point;
  // `top` lifts the whole block above it, `bottom` drops the first baseline below it.
  const dy = fontSize * 0.75 + sv * r + ((sv - 1) * numLines * fontSize) / 2;
  // `+ 0` turns -0 (sign 0 × r, or top-left) into 0 for callers comparing offsets.
  return { anchorX: ANCHOR_X[h], anchorY: 'baseline', offset: [dx + 0, dy + 0] };
}

const NEWLINES = /\r\n?|\n/g;
const BR_TAG = /<br(?:\s[^<>]*)?\/?>/gi;
// Only things that look like tags, so a literal `a < b > c` survives.
const TAG = /<\/?[a-z][^<>]*>/gi;
const ENTITY = /&(?:(amp|lt|gt|quot|nbsp)|#(\d+)|#x([\da-f]+));/gi;
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  nbsp: ' ',
};

/**
 * Reduce Plotly pseudo-HTML to plain text for the SDF text primitive: `<br>` (any case, `<br/>`,
 * `<br />`) becomes '\n', other tags are stripped and the entities `&amp; &lt; &gt; &quot;
 * &nbsp;` and numeric ones (`&#39;`, `&#x27;`) are decoded.
 *
 * Raw newlines become spaces first, as in Plotly's SVG text, where only `<br>` breaks lines.
 */
export function plainText(s: string): string {
  if (!/[<&\r\n]/.test(s)) return s;
  return (
    s
      .replace(NEWLINES, ' ')
      .replace(BR_TAG, '\n')
      .replace(TAG, '')
      // One pass, so `&amp;lt;` decodes to `&lt;` and not `<`.
      .replace(ENTITY, decodeEntity)
  );
}

function decodeEntity(match: string, name?: string, dec?: string, hex?: string): string {
  if (name !== undefined) return NAMED_ENTITIES[name.toLowerCase()] ?? match;
  const code = dec !== undefined ? Number(dec) : parseInt(hex ?? '', 16);
  return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
}

/** Lines in a {@link plainText} result: the number of '\n' plus one. */
export function lineCount(s: string): number {
  let n = 1;
  for (let i = s.indexOf('\n'); i >= 0; i = s.indexOf('\n', i + 1)) n++;
  return n;
}
