/**
 * Compile-time specialization of the marker shaders. A marker set whose items all share one symbol
 * code (most traces), no rotation, or no stroke gets `#define`s that let the GLSL compiler drop the
 * symbol-table fetches, the generic shape branching, the rotation math, and the stroke math. Mixed
 * sets fall back to the generic program; the rendered pixels are the same either way.
 *
 * The summary is maintained incrementally from the packed `aStyle` array (lineWidth, symbol,
 * opacity, angle per item) so a `patch()` only scans the patched range.
 */
import { MARKER_SYMBOLS, SYMBOL_COUNT, symbolLayout, type SymbolLayoutEntry } from './symbols.ts';

/** What the items of a marker set have in common, as far as the shaders care. */
export interface StyleSummary {
  /** The single symbol code (base + 100 × variant) shared by every item, or `null` when mixed. */
  symbol: number | null;
  /** Some item has a non-zero angle. */
  anyAngle: boolean;
  /** Some item has a positive line width. */
  anyStroke: boolean;
  /** Some item uses an `-open` / `-open-dot` variant (those always draw a stroke). */
  anyOpen: boolean;
}

/** Normalize a code the way the vertex shader does: unknown bases or variants fall back to 0. */
export function normalizeSymbolCode(code: number): number {
  const c = Math.round(code);
  const base = c % 100;
  const variant = Math.floor(c / 100);
  return base < 0 || base >= SYMBOL_COUNT || variant > 3 || variant < 0 ? 0 : c;
}

/** Summarize items `[start, end)` of a packed style array (4 floats per item). */
export function summarizeStyle(style: ArrayLike<number>, start: number, end: number): StyleSummary {
  let symbol: number | null = null;
  let mixed = false;
  let anyAngle = false;
  let anyStroke = false;
  let anyOpen = false;
  for (let i = start; i < end; i++) {
    const k = i * 4;
    const code = normalizeSymbolCode(style[k + 1]!);
    if (symbol === null && !mixed) symbol = code;
    else if (code !== symbol) mixed = true;
    if (style[k]! > 0) anyStroke = true;
    if (style[k + 3]! !== 0) anyAngle = true;
    const variant = Math.floor(code / 100);
    if (variant === 1 || variant === 3) anyOpen = true;
  }
  return { symbol: mixed ? null : symbol, anyAngle, anyStroke, anyOpen };
}

/**
 * Combine the summary of the existing items with that of a freshly written range. Conservative: a
 * set that became mixed stays mixed until a full rewrite, even if a patch overwrote every odd item
 * (that only costs speed, never correctness).
 */
export function mergeStyleSummary(prev: StyleSummary, range: StyleSummary): StyleSummary {
  return {
    symbol: prev.symbol !== null && prev.symbol === range.symbol ? prev.symbol : null,
    anyAngle: prev.anyAngle || range.anyAngle,
    anyStroke: prev.anyStroke || range.anyStroke,
    anyOpen: prev.anyOpen || range.anyOpen,
  };
}

let layoutCache: SymbolLayoutEntry[] | undefined;

function glslFloat(v: number): string {
  const s = String(v);
  return /[.eE]/.test(s) ? s : `${s}.0`;
}

/**
 * Shader defines for a summary. `MARKER_SYMBOL` bakes the symbol's layout (the same texel indices
 * the generic path reads from the symbol table); `NO_ROTATION` / `NO_STROKE` drop math that would
 * evaluate to the identity / zero coverage for every item.
 */
export function markerDefines(summary: StyleSummary): Record<string, string> {
  const defines: Record<string, string> = {};
  if (summary.symbol !== null) {
    layoutCache ??= symbolLayout(MARKER_SYMBOLS).entries;
    const base = summary.symbol % 100;
    const e = layoutCache[base]!;
    Object.assign(defines, {
      MARKER_SYMBOL: String(summary.symbol),
      SYM_VARIANT: String(Math.floor(summary.symbol / 100)),
      SYM_AREA: String(e.areaKind),
      SYM_EXTENT: glslFloat(e.extent),
      SYM_NO_DOT: String(+e.noDot),
      SYM_NO_FILL: String(+e.noFill),
      SYM_POLY_START: String(e.polyStart),
      SYM_POLY_COUNT: String(e.polyCount),
      SYM_SEG_START: String(e.segStart),
      SYM_SEG_COUNT: String(e.segCount),
    });
  }
  if (!summary.anyAngle) defines.NO_ROTATION = '';
  // Open variants force a 1 px stroke even at lineWidth 0, so they keep the stroke math.
  if (!summary.anyStroke && !summary.anyOpen) defines.NO_STROKE = '';
  return defines;
}

/** Names of every define this module may set (so callers can clear stale ones). */
export const SPECIALIZATION_DEFINES = [
  'MARKER_SYMBOL',
  'SYM_VARIANT',
  'SYM_AREA',
  'SYM_EXTENT',
  'SYM_NO_DOT',
  'SYM_NO_FILL',
  'SYM_POLY_START',
  'SYM_POLY_COUNT',
  'SYM_SEG_START',
  'SYM_SEG_COUNT',
  'NO_ROTATION',
  'NO_STROKE',
] as const;
