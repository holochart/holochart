/**
 * The polar axes component (plan E11.4): draws every polar subplot's background, grids, axis
 * lines, ticks, labels and radial title (see `axes.ts`), and runs its interactions, following
 * plotly.js `Polar.updateFx`:
 *
 * - **Radial drag** on the handle past the end of the radial axis (and the one at its inner end
 *   when there is a hole or a partial sector): moving along the axis changes that end of the
 *   radial range, moving across it rotates the radial axis (`radialaxis.angle`).
 * - **Angular drag** in the band just outside the subplot: rotates the angular axis
 *   (`angularaxis.rotation`; polygon grids turn the radial axis with it).
 * - **Zoom box** (`dragmode: 'zoom'`) in the plot area: a ring between the press and the pointer
 *   radius becomes the new radial range.
 * - **Double-click** in the plot area: back to the first drawn view (`doubleclick` event).
 *
 * Drags preview through {@link PolarSubplot.setView} (views redraw without a pipeline run), emit
 * `relayouting`, and commit one GUI relayout when released (`relayout` with Plotly's keys:
 * `polar.radialaxis.range`, `polar.radialaxis.range[1]`, `polar.radialaxis.angle`,
 * `polar.angularaxis.rotation`).
 *
 * The component ships with the polar traces (registered by the `@mk7s/holochart-traces-sci`
 * modules' bundle, `sciTraces`), so charts without polar traces don't carry it.
 */
import { getIn, toRGBA, type FullLayout } from '@mk7s/holochart-core';
import {
  createArcPrimitive,
  createLazyFillPrimitive,
  createTextPrimitive,
  LinePrimitive,
  type ArcPrimitive,
  type DataTransform,
  type LazyFillPrimitive,
  type TextLabel,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import type {
  ComponentDrawContext,
  ComponentModule,
  ComponentPointerEvent,
  ComponentView,
} from '@mk7s/holochart-runtime';
import { buildPolarScene, type AxisLayer, type Strokes } from './axes.ts';
import { MINDRAG, radialDragMode, rerange, zoomRing } from './drag.ts';
import { laidOutSubplots, type PolarCalc } from './cross-trace.ts';
import {
  deg2rad,
  isAngleInsideSector,
  modHalf,
  polygonScale,
  rad2deg,
  regionRings,
  snapToVertexAngle,
  TAU,
} from './geometry.ts';
import { isPolarTrace, polarSubplotIds, subplotOf } from './layout-defaults.ts';
import { POLAR_ORDER } from './order.ts';
import { PolarSubplot } from './subplot.ts';

/** plotly.js polar `constants`: the radial drag handles and the angular drag band (px). */
const RADIAL_BOX = 50;
const ANGULAR_BAND = 30;

type Container = Record<string, unknown>;

/** Subplots laid out alone (no visible trace on them), per layout. */
const ALONE = new WeakMap<FullLayout, Map<string, PolarSubplot>>();

/** The laid-out subplot `id` of the current pass (see the module comment of `cross-trace.ts`). */
export function resolveSubplot(ctx: ComponentDrawContext, id: string): PolarSubplot {
  const laid = laidOutSubplots(ctx.fullLayout)?.get(id);
  if (laid) return laid;
  for (let i = 0; i < ctx.fullData.length; i++) {
    const trace = ctx.fullData[i]!;
    if (trace.visible !== true || !isPolarTrace(trace) || subplotOf(trace) !== id) continue;
    const calc = ctx.calcdata?.(i) as PolarCalc | undefined;
    if (calc?.subplot) return calc.subplot;
  }
  let alone = ALONE.get(ctx.fullLayout);
  if (!alone) ALONE.set(ctx.fullLayout, (alone = new Map()));
  let sp = alone.get(id);
  if (!sp) {
    sp = new PolarSubplot({ fullLayout: ctx.fullLayout, id, plotArea: ctx.plotArea, extremes: [] });
    alone.set(id, sp);
  }
  return sp;
}

/** Primitives of one axis layer. */
class LayerPrimitives {
  readonly lines: LinePrimitive[] = [];
  text: TextPrimitive | undefined;
}

/** Primitives of one subplot. */
class SubplotPrimitives {
  arc: ArcPrimitive | undefined;
  fill: LazyFillPrimitive | undefined;
  readonly grid: LinePrimitive[] = [];
  readonly below = new LayerPrimitives();
  readonly above = new LayerPrimitives();
}

function syncLines(
  ctx: ComponentDrawContext,
  list: LinePrimitive[],
  strokes: readonly Strokes[],
  transform: DataTransform,
  order: number,
): void {
  while (list.length > strokes.length) ctx.remove(list.pop()!);
  strokes.forEach((s, k) => {
    let p = list[k];
    if (!p) {
      p = new LinePrimitive(ctx.primitives);
      ctx.add(p);
      list.push(p);
    }
    p.update({
      x: Float64Array.from(s.x),
      y: Float64Array.from(s.y),
      color: s.color,
      width: s.width,
      dash: s.dash,
    });
    p.setTransform(transform);
    p.object.renderOrder = order + k * 1e-3;
  });
}

function syncLayer(
  ctx: ComponentDrawContext,
  prims: LayerPrimitives,
  layer: AxisLayer,
  transform: DataTransform,
  order: number,
): void {
  syncLines(ctx, prims.lines, layer.strokes, transform, order);
  if (layer.labels.length === 0) {
    if (prims.text) ctx.remove(prims.text);
    prims.text = undefined;
    return;
  }
  const labels: TextLabel[] = layer.labels.map((l) => ({
    text: l.text,
    x: l.x,
    y: l.y,
    font: l.font,
    color: l.color,
    anchorX: l.anchorX,
    anchorY: l.anchorY,
    angle: l.angle,
    lineHeight: 1.3,
    ...(l.runs ? { runs: l.runs } : {}),
  }));
  if (!prims.text) {
    prims.text = createTextPrimitive(ctx.primitives, { mode: 'fixed', sizing: 'screen' });
    ctx.add(prims.text);
  }
  prims.text.update({ labels });
  prims.text.setTransform(transform);
  prims.text.object.renderOrder = order + 0.5;
}

function dropLayer(ctx: ComponentDrawContext, prims: LayerPrimitives): void {
  for (const p of prims.lines) ctx.remove(p);
  prims.lines.length = 0;
  if (prims.text) ctx.remove(prims.text);
  prims.text = undefined;
}

/** Luminance (0–1) of a CSS color, for the zoom box shade (tinycolor's `getLuminance`). */
function luminance(c: unknown): number {
  const rgba = typeof c === 'string' ? toRGBA(c) : null;
  if (!rgba) return 1;
  const lin = (v: number): number => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(rgba[0]) + 0.7152 * lin(rgba[1]) + 0.0722 * lin(rgba[2]);
}

/** The current view of a subplot (what a cancelled drag goes back to). */
function viewOf(sp: PolarSubplot): { range: [number, number]; rotation: number; angle: number } {
  return { range: [sp.rl[0], sp.rl[1]], rotation: sp.rotation, angle: sp.angle };
}

/** Initial view of a subplot, for double-click reset. */
interface InitialView {
  autorange: unknown;
  range: unknown;
  angle: unknown;
  rotation: unknown;
}

type Drag =
  | {
      kind: 'radial';
      sp: PolarSubplot;
      /** The view when the drag started. */
      start: { range: [number, number]; rotation: number; angle: number };
      index: 0 | 1;
      x0: number;
      y0: number;
      /** Handle center (container px). */
      tx: number;
      ty: number;
      mode: 'rotate' | 'range' | undefined;
      range: [number, number] | undefined;
      angle: number | undefined;
    }
  | {
      kind: 'rotate';
      sp: PolarSubplot;
      start: { range: [number, number]; rotation: number; angle: number };
      a0: number;
      rot0: number;
      angle0: number;
      rotation: number | undefined;
      angle: number | undefined;
    };

/** The view of the polar component (see the module comment). */
class PolarView implements ComponentView {
  #ctx: ComponentDrawContext;
  readonly #prims = new Map<string, SubplotPrimitives>();
  #subplots = new Map<string, PolarSubplot>();
  readonly #initial = new Map<string, InitialView>();
  #drag: Drag | undefined;
  #zoombox: LazyFillPrimitive | undefined;
  #zoomEnd: (() => void) | undefined;

  constructor(ctx: ComponentDrawContext) {
    this.#ctx = ctx;
    this.#draw(ctx);
  }

  update(ctx: ComponentDrawContext): void {
    this.#ctx = ctx;
    this.#draw(ctx);
  }

  #draw(ctx: ComponentDrawContext): void {
    const ids = polarSubplotIds(ctx.fullLayout);
    const next = new Map<string, PolarSubplot>();
    for (const id of ids) next.set(id, resolveSubplot(ctx, id));
    for (const [id, prims] of this.#prims) {
      if (next.has(id)) continue;
      this.#drop(ctx, prims);
      this.#prims.delete(id);
    }
    this.#subplots = next;
    for (const [id, sp] of next) {
      if (!this.#initial.has(id)) this.#capture(ctx, id);
      this.#drawSubplot(ctx, id, sp);
    }
  }

  #capture(ctx: ComponentDrawContext, id: string): void {
    const layout = ctx.chart?.layout ?? {};
    const radial = (ctx.fullLayout[id] as Container | undefined)?.['radialaxis'] as
      Container | undefined;
    this.#initial.set(id, {
      autorange: radial?.['autorange'],
      range: getIn(layout, `${id}.radialaxis.range`),
      angle: getIn(layout, `${id}.radialaxis.angle`),
      rotation: getIn(layout, `${id}.angularaxis.rotation`),
    });
  }

  #drawSubplot(ctx: ComponentDrawContext, id: string, sp: PolarSubplot): void {
    const polar = (ctx.fullLayout[id] ?? {}) as Container;
    let prims = this.#prims.get(id);
    if (!prims) this.#prims.set(id, (prims = new SubplotPrimitives()));
    const transform: DataTransform = {
      scaleX: 1,
      scaleY: 1,
      offsetX: sp.cx,
      offsetY: ctx.overlay.size.height - sp.cy,
    };
    const scene = buildPolarScene(sp, polar);
    const bgcolor = scene.background?.color ?? [0, 0, 0, 0];
    // Background: an exact arc for circular grids, the polygon fill for `gridshape: 'linear'`.
    if (!sp.vangles) {
      if (prims.fill) ctx.remove(prims.fill);
      prims.fill = undefined;
      const [s0, s1] = sp.sector;
      const data = {
        x: [0],
        y: [0],
        innerRadius: sp.innerRadius,
        outerRadius: sp.radius,
        startAngle: sp.full ? 0 : s0,
        endAngle: sp.full ? TAU : s1,
        fill: bgcolor,
      };
      if (!prims.arc) {
        prims.arc = createArcPrimitive(ctx.primitives, data);
        ctx.add(prims.arc);
      } else prims.arc.update(data);
      prims.arc.setTransform(transform);
      prims.arc.object.renderOrder = POLAR_ORDER.background;
    } else if (scene.background) {
      if (prims.arc) ctx.remove(prims.arc);
      prims.arc = undefined;
      const b = scene.background;
      const data = {
        x: Float64Array.from(b.x),
        y: Float64Array.from(b.y),
        rings: b.rings,
        color: bgcolor,
      };
      if (!prims.fill) {
        prims.fill = createLazyFillPrimitive(ctx.primitives, data);
        ctx.add(prims.fill);
      } else prims.fill.update(data);
      prims.fill.setTransform(transform);
      prims.fill.object.renderOrder = POLAR_ORDER.background;
    }
    syncLines(ctx, prims.grid, scene.grid, transform, POLAR_ORDER.grid);
    syncLayer(ctx, prims.below, scene.below, transform, POLAR_ORDER.axesBelow);
    syncLayer(ctx, prims.above, scene.above, transform, POLAR_ORDER.axesAbove);
  }

  #drop(ctx: ComponentDrawContext, prims: SubplotPrimitives): void {
    if (prims.arc) ctx.remove(prims.arc);
    if (prims.fill) ctx.remove(prims.fill);
    for (const p of prims.grid) ctx.remove(p);
    prims.grid.length = 0;
    dropLayer(ctx, prims.below);
    dropLayer(ctx, prims.above);
  }

  /** Redraw one subplot's axes after its view changed (drag previews). */
  #redraw(sp: PolarSubplot): void {
    this.#drawSubplot(this.#ctx, sp.id, sp);
    this.#ctx.invalidate();
  }

  // ---- Hit tests ------------------------------------------------------------------------------------

  /** The radial drag handle (0: inner end, 1: outer end) under `(x, y)`. */
  #radialHandleAt(
    sp: PolarSubplot,
    x: number,
    y: number,
  ): { index: 0 | 1; tx: number; ty: number } | undefined {
    const radial = (sp.layout['radialaxis'] ?? {}) as Container;
    if (radial['visible'] !== true || !(sp.innerRadius < sp.radius)) return undefined;
    const a = deg2rad(sp.radialAxisAngle);
    const half = RADIAL_BOX / 2;
    for (const index of [1, 0] as const) {
      const d = index === 1 ? sp.radius + half : sp.innerRadius - half;
      const tx = sp.cx + d * Math.cos(a);
      const ty = sp.cy - d * Math.sin(a);
      if (Math.abs(x - tx) > half || Math.abs(y - ty) > half) continue;
      // The inner handle is under the plot area (Plotly draws the main drag over it).
      if (index === 0 && this.#inPlot(sp, x, y)) continue;
      return { index, tx, ty };
    }
    return undefined;
  }

  /** Whether `(x, y)` is in the band just outside the subplot, where drags rotate it. */
  #inAngularBand(sp: PolarSubplot, x: number, y: number): boolean {
    if (sp.vangles && !sp.full) return false;
    const [gx, gy] = sp.toGeometric(x, y);
    const a = Math.atan2(gy, gx);
    if (!isAngleInsideSector(a, sp.sector)) return false;
    const r = Math.hypot(gx, gy) / polygonScale(a, sp.vangles);
    return r >= sp.radius && r <= sp.radius + ANGULAR_BAND;
  }

  #inPlot(sp: PolarSubplot, x: number, y: number): boolean {
    const [gx, gy] = sp.toGeometric(x, y);
    return sp.inside(gx, gy);
  }

  // ---- Pointer ------------------------------------------------------------------------------------

  handlePointer(event: ComponentPointerEvent): boolean {
    const ctx = this.#ctx;
    const chart = ctx.chart;
    if (!chart || this.#subplots.size === 0) return false;
    const settings = chart.interaction;
    if (settings.staticPlot) return false;
    const dragmode = settings.dragmode;
    if (this.#drag) return this.#dragPointer(event);
    if (dragmode === false) return false;
    const subplots = [...this.#subplots.values()].reverse();
    if (event.type === 'move' || event.type === 'down') {
      for (const sp of subplots) {
        const handle = this.#radialHandleAt(sp, event.x, event.y);
        if (handle) {
          if (event.type === 'down' && event.button === 0) {
            this.#drag = {
              kind: 'radial',
              sp,
              start: viewOf(sp),
              index: handle.index,
              x0: event.x,
              y0: event.y,
              tx: handle.tx,
              ty: handle.ty,
              mode: undefined,
              range: undefined,
              angle: undefined,
            };
          } else event.cursor = 'crosshair';
          return true;
        }
        if (this.#inAngularBand(sp, event.x, event.y)) {
          if (event.type === 'down' && event.button === 0) {
            const [gx, gy] = sp.toGeometric(event.x, event.y);
            this.#drag = {
              kind: 'rotate',
              sp,
              start: viewOf(sp),
              a0: Math.atan2(gy, gx),
              rot0: sp.rotation,
              angle0: sp.radialAxisAngle,
              rotation: undefined,
              angle: undefined,
            };
          } else event.cursor = 'move';
          return true;
        }
        if (
          event.type === 'down' &&
          event.button === 0 &&
          dragmode === 'zoom' &&
          this.#inPlot(sp, event.x, event.y)
        ) {
          // Not taken: the chart keeps the gesture (clicks on points still emit `click`); the
          // zoom box follows the pointer through document listeners.
          this.#startZoom(sp, event);
          return false;
        }
      }
      return false;
    }
    if (event.type === 'dblclick' && (dragmode === 'zoom' || dragmode === 'pan')) {
      for (const sp of subplots) {
        if (!this.#inPlot(sp, event.x, event.y)) continue;
        this.#reset(sp.id);
        chart.emit('doubleclick', undefined);
        return true;
      }
    }
    return false;
  }

  #dragPointer(event: ComponentPointerEvent): boolean {
    const drag = this.#drag!;
    const chart = this.#ctx.chart!;
    const sp = drag.sp;
    if (event.type === 'move') {
      if (drag.kind === 'radial') this.#radialMove(drag, event.x - drag.x0, event.y - drag.y0);
      else this.#rotateMove(drag, event.x, event.y);
      return true;
    }
    if (event.type === 'leave') {
      // A cancelled gesture (pointercancel): back to where the drag started.
      this.#drag = undefined;
      sp.setView(drag.start);
      this.#redraw(sp);
      return true;
    }
    if (event.type === 'up') {
      this.#drag = undefined;
      const update = this.#dragUpdate(drag);
      if (update) chart.relayout(update, { gui: true }).catch(() => undefined);
      return true;
    }
    return true;
  }

  /** The relayout of a drag (Plotly's keys), or `undefined` when nothing changed. */
  #dragUpdate(drag: Drag): Record<string, unknown> | undefined {
    const id = drag.sp.id;
    if (drag.kind === 'radial') {
      if (drag.angle !== undefined) return { [`${id}.radialaxis.angle`]: drag.angle };
      if (drag.range) {
        const v = drag.sp.radialScale.l2r(drag.range[drag.index]);
        return { [`${id}.radialaxis.range[${drag.index}]`]: v };
      }
      return undefined;
    }
    if (drag.rotation === undefined) return undefined;
    return drag.angle !== undefined
      ? {
          [`${id}.angularaxis.rotation`]: drag.rotation,
          [`${id}.radialaxis.angle`]: drag.angle,
        }
      : { [`${id}.angularaxis.rotation`]: drag.rotation };
  }

  /** plotly.js `updateRadialDrag`'s `moveFn`: re-range along the axis, rotate across it. */
  #radialMove(drag: Extract<Drag, { kind: 'radial' }>, dx0: number, dy0: number): void {
    const sp = drag.sp;
    const small = Math.hypot(dx0, dy0) < MINDRAG;
    const dx = small ? 0 : dx0;
    const dy = small ? 0 : dy0;
    const a0 = deg2rad(sp.radialAxisAngle);
    if (!drag.mode && !small) drag.mode = radialDragMode(dx, dy, a0, drag.index);
    if (drag.mode === 'rotate') {
      const x1 = drag.tx + dx;
      const y1 = drag.ty + dy;
      let a = Math.atan2(sp.cy - y1, x1 - sp.cx);
      if (sp.vangles) a = snapToVertexAngle(a, sp.vangles);
      drag.angle = rad2deg(a);
      sp.setView({ angle: drag.angle });
    } else if (drag.mode === 'range') {
      const range = rerange(drag.start.range, drag.index, dx, dy, a0, sp.radius, sp.innerRadius);
      // Never flip the range.
      if (!range) return;
      drag.range = range;
      sp.setView({ range });
    } else return;
    this.#redraw(sp);
    const update = this.#dragUpdate(drag);
    if (update) this.#ctx.chart?.emit('relayouting', update);
  }

  /** plotly.js `updateAngularDrag`'s `moveFn`: rotate by the angle swept around the center. */
  #rotateMove(drag: Extract<Drag, { kind: 'rotate' }>, x: number, y: number): void {
    const sp = drag.sp;
    const [gx, gy] = sp.toGeometric(x, y);
    const da = rad2deg(Math.atan2(gy, gx) - drag.a0);
    drag.rotation = drag.rot0 + da;
    drag.angle = sp.vangles ? drag.angle0 + da : undefined;
    sp.setView({
      rotation: modHalf(drag.rotation, 360),
      ...(drag.angle !== undefined ? { angle: drag.angle } : {}),
    });
    this.#redraw(sp);
    const update = this.#dragUpdate(drag);
    if (update) this.#ctx.chart?.emit('relayouting', update);
  }

  // ---- Zoom box ---------------------------------------------------------------------------------

  #startZoom(sp: PolarSubplot, event: ComponentPointerEvent): void {
    const native = event.native as PointerEvent | undefined;
    if (!native || typeof window === 'undefined') return;
    this.#zoomEnd?.();
    const offX = native.clientX - event.x;
    const offY = native.clientY - event.y;
    const pointerId = native.pointerId;
    const [gx0, gy0] = sp.toGeometric(event.x, event.y);
    const a0 = Math.atan2(gy0, gx0);
    const radiusAt = (gx: number, gy: number): number =>
      Math.hypot(gx, gy) / polygonScale(Math.atan2(gy, gx), sp.vangles);
    const rr0Start = radiusAt(gx0, gy0);
    let r0: number | null = null;
    let r1: number | null = null;
    const newRange = (): [unknown, unknown] | undefined => {
      if (r0 === null || r1 === null) return undefined;
      const scale = sp.radialScale;
      return [scale.l2r(sp.px2r(r0)), scale.l2r(sp.px2r(r1))];
    };
    const move = (e: PointerEvent): void => {
      if (e.pointerId !== pointerId) return;
      const [gx, gy] = sp.toGeometric(e.clientX - offX, e.clientY - offY);
      const ring = zoomRing(rr0Start, radiusAt(gx, gy), sp.radius, sp.innerRadius);
      r0 = ring ? ring[0] : null;
      r1 = ring ? ring[1] : null;
      this.#drawZoombox(sp, r0, r1, a0);
      const range = newRange();
      if (range) this.#ctx.chart?.emit('relayouting', { [`${sp.id}.radialaxis.range`]: range });
    };
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== pointerId) return;
      finish();
      const range = newRange();
      if (range) {
        this.#ctx.chart
          ?.relayout({ [`${sp.id}.radialaxis.range`]: range }, { gui: true })
          .catch(() => undefined);
      }
    };
    const finish = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      this.#zoomEnd = undefined;
      this.#drawZoombox(sp, null, null, a0);
    };
    const cancel = (e: PointerEvent): void => {
      if (e.pointerId === pointerId) finish();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    this.#zoomEnd = finish;
  }

  /** Shade the subplot outside the ring `[r0, r1]` (nothing when `null`). */
  #drawZoombox(sp: PolarSubplot, r0: number | null, r1: number | null, _a0: number): void {
    const ctx = this.#ctx;
    if (r0 === null || r1 === null) {
      if (this.#zoombox) ctx.remove(this.#zoombox);
      this.#zoombox = undefined;
      ctx.invalidate();
      return;
    }
    const region = sp.region;
    const parts = [
      regionRings(region),
      regionRings({ ...region, r0: 0, r1 }),
      ...(r0 > 0 ? [regionRings({ ...region, r0: 0, r1: r0 })] : []),
    ];
    const x: number[] = [];
    const y: number[] = [];
    const rings: number[] = [];
    for (const p of parts) {
      for (let k = 0; k < p.rings.length; k++) {
        rings.push(x.length + (p.rings[k] as number));
      }
      x.push(...p.x);
      y.push(...p.y);
    }
    const shade =
      luminance(sp.layout['bgcolor']) > 0.2 ? ([0, 0, 0, 0.4] as const) : ([1, 1, 1, 0.3] as const);
    const data = {
      x: Float64Array.from(x),
      y: Float64Array.from(y),
      rings,
      polygons: [0],
      fillRule: 'evenodd' as const,
      color: [...shade] as [number, number, number, number],
    };
    if (!this.#zoombox) {
      this.#zoombox = createLazyFillPrimitive(ctx.primitives, data);
      ctx.add(this.#zoombox);
    } else this.#zoombox.update(data);
    this.#zoombox.setTransform({
      scaleX: 1,
      scaleY: 1,
      offsetX: sp.cx,
      offsetY: ctx.overlay.size.height - sp.cy,
    });
    this.#zoombox.object.renderOrder = POLAR_ORDER.zoombox;
    ctx.invalidate();
  }

  /** Back to the first drawn view (double-click). */
  #reset(id: string): void {
    const init = this.#initial.get(id);
    const chart = this.#ctx.chart;
    if (!init || !chart) return;
    const update: Record<string, unknown> = {};
    if (init.autorange === false && Array.isArray(init.range)) {
      update[`${id}.radialaxis.range`] = [...(init.range as unknown[])];
      update[`${id}.radialaxis.autorange`] = false;
    } else {
      update[`${id}.radialaxis.range`] = null;
      update[`${id}.radialaxis.autorange`] = init.autorange ?? true;
    }
    update[`${id}.radialaxis.angle`] = init.angle ?? null;
    update[`${id}.angularaxis.rotation`] = init.rotation ?? null;
    chart.relayout(update, { gui: true }).catch(() => undefined);
  }

  dispose(): void {
    this.#zoomEnd?.();
    this.#prims.clear();
  }
}

/**
 * The polar axes component: draws polar subplots and runs their drags (see the module comment).
 * `sciTraces` includes it; register it with the polar traces in partial bundles.
 */
export const polarComponent: ComponentModule = {
  name: 'polar',
  // Under the other components (the legend, titles) like the cartesian axes.
  order: -10,
  draw: {
    create: (ctx) => new PolarView(ctx),
  },
};
