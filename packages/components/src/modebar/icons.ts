/**
 * Modebar icons (plan E5.8): plain data, so the button-set resolution stays DOM-free and custom
 * buttons can reuse the built-in glyphs (`icon: modebarIcons.home`).
 *
 * The built-in glyphs are original 24×24 path drawings (not Plotly's paths). Each path is drawn
 * with `fill-rule="evenodd"` so rings and cut-outs are expressed within one path, and separate
 * paths simply overlap.
 */

/**
 * An icon for a modebar button, in one of three forms:
 *
 * - `{ paths, viewBox? }` — filled SVG paths (the built-in form, viewBox default `0 0 24 24`);
 * - `{ path, width?, height?, transform? }` — Plotly's custom-icon form (viewBox
 *   `0 0 width height`, default 1000 × 1000, optional `transform` on the path);
 * - `{ svg }` — a complete SVG string. It is inserted as markup, so it must be trusted
 *   (developer-provided config, like the button's `click` function itself).
 */
export type ModebarIcon =
  | { readonly paths: readonly string[]; readonly viewBox?: string }
  | {
      readonly path: string;
      readonly width?: number;
      readonly height?: number;
      readonly transform?: string;
    }
  | { readonly svg: string };

const icon = (...paths: string[]): ModebarIcon => ({ paths });

/** The built-in modebar glyphs, reusable as `icon` of custom buttons. */
export const modebarIcons = {
  /** Camera: download image. */
  camera: icon(
    'M8.5 4 7 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3l-1.5-2h-7zM12 8.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z',
    'M12 10.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  ),
  /** Magnifier: box zoom. */
  magnifier: icon(
    'M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
    'M14.6 16 16 14.6l5.5 5.5-1.4 1.4z',
  ),
  /** Four-way arrows: pan. */
  move: icon(
    'M12 2l3.5 3.5H13V11h5.5V8.5L22 12l-3.5 3.5V13H13v5.5h2.5L12 22l-3.5-3.5H11V13H5.5v2.5L2 12l3.5-3.5V11H11V5.5H8.5z',
  ),
  /** Dashed rectangle: box select. */
  selectBox: icon(
    'M3 3h4v2H5v2H3zM17 3h4v4h-2V5h-2zM3 17h2v2h2v2H3zM19 17h2v4h-4v-2h2zM10 3h4v2h-4zM10 19h4v2h-4zM3 10h2v4H3zM19 10h2v4h-2z',
  ),
  /** Loop with a tail: lasso select. */
  lasso: icon(
    'M12 3a9 6 0 1 1 0 12 9 6 0 1 1 0-12zm0 2a7 4 0 1 0 0 8 7 4 0 1 0 0-8z',
    'M6.3 13.5l1.9.6-1.9 6.6-1.9-.6z',
  ),
  /** Framed plus: zoom in. */
  zoomIn: icon(
    'M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v16h16V4z',
    'M11 6h2v5h5v2h-5v5h-2v-5H6v-2h5z',
  ),
  /** Framed minus: zoom out. */
  zoomOut: icon(
    'M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v16h16V4z',
    'M6 11h12v2H6z',
  ),
  /** Diagonal outward arrows: autoscale. */
  expand: icon('M14 3h7v7l-2.6-2.6-4 4-1.8-1.8 4-4z', 'M10 21H3v-7l2.6 2.6 4-4 1.8 1.8-4 4z'),
  /** House: reset axes. */
  home: icon('M12 3l9 8h-3v9h-4.5v-6h-3v6H6v-9H3z'),
  /** One label: closest-point hover. */
  tooltip: icon('M3 4h18v11h-8l-4 4v-4H3z'),
  /** Two labels: compare-data hover. */
  tooltips: icon('M2 3h13v7H8l-3 3v-3H2z', 'M9 12h13v7h-3v3l-3-3H9z'),
  /** Point with dashed guides: spike lines. */
  spikelines: icon(
    'M16 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
    'M15.2 12h1.6v3h-1.6zM15.2 17h1.6v3h-1.6zM3 7.2h3v1.6H3zM8 7.2h3v1.6H8zM2 21h20v1.5H2z',
  ),
  /** Segment with end handles: draw line. */
  drawLine: icon('M4.4 18.2 18.2 4.4l1.4 1.4L5.8 19.6z', 'M2 17h5v5H2zM17 2h5v5h-5z'),
  /** Zigzag stroke: draw open freeform. */
  drawOpenPath: icon('M2 16.9 7.2 9l5 6.1 4.1-7.2 5.7 5-1.3 1.5-3.9-3.4-4.3 7.5-5.1-6.2-3.7 5.6z'),
  /** Irregular ring: draw closed freeform. */
  drawClosedPath: icon('M4 5l9-2 8 7-5 11-11-3zm2 1.6.6 9.8 8.3 2.2 3.7-8.2-6-5.2z'),
  /** Ring: draw circle. */
  drawCircle: icon('M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 2a7 7 0 1 0 0 14 7 7 0 0 0 0-14z'),
  /** Rectangle outline: draw rectangle. */
  drawRect: icon('M3 5h18v14H3zm2 2v10h14V7z'),
  /** Eraser over a baseline: erase the active shape. */
  eraseShape: icon(
    'M14.5 3 21 9.5 11.5 19H7.3L3 14.7zm-5 5.9-3.7 3.8 3.1 3.1h1.7l2.5-2.5z',
    'M13 19h8v2h-8z',
  ),
  /** Filled dot: the fallback for custom buttons without an icon. */
  dot: icon('M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z'),
} as const satisfies Readonly<Record<string, ModebarIcon>>;

/** Whether `value` is a usable {@link ModebarIcon} (custom icons come from untyped config). */
export function isModebarIcon(value: unknown): value is ModebarIcon {
  if (value === null || typeof value !== 'object') return false;
  const rec = value as Record<string, unknown>;
  if (typeof rec['svg'] === 'string') return true;
  if (typeof rec['path'] === 'string') return true;
  return Array.isArray(rec['paths']) && rec['paths'].every((p) => typeof p === 'string');
}
