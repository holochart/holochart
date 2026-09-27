/**
 * The contour renderer shared by `histogram2dcontour` (plan E10.3) and `contour` (E11.2): per
 * `contours.coloring`,
 *
 * - `fill`: one lazily loaded {@link LazyFillPrimitive} (the fill code is its own chunk, E21.6)
 *   holding the background band and one polygon per level (its region, nonzero rule), painted in
 *   level order in a single draw call;
 * - `heatmap`: the grid as a smoothed {@link HeatmapPrimitive} (`zsmooth: 'best'`), with optional
 *   cell labels;
 * - lines: one {@link LinePrimitive} for every level (`line.width`, `line.dash`), colored per level
 *   for `coloring: 'lines'`;
 * - labels (`contours.showlabels`): one {@link TextPrimitive}, placed along the lines in px with the
 *   lines cut under them.
 *
 * Constraint contours (`contours.type: 'constraint'`) fill their shaded region in `fillcolor` (one
 * polygon) under lines in `line.color`. With a gap mask (`contour` with `connectgaps: false`),
 * every fill polygon also gets the mask's rings and is filled where both overlap
 * (`fillRule: 'intersect'`).
 *
 * Fills, heatmap and unlabelled lines are in data space: zoom and pan set transforms only. Labels
 * (and the line gaps under them) are placed in px, so they are re-placed after a zoom.
 */
import { formatNumber, toRGBA, type FullTrace, type RGBA } from '@mk7s/holochart-core';
import {
  createHeatmapPrimitive,
  createLazyFillPrimitive,
  createTextPrimitive,
  LinePrimitive,
  measureText,
  type DataTransform,
  type FillData,
  type HeatmapData,
  type HeatmapPrimitive,
  type LazyFillPrimitive,
  type LineData,
  type LineDash,
  type TextFont,
  type TextFontStyle,
  type TextFontWeight,
  type TextLabel,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import type {
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import type { ZColorMapping } from '../histogram2d/colorscale.ts';
import { heatmapRenderOrder } from '../histogram2d/plot.ts';
import { autoCellFontSize, cellLabels, type CellText } from '../histogram2d/text.ts';
import {
  clipPolylineByBoxes,
  placeContourLabels,
  type ContourRegion,
  type LabelPath,
  type LabelSize,
} from '../shared/contour.ts';
import type { ContourField } from './field.ts';
import { bandColors, contourMapping, isConstraint, levelLineColors } from './style.ts';

/** One direction of a contour grid: point coordinates and cell edges (linear coordinates). */
export interface ContourAxisGrid {
  /** The grid points (bin centers of histogram2dcontour). */
  readonly centers: ArrayLike<number>;
  /** `n + 1` cell edges around the points (drawn by `coloring: 'heatmap'`). */
  readonly edges: ArrayLike<number>;
}

/** What the contour renderer needs of a calc: the grid and its {@link ContourField}. */
export interface ContourCalc extends ContourField {
  readonly nx: number;
  readonly ny: number;
  readonly x: ContourAxisGrid;
  readonly y: ContourAxisGrid;
  /** Grid values for hover (row-major). */
  readonly z: ArrayLike<number>;
  /** Finite extent of the values. */
  readonly zExtent: readonly [number, number];
  /** Values `coloring: 'heatmap'` draws (default: `zFilled`); NaN cells are transparent. */
  readonly heatmapZ?: ArrayLike<number> | undefined;
  /**
   * Where the data is (`contour` with `connectgaps: false`, Plotly's `clipGaps`): rings in linear
   * coordinates for the nonzero rule. Fills are clipped to it; lines are already clipped.
   */
  readonly mask?: ContourRegion | undefined;
}

/** Hooks of {@link createContourRenderer}. */
export interface ContourRendererOptions<C extends ContourCalc> {
  /** Cell labels of `coloring: 'heatmap'` (`texttemplate`), in data space. */
  cellTexts?(ctx: TracePlotContext<C>, mapping: ZColorMapping): CellText[];
}

/** Draw order within the trace: fills / heatmap, lines, labels. */
const LAYER = { lines: 0.25, text: 0.5 } as const;

/** Label line height (a multiple of the font size). */
const LINE_HEIGHT = 1.2;

type Ctx = TracePlotContext<ContourCalc>;

function numberOr(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

function contoursOf(trace: FullTrace): Record<string, unknown> {
  return (trace['contours'] ?? {}) as Record<string, unknown>;
}

function lineOf(trace: FullTrace): Record<string, unknown> {
  return (trace['line'] ?? {}) as Record<string, unknown>;
}

/**
 * Whether lines are drawn: always, except with `showlines: false` for `coloring: 'fill'` and for
 * shaded constraints (a `=` constraint is its line).
 */
export function showsLines(trace: FullTrace): boolean {
  const c = contoursOf(trace);
  if ((c['coloring'] === 'fill' || isConstraint(trace)) && c['showlines'] === false) return false;
  return numberOr(lineOf(trace)['width'], 0.5) > 0;
}

/** Whether level labels are drawn (`contours.showlabels`, with or without the lines). */
export function showsLabels(trace: FullTrace): boolean {
  return contoursOf(trace)['showlabels'] === true;
}

/** Append the mask's rings to every polygon of a fill (see {@link ContourCalc.mask}). */
function withMask(data: FillData, mask: ContourRegion | undefined): FillData {
  if (!mask || mask.rings.length === 0) return data;
  const polygons = data.polygons ?? new Uint32Array(0);
  const rings = data.rings ?? new Uint32Array(0);
  const nPoly = polygons.length;
  const nv = data.x.length;
  const mv = mask.x.length;
  const x = new Float64Array(nv + nPoly * mv);
  const y = new Float64Array(nv + nPoly * mv);
  const outRings: number[] = [];
  const outPolys = new Uint32Array(nPoly);
  let v = 0;
  for (let p = 0; p < nPoly; p++) {
    const r0 = polygons[p]!;
    const r1 = p + 1 < nPoly ? polygons[p + 1]! : rings.length;
    outPolys[p] = outRings.length;
    const v0 = r0 < rings.length ? rings[r0]! : nv;
    const v1 = r1 < rings.length ? rings[r1]! : nv;
    for (let r = r0; r < r1; r++) outRings.push(rings[r]! - v0 + v);
    for (let k = v0; k < v1; k++) {
      x[v] = data.x[k]!;
      y[v] = data.y[k]!;
      v++;
    }
    for (let r = 0; r < mask.rings.length; r++) outRings.push(mask.rings[r]! + v);
    x.set(mask.x, v);
    y.set(mask.y, v);
    v += mv;
  }
  return {
    ...data,
    x: x.subarray(0, v),
    y: y.subarray(0, v),
    rings: Uint32Array.from(outRings),
    polygons: outPolys,
    fillRule: 'intersect',
  };
}

/** The fill of a constraint contour: its shaded region in `fillcolor`, or undefined. */
export function constraintFillData(calc: ContourCalc, trace: FullTrace): FillData | undefined {
  const region = calc.regions?.[0];
  const color = typeof trace['fillcolor'] === 'string' ? toRGBA(trace['fillcolor']) : null;
  if (!region || region.rings.length === 0 || !color || color[3] === 0) return undefined;
  return withMask(
    {
      x: region.x,
      y: region.y,
      rings: region.rings,
      polygons: Uint32Array.of(0),
      fillRule: 'nonzero',
      color,
      opacity: numberOr(trace['opacity'], 1),
    },
    calc.mask,
  );
}

/** The fill primitive's data: background + one polygon per level, in paint order. */
export function fillData(calc: ContourCalc, mapping: ZColorMapping, opacity: number): FillData {
  const regions = calc.regions ?? [];
  const b = calc.bounds;
  let vertices = 4;
  let ringCount = 1;
  for (const r of regions) {
    vertices += r.x.length;
    ringCount += r.rings.length;
  }
  const x = new Float64Array(vertices);
  const y = new Float64Array(vertices);
  const rings = new Uint32Array(ringCount);
  const polygons = new Uint32Array(regions.length + 1);
  x.set([b.x0, b.x1, b.x1, b.x0]);
  y.set([b.y0, b.y0, b.y1, b.y1]);
  let v = 4;
  let ring = 1;
  regions.forEach((r, k) => {
    polygons[k + 1] = ring;
    for (let q = 0; q < r.rings.length; q++) rings[ring++] = v + r.rings[q]!;
    x.set(r.x, v);
    y.set(r.y, v);
    v += r.x.length;
  });
  // Levels without a region (entirely below) still need a polygon for the color layout: an
  // empty ring list is fine, the primitive skips empty polygons.
  return withMask(
    {
      x,
      y,
      rings,
      polygons,
      fillRule: 'nonzero',
      color: bandColors(calc.levels, mapping),
      opacity,
    },
    calc.mask,
  );
}

/** Level labels' text: `contours.labelformat`, else Plotly's automatic precision. */
export function levelText(level: number, labelformat: unknown): string {
  const format = typeof labelformat === 'string' && labelformat !== '' ? labelformat : undefined;
  return formatNumber(level, format ? { tickformat: format } : {});
}

/** One contour line: its level and linear coordinates. */
interface LinePiece {
  readonly level: number;
  readonly x: ArrayLike<number>;
  readonly y: ArrayLike<number>;
  readonly closed: boolean;
}

function pieces(calc: ContourCalc): LinePiece[] {
  const out: LinePiece[] = [];
  calc.paths.forEach((paths, level) => {
    for (const p of paths) out.push({ level, x: p.x, y: p.y, closed: p.closed });
  });
  return out;
}

/** Concatenate pieces (closed ones re-closed) into line primitive input with per-point colors. */
function lineGeometry(
  list: readonly LinePiece[],
  colors: readonly RGBA[],
  alpha: number,
): Pick<LineData, 'x' | 'y' | 'starts' | 'color'> {
  let n = 0;
  for (const p of list) n += p.x.length + (p.closed ? 1 : 0);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const color = new Float32Array(n * 4);
  const starts: number[] = [];
  let k = 0;
  for (const p of list) {
    if (k > 0) starts.push(k);
    const m = p.x.length;
    const c = colors[p.level] ?? [0, 0, 0, 1];
    for (let q = 0; q < m + (p.closed ? 1 : 0); q++) {
      x[k] = p.x[q % m]!;
      y[k] = p.y[q % m]!;
      color.set([c[0], c[1], c[2], c[3] * alpha], k * 4);
      k++;
    }
  }
  return { x, y, starts, color };
}

function labelFont(trace: FullTrace, ctx: Pick<Ctx, 'fullLayout'>): TextFont {
  const f = (contoursOf(trace)['labelfont'] ?? {}) as Record<string, unknown>;
  const lf = ctx.fullLayout.font;
  return {
    family: typeof f['family'] === 'string' ? f['family'] : lf.family,
    size: numberOr(f['size'], lf.size),
    weight: (f['weight'] ?? lf.weight ?? 'normal') as TextFontWeight,
    style: (f['style'] ?? lf.style ?? 'normal') as TextFontStyle,
  };
}

/**
 * Labels (Plotly's optimizer, in px) and the lines clipped by the label boxes, back in linear
 * coordinates: Plotly places labels on screen, so this reruns after zooming. Labels stay inside
 * the plot ∩ the data extent (`calc.bounds`); every level's lines are clipped by every box.
 */
export function labelLayout(
  calc: ContourCalc,
  trace: FullTrace,
  transform: Readonly<DataTransform>,
  rect: { width: number; height: number },
  colors: readonly RGBA[],
  font: TextFont,
): { labels: TextLabel[]; lines: LinePiece[] } {
  const all = pieces(calc);
  const contours = contoursOf(trace);
  const t = transform;
  const toPxX = (v: number): number => v * t.scaleX + t.offsetX;
  const toPxY = (v: number): number => v * t.scaleY + t.offsetY;
  const px: LabelPath[] = all.map((p) => ({
    x: Float64Array.from(p.x as ArrayLike<number>, toPxX),
    y: Float64Array.from(p.y as ArrayLike<number>, toPxY),
    closed: p.closed,
    level: p.level,
  }));
  const texts = calc.levels.levels.map((l) => levelText(l, contours['labelformat']));
  const sizes = calc.levels.levels.map((_, k): LabelSize => {
    const m = measureText(texts[k]!, font, LINE_HEIGHT);
    return { width: m.width, height: m.height, fontSize: font.size };
  });
  const b = calc.bounds;
  const bounds = [b.x0, b.x1, b.y0, b.y1].every(Number.isFinite)
    ? { x0: toPxX(b.x0), x1: toPxX(b.x1), y0: toPxY(b.y0), y1: toPxY(b.y1) }
    : undefined;
  const placed = placeContourLabels(
    px,
    sizes,
    { x0: 0, y0: 0, x1: rect.width, y1: rect.height },
    { bounds },
  );
  const fixed = (() => {
    const f = contours['labelfont'] as { color?: unknown } | undefined;
    return typeof f?.color === 'string' ? toRGBA(f.color) : undefined;
  })();
  const labels: TextLabel[] = placed.labels.map((l) => ({
    text: texts[l.level]!,
    x: (l.x - t.offsetX) / t.scaleX,
    y: (l.y - t.offsetY) / t.scaleY,
    angle: l.angle,
    anchorX: 'center',
    anchorY: 'middle',
    font,
    color: fixed ?? colors[l.level] ?? [0, 0, 0, 1],
  }));
  if (placed.labels.length === 0) return { labels, lines: all };
  const lines: LinePiece[] = [];
  all.forEach((p, i) => {
    const path = px[i]!;
    const cut = clipPolylineByBoxes(path.x, path.y, path.closed, placed.labels);
    if (cut.length === 1 && cut[0]!.x === path.x) {
      lines.push(p);
      return;
    }
    for (const c of cut) {
      lines.push({
        level: p.level,
        x: Float64Array.from(c.x, (v) => (v - t.offsetX) / t.scaleX),
        y: Float64Array.from(c.y, (v) => (v - t.offsetY) / t.scaleY),
        closed: false,
      });
    }
  });
  return { labels, lines };
}

class ContourView<C extends ContourCalc> implements TraceView<C> {
  readonly #options: ContourRendererOptions<C>;
  #fill: LazyFillPrimitive | undefined;
  #heatmap: HeatmapPrimitive | undefined;
  #lines: LinePrimitive | undefined;
  #text: TextPrimitive | undefined;
  #cells: TextPrimitive | undefined;
  /** Transform the labels were placed for. */
  #labelTransform: DataTransform | undefined;

  constructor(ctx: TracePlotContext<C>, options: ContourRendererOptions<C>) {
    this.#options = options;
    this.#sync(ctx);
  }

  update(ctx: TracePlotContext<C>, plan: TraceUpdatePlan): void {
    if (plan.calc || plan.plot || plan.style) {
      this.#sync(ctx);
      return;
    }
    if (plan.transform) {
      this.#fill?.setTransform(ctx.transform);
      this.#heatmap?.setTransform(ctx.transform);
      this.#cells?.setTransform(ctx.transform);
      if (this.#hasLabels(ctx) && !sameTransform(this.#labelTransform, ctx.transform)) {
        this.#syncLines(ctx);
      } else {
        this.#lines?.setTransform(ctx.transform);
        this.#text?.setTransform(ctx.transform);
      }
    }
  }

  #hasLabels(ctx: TracePlotContext<C>): boolean {
    return showsLabels(ctx.trace);
  }

  #sync(ctx: TracePlotContext<C>): void {
    const { calc, trace } = ctx;
    const coloring = calc.nx === 0 ? 'none' : calc.coloring;
    const mapping = calc.nx === 0 ? undefined : contourMapping(trace, ctx.fullLayout, calc.zExtent);
    const opacity = numberOr(trace['opacity'], 1);
    const order = heatmapRenderOrder(trace, ctx.index);

    // Fills: bands between levels, or the shaded region of a constraint.
    const data =
      calc.nx === 0
        ? undefined
        : calc.constraint
          ? constraintFillData(calc, trace)
          : coloring === 'fill' && mapping
            ? fillData(calc, mapping, opacity)
            : undefined;
    if (data) {
      if (!this.#fill) {
        this.#fill = createLazyFillPrimitive(ctx.primitives, data);
        ctx.add(this.#fill);
      } else this.#fill.update(data);
      this.#fill.object.renderOrder = order;
      this.#fill.setTransform(ctx.transform);
    } else if (this.#fill) {
      ctx.remove(this.#fill);
      this.#fill = undefined;
    }

    // Heatmap coloring (and its optional cell labels).
    if (coloring === 'heatmap' && mapping) {
      const heatmap: HeatmapData = {
        z: calc.heatmapZ ?? calc.zFilled,
        nx: calc.nx,
        ny: calc.ny,
        xEdges: calc.x.edges,
        yEdges: calc.y.edges,
        colorscale: mapping.colorscale,
        interpolation: 'rgb',
        zmin: mapping.zmin,
        zmax: mapping.zmax,
        reversescale: mapping.reversescale,
        smoothing: 'best',
        xgap: 0,
        ygap: 0,
        opacity,
      };
      if (!this.#heatmap) {
        this.#heatmap = createHeatmapPrimitive(ctx.primitives, heatmap);
        ctx.add(this.#heatmap);
      } else this.#heatmap.update(heatmap);
      this.#heatmap.object.renderOrder = order;
      this.#heatmap.setTransform(ctx.transform);
      this.#syncCells(ctx, mapping);
    } else {
      if (this.#heatmap) ctx.remove(this.#heatmap);
      this.#heatmap = undefined;
      if (this.#cells) ctx.remove(this.#cells);
      this.#cells = undefined;
    }
    this.#syncLines(ctx);
  }

  /** Cell labels of `coloring: 'heatmap'` (`texttemplate`), from the renderer's hook. */
  #syncCells(ctx: TracePlotContext<C>, mapping: ZColorMapping): void {
    const { trace, calc } = ctx;
    const texts =
      typeof trace['texttemplate'] === 'string' &&
      trace['texttemplate'] !== '' &&
      this.#options.cellTexts
        ? this.#options.cellTexts(ctx, mapping)
        : [];
    const sizeIn = (trace['textfont'] as { size?: unknown } | undefined)?.size;
    const size =
      typeof sizeIn === 'number'
        ? sizeIn
        : autoCellFontSize(
            calc,
            texts,
            ctx.transform,
            { xgap: 0, ygap: 0 },
            ctx.fullLayout.font.size,
          );
    if (texts.length === 0 || size <= 0) {
      if (this.#cells) ctx.remove(this.#cells);
      this.#cells = undefined;
      return;
    }
    const lf = ctx.fullLayout.font;
    const f = (trace['textfont'] ?? {}) as Record<string, unknown>;
    const labels = cellLabels(texts, {
      family: typeof f['family'] === 'string' ? f['family'] : lf.family,
      size,
      weight: (f['weight'] ?? lf.weight ?? 'normal') as TextFontWeight,
      style: (f['style'] ?? lf.style ?? 'normal') as TextFontStyle,
    });
    if (!this.#cells) {
      this.#cells = createTextPrimitive(ctx.primitives, { labels });
      ctx.add(this.#cells);
    } else this.#cells.update({ labels });
    this.#cells.object.renderOrder = heatmapRenderOrder(trace, ctx.index) + LAYER.text;
    this.#cells.setTransform(ctx.transform);
  }

  /** Lines, and the labels along them (placed for the current transform). */
  #syncLines(ctx: TracePlotContext<C>): void {
    const { calc, trace } = ctx;
    const lines = showsLines(trace);
    if (calc.nx === 0 || (!lines && !this.#hasLabels(ctx))) {
      if (this.#lines) ctx.remove(this.#lines);
      if (this.#text) ctx.remove(this.#text);
      this.#lines = this.#text = this.#labelTransform = undefined;
      return;
    }
    const mapping = contourMapping(trace, ctx.fullLayout, calc.zExtent);
    const colors = levelLineColors(trace, calc.levels, mapping);
    const line = lineOf(trace);
    let list = pieces(calc);
    let labels: TextLabel[] = [];
    if (this.#hasLabels(ctx)) {
      const rect = ctx.subplot?.rect ?? { width: 0, height: 0 };
      const layout = labelLayout(calc, trace, ctx.transform, rect, colors, labelFont(trace, ctx));
      list = layout.lines;
      labels = layout.labels;
      this.#labelTransform = { ...ctx.transform };
    } else this.#labelTransform = undefined;
    if (lines) {
      const data: Partial<LineData> = {
        ...lineGeometry(list, colors, 1),
        width: numberOr(line['width'], 0.5),
        dash: (typeof line['dash'] === 'string' ? line['dash'] : 'solid') as LineDash,
        join: 'round',
        opacity: numberOr(trace['opacity'], 1),
      };
      if (!this.#lines) {
        this.#lines = new LinePrimitive(ctx.primitives, data);
        ctx.add(this.#lines);
      } else this.#lines.update(data);
      this.#lines.object.renderOrder = heatmapRenderOrder(trace, ctx.index) + LAYER.lines;
      this.#lines.setTransform(ctx.transform);
    } else if (this.#lines) {
      ctx.remove(this.#lines);
      this.#lines = undefined;
    }

    if (labels.length === 0) {
      if (this.#text) ctx.remove(this.#text);
      this.#text = undefined;
      return;
    }
    if (!this.#text) {
      this.#text = createTextPrimitive(ctx.primitives, { labels });
      ctx.add(this.#text);
    } else this.#text.update({ labels });
    this.#text.object.renderOrder = heatmapRenderOrder(trace, ctx.index) + LAYER.text;
    this.#text.setTransform(ctx.transform);
  }
}

function sameTransform(a: DataTransform | undefined, b: Readonly<DataTransform>): boolean {
  return (
    a !== undefined &&
    a.scaleX === b.scaleX &&
    a.scaleY === b.scaleY &&
    a.offsetX === b.offsetX &&
    a.offsetY === b.offsetY
  );
}

/** The `plot` part of a contour trace module. */
export function createContourRenderer<C extends ContourCalc>(
  options: ContourRendererOptions<C> = {},
): TraceRenderer<C> {
  return { create: (ctx) => new ContourView<C>(ctx, options) };
}
