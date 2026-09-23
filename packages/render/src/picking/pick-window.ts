/**
 * Pick-window math for GPU picking (ADR-010): which device pixels around the cursor get rendered,
 * how the camera projection is narrowed onto them, and how read-back pixels map to CSS distances.
 *
 * Inputs are CSS px (pointer events, layout rects); everything the GPU sees is device px. The
 * mapping mirrors what three.js does for the visible frame so the pick pass rasterizes exactly the
 * same pixel centres:
 * - `WebGLRenderer.setSize` makes the canvas `floor(cssSize * dpr)` device px,
 * - `setViewport` / `setScissor` use `round(cssRect * dpr)` in GL's bottom-left origin.
 */
import { Matrix4 } from 'three';
import type { ViewportRect } from '../core/viewport.ts';

/** Largest supported pick radius (CSS px). Bigger requests are clamped. */
export const MAX_PICK_RADIUS = 64;

/**
 * A square window of `size × size` device pixels centred on the pixel under the cursor. Mutable
 * and reused across picks; filled by {@link computePickWindow}.
 */
export interface PickWindow {
  /** Cursor, CSS px from the canvas' top-left. */
  x: number;
  y: number;
  /** Search radius, CSS px (after clamping). */
  radius: number;
  pixelRatio: number;
  /** Window side in device px: `2 * half + 1`. */
  size: number;
  /** Device px from the centre pixel to the window edge: `ceil(radius * dpr)`. */
  half: number;
  /** Device pixel under the cursor: column from the left, row from the top of the canvas. */
  col: number;
  row: number;
  /** Canvas height in device px (`floor(cssHeight * dpr)`). */
  canvasRows: number;
  /** GL viewport in device px (bottom-left origin), as three.js sets it for this view. */
  vx: number;
  vy: number;
  vw: number;
  vh: number;
  /** Visible region in device px, GL bottom-left origin, half-open `[x0, x1) × [y0, y1)`. */
  clipX0: number;
  clipY0: number;
  clipX1: number;
  clipY1: number;
  /** NDC scale and centre of the window: `ndc' = (ndc - centre) * scale`. */
  scaleX: number;
  scaleY: number;
  centerX: number;
  centerY: number;
  /**
   * The window's size in the view's CSS px (`size × renderArea / viewport device size`). Screen-
   * space sized primitives use this as their `uResolution` in the pick pass.
   */
  windowWidth: number;
  windowHeight: number;
}

/** A zeroed {@link PickWindow} to pass to {@link computePickWindow}. */
export function createPickWindow(): PickWindow {
  return {
    x: 0,
    y: 0,
    radius: 0,
    pixelRatio: 1,
    size: 1,
    half: 0,
    col: 0,
    row: 0,
    canvasRows: 1,
    vx: 0,
    vy: 0,
    vw: 1,
    vh: 1,
    clipX0: 0,
    clipY0: 0,
    clipX1: 0,
    clipY1: 0,
    scaleX: 1,
    scaleY: 1,
    centerX: 0,
    centerY: 0,
    windowWidth: 1,
    windowHeight: 1,
  };
}

/** Canvas geometry a pick window is computed against (CSS px). */
export interface PickCanvas {
  width: number;
  height: number;
  pixelRatio: number;
}

/**
 * Convert a CSS rect (top-left origin) to a device-px GL rect (bottom-left origin) the way three.js
 * `setViewport`/`setScissor` do: flip against the CSS canvas height, scale by DPR, round.
 */
export function toDeviceGLRect(
  rect: Readonly<ViewportRect>,
  canvasCssHeight: number,
  pixelRatio: number,
  out: ViewportRect = { x: 0, y: 0, width: 0, height: 0 },
): ViewportRect {
  out.x = Math.round(rect.x * pixelRatio);
  out.y = Math.round((canvasCssHeight - rect.y - rect.height) * pixelRatio);
  out.width = Math.round(rect.width * pixelRatio);
  out.height = Math.round(rect.height * pixelRatio);
  return out;
}

const scratchRect: ViewportRect = { x: 0, y: 0, width: 0, height: 0 };

/**
 * Fill `out` for a pick at CSS `(x, y)` with `radius` CSS px, in a view that renders into
 * `renderArea` (CSS, top-left origin) clipped to `scissor` (or unclipped when null).
 *
 * Returns false (leaving `out` partially written) when the cursor's pixel is not visible in the
 * view, or the view is empty: there is nothing to pick.
 */
export function computePickWindow(
  out: PickWindow,
  x: number,
  y: number,
  radius: number,
  canvas: Readonly<PickCanvas>,
  renderArea: Readonly<ViewportRect>,
  scissor: Readonly<ViewportRect> | null,
): boolean {
  const dpr = canvas.pixelRatio > 0 ? canvas.pixelRatio : 1;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const r = radius > 0 ? Math.min(radius, MAX_PICK_RADIUS) : 0;
  out.x = x;
  out.y = y;
  out.radius = r;
  out.pixelRatio = dpr;
  out.half = Math.ceil(r * dpr);
  out.size = 2 * out.half + 1;
  out.col = Math.floor(x * dpr);
  out.row = Math.floor(y * dpr);
  const cols = Math.floor(canvas.width * dpr);
  const rows = Math.floor(canvas.height * dpr);
  out.canvasRows = rows;

  const vp = toDeviceGLRect(renderArea, canvas.height, dpr, scratchRect);
  out.vx = vp.x;
  out.vy = vp.y;
  out.vw = vp.width;
  out.vh = vp.height;
  if (vp.width <= 0 || vp.height <= 0) return false;

  let x0 = Math.max(0, vp.x);
  let y0 = Math.max(0, vp.y);
  let x1 = Math.min(cols, vp.x + vp.width);
  let y1 = Math.min(rows, vp.y + vp.height);
  if (scissor) {
    const s = toDeviceGLRect(scissor, canvas.height, dpr, scratchRect);
    x0 = Math.max(x0, s.x);
    y0 = Math.max(y0, s.y);
    x1 = Math.min(x1, s.x + s.width);
    y1 = Math.min(y1, s.y + s.height);
  }
  out.clipX0 = x0;
  out.clipY0 = y0;
  out.clipX1 = x1;
  out.clipY1 = y1;

  const glRow = rows - 1 - out.row;
  if (out.col < x0 || out.col >= x1 || glRow < y0 || glRow >= y1) return false;

  // Cursor pixel relative to the GL viewport; the window is centred on that pixel's centre.
  const c = out.col - vp.x;
  const rr = glRow - vp.y;
  out.scaleX = vp.width / out.size;
  out.scaleY = vp.height / out.size;
  out.centerX = (2 * (c + 0.5)) / vp.width - 1;
  out.centerY = (2 * (rr + 0.5)) / vp.height - 1;
  out.windowWidth = (out.size * renderArea.width) / vp.width;
  out.windowHeight = (out.size * renderArea.height) / vp.height;
  return true;
}

const scratchT = new Matrix4();

/**
 * Narrow `projection` onto the pick window: `out = T × projection`, where `T` scales and
 * translates clip-space x/y so the window's device pixels fill NDC [-1, 1]². Depth is untouched,
 * so the pick pass depth-tests exactly like the visible frame. Equivalent to
 * `camera.setViewOffset(vw, vh, …, size, size)` but works for any camera (and camera that already
 * has a view offset) without mutating it. `out` may alias `projection`.
 */
export function pickProjection(
  out: Matrix4,
  projection: Readonly<Matrix4>,
  win: Readonly<PickWindow>,
): Matrix4 {
  const sx = win.scaleX;
  const sy = win.scaleY;
  // Row-major: x' = sx·x − sx·cx·w, y' = sy·y − sy·cy·w (clip space, before the divide).
  scratchT.set(sx, 0, 0, -sx * win.centerX, 0, sy, 0, -sy * win.centerY, 0, 0, 1, 0, 0, 0, 0, 1);
  return out.multiplyMatrices(scratchT, projection as Matrix4);
}

/**
 * Whether window pixel `(i, j)` (column from the left, row from the BOTTOM, as read back) lies in
 * the view's visible region.
 */
export function windowPixelVisible(win: Readonly<PickWindow>, i: number, j: number): boolean {
  const gx = win.col - win.half + i;
  const gy = win.canvasRows - 1 - win.row - win.half + j;
  return gx >= win.clipX0 && gx < win.clipX1 && gy >= win.clipY0 && gy < win.clipY1;
}

/**
 * CSS distance from the cursor to the centre of window pixel `(i, j)` (row from the bottom). The
 * pixel under the cursor is distance 0: whatever is drawn there is under the pointer.
 */
export function windowPixelDistance(win: Readonly<PickWindow>, i: number, j: number): number {
  const h = win.half;
  if (i === h && j === h) return 0;
  const dpr = win.pixelRatio;
  const cx = (win.col - h + i + 0.5) / dpr;
  // Read-back rows grow upwards; canvas rows (and CSS y) grow downwards.
  const cy = (win.row + h - j + 0.5) / dpr;
  return Math.hypot(cx - win.x, cy - win.y);
}
