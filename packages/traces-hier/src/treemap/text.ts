/**
 * Labels of treemap tiles, icicle cells and path bar segments (plan E13.3, E13.4), ported from
 * plotly.js' `traces/treemap/plot_one.js` (`toMoveInsideSlice`, with bar's `toMoveInsideBar`),
 * `draw_descendants.js` and `draw_ancestors.js`:
 *
 * - **What**: headers (treemap branches above the last level drawn) show their label, when the
 *   header padding on their side is not 0; other tiles and icicle cells show `textinfo` /
 *   `texttemplate` (see `../hierarchy/format.ts`); path bar segments their label on one line.
 * - **Where**: `textposition` (9-way) in the tile, 3 px in from its edges (Plotly's `TEXTPAD`);
 *   headers in their padding band (on top, or at the bottom for the `bottom` positions), path bar
 *   labels on the left.
 * - **Size**: shrunk (never grown) to fit. Unlike Plotly, a label that is too wide first wraps at
 *   spaces when that lets it stay larger (headers and path bar labels keep one line). With
 *   `layout.uniformtext` (E4.6), every label, path bar labels included, is then resized to the
 *   size negotiated across the traces of the type.
 *
 * Pure and in domain px (y down); text sizes come from the render layer's synchronous metrics.
 */
import type { FullLayout, FullTrace, UniformTextItem } from '@mk7s/holochart-core';
import {
  layoutTextRuns,
  scaleTextRuns,
  wrapText,
  wrapTextRuns,
  type TextFont,
} from '@mk7s/holochart-render';
import { labelContent, measureLabel } from '@mk7s/holochart-traces-basic';
import type { HierarchyCalc } from '../hierarchy/calc.ts';
import { nodeContext, nodeText } from '../hierarchy/format.ts';
import {
  LINE_HEIGHT,
  MIN_FONT_SIZE,
  nodeFont,
  uniformFont,
  uniformScales,
  uniformTextPass,
  type UniformTextPass,
} from '../hierarchy/text.ts';
import type { NodeLabel } from '../hierarchy/view.ts';
import { TEXTPAD } from './defaults.ts';
import { numberIn, type RectGeometry, type Segment, type Tile } from './geometry.ts';

type Content = ReturnType<typeof labelContent>;

/** Where labels go in their tiles: `textposition` as flags. */
export interface TextSpot {
  readonly top: boolean;
  readonly bottom: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

export function textSpot(textposition: unknown): TextSpot {
  const p = typeof textposition === 'string' ? textposition : 'top left';
  return {
    top: p.includes('top'),
    bottom: p.includes('bottom'),
    left: p.includes('left'),
    right: p.includes('right'),
  };
}

/** Header paddings: treemaps' `marker.pad`, icicles' `tiling.pad` on every side. */
export interface Pads {
  readonly t: number;
  readonly l: number;
  readonly r: number;
  readonly b: number;
}

export function padsOf(trace: FullTrace): Pads {
  if (trace.type === 'icicle') {
    const p = numberIn(trace['tiling'], 'pad');
    return { t: p, l: p, r: p, b: p };
  }
  const pad = (trace['marker'] as { pad?: unknown } | undefined)?.pad;
  return {
    t: numberIn(pad, 't'),
    l: numberIn(pad, 'l'),
    r: numberIn(pad, 'r'),
    b: numberIn(pad, 'b'),
  };
}

/** A label placed in a box: its center, scale and line alignment. */
export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/**
 * Plotly's `toMoveInsideSlice` + `toMoveInsideBar` for a `width` × `height` label in the rect
 * `x0`–`x1`, `y0`–`y1` (y down): its center and scale (≤ 1; ≤ 0 when there is no room).
 */
export function placeInRect(
  rect: { x0: number; x1: number; y0: number; y1: number },
  width: number,
  height: number,
  spot: TextSpot,
  opts: {
    readonly header?: boolean;
    readonly onPathbar?: boolean;
    readonly pads?: Pads;
    /** Scale to place at instead of the fit's (`uniformtext` resizing). */
    readonly scale?: number;
  } = {},
): Placement {
  let { x0, x1, y0, y1 } = rect;
  const top = spot.top || (opts.header === true && !spot.bottom);
  const ltr = spot.left || opts.onPathbar ? -1 : spot.right ? 1 : 0;
  const pads = opts.pads;
  if (opts.header && pads) {
    x0 += pads.l - TEXTPAD;
    x1 -= pads.r - TEXTPAD;
    if (x0 >= x1) x0 = x1 = (x0 + x1) / 2;
    if (spot.bottom) {
      const lim = y1 - pads.b;
      if (y0 < lim && lim < y1) y0 = lim;
    } else {
      const lim = y0 + pads.t;
      if (y0 < lim && lim < y1) y1 = lim;
    }
  }
  let lx = Math.abs(x1 - x0);
  let ly = Math.abs(y1 - y0);
  const pad = lx > 2 * TEXTPAD && ly > 2 * TEXTPAD ? TEXTPAD : 0;
  lx -= 2 * pad;
  ly -= 2 * pad;
  const scale = opts.scale ?? Math.min(1, lx / width, ly / height);
  const w = (scale * width) / 2;
  const h = (scale * height) / 2;
  return {
    x: ltr < 0 ? x0 + TEXTPAD + w : ltr > 0 ? x1 - TEXTPAD - w : (x0 + x1) / 2,
    y: top ? y0 + pad + h : spot.bottom ? y1 - pad - h : (y0 + y1) / 2,
    scale,
  };
}

/** `content` word-wrapped to `maxWidth` px. */
function wrapped(content: Content, maxWidth: number): Content {
  if (content.runs) {
    const runs = wrapTextRuns(content.runs, content.font, maxWidth);
    const text = runs.map((line) => line.map((r) => r.text).join('')).join('\n');
    return { ...content, runs, text, lineCount: runs.length };
  }
  const lines = wrapText(content.text, content.font, maxWidth);
  return { ...content, text: lines.join('\n'), lineCount: lines.length };
}

function sizeOf(content: Content): { width: number; height: number } {
  if (!content.runs) return measureLabel(content, LINE_HEIGHT);
  const l = layoutTextRuns(content.runs, { font: content.font, lineHeight: LINE_HEIGHT });
  return { width: l.width, height: l.height };
}

/**
 * The largest scale (up to 1) at which `content`, wrapped to the room `lx` × `ly` px, fits, and
 * the wrapped content; `undefined` when wrapping does not beat `scale`.
 */
export function wrapToFit(
  content: Content,
  lx: number,
  ly: number,
  scale: number,
): { content: Content; width: number; height: number; scale: number } | undefined {
  let best: { content: Content; width: number; height: number; scale: number } | undefined;
  const tryAt = (s: number): boolean => {
    const c = wrapped(content, lx / s);
    const size = sizeOf(c);
    const fit = Math.min(1, lx / size.width, ly / size.height);
    if (fit > (best?.scale ?? scale) + 1e-6) best = { content: c, ...size, scale: fit };
    return fit >= s - 1e-6;
  };
  // Wider wraps mean fewer lines: bisect the scale whose wrap width fits best.
  if (!tryAt(1)) {
    let lo = scale;
    let hi = 1;
    for (let k = 0; k < 6; k++) {
      const mid = (lo + hi) / 2;
      if (tryAt(mid)) lo = mid;
      else hi = mid;
    }
  }
  return best && best.scale > scale * 1.05 ? best : undefined;
}

function labelAt(
  content: Content,
  font: TextFont,
  placed: Placement,
  color: NodeLabel['color'],
  align: NodeLabel['align'],
): NodeLabel | undefined {
  // Quantized so tiny layout changes don't re-typeset labels.
  const size = Math.floor(font.size * Math.min(1, placed.scale) * 4) / 4;
  if (!(size >= MIN_FONT_SIZE)) return undefined;
  return {
    text: content.text,
    x: placed.x,
    y: placed.y,
    font: { ...font, size },
    ...(content.runs ? { runs: scaleTextRuns(content.runs, size / font.size) } : {}),
    color,
    align,
  };
}

/**
 * Place the labels of the tiles and path bar segments of `geometry` (domain px). Tiles without
 * text, or whose label would shrink below 1 px, get none. `pass` applies `layout.uniformtext` (see
 * {@link UniformTextPass}).
 */
export function layoutRectText(
  trace: FullTrace,
  calc: HierarchyCalc,
  geometry: RectGeometry,
  fullLayout: FullLayout,
  pass: UniformTextPass = uniformTextPass(fullLayout),
): NodeLabel[] {
  const hierarchy = calc.hierarchy;
  if (!hierarchy) return [];
  const ctx = nodeContext(hierarchy, geometry.entry, fullLayout);
  const spot = textSpot(trace['textposition']);
  const pads = padsOf(trace);
  const treemap = trace.type === 'treemap';
  const noHeaders = spot.bottom ? !pads.b : !pads.t;
  const align = spot.right ? 'right' : spot.left ? 'left' : 'center';
  const placed: {
    item: Tile | Segment;
    content: Content;
    box: { width: number; height: number };
    opts: { header: boolean; onPathbar: boolean; pads: Pads };
    at: Placement;
    color: NodeLabel['color'];
  }[] = [];
  const fits: UniformTextItem[] = [];

  const add = (item: Tile | Segment, raw: string, onPathbar: boolean, header: boolean): void => {
    if (!raw || !(item.x1 > item.x0 && item.y1 > item.y0)) return;
    const { font, color } = nodeFont(trace, calc.colorscale, item.node, fullLayout, onPathbar);
    let content = labelContent(raw, uniformFont(font, pass));
    if (!content.text) return;
    let box = sizeOf(content);
    if (!(box.width > 0 && box.height > 0)) return;
    const opts = { header, onPathbar, pads };
    let at = placeInRect(item, box.width, box.height, spot, opts);
    if (at.scale < 1 && !header && !onPathbar && /\s/.test(content.text)) {
      const lx = item.x1 - item.x0 - 2 * TEXTPAD;
      const ly = item.y1 - item.y0 - 2 * TEXTPAD;
      // Wrapping helps labels that are short of width, not of height.
      if (lx > 0 && ly / box.height > lx / box.width) {
        const fit = wrapToFit(content, lx, ly, at.scale);
        if (fit) {
          content = fit.content;
          box = fit;
          at = placeInRect(item, box.width, box.height, spot, opts);
        }
      }
    }
    placed.push({ item, content, box, opts, at, color });
    fits.push({ fontSize: content.font.size, scale: Math.min(1, at.scale) });
  };

  for (const tile of geometry.tiles) {
    if (tile.hidden) continue;
    const header = treemap && tile.header;
    const raw = header ? (noHeaders ? '' : tile.node.label) : nodeText(trace, tile.node, ctx);
    add(tile, raw, false, header);
  }
  for (const s of geometry.pathbar) add(s, s.node.label.split('<br>').join(' '), true, false);

  const scales = uniformScales(fits, pass);
  const labels: NodeLabel[] = [];
  placed.forEach(({ item, content, box, opts, at, color }, k) => {
    const scale = scales[k]!;
    const where =
      scale === fits[k]!.scale
        ? at
        : placeInRect(item, box.width, box.height, spot, { ...opts, scale });
    const label = labelAt(content, content.font, where, color, opts.onPathbar ? 'left' : align);
    if (label) labels.push(label);
  });
  return labels;
}
