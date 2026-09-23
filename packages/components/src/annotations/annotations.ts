/**
 * The annotations component (plan E5.4): `layout.annotations[]` text with optional arrows,
 * anchored to data, axis domains or paper, drawn in the overlay.
 *
 * ## Primitives (constant draw calls whatever the annotation count)
 *
 * One fill primitive (box backgrounds, borders and arrowheads — rotated boxes need polygons), one
 * line primitive (arrow shafts) and one text batch. They are created once and updated in place:
 * zoom and pan recompute positions and re-upload a few vertices, and the text primitive only moves
 * its labels (no re-typesetting), so data-anchored annotations follow the view cheaply.
 *
 * ## Pointer input
 *
 * Over an annotation with `captureevents` (or while editable) the view takes pointer events first
 * (`ComponentView.handlePointer`): a click emits `clickannotation`; with `config.editable` or
 * `config.edits.annotationPosition` dragging the text (no arrow) or the arrow head moves the anchor
 * (`x`/`y`); with `annotationTail` dragging the text of an arrow annotation moves the tail
 * (`ax`/`ay`). The drag previews locally and commits one `relayout` on release.
 */
import {
  createFillPrimitive,
  LinePrimitive,
  type FillPrimitive,
  type RGBA,
} from '@mk7s/holochart-render';
import type {
  Chart,
  ChartPoint,
  ComponentDrawContext,
  ComponentModule,
  ComponentPointerEvent,
  ComponentUpdatePlan,
  ComponentView,
  PointerEventData,
} from '@mk7s/holochart-runtime';
import type { LabelItem } from '../axes/geometry.ts';
import { TextBatch } from '../shared/batches.ts';
import { findChart, fireAndForget, overlayTransform } from '../shared/host.ts';
import { oracleMeasure, type MeasureLine } from '../shared/text.ts';
import {
  annotationGeometry,
  boxCorners,
  hitAnnotation,
  pxToRef,
  refCenter,
  refToPx,
  type AnnotationEnv,
  type AnnotationGeometry,
  type DragOffset,
  type Point,
} from './layout.ts';
import { annotationsAttributes, supplyAnnotationDefaults, type FullAnnotation } from './schema.ts';

/** Draw order in the overlay: above traces, axes, colorbars and the legend. */
const ORDER = { fill: 30, lines: 31, text: 32 } as const;

/** The polygons and segments of a set of annotations, ready for the fill and line primitives. */
export interface AnnotationBatches {
  fill: { x: number[]; y: number[]; rings: number[]; polygons: number[]; color: number[] };
  lines: { x: number[]; y: number[]; starts: number[]; color: number[]; width: number[] };
  labels: LabelItem[];
}

/** The defaulted annotations of a layout. */
export function annotationsOf(fullLayout: Record<string, unknown>): FullAnnotation[] {
  const list = fullLayout['annotations'];
  return Array.isArray(list) ? (list as FullAnnotation[]) : [];
}

/** Geometry → primitive data (pure). Boxes first, so arrowheads and text draw over them. */
export function annotationBatches(geoms: readonly AnnotationGeometry[]): AnnotationBatches {
  const out: AnnotationBatches = {
    fill: { x: [], y: [], rings: [], polygons: [], color: [] },
    lines: { x: [], y: [], starts: [], color: [], width: [] },
    labels: [],
  };
  const f = out.fill;
  const polygon = (rings: readonly Point[][], color: RGBA): void => {
    f.polygons.push(f.rings.length);
    for (const ring of rings) {
      f.rings.push(f.x.length);
      for (const p of ring) {
        f.x.push(p.x);
        f.y.push(p.y);
      }
    }
    f.color.push(...color);
  };
  for (const g of geoms) {
    if (g.bgcolor[3] > 0) polygon([boxCorners(g.box)], g.bgcolor);
    if (g.borderwidth > 0 && g.bordercolor[3] > 0) {
      polygon([boxCorners(g.box), boxCorners(g.box, g.borderwidth)], g.bordercolor);
    }
    const line = g.arrow?.line;
    if (line && g.arrowcolor[3] > 0 && g.arrowwidth > 0) {
      const l = out.lines;
      if (l.x.length > 0) l.starts.push(l.x.length);
      for (const p of line) {
        l.x.push(p.x);
        l.y.push(p.y);
        l.color.push(...g.arrowcolor);
        l.width.push(g.arrowwidth);
      }
    }
    for (const head of g.arrow?.heads ?? []) {
      if (head.length >= 3 && g.arrowcolor[3] > 0) polygon([head], g.arrowcolor);
    }
    if (g.label) out.labels.push(g.label);
  }
  return out;
}

type EditKey = 'annotationPosition' | 'annotationTail';

/** `config.edits[key]`, falling back to `config.editable` (Plotly semantics). */
function canEdit(ctx: ComponentDrawContext, key: EditKey): boolean {
  const cfg = ctx.fullConfig as { editable?: unknown; edits?: Record<string, unknown> } | undefined;
  if (cfg?.edits?.[key] === true) return true;
  if (cfg?.editable !== true) return false;
  // Defaulted `edits` are all false; only an explicit input `false` opts out of `editable`.
  const input = findChart(ctx)?.config as { edits?: Record<string, unknown> } | undefined;
  return input?.edits?.[key] !== false;
}

interface Drag {
  index: number;
  kind: 'position' | 'tail';
  x0: number;
  y0: number;
  dx: number;
  dy: number;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || a === null || b === undefined || b === null) return false;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return String(a) === String(b);
}

/** Every annotation's geometry for a draw context (pure given `measure`). */
export function buildAnnotationGeometries(
  ctx: Pick<ComponentDrawContext, 'fullLayout' | 'width' | 'height' | 'plotArea' | 'axes'>,
  measure: MeasureLine,
  drag?: { index: number; offset: DragOffset },
): AnnotationGeometry[] {
  const env = envOf(ctx, measure);
  const out: AnnotationGeometry[] = [];
  for (const a of annotationsOf(ctx.fullLayout)) {
    const g = annotationGeometry(a, env, drag?.index === a._index ? drag.offset : undefined);
    if (g) out.push(g);
  }
  return out;
}

function envOf(
  ctx: Pick<ComponentDrawContext, 'width' | 'height' | 'plotArea' | 'axes'>,
  measure: MeasureLine,
): AnnotationEnv {
  return {
    size: { width: ctx.width, height: ctx.height },
    plotArea: ctx.plotArea,
    axes: ctx.axes,
    measure,
  };
}

class AnnotationsView implements ComponentView {
  #ctx: ComponentDrawContext;
  readonly #text: TextBatch;
  #fill: FillPrimitive | undefined;
  #fillKey = '';
  #lines: LinePrimitive | undefined;
  #linesKey = '';
  #geoms: AnnotationGeometry[] = [];
  #drag: Drag | undefined;
  readonly #off: (() => void) | undefined;

  constructor(ctx: ComponentDrawContext) {
    this.#ctx = ctx;
    this.#text = new TextBatch(ctx, ctx.primitives, ctx.overlay, ORDER.text);
    const chart = findChart(ctx);
    this.#off = chart?.on('click', (e) => this.#clickToShow(chart, e));
    this.#draw();
  }

  update(ctx: ComponentDrawContext, plan: ComponentUpdatePlan): void {
    this.#ctx = ctx;
    const s = plan.stages;
    if (!plan.layout && !s.has('plot') && !s.has('style') && !s.has('calc') && !s.has('ticks')) {
      return;
    }
    this.#draw();
  }

  #draw(): void {
    const ctx = this.#ctx;
    const d = this.#drag;
    const offset: DragOffset | undefined = d
      ? d.kind === 'position'
        ? { head: { x: d.dx, y: d.dy } }
        : { tail: { x: d.dx, y: d.dy } }
      : undefined;
    this.#geoms = buildAnnotationGeometries(
      ctx,
      oracleMeasure,
      d && offset ? { index: d.index, offset } : undefined,
    );
    const b = annotationBatches(this.#geoms);
    const t = overlayTransform(ctx.height);

    const fillKey = JSON.stringify(b.fill);
    if (b.fill.polygons.length === 0) {
      if (this.#fill) ctx.remove(this.#fill);
      this.#fill = undefined;
    } else if (fillKey !== this.#fillKey || !this.#fill) {
      const data = {
        x: Float64Array.from(b.fill.x),
        y: Float64Array.from(b.fill.y),
        rings: b.fill.rings,
        polygons: b.fill.polygons,
        color: Float32Array.from(b.fill.color),
      };
      if (!this.#fill) {
        this.#fill = createFillPrimitive(ctx.primitives, data);
        this.#fill.object.renderOrder = ORDER.fill;
        ctx.add(this.#fill);
      } else {
        this.#fill.update(data);
      }
    }
    this.#fillKey = fillKey;
    this.#fill?.setTransform(t);

    const linesKey = JSON.stringify(b.lines);
    if (b.lines.x.length === 0) {
      if (this.#lines) ctx.remove(this.#lines);
      this.#lines = undefined;
    } else if (linesKey !== this.#linesKey || !this.#lines) {
      if (!this.#lines) {
        this.#lines = new LinePrimitive(ctx.primitives, {});
        this.#lines.object.renderOrder = ORDER.lines;
        ctx.add(this.#lines);
      }
      this.#lines.update({
        x: Float64Array.from(b.lines.x),
        y: Float64Array.from(b.lines.y),
        starts: b.lines.starts,
        color: Float32Array.from(b.lines.color),
        width: Float32Array.from(b.lines.width),
        cap: 'butt',
      });
    }
    this.#linesKey = linesKey;
    this.#lines?.setTransform(t);

    this.#text.setTransform(t);
    this.#text.set(b.labels);
  }

  /** The topmost annotation under a point and which part was hit. */
  #hit(x: number, y: number): { g: AnnotationGeometry; part: 'box' | 'head' } | undefined {
    for (let i = this.#geoms.length - 1; i >= 0; i--) {
      const g = this.#geoms[i] as AnnotationGeometry;
      const part = hitAnnotation(g, x, y);
      if (part) return { g, part };
    }
    return undefined;
  }

  #full(index: number): FullAnnotation | undefined {
    return annotationsOf(this.#ctx.fullLayout).find((a) => a._index === index);
  }

  handlePointer(event: ComponentPointerEvent): boolean {
    const drag = this.#drag;
    if (drag) {
      if (event.type === 'move') {
        drag.dx = event.x - drag.x0;
        drag.dy = event.y - drag.y0;
        event.cursor = 'move';
        this.#draw();
        this.#ctx.invalidate();
      } else if (event.type === 'up' || event.type === 'leave') {
        this.#drag = undefined;
        this.#commit(drag);
      }
      return event.type !== 'leave';
    }
    if (event.type === 'leave') return false;
    const hit = this.#hit(event.x, event.y);
    if (!hit) return false;
    const a = this.#full(hit.g.index);
    if (!a) return false;
    const arrow = hit.g.arrow !== undefined;
    let kind: Drag['kind'] | undefined;
    if (a._index >= 0) {
      if (hit.part === 'head' || !arrow) {
        if (canEdit(this.#ctx, 'annotationPosition')) kind = 'position';
      } else if (canEdit(this.#ctx, 'annotationTail')) kind = 'tail';
    }
    const capture = a.captureevents === true || kind !== undefined;
    if (!capture) return false;
    switch (event.type) {
      case 'move':
        event.cursor = kind ? 'move' : 'pointer';
        break;
      case 'down':
        if (kind && event.button === 0) {
          this.#drag = { index: a._index, kind, x0: event.x, y0: event.y, dx: 0, dy: 0 };
        }
        break;
      case 'click':
        this.#emitClick(a, event);
        break;
      default:
        break;
    }
    return true;
  }

  #emitClick(a: FullAnnotation, event: ComponentPointerEvent): void {
    const chart = findChart(this.#ctx);
    if (!chart) return;
    const input = (chart.layout['annotations'] as unknown[] | undefined)?.[a._index];
    chart.emit('clickannotation', {
      index: a._index,
      annotation: input,
      fullAnnotation: a,
      ...(event.native ? { event: event.native } : {}),
    });
  }

  #commit(drag: Drag): void {
    const chart = findChart(this.#ctx);
    const a = this.#full(drag.index);
    if (!chart || !a || (drag.dx === 0 && drag.dy === 0)) {
      this.#draw();
      return;
    }
    const env = envOf(this.#ctx, oracleMeasure);
    const key = `annotations[${a._index}]`;
    const update: Record<string, unknown> = {};
    if (drag.kind === 'position') {
      const x = a.x ?? refCenter(a.xref, 'x', env);
      const y = a.y ?? refCenter(a.yref, 'y', env);
      const hx = refToPx(a.xref, x, 'x', env);
      const hy = refToPx(a.yref, y, 'y', env);
      if (hx === undefined || hy === undefined) return;
      update[`${key}.x`] = pxToRef(a.xref, hx + drag.dx, 'x', env);
      update[`${key}.y`] = pxToRef(a.yref, hy + drag.dy, 'y', env);
    } else {
      for (const [letter, d] of [
        ['x', drag.dx],
        ['y', drag.dy],
      ] as const) {
        const ref = letter === 'x' ? a.axref : a.ayref;
        const value = letter === 'x' ? a.ax : a.ay;
        if (ref === 'pixel') update[`${key}.a${letter}`] = Number(value ?? 0) + d;
        else {
          const p = refToPx(ref, value, letter, env);
          if (p !== undefined) update[`${key}.a${letter}`] = pxToRef(ref, p + d, letter, env);
        }
      }
    }
    fireAndForget(chart.relayout(update, { gui: true }));
  }

  /** `clicktoshow`: toggle annotations whose `xclick`/`yclick` (or `x`/`y`) match the click. */
  #clickToShow(chart: Chart, e: PointerEventData): void {
    const update: Record<string, unknown> = {};
    for (const a of annotationsOf(this.#ctx.fullLayout)) {
      if (a.clicktoshow === false || a._index < 0) continue;
      const hit = e.points.some(
        (p: ChartPoint) => sameValue(p.x, a.xclick ?? a.x) && sameValue(p.y, a.yclick ?? a.y),
      );
      const next = hit ? !a.visible : a.clicktoshow === 'onout' ? false : a.visible;
      if (next !== a.visible) update[`annotations[${a._index}].visible`] = next;
    }
    if (Object.keys(update).length > 0) fireAndForget(chart.relayout(update));
  }

  dispose(): void {
    this.#off?.();
  }
}

/** The annotations component (`layout.annotations`, E5.4). */
export const annotationsComponent: ComponentModule = {
  name: 'annotations',
  order: 40,
  layoutSchema: { annotations: annotationsAttributes },
  supplyLayoutDefaults(_layoutIn, layoutOut, ctx) {
    supplyAnnotationDefaults(layoutOut, ctx);
  },
  draw: {
    create: (ctx) => new AnnotationsView(ctx),
  },
};
