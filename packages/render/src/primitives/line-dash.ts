/**
 * Dash pattern resolution for the line primitive (plan E2.5), following Plotly's `line.dash`
 * semantics so imported figures look the same.
 */

/** Named Plotly dash styles. */
export type NamedLineDash = 'solid' | 'dot' | 'dash' | 'longdash' | 'dashdot' | 'longdashdot';

/**
 * A dash specification: a named style, a Plotly/SVG dash-array string (`'5px,10px,2px'`,
 * `'5,10'`, `'2%,1%'`), or an explicit list of on/off lengths in CSS px.
 */
export type LineDash = NamedLineDash | (string & {}) | readonly number[];

/** Maximum number of on/off entries the shader supports (after odd-length doubling). */
export const MAX_DASH_ENTRIES = 16;

/**
 * Resolve a dash spec to on/off lengths in CSS px. Returns an empty array for a solid line.
 *
 * - Named styles scale with the line width exactly like Plotly (`Drawing.dashStyle`), using
 *   `max(width, 3)` so thin lines still get visible dashes.
 * - Custom lists follow SVG `stroke-dasharray`: unitless or `px` values are CSS px; percentages are
 *   relative to the normalized viewport diagonal `sqrt((w² + h²) / 2)`; an odd-length list is
 *   repeated to make it even; a negative value, a non-numeric token, or an all-zero list yields a
 *   solid line.
 * - Lists longer than {@link MAX_DASH_ENTRIES} are truncated to an even prefix.
 */
export function resolveDashPattern(
  dash: LineDash | undefined,
  lineWidth: number,
  viewport: { width: number; height: number } = { width: 0, height: 0 },
): number[] {
  if (dash === undefined || dash === 'solid' || dash === '') return [];
  const dlw = Math.max(Number.isFinite(lineWidth) ? lineWidth : 0, 3);
  let values: number[];
  switch (dash) {
    case 'dot':
      values = [dlw, dlw];
      break;
    case 'dash':
      values = [3 * dlw, 3 * dlw];
      break;
    case 'longdash':
      values = [5 * dlw, 5 * dlw];
      break;
    case 'dashdot':
      values = [3 * dlw, dlw, dlw, dlw];
      break;
    case 'longdashdot':
      values = [5 * dlw, 2 * dlw, dlw, 2 * dlw];
      break;
    default: {
      const parsed = typeof dash === 'string' ? parseDashList(dash, viewport) : [...dash];
      if (!parsed) return [];
      values = parsed;
    }
  }
  if (values.some((v) => !Number.isFinite(v) || v < 0)) return [];
  if (values.length % 2 === 1) values = values.concat(values);
  if (values.length > MAX_DASH_ENTRIES) values = values.slice(0, MAX_DASH_ENTRIES);
  if (!values.some((v) => v > 0)) return [];
  return values;
}

function parseDashList(
  text: string,
  viewport: { width: number; height: number },
): number[] | undefined {
  const tokens = text.trim().split(/[\s,]+/);
  const diag = Math.sqrt((viewport.width ** 2 + viewport.height ** 2) / 2);
  const out: number[] = [];
  for (const token of tokens) {
    const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px|%)?$/i.exec(token);
    if (!m) return undefined;
    const v = Number(m[1]);
    out.push(m[2] === '%' ? (v / 100) * diag : v);
  }
  return out;
}

/** True when the dash spec depends on the viewport size (percentage entries). */
export function dashDependsOnViewport(dash: LineDash | undefined): boolean {
  return typeof dash === 'string' && dash.includes('%');
}

/** Sum of a resolved pattern (the period of the dash phase). */
export function dashPeriod(pattern: readonly number[]): number {
  let total = 0;
  for (const v of pattern) total += v;
  return total;
}

/**
 * Signed distance (in pattern units) from `along` to the nearest "on" interval of the repeating
 * pattern — negative inside a dash. CPU mirror of `hcDashDistance` in `line.glsl.ts`.
 */
export function dashDistance(along: number, pattern: readonly number[]): number {
  const total = dashPeriod(pattern);
  if (pattern.length === 0 || total <= 0) return -Infinity;
  const m = along - Math.floor(along / total) * total;
  let best = Infinity;
  let start = 0;
  for (let i = 0; i + 1 < pattern.length; i += 2) {
    const a = start;
    const b = start + pattern[i]!;
    for (const x of [m, m - total, m + total]) best = Math.min(best, Math.max(a - x, x - b));
    start = b + pattern[i + 1]!;
  }
  return best;
}
