/**
 * The view of the 2.5D view component (`layout.view3d`, plan E8.9; see `view3d.ts`), loaded the
 * first time a figure enables the view, with render's 2.5D chunk.
 *
 * Per cartesian subplot it keeps:
 *
 * - a projector (render `View3DProjector`) on the subplot's viewport: the tilted camera, the plot
 *   area as a quad clipping the flat traces (stencil), and the pointer mapping the runtime's
 *   interaction uses;
 * - the subplot's grid in its own viewport (under the traces, clipped with them, on the plot
 *   plane);
 * - a "decor" viewport with the same camera, drawn right after the subplot over everything it drew
 *   (its depth is cleared): the axis lines, ticks, tick labels and titles of the subplot's own two
 *   axes, placed as the flat view places them. The value axis lies in the plot plane (its labels
 *   line up with the grid); the axis whose labels go with extruded shapes (bars' position axis)
 *   lies in the plane of their front faces, so the labels sit below the bars rather than behind
 *   them. That depth follows the extruded primitives of the subplot (checked every frame: they may
 *   arrive after the view's last draw).
 *
 * The axes component leaves those axes out while a projector is on. Angles change without a
 * pipeline run during a drag (`dragmode` `'turntable'` / `'orbit'` with `interactive`): the
 * release commits them with one `relayout`.
 */
import {
  axisGeometry,
  axisPlacement,
  axisTicks,
  buildAxesScene,
  type DashItem,
  type LabelItem,
  type RectItem,
} from '@mk7s/holochart-components';
import {
  createRectPrimitive,
  createTextPrimitive,
  getDefaultFontMetricsOracle,
  LinePrimitive,
  type DataTransform,
  type ExtrusionModule,
  type Primitive,
  type RectPrimitive,
  type TextFont,
  type TextPrimitive,
  type View3DProjector,
  type Viewport,
  type ViewportProjector,
  type ViewportRect,
} from '@mk7s/holochart-render';
import type {
  Chart,
  ComponentDrawContext,
  ComponentPointerEvent,
  ComponentUpdatePlan,
  ComponentView,
  SubplotInfo,
} from '@mk7s/holochart-runtime';

/** `layout.view3d` after defaults. */
interface FullView3D {
  readonly enabled: boolean;
  readonly tilt: number;
  readonly rotation: number;
  readonly perspective: number;
  readonly interactive: boolean;
}

/** Degrees per px of a turning drag. */
const DEG_PER_PX = 0.35;
/** Largest `tilt` / `rotation` (the schema's limits). */
const LIMIT = 80;

/** Render order of grids: the axes component's (`BELOW_TRACES_ORDER`), under every trace. */
const BELOW_TRACES = -1e12;
/** Line height of axis labels (the components' `LINE_HEIGHT`). */
const LINE_HEIGHT = 1.3;

/** Text width in px, as the axes component measures it. */
const measure = (line: string, font: TextFont): number =>
  getDefaultFontMetricsOracle().measureWidth(line, font);

/** One axis' lines and labels in the decor viewport. */
interface AxisDecor {
  readonly over: RectPrimitive;
  readonly labels: TextPrimitive;
}

/** What the view keeps per tilted subplot. */
interface Tilted {
  subplot: SubplotInfo;
  readonly projector: View3DProjector;
  readonly decor: Viewport;
  readonly axes: { readonly x: AxisDecor; readonly y: AxisDecor };
  readonly grid: RectPrimitive;
  readonly dashes: Map<string, LinePrimitive>;
  /** Front plane of the extruded shapes (px) and the axis drawn there. */
  front: { depth: number; letter: 'x' | 'y' };
}

function view3dOf(ctx: ComponentDrawContext): FullView3D | undefined {
  const v = (ctx.fullLayout as { view3d?: FullView3D }).view3d;
  return v?.enabled === true ? v : undefined;
}

const clamp = (v: number): number => Math.max(-LIMIT, Math.min(LIMIT, v));

/** The chart of a draw context, if it is alive. */
function findChart(ctx: ComponentDrawContext): Chart | undefined {
  const chart = ctx.chart;
  return chart && !chart.destroyed ? chart : undefined;
}

/** Swallow the rejection of a chart update (errors reach the chart's listeners). */
function fireAndForget(promise: Promise<unknown>): void {
  promise.catch(() => undefined);
}

/** Container px → world px of a 2D viewport whose rect is `rect` (container px, top-left). */
function rectTransform(rect: Readonly<ViewportRect>): DataTransform {
  return { scaleX: 1, offsetX: -rect.x, scaleY: -1, offsetY: rect.y + rect.height };
}

/** Axis lines, ticks or grid lines (container px) into a rect primitive. */
function setRects(p: RectPrimitive, items: readonly RectItem[]): void {
  const n = items.length;
  const x0 = new Float64Array(n);
  const y0 = new Float64Array(n);
  const x1 = new Float64Array(n);
  const y1 = new Float64Array(n);
  const fill = new Float32Array(n * 4);
  items.forEach((r, i) => {
    x0[i] = r.x0;
    y0[i] = r.y0;
    x1[i] = r.x1;
    y1[i] = r.y1;
    fill.set(r.color, i * 4);
  });
  p.update({ x0, y0, x1, y1, fill });
}

/** Tick labels and titles (container px) into a text primitive. */
function setLabels(p: TextPrimitive, items: readonly LabelItem[]): void {
  p.update({
    labels: items.map((l) => ({
      text: l.text,
      x: l.x,
      y: l.y,
      anchorX: l.anchorX,
      anchorY: l.anchorY,
      angle: l.angle,
      font: l.font,
      color: l.color,
      lineHeight: LINE_HEIGHT,
      ...(l.align ? { align: l.align } : {}),
      ...(l.runs ? { runs: l.runs } : {}),
    })),
  });
}

/** Dashed grid lines of one dash pattern (container px) into a line primitive. */
function setDashes(p: LinePrimitive, items: readonly DashItem[]): void {
  const n = items.length;
  const x = new Float64Array(n * 2);
  const y = new Float64Array(n * 2);
  const color = new Float32Array(n * 8);
  const width = new Float32Array(n * 2);
  const starts: number[] = [];
  items.forEach((d, i) => {
    x.set([d.x0, d.x1], 2 * i);
    y.set([d.y0, d.y1], 2 * i);
    color.set(d.color, 8 * i);
    color.set(d.color, 8 * i + 4);
    width.set([d.width, d.width], 2 * i);
    if (i > 0) starts.push(2 * i);
  });
  p.update({ x, y, starts, color, width, dash: items[0]?.dash ?? 'solid' });
}

/** A projector for another viewport with the same camera (the decor's; no pointer mapping). */
function follower(projector: View3DProjector): ViewportProjector {
  return {
    get camera() {
      return projector.camera;
    },
    layout: () => undefined,
    project: (x, y) => projector.project(x, y),
    unproject: (x, y) => projector.unproject(x, y),
  };
}

/** See the module comment. */
export class View3DView implements ComponentView {
  readonly #render: ExtrusionModule;
  readonly #tilted = new Map<string, Tilted>();
  #ctx: ComponentDrawContext;
  /** Angles of a turning drag in progress (they win over the layout's until it ends). */
  #drag: { tilt: number; rotation: number } | null = null;
  #off: (() => void) | undefined;

  constructor(ctx: ComponentDrawContext, render: ExtrusionModule) {
    this.#ctx = ctx;
    this.#render = render;
    this.#off = findChart(ctx)?.three.root.on('beforerender', () => this.#placeFront());
    // Created after the axes drew (the code loaded meanwhile): lay out again so they leave the
    // tilted subplots' axes to this view.
    if (this.#draw(ctx)) {
      const chart = findChart(ctx);
      if (chart) fireAndForget(chart.resize());
    }
  }

  update(ctx: ComponentDrawContext, _plan: ComponentUpdatePlan): void {
    this.#ctx = ctx;
    this.#draw(ctx);
  }

  /**
   * Turning drags (`dragmode` `'turntable'` / `'orbit'`, `view3d.interactive`): followed on the
   * canvas without taking the gesture, so a press without a drag still clicks the points under it
   * (the runtime's own gesture does nothing in these drag modes).
   */
  handlePointer(event: ComponentPointerEvent): boolean {
    const ctx = this.#ctx;
    const v = view3dOf(ctx);
    const dragmode = (ctx.fullLayout as { dragmode?: unknown }).dragmode;
    const native = event.native as PointerEvent | undefined;
    const target = native?.target as HTMLElement | null | undefined;
    if (
      event.type !== 'down' ||
      event.button !== 0 ||
      !v?.interactive ||
      (dragmode !== 'turntable' && dragmode !== 'orbit') ||
      !native ||
      !target ||
      !this.#subplotAt(event.x, event.y)
    ) {
      return false;
    }
    const x0 = native.clientX;
    const y0 = native.clientY;
    const start = { tilt: v.tilt, rotation: v.rotation };
    const drag = (this.#drag = { ...start });
    const onMove = (e: PointerEvent): void => {
      drag.tilt = clamp(start.tilt + (e.clientY - y0) * DEG_PER_PX);
      drag.rotation = clamp(start.rotation - (e.clientX - x0) * DEG_PER_PX);
      for (const t of this.#tilted.values()) {
        t.projector.setAngles({ ...drag, perspective: v.perspective });
      }
      this.#ctx.invalidate();
    };
    const onUp = (): void => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      this.#drag = null;
      const chart = findChart(this.#ctx);
      if (chart && (drag.tilt !== start.tilt || drag.rotation !== start.rotation)) {
        fireAndForget(
          chart.relayout({ 'view3d.tilt': drag.tilt, 'view3d.rotation': drag.rotation }),
        );
      }
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
    return false;
  }

  dispose(): void {
    this.#off?.();
    this.#off = undefined;
    for (const id of [...this.#tilted.keys()]) this.#remove(id);
  }

  /** The tilted subplot whose rect contains container point `(x, y)`. */
  #subplotAt(x: number, y: number): SubplotInfo | undefined {
    for (const t of this.#tilted.values()) {
      const r = t.subplot.rect;
      if (x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height) return t.subplot;
    }
    return undefined;
  }

  /** Attach, update or remove the projectors; draw the axes. Returns whether any was attached. */
  #draw(ctx: ComponentDrawContext): boolean {
    const v = view3dOf(ctx);
    for (const [id, t] of this.#tilted) {
      if (!v || ctx.subplots.get(id)?.viewport !== t.subplot.viewport) this.#remove(id);
    }
    if (!v) return false;
    const angles = {
      tilt: this.#drag?.tilt ?? v.tilt,
      rotation: this.#drag?.rotation ?? v.rotation,
      perspective: v.perspective,
    };
    let attached = false;
    for (const sp of ctx.subplots.values()) {
      let t = this.#tilted.get(sp.id);
      if (!t) {
        t = this.#create(ctx, sp);
        if (!t) continue;
        attached = true;
      }
      t.subplot = sp;
      t.projector.setAngles(angles);
      // The chart paints `plot_bgcolor` into the viewport on every run: the plane takes it over.
      t.projector.takeBackground();
      t.decor.order = sp.viewport.order + 0.5;
      this.#drawAxes(ctx, sp, t);
    }
    this.#placeFront(true);
    ctx.invalidate();
    return attached;
  }

  #create(ctx: ComponentDrawContext, sp: SubplotInfo): Tilted | undefined {
    const root = findChart(ctx)?.three.root;
    if (!root) return undefined;
    const projector = this.#render.createView3DProjector({ tilt: 0, rotation: 0, perspective: 0 });
    projector.attach(sp.viewport);
    // The whole canvas, depth cleared first: axes draw over what the subplot drew.
    const decor = root.addViewport({
      kind: '2d',
      fit: true,
      clip: false,
      clearDepth: true,
      order: sp.viewport.order + 0.5,
      name: `view3d-${sp.id}`,
    });
    decor.projector = follower(projector);
    const add = <P extends Primitive<unknown>>(p: P, viewport: Viewport, order = 0): P => {
      p.object.renderOrder = order;
      ctx.add(p, viewport);
      return p;
    };
    const axis = (): AxisDecor => ({
      over: add(createRectPrimitive(ctx.primitives, { snap: true }), decor),
      labels: add(createTextPrimitive(ctx.primitives, { mode: 'fixed', sizing: 'screen' }), decor),
    });
    const t: Tilted = {
      subplot: sp,
      projector,
      decor,
      axes: { x: axis(), y: axis() },
      grid: add(createRectPrimitive(ctx.primitives, { snap: true }), sp.viewport, BELOW_TRACES),
      dashes: new Map(),
      front: { depth: -1, letter: 'x' },
    };
    this.#tilted.set(sp.id, t);
    return t;
  }

  /** The subplot's own axes (lines, ticks, labels, titles) and grid, as the axes component would. */
  #drawAxes(ctx: ComponentDrawContext, sp: SubplotInfo, t: Tilted): void {
    const axes = new Map([
      [sp.xaxis.id, sp.xaxis],
      [sp.yaxis.id, sp.yaxis],
    ]);
    const subplots = new Map([[sp.id, sp]]);
    const pad = ctx.fullLayout.margin.pad;
    for (const axis of [sp.xaxis, sp.yaxis]) {
      let over: RectItem[] = [];
      let labels: LabelItem[] = [];
      if (axis.full.visible) {
        const placement = axisPlacement(axis, axes, subplots.values(), ctx.plotArea, pad);
        const geo = axisGeometry(axis, placement.frame, axisTicks(axis), {
          measure,
          width: ctx.width,
          height: ctx.height,
          mirrors: placement.mirrors,
          lineOverhang: placement.overhang,
        });
        over = geo.rects;
        labels = geo.labels;
      }
      setRects(t.axes[axis.letter].over, over);
      setLabels(t.axes[axis.letter].labels, labels);
    }
    const scene = buildAxesScene({ ...ctx, axes, subplots }, measure);
    const under = scene.under.get(sp.id) ?? { rects: [], dashed: [] };
    const tf = rectTransform(sp.rect);
    t.grid.setTransform(tf);
    setRects(t.grid, under.rects);
    const byDash = new Map<string, DashItem[]>();
    for (const d of under.dashed) byDash.set(d.dash, [...(byDash.get(d.dash) ?? []), d]);
    for (const [dash, line] of t.dashes) {
      if (byDash.has(dash)) continue;
      ctx.remove(line);
      t.dashes.delete(dash);
    }
    for (const [dash, items] of byDash) {
      let line = t.dashes.get(dash);
      if (!line) {
        line = new LinePrimitive(ctx.primitives, { cap: 'butt' });
        line.object.renderOrder = BELOW_TRACES + 1;
        ctx.add(line, sp.viewport);
        t.dashes.set(dash, line);
      }
      line.setTransform(tf);
      setDashes(line, items);
    }
  }

  /**
   * Put the axis of extruded shapes in the plane of their front faces, the other in the plot plane
   * (see the module comment); `force` re-applies the transforms (the subplot moved).
   */
  #placeFront(force = false): void {
    for (const t of this.#tilted.values()) {
      let depth = 0;
      let letter: 'x' | 'y' = 'x';
      for (const p of t.subplot.viewport.primitives) {
        if (!(p instanceof this.#render.ExtrusionPrimitive) || p.maxDepth <= depth) continue;
        depth = p.maxDepth;
        letter = p.data.front;
      }
      if (!force && depth === t.front.depth && letter === t.front.letter) continue;
      t.front = { depth, letter };
      const flat = rectTransform(t.subplot.rect);
      const lifted: DataTransform = { ...flat, offsetZ: depth > 0 ? depth + 0.5 : 0 };
      for (const l of ['x', 'y'] as const) {
        const tf = l === letter ? lifted : flat;
        t.axes[l].over.setTransform(tf);
        t.axes[l].labels.setTransform(tf);
      }
      if (!force) this.#ctx.invalidate();
    }
  }

  /** Flatten a subplot again: its batches, decor viewport and projector go. */
  #remove(id: string): void {
    const t = this.#tilted.get(id);
    if (!t) return;
    this.#tilted.delete(id);
    const ctx = this.#ctx;
    if (!t.subplot.viewport.disposed) for (const p of [t.grid, ...t.dashes.values()]) ctx.remove(p);
    for (const a of [t.axes.x, t.axes.y]) {
      ctx.remove(a.over);
      ctx.remove(a.labels);
    }
    t.projector.dispose();
    findChart(this.#ctx)?.three.root.removeViewport(t.decor);
  }
}
