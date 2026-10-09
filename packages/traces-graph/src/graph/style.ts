/**
 * `graph` styles in render-layer terms (backlog G1, ADR-029): the defaulted trace → sRGB 0–1
 * colors, px sizes and opacities for the marker, rect, line and text primitives, and the CSS
 * colors hover labels and the legend use. Pure (no GPU objects).
 *
 * Node colors, in this order: numbers through the colorscale (`node.color` with the colorscale
 * attributes, as scatter's `marker.color`); CSS colors as given; else the color of the node's
 * group (the colorway, one color per group in order of first appearance); else the trace's
 * colorway color. A selection dims the nodes outside it, and the links that do not join two
 * selected nodes. A highlight (`highlight.ts`: a hover, a path) takes the place of that dimming
 * while it lasts: what it emphasizes keeps its look, its links opaque or in `highlight.color`,
 * and everything else is dimmed by `highlight.dim`.
 */
import {
  isArrayLike,
  toRGBA,
  toRGBAArray,
  type FullLayout,
  type FullTrace,
  type RGBAColor,
} from '@mk7s/holochart-core';
import type { ColorInput, LineData, MarkerData, ScalarInput } from '@mk7s/holochart-render';
import { mapColor, resolveColorMapping, rgbaToCss } from '@mk7s/holochart-traces-basic';
import type { GraphCalc, GraphModelCalc } from './calc.ts';
import { luminance } from './defaults.ts';
import type { LinkGeometry } from './geometry.ts';
import type { Emphasis } from './highlight.ts';
import type { GraphModel } from './model.ts';

type Container = Readonly<Record<string, unknown>>;

/** Opacity factor of what a selection leaves out (Plotly's `DESELECTDIM`). */
export const DESELECT_DIM = 0.2;
/** The color of a node without a group in a graph that has groups. */
const UNGROUPED: RGBAColor = [0.6, 0.6, 0.6, 1];
const FALLBACK: RGBAColor = [0.4, 0.4, 0.4, 1];

export function part(trace: Container, key: string): Container {
  const v = trace[key];
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Container) : {};
}

function arrayOf(v: unknown): ArrayLike<unknown> | undefined {
  return isArrayLike(v) && typeof v !== 'string' ? (v as ArrayLike<unknown>) : undefined;
}

/** The trace `opacity` (multiplies everything the trace draws). */
export function traceOpacity(trace: FullTrace): number {
  return typeof trace['opacity'] === 'number' ? trace['opacity'] : 1;
}

function colorway(fullLayout: FullLayout | undefined): readonly string[] {
  const way = fullLayout?.['colorway'];
  return Array.isArray(way) && way.length > 0 ? (way as string[]) : ['#636efa'];
}

/** The CSS color of every group, by group index. */
export function groupColors(model: GraphModel, fullLayout: FullLayout | undefined): string[] {
  const way = colorway(fullLayout);
  return model.groupNames.map((_, g) => way[g % way.length]!);
}

/** A per-item value: the one value for all, or the entry of an array (the default when missing). */
function numberAt(v: unknown, i: number, dflt: number): number {
  const values = arrayOf(v);
  const one = values ? values[i] : v;
  return typeof one === 'number' && Number.isFinite(one) ? one : dflt;
}

/**
 * The fill color of every node on the CPU: one color when all nodes share it, else 4 floats per
 * node. Numeric colors are mapped through the colorscale here (see {@link nodeMarkerStyle} for
 * the GPU path of markers).
 */
export function nodeFillColors(
  calc: GraphModelCalc,
  trace: FullTrace,
  fullLayout: FullLayout | undefined,
): ColorInput {
  const { model } = calc;
  const n = model.nodes;
  const node = part(trace, 'node');
  const given = node['color'];
  const mapping = resolveColorMapping(node, fullLayout);
  const values = arrayOf(given);
  if (mapping && values) {
    const out = new Float32Array(4 * n);
    for (let i = 0; i < n; i++) {
      const v = values[i];
      const literal = typeof v === 'string' ? toRGBA(v) : null;
      out.set(literal ?? mapColor(typeof v === 'number' ? v : NaN, mapping), 4 * i);
    }
    return out;
  }
  if (typeof given === 'string') return toRGBA(given) ?? FALLBACK;
  if (values) {
    const colors = toRGBAArray(values, FALLBACK);
    if (colors.length >= 4 * n) return colors;
    // A short array leaves the last nodes in the fallback color.
    const out = new Float32Array(4 * n);
    for (let i = 0; i < n; i++) out.set(FALLBACK, 4 * i);
    out.set(colors);
    return out;
  }
  if (model.groupNames.length === 0) return FALLBACK;
  const palette = groupColors(model, fullLayout).map((c) => toRGBA(c) ?? FALLBACK);
  const out = new Float32Array(4 * n);
  for (let i = 0; i < n; i++) out.set(palette[model.group[i]!] ?? UNGROUPED, 4 * i);
  return out;
}

function colorAt(colors: ColorInput, i: number): RGBAColor {
  if (!(colors instanceof Float32Array)) return colors;
  return [colors[4 * i]!, colors[4 * i + 1]!, colors[4 * i + 2]!, colors[4 * i + 3]!];
}

/** CSS color of node `i`, for hover labels (cheap: one node, no arrays). */
export function nodeCss(
  calc: GraphModelCalc,
  trace: FullTrace,
  fullLayout: FullLayout | undefined,
  i: number,
): string {
  const node = part(trace, 'node');
  const given = node['color'];
  const values = arrayOf(given);
  if (values) {
    const v = values[i];
    if (typeof v === 'string' && toRGBA(v)) return v;
    const mapping = resolveColorMapping(node, fullLayout);
    if (mapping) return rgbaToCss(mapColor(typeof v === 'number' ? v : NaN, mapping));
    return rgbaToCss(FALLBACK);
  }
  if (typeof given === 'string') return given;
  const g = calc.model.group[i] ?? -1;
  if (calc.model.groupNames.length === 0) return rgbaToCss(FALLBACK);
  const way = colorway(fullLayout);
  return g >= 0 ? way[g % way.length]! : rgbaToCss(UNGROUPED);
}

/** A 0/1 flag per node from a selection, or `undefined` when nothing is selected. */
export function selectionMask(
  nodes: number,
  selectedPoints: readonly number[] | null | undefined,
): Uint8Array | undefined {
  if (!selectedPoints) return undefined;
  const mask = new Uint8Array(nodes);
  for (const i of selectedPoints) if (i >= 0 && i < nodes) mask[i] = 1;
  return mask;
}

/**
 * Node opacities: `node.opacity` × the trace opacity, with the selection's styles applied, and
 * times `fade` (how much of each node shows while a tree folds or unfolds). With an `emphasis`
 * the nodes outside it are dimmed by its factor instead of by the selection.
 */
export function nodeOpacities(
  trace: FullTrace,
  nodes: number,
  selected: Uint8Array | undefined,
  fade?: Float32Array,
  emphasis?: Emphasis,
): ScalarInput {
  const node = part(trace, 'node');
  const base = traceOpacity(trace);
  const given = node['opacity'];
  if (!selected && !fade && !emphasis && !arrayOf(given)) return numberAt(given, 0, 1) * base;
  const sel = part(part(trace, 'selected'), 'node')['opacity'];
  const unsel = part(part(trace, 'unselected'), 'node')['opacity'];
  const out = new Float32Array(nodes);
  for (let i = 0; i < nodes; i++) {
    const own = numberAt(given, i, 1) * base;
    const picked = selected?.[i] === 1 && typeof sel === 'number' ? sel * base : own;
    if (emphasis) out[i] = emphasis.node[i] === 1 ? picked : own * emphasis.dim;
    else if (!selected) out[i] = own;
    else if (selected[i] === 1) out[i] = picked;
    else out[i] = typeof unsel === 'number' ? unsel * base : own * DESELECT_DIM;
    if (fade) out[i] = out[i]! * fade[i]!;
  }
  return out;
}

/** `selected.node.color` / `unselected.node.color` painted over `colors`, when either is set. */
function selectionColors(
  trace: FullTrace,
  colors: ColorInput,
  nodes: number,
  selected: Uint8Array | undefined,
): ColorInput {
  if (!selected) return colors;
  const sel = part(part(trace, 'selected'), 'node')['color'];
  const unsel = part(part(trace, 'unselected'), 'node')['color'];
  const s = typeof sel === 'string' ? toRGBA(sel) : null;
  const u = typeof unsel === 'string' ? toRGBA(unsel) : null;
  if (!s && !u) return colors;
  const out = new Float32Array(4 * nodes);
  for (let i = 0; i < nodes; i++) {
    out.set((selected[i] === 1 ? s : u) ?? colorAt(colors, i), 4 * i);
  }
  return out;
}

function outlineColors(trace: FullTrace): ColorInput {
  const color = part(part(trace, 'node'), 'line')['color'];
  if (typeof color === 'string') return toRGBA(color) ?? [1, 1, 1, 1];
  const values = arrayOf(color);
  return values ? toRGBAArray(values, [1, 1, 1, 1]) : [1, 1, 1, 1];
}

function outlineWidths(trace: FullTrace, nodes: number): ScalarInput {
  const width = part(part(trace, 'node'), 'line')['width'];
  const values = arrayOf(width);
  if (!values) return numberAt(width, 0, 1);
  const out = new Float32Array(nodes);
  for (let i = 0; i < nodes; i++) out[i] = Math.max(0, numberAt(values, i, 0));
  return out;
}

/**
 * The style of the node markers (everything of `MarkerData` but the positions). Numeric colors
 * go through the marker primitive's colorscale texture, unless CSS colors are mixed in or a
 * selection recolors nodes, which are resolved per node on the CPU.
 */
export function nodeMarkerStyle(
  calc: GraphModelCalc,
  trace: FullTrace,
  fullLayout: FullLayout | undefined,
  selectedPoints?: readonly number[] | null,
  fade?: Float32Array,
  emphasis?: Emphasis,
): Partial<MarkerData> {
  const { model } = calc;
  const n = model.nodes;
  const node = part(trace, 'node');
  const selected = selectionMask(n, selectedPoints);
  const symbol = node['symbol'];
  const style: Partial<MarkerData> = {
    size: model.size,
    symbol:
      typeof symbol === 'string' || typeof symbol === 'number'
        ? symbol
        : ((arrayOf(symbol) as ArrayLike<number | string> | undefined) ?? 0),
    opacity: nodeOpacities(trace, n, selected, fade, emphasis),
    lineColor: outlineColors(trace),
    lineWidth: outlineWidths(trace, n),
  };
  const mapping = resolveColorMapping(node, fullLayout);
  const values = arrayOf(node['color']);
  const recolored =
    selected !== undefined &&
    (typeof part(part(trace, 'selected'), 'node')['color'] === 'string' ||
      typeof part(part(trace, 'unselected'), 'node')['color'] === 'string');
  let numeric = mapping !== undefined && values !== undefined && !recolored;
  if (numeric) {
    for (let i = 0; i < values!.length; i++) {
      if (typeof values![i] === 'string') {
        numeric = false;
        break;
      }
    }
  }
  if (numeric) {
    const colorValues = new Float64Array(n).fill(NaN);
    for (let i = 0; i < Math.min(n, values!.length); i++) {
      const v = values![i];
      if (typeof v === 'number') colorValues[i] = v;
    }
    return {
      ...style,
      color: FALLBACK,
      colorValues,
      colorscale: mapping!.colorscale,
      cmin: mapping!.cmin,
      cmax: mapping!.cmax,
      cmid: null,
      reversescale: mapping!.reversescale,
    };
  }
  return {
    ...style,
    color: selectionColors(trace, nodeFillColors(calc, trace, fullLayout), n, selected),
    colorValues: null,
    colorscale: null,
  };
}

/**
 * The style of box nodes for the rect primitive. `framed`: 1 for the boxes that get a frame in
 * the figure's text color (pinned nodes); the collapsed nodes of a tree get one too.
 */
export function nodeBoxStyle(
  calc: GraphCalc,
  trace: FullTrace,
  fullLayout: FullLayout | undefined,
  selectedPoints?: readonly number[] | null,
  fade?: Float32Array,
  emphasis?: Emphasis,
  framed?: Uint8Array,
): { fill: ColorInput; borderColor: ColorInput; borderWidth: ScalarInput; fills: ColorInput } {
  const n = calc.model.nodes;
  const selected = selectionMask(n, selectedPoints);
  const fills = selectionColors(trace, nodeFillColors(calc, trace, fullLayout), n, selected);
  const opacity = nodeOpacities(trace, n, selected, fade, emphasis);
  let outline = outlineColors(trace);
  let widths = outlineWidths(trace, n);
  const collapsed = framed ?? calc.tree?.collapsed;
  if (collapsed?.includes(1)) {
    // A collapsed box has a frame in the text color of the figure: it holds something.
    const ring = ringColor(fullLayout);
    const colors = new Float32Array(4 * n);
    const each = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const own = typeof widths === 'number' ? widths : widths[i]!;
      const marked = collapsed[i] === 1;
      colors.set(
        marked
          ? ring
          : colorAt(
              outline,
              outline instanceof Float32Array ? Math.min(i, (outline.length >> 2) - 1) : i,
            ),
        4 * i,
      );
      each[i] = marked ? Math.max(RING_WIDTH, own) : own;
    }
    outline = colors;
    widths = each;
  }
  // The rect primitive has one opacity for all: per-node opacities go into the colors' alpha.
  const faded = (colors: ColorInput): ColorInput => {
    if (typeof opacity === 'number' && !(colors instanceof Float32Array)) {
      return [colors[0], colors[1], colors[2], colors[3] * opacity];
    }
    const out = new Float32Array(4 * n);
    for (let i = 0; i < n; i++) {
      const c = colorAt(
        colors,
        colors instanceof Float32Array ? Math.min(i, (colors.length >> 2) - 1) : i,
      );
      const o = typeof opacity === 'number' ? opacity : opacity[i]!;
      out.set([c[0], c[1], c[2], c[3] * o], 4 * i);
    }
    return out;
  };
  return {
    fill: faded(fills),
    borderColor: faded(outline),
    borderWidth: widths,
    fills,
  };
}

/** Width in px of the ring of a collapsed node (the frame of a collapsed box). */
export const RING_WIDTH = 2;

/** The color of the frame of a collapsed box: the figure's text color. */
export function ringColor(fullLayout: FullLayout | undefined): RGBAColor {
  const color = (fullLayout?.font as { color?: unknown } | undefined)?.color;
  return (typeof color === 'string' ? toRGBA(color) : null) ?? [0.27, 0.27, 0.27, 1];
}

/** Black or white, whichever reads better on `fill` (the text of a box node). */
export function contrastColor(fill: RGBAColor): RGBAColor {
  return luminance(fill) > 0.4 ? [0.13, 0.13, 0.13, 1] : [1, 1, 1, 1];
}

export { colorAt };

// ---- Links --------------------------------------------------------------------------------------

/**
 * Link widths in px, one per kept link: `link.width`, or with `link.widthby: 'value'` the value's
 * share of the largest value between the two widths of `link.widthrange`.
 */
export function linkWidths(model: GraphModel, trace: FullTrace): Float32Array {
  const link = part(trace, 'link');
  const out = new Float32Array(model.links);
  if (link['widthby'] === 'value') {
    const range = arrayOf(link['widthrange']);
    const lo = numberAt(range?.[0], 0, 1);
    const hi = numberAt(range?.[1], 0, 8);
    let max = 0;
    for (let k = 0; k < model.links; k++) {
      const v = model.value[k]!;
      if (Number.isFinite(v) && v > max) max = v;
    }
    for (let k = 0; k < model.links; k++) {
      const v = model.value[k]!;
      const share = max > 0 && Number.isFinite(v) && v > 0 ? v / max : 0;
      out[k] = lo + (hi - lo) * share;
    }
    return out;
  }
  const width = link['width'];
  for (let k = 0; k < model.links; k++) {
    out[k] = Math.max(0, numberAt(width, model.linkIndex[k]!, 1));
  }
  return out;
}

/** Whether every entry of `values` is the same (a uniform, instead of a buffer). */
function uniform(values: Float32Array): boolean {
  for (let i = 1; i < values.length; i++) if (values[i] !== values[0]) return false;
  return true;
}

/** Arrowhead lengths in px, one per kept link: `link.arrow.size`, at least 3 × the link width. */
export function arrowSizes(trace: FullTrace, widths: Float32Array): Float32Array {
  const size = numberAt(part(part(trace, 'link'), 'arrow')['size'], 0, 8);
  const out = new Float32Array(widths.length);
  for (let k = 0; k < widths.length; k++) out[k] = Math.max(size, 3 * widths[k]!);
  return out;
}

/** The curvature of every kept link: `link.curve`, else the fan of parallel links. */
export function linkCurves(model: GraphModel, trace: FullTrace): Float32Array {
  const curve = part(trace, 'link')['curve'];
  if (curve === undefined || curve === null) return model.fan;
  const out = new Float32Array(model.links);
  const values = arrayOf(curve);
  for (let k = 0; k < model.links; k++) {
    const v = values ? values[model.linkIndex[k]!] : curve;
    out[k] = typeof v === 'number' && Number.isFinite(v) ? v : model.fan[k]!;
  }
  return out;
}

/** The color of kept link `k` as sRGB RGBA. */
function linkColorAt(
  color: unknown,
  values: ArrayLike<unknown> | undefined,
  index: number,
): RGBAColor {
  const v = values ? values[index] : color;
  return (typeof v === 'string' ? toRGBA(v) : null) ?? FALLBACK;
}

/** CSS color of kept link `k`, for hover labels: its color, opaque. */
export function linkCss(model: GraphModel, trace: FullTrace, k: number): string {
  const color = part(trace, 'link')['color'];
  const c = linkColorAt(color, arrayOf(color), model.linkIndex[k]!);
  return rgbaToCss([c[0], c[1], c[2], 1]);
}

/** The dash of the secondary links (`link.secondary.dash`). */
export function secondaryDash(trace: FullTrace): string {
  const dash = part(part(trace, 'link'), 'secondary')['dash'];
  return typeof dash === 'string' ? dash : 'dash';
}

/**
 * Per-link colors (4 floats each, or one color when all links share it), with in their alpha the
 * selection's dimming, the opacity of the secondary links (`link.secondary`, which may also give
 * them a color of their own) and `fade`: how much of each node shows while a tree folds or
 * unfolds (a link shows as much as the fainter of its two ends). With an `emphasis` its links
 * are opaque (or in its color) and the others dimmed by its factor, in place of the selection's
 * dimming, and by `faint` on top: the factor the level of detail fades all links by when nothing
 * is emphasized (`lod.ts`), which the emphasized links are spared.
 */
export function linkColors(
  calc: GraphModelCalc,
  trace: FullTrace,
  selectedPoints?: readonly number[] | null,
  fade?: Float32Array,
  emphasis?: Emphasis,
  faint = 1,
): ColorInput {
  const { model } = calc;
  const link = part(trace, 'link');
  const color = link['color'];
  const values = arrayOf(color);
  const selected = emphasis ? undefined : selectionMask(model.nodes, selectedPoints);
  const secondary = calc.secondary;
  if (!values && !selected && !secondary && !fade && !emphasis) {
    return linkColorAt(color, undefined, 0);
  }
  const one = values ? undefined : linkColorAt(color, undefined, 0);
  const style = part(link, 'secondary');
  const secondaryColor = typeof style['color'] === 'string' ? toRGBA(style['color']) : null;
  const secondaryOpacity = numberAt(style['opacity'], 0, 0.7);
  const out = new Float32Array(4 * model.links);
  // Written component by component: this runs for every link on every hover that highlights.
  for (let k = 0; k < model.links; k++) {
    const a = model.source[k]!;
    const b = model.target[k]!;
    let c = one ?? linkColorAt(color, values, model.linkIndex[k]!);
    let alpha = 1;
    if (secondary?.[k] === 1) {
      c = secondaryColor ?? c;
      alpha = secondaryOpacity;
    }
    if (selected && !(selected[a] === 1 && selected[b] === 1)) alpha *= DESELECT_DIM;
    let own = c[3];
    if (emphasis?.link[k] === 1) {
      // What a highlight emphasizes is drawn in full, whatever its own alpha.
      c = emphasis.color ?? c;
      own = emphasis.color ? c[3] : 1;
      alpha = 1;
    } else if (emphasis) {
      alpha *= emphasis.dim * faint;
    }
    if (fade) alpha *= Math.min(fade[a]!, fade[b]!);
    const at = 4 * k;
    out[at] = c[0];
    out[at + 1] = c[1];
    out[at + 2] = c[2];
    out[at + 3] = own * alpha;
  }
  return out;
}

/**
 * Per-link colors spread over each link's vertices, as the line primitive takes them (one color
 * as it is, when all links share it).
 */
export function linkVertexColors(geometry: LinkGeometry, colors: ColorInput): ColorInput {
  if (!(colors instanceof Float32Array)) return colors;
  const { offsets } = geometry;
  const links = offsets.length - 1;
  const perVertex = new Float32Array(4 * geometry.x.length);
  for (let k = 0; k < links; k++) {
    const from = 4 * k;
    const r = colors[from]!;
    const g = colors[from + 1]!;
    const b = colors[from + 2]!;
    const a = colors[from + 3]!;
    for (let v = 4 * offsets[k]!, end = 4 * offsets[k + 1]!; v < end; v += 4) {
      perVertex[v] = r;
      perVertex[v + 1] = g;
      perVertex[v + 2] = b;
      perVertex[v + 3] = a;
    }
  }
  return perVertex;
}

/**
 * The style of the links for the line primitive: per-link colors and widths spread over each
 * link's vertices (or one value when all links share it).
 */
export function linkLineStyle(
  trace: FullTrace,
  geometry: LinkGeometry,
  colors: ColorInput,
  widths: Float32Array,
  dash?: string,
): Pick<LineData, 'color' | 'width' | 'dash' | 'opacity' | 'join' | 'cap'> {
  const link = part(trace, 'link');
  const vertices = geometry.x.length;
  const links = geometry.offsets.length - 1;
  const color = linkVertexColors(geometry, colors);
  let width: ScalarInput = widths[0] ?? 1;
  if (!uniform(widths) && vertices > 0) {
    const perVertex = new Float32Array(vertices);
    for (let k = 0; k < links; k++) {
      perVertex.fill(widths[k]!, geometry.offsets[k]!, geometry.offsets[k + 1]!);
    }
    width = perVertex;
  }
  return {
    color,
    width,
    dash: dash ?? (typeof link['dash'] === 'string' ? link['dash'] : 'solid'),
    opacity: numberAt(link['opacity'], 0, 1) * traceOpacity(trace),
    join: 'round',
    cap: 'butt',
  };
}

/** The colors of the arrowheads: their link's color (4 floats per head, or one color). */
export function arrowColors(geometry: LinkGeometry, colors: ColorInput): ColorInput {
  if (!(colors instanceof Float32Array)) return colors;
  const out = new Float32Array(4 * geometry.arrows.count);
  for (let a = 0; a < geometry.arrows.count; a++) {
    const from = 4 * geometry.arrows.link[a]!;
    const to = 4 * a;
    out[to] = colors[from]!;
    out[to + 1] = colors[from + 1]!;
    out[to + 2] = colors[from + 2]!;
    out[to + 3] = colors[from + 3]!;
  }
  return out;
}
