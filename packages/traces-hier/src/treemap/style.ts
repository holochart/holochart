/**
 * How treemap tiles and icicle cells are drawn (plan E13.3, E13.4), ported from plotly.js'
 * `traces/treemap/style.js` and `traces/icicle/style.js` (`styleOne`):
 *
 * - Fill: the node's color. Treemaps fade it towards the background with `marker.depthfade`
 *   (Plotly's `fadedColor` steps, rounded like tinycolor's); icicles fade leaves with
 *   `leaf.opacity`.
 * - Outline: `marker.line` (centered on the edge, as SVG strokes), none for a treemap root in
 *   `root.color`. A hovered treemap tile or path bar segment gets a 2 px outline contrasting the
 *   paper (Plotly's `_hovered` line).
 * - Pattern: `marker.pattern` per node, on the paper unless it overlays the fill.
 */
import { toRGBA, type FullTrace, type RGBA } from '@mk7s/holochart-core';
import type { HierNode } from '../hierarchy/build.ts';
import { DEFAULT_LINE } from '../hierarchy/colors.ts';
import { nodeAttr } from '../hierarchy/format.ts';
import { isHierarchyRoot, isLeaf, maxDepthOf } from '../hierarchy/levels.ts';
import { contrastColor } from '../hierarchy/text.ts';
import { fadeColor, nodePattern } from '../hierarchy/view.ts';
import type { RectGeometry } from './geometry.ts';

const GREY: RGBA = [0.5, 0.5, 0.5, 1];
const CLEAR: RGBA = [0, 0, 0, 0];

/** How a tile or path bar segment is drawn. */
export interface RectStyle {
  /** Fill, alpha multiplied by `opacity`. */
  readonly fill: RGBA;
  /** Outline color, alpha multiplied by `opacity`. */
  readonly line: RGBA;
  /** Outline width, px. */
  readonly width: number;
  /** `leaf.opacity` for icicle leaves, else 1 (patterns fade with it too). */
  readonly opacity: number;
  /** The node's `marker.pattern` (array attributes cast to it), when it has a shape. */
  readonly pattern: Record<string, unknown> | undefined;
}

type RGB255 = readonly [number, number, number, number];

function rgb255(css: string): RGB255 {
  const c = toRGBA(css) ?? CLEAR;
  return [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255), c[3]];
}

/** Plotly's `Color.combine(front, back)`: `front` over `back` (flattened on white), opaque. */
function combine(front: RGB255, back: RGB255): RGB255 {
  const a = front[3];
  if (a === 1) return front;
  const b = back[3];
  const flat = (k: number): number => (b === 1 ? back[k]! : 255 * (1 - b) + back[k]! * b);
  const mix = (k: number): number => Math.round(flat(k) * (1 - a) + front[k]! * a);
  return [mix(0), mix(1), mix(2), 1];
}

/**
 * `color` faded `n` steps towards `background` (Plotly's treemap `depthfade`): the faded color is
 * the background at 75% over the color, and step `i` lays it at `0.5·i/n` opacity over the result.
 */
export function depthfadeColor(color: string, background: string, n: number): RGBA {
  let fill = rgb255(color);
  if (n > 0) {
    const bg = rgb255(background);
    const faded = combine([bg[0], bg[1], bg[2], 0.75], fill);
    for (let i = 0; i < n; i++) {
      fill = combine([faded[0], faded[1], faded[2], (0.5 * i) / n], fill);
    }
  }
  return [fill[0] / 255, fill[1] / 255, fill[2] / 255, fill[3]];
}

/** How many depthfade steps a treemap node takes (Plotly's `styleOne`). */
export function depthfadeSteps(
  trace: FullTrace,
  node: HierNode,
  depth: number,
  geometry: Pick<RectGeometry, 'entry' | 'layers'>,
): number {
  const mode = (trace['marker'] as { depthfade?: unknown } | undefined)?.depthfade;
  if (mode === true) {
    if (!Number.isFinite(maxDepthOf(trace['maxdepth']))) return node.height + 1;
    return isLeaf(node) ? 0 : geometry.layers - depth;
  }
  if (mode === 'reversed') return depth + (isHierarchyRoot(geometry.entry) ? 0 : 1);
  return 0;
}

/**
 * The style of each node of `nodes` (tiles with their depth below the entry, or path bar
 * segments with `onPathbar`), for a `treemap` or `icicle` trace.
 */
export function rectStyles(
  trace: FullTrace,
  nodes: readonly { readonly node: HierNode; readonly depth?: number }[],
  geometry: Pick<RectGeometry, 'entry' | 'layers'>,
  paper: unknown,
  options: { readonly colorscale: boolean; readonly onPathbar?: boolean },
): RectStyle[] {
  const treemap = trace.type === 'treemap';
  const marker = (trace['marker'] ?? {}) as {
    line?: { color?: unknown; width?: unknown };
    pattern?: unknown;
  };
  const rootColor = toRGBA((trace['root'] as { color?: unknown } | undefined)?.color as string);
  const leafOpacity = (trace['leaf'] as { opacity?: unknown } | undefined)?.opacity;
  const background = typeof paper === 'string' ? paper : '#fff';
  // Nodes share few colors: parse (and fade) each color once.
  const parsed = new Map<string, { rgba: RGBA | null; faded: RGBA[] }>();
  const parse = (css: string) => {
    let p = parsed.get(css);
    if (!p) parsed.set(css, (p = { rgba: toRGBA(css), faded: [] }));
    return p;
  };
  return nodes.map(({ node, depth = 0 }) => {
    const i = node.i;
    const color = parse(node.color).rgba;
    const pattern = nodePattern(marker.pattern, i, paper);
    if (
      treemap &&
      isHierarchyRoot(node) &&
      color &&
      rootColor &&
      color.every((v, k) => Math.abs(v - rootColor[k]!) < 1e-6)
    ) {
      return { fill: color, line: CLEAR, width: 0, opacity: 1, pattern };
    }
    const lineColor = nodeAttr(marker.line?.color, i);
    const line =
      (typeof lineColor === 'string' ? parse(lineColor).rgba : null) ?? parse(DEFAULT_LINE).rgba!;
    const width = Math.max(0, Number(nodeAttr(marker.line?.width, i)) || 0);
    if (treemap) {
      const steps =
        options.colorscale || options.onPathbar ? 0 : depthfadeSteps(trace, node, depth, geometry);
      const faded = parse(node.color).faded;
      const fill =
        steps > 0
          ? (faded[steps] ??= depthfadeColor(node.color, background, steps))
          : (color ?? GREY);
      return { fill, line, width, opacity: 1, pattern };
    }
    const opacity = isLeaf(node) && typeof leafOpacity === 'number' ? leafOpacity : 1;
    return {
      fill: fadeColor(color ?? GREY, opacity),
      line: fadeColor(line, opacity),
      width,
      opacity,
      pattern,
    };
  });
}

/** The style of a hovered treemap tile or segment: a 2 px outline contrasting the paper. */
export function hoveredStyle(style: RectStyle, paper: unknown): RectStyle {
  return { ...style, line: contrastColor(typeof paper === 'string' ? paper : '#fff'), width: 2 };
}
