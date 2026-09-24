/**
 * The shapes component (plan E5.5): `layout.shapes[]` lines, rectangles, ellipses and SVG paths.
 *
 * ## Primitives
 *
 * Shapes are grouped by where they draw (a viewport and draw order, see `shared/layers.ts`) and by
 * coordinate class (see `geometry.ts`): each group is one fill and one line primitive (per fill
 * rule / dash pattern), plus one text batch per placement for labels. Groups are updated in place:
 * geometry is only re-uploaded when it changed in class space, and a zoom or pan sets transforms.
 *
 * ## Editing
 *
 * With `config.editable`, `config.edits.shapePosition` or a shape's own `editable`, dragging a shape
 * moves it, dragging a line's end moves that end and dragging a rect's or ellipse's edge or corner
 * resizes it. The drag previews locally and commits one `relayout` (`shapes[i].x0`, …) on release.
 */
import { createFillPrimitive, LinePrimitive, type FillPrimitive } from '@mk7s/holochart-render';
import type {
  ComponentDrawContext,
  ComponentModule,
  ComponentPointerEvent,
  ComponentUpdatePlan,
  ComponentView,
  SubplotInfo,
} from '@mk7s/holochart-runtime';
import type { LabelItem } from '../axes/geometry.ts';
import { TextBatch } from '../shared/batches.ts';
import { findChart, fireAndForget } from '../shared/host.ts';
import { handleLinkPointer } from '../shared/text.ts';
import {
  classTransform,
  LayerHost,
  type LayerPlacement,
  type LayerStack,
} from '../shared/layers.ts';
import {
  cachedPath,
  shapeDim,
  shapeExtremes,
  shapeGeometry,
  type Ring,
  type ShapeDim,
  type ShapeEnv,
  type ShapeGeometry,
} from './geometry.ts';
import type { PathValue } from './path.ts';
import { shapesAttributes, supplyShapeDefaults, type FullShape } from './schema.ts';

/** The defaulted shapes of a layout. */
export function shapesOf(fullLayout: Record<string, unknown>): FullShape[] {
  const list = fullLayout['shapes'];
  return Array.isArray(list) ? (list as FullShape[]) : [];
}

/** Where a shape sits in Plotly's layer stack. */
export function shapeStack(
  s: Pick<FullShape, 'layer'>,
  x: Pick<ShapeDim, 'paper'>,
  y: Pick<ShapeDim, 'paper'>,
): LayerStack {
  if (s.layer === 'above') return 'upper';
  return x.paper || y.paper ? 'lower' : s.layer;
}

/** The subplot drawn with axes `x` and `y`. */
export function subplotOf(
  subplots: ReadonlyMap<string, SubplotInfo>,
  x: { id: string } | undefined,
  y: { id: string } | undefined,
): SubplotInfo | undefined {
  if (!x || !y) return undefined;
  for (const sp of subplots.values()) if (sp.xaxis.id === x.id && sp.yaxis.id === y.id) return sp;
  return undefined;
}

interface FillAcc {
  x: number[];
  y: number[];
  rings: number[];
  polygons: number[];
  color: number[];
}

interface LineAcc {
  x: number[];
  y: number[];
  starts: number[];
  color: number[];
  width: number[];
}

/** One group's geometry before upload. */
interface Group {
  placement: LayerPlacement;
  x: ShapeDim['axis'];
  y: ShapeDim['axis'];
  rule: 'simple' | 'evenodd' | 'nonzero';
  dash: string;
  fill?: FillAcc;
  line?: LineAcc;
}

/**
 * A closed ring as one polyline that starts and ends mid-edge, so its ends meet on a straight
 * segment (butt caps line up) instead of leaving a notch at a corner.
 */
export function closedPolyline(r: Pick<Ring, 'x' | 'y'>): { x: number[]; y: number[] } {
  const n = r.x.length;
  if (n < 3) return { x: [...r.x], y: [...r.y] };
  const mx = ((r.x[0] as number) + (r.x[1] as number)) / 2;
  const my = ((r.y[0] as number) + (r.y[1] as number)) / 2;
  const x = [mx, ...r.x.slice(1), r.x[0] as number, mx];
  const y = [my, ...r.y.slice(1), r.y[0] as number, my];
  return { x, y };
}

/** Append one shape to its fill and line accumulators (pure; exported for tests). */
export function accumulateShape(
  g: ShapeGeometry,
  fill: FillAcc | undefined,
  line: LineAcc | undefined,
): void {
  if (fill && g.filled) {
    const first = fill.rings.length;
    for (const r of g.rings) {
      if (r.x.length < 3) continue;
      fill.rings.push(fill.x.length);
      fill.x.push(...r.x);
      fill.y.push(...r.y);
    }
    if (fill.rings.length > first) {
      fill.polygons.push(first);
      fill.color.push(...g.fillColor);
    }
  }
  if (line && g.lineWidth > 0 && g.lineColor[3] > 0) {
    for (const r of g.rings) {
      const p = r.closed ? closedPolyline(r) : r;
      if (p.x.length < 2) continue;
      if (line.x.length > 0) line.starts.push(line.x.length);
      line.x.push(...p.x);
      line.y.push(...p.y);
      for (let i = 0; i < p.x.length; i++) {
        line.color.push(...g.lineColor);
        line.width.push(g.lineWidth);
      }
    }
  }
}

type DragMode = 'move' | 'start' | 'end' | `resize-${string}`;

interface Drag {
  index: number;
  mode: DragMode;
  base: ShapeGeometry;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
}

type Override = Partial<
  Pick<FullShape, 'x0' | 'x1' | 'y0' | 'y1' | 'path' | 'xanchor' | 'yanchor'>
>;

/** Distance from `p` to the segment `a`–`b`. */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Rings of a geometry in container px. */
function pxRings(g: ShapeGeometry): Ring[] {
  return g.rings.map((r) => ({
    x: r.x.map((u) => g.x.toPx(u)),
    y: r.y.map((v) => g.y.toPx(v)),
    closed: r.closed,
  }));
}

/** Handle size, px: how close to an end or edge a pointer must be to grab it. */
const GRAB = 6;

/**
 * What dragging at (`px`, `py`) does to a shape: move it, move a line end, or resize a box along
 * the edges it is near (`resize-nw`, `resize-e`, …). `undefined` when the point misses the shape.
 */
export function hitShape(g: ShapeGeometry, px: number, py: number): DragMode | undefined {
  const slop = Math.max(GRAB, g.lineWidth / 2 + 2);
  const t = g.shape.type;
  if (g.ends && t === 'line') {
    const [x0, y0, x1, y1] = [
      g.x.toPx(g.ends[0]),
      g.y.toPx(g.ends[1]),
      g.x.toPx(g.ends[2]),
      g.y.toPx(g.ends[3]),
    ];
    if (Math.hypot(px - x0, py - y0) <= slop + 2) return 'start';
    if (Math.hypot(px - x1, py - y1) <= slop + 2) return 'end';
    return segmentDistance(px, py, x0, y0, x1, y1) <= slop ? 'move' : undefined;
  }
  if (g.ends) {
    const xs = [g.x.toPx(g.ends[0]), g.x.toPx(g.ends[2])];
    const ys = [g.y.toPx(g.ends[1]), g.y.toPx(g.ends[3])];
    const [l, r] = [Math.min(...xs), Math.max(...xs)];
    const [tp, b] = [Math.min(...ys), Math.max(...ys)];
    if (px < l - slop || px > r + slop || py < tp - slop || py > b + slop) return undefined;
    // Small boxes only move (Plotly: resizing needs room for the handles).
    if (r - l < 3 * GRAB || b - tp < 3 * GRAB) return 'move';
    const v = Math.abs(py - tp) <= slop ? 'n' : Math.abs(py - b) <= slop ? 's' : '';
    const h = Math.abs(px - l) <= slop ? 'w' : Math.abs(px - r) <= slop ? 'e' : '';
    return v || h ? `resize-${v}${h}` : 'move';
  }
  // Paths: the stroke, or inside a closed subpath (even-odd).
  let inside = false;
  for (const r of pxRings(g)) {
    const n = r.x.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (!r.closed && j === 0) break;
      const [ax, ay, bx, by] = [r.x[i]!, r.y[i]!, r.x[j]!, r.y[j]!];
      if (segmentDistance(px, py, ax, ay, bx, by) <= slop) return 'move';
      if (r.closed && ay > py !== by > py && px < ax + ((py - ay) * (bx - ax)) / (by - ay)) {
        inside = !inside;
      }
    }
  }
  return inside ? 'move' : undefined;
}

/** Shift a value of `dim` by `d` px, in its reference units. */
function shiftValue(dim: ShapeDim, u: number, d: number): unknown {
  return dim.fromPx(dim.toPx(u) + d);
}

/** Path value → text: numbers as-is, dates with `_` between date and time (Plotly). */
function pathText(v: unknown): string {
  return typeof v === 'string' ? v.replace(' ', '_') : String(v);
}

/** A path with every coordinate moved by (`dx`, `dy`) px, written with absolute commands. */
export function movePath(d: string, x: ShapeDim, y: ShapeDim, dx: number, dy: number): string {
  const out: string[] = [];
  for (const seg of cachedPath(d).segments) {
    const parts: string[] = [seg.type];
    seg.x.forEach((vx: PathValue, i) => {
      const nx = shiftValue(x, x.toClass(vx), dx);
      const ny = shiftValue(y, y.toClass(seg.y[i] as PathValue), dy);
      parts.push(`${pathText(nx)},${pathText(ny)}`);
    });
    out.push(parts.join(''));
  }
  return out.join('');
}

/** New positions of a dragged shape, in reference units (the `relayout` values). */
export function dragOverride(drag: Drag, env: ShapeEnv): Override {
  const { base: g, mode, dx, dy } = drag;
  const s = g.shape;
  if (s.type === 'path') {
    return typeof s.path === 'string' ? { path: movePath(s.path, g.x, g.y, dx, dy) } : {};
  }
  if (!g.ends) return {};
  const [x0, y0, x1, y1] = g.ends;
  const out: Override = {};
  const moveX = (which: 'x0' | 'x1', d: number): void => {
    out[which] = shiftValue(g.x, which === 'x0' ? x0 : x1, d);
  };
  const moveY = (which: 'y0' | 'y1', d: number): void => {
    out[which] = shiftValue(g.y, which === 'y0' ? y0 : y1, d);
  };
  if (mode === 'move') {
    // Pixel-sized dimensions move their anchor; the px offsets stay.
    for (const [letter, d] of [
      ['x', dx],
      ['y', dy],
    ] as const) {
      const dim = letter === 'x' ? g.x : g.y;
      if (dim.pixel) {
        const scaled = shapeDim(s[`${letter}ref`], letter, false, undefined, env);
        const a = s[`${letter}anchor`];
        if (!scaled) continue;
        const u = a === undefined || a === null ? scaled.at(0.5) : scaled.toClass(a);
        out[`${letter}anchor`] = shiftValue(scaled, u, d);
      } else if (letter === 'x') {
        moveX('x0', d);
        moveX('x1', d);
      } else {
        moveY('y0', d);
        moveY('y1', d);
      }
    }
    return out;
  }
  if (mode === 'start' || mode === 'end') {
    moveX(mode === 'start' ? 'x0' : 'x1', dx);
    moveY(mode === 'start' ? 'y0' : 'y1', dy);
    return out;
  }
  const edges = mode.slice('resize-'.length);
  const left = g.x.toPx(x0) <= g.x.toPx(x1) ? 'x0' : 'x1';
  const top = g.y.toPx(y0) <= g.y.toPx(y1) ? 'y0' : 'y1';
  if (edges.includes('w')) moveX(left, dx);
  if (edges.includes('e')) moveX(left === 'x0' ? 'x1' : 'x0', dx);
  if (edges.includes('n')) moveY(top, dy);
  if (edges.includes('s')) moveY(top === 'y0' ? 'y1' : 'y0', dy);
  return out;
}

const CURSORS: Record<string, string> = { start: 'crosshair', end: 'crosshair', move: 'move' };

class ShapesView implements ComponentView {
  #ctx: ComponentDrawContext;
  readonly #layers: LayerHost;
  readonly #fills = new Map<string, { prim: FillPrimitive; key: string }>();
  readonly #lines = new Map<string, { prim: LinePrimitive; key: string }>();
  readonly #texts = new Map<string, TextBatch>();
  #geoms: ShapeGeometry[] = [];
  #drag: Drag | undefined;

  constructor(ctx: ComponentDrawContext) {
    this.#ctx = ctx;
    this.#layers = new LayerHost(ctx, 'shapes');
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

  #env(): ShapeEnv {
    return { plotArea: this.#ctx.plotArea, axes: this.#ctx.axes };
  }

  #draw(): void {
    const ctx = this.#ctx;
    const env = this.#env();
    const drag = this.#drag;
    this.#geoms = [];
    for (const s of shapesOf(ctx.fullLayout)) {
      const over = drag?.index === s._index ? dragOverride(drag, env) : undefined;
      const g = shapeGeometry(s, env, over);
      if (g) this.#geoms.push(g);
    }
    this.#layers.begin(ctx);
    const groups = new Map<string, Group>();
    const labels = new Map<string, { placement: LayerPlacement; items: LabelItem[] }>();
    for (const g of this.#geoms) {
      const req = {
        stack: shapeStack(g.shape, g.x, g.y),
        clipX: g.x.clip,
        clipY: g.y.clip,
        subplot: subplotOf(ctx.subplots, g.x.owner, g.y.owner),
      };
      const cls = `${g.x.axis?.id ?? 'px'}|${g.y.axis?.id ?? 'px'}`;
      for (const placement of this.#layers.place(req)) {
        const fk = `${placement.key}|${cls}|fill|${g.fillRule}`;
        const lk = `${placement.key}|${cls}|line|${g.dash}`;
        const make = (key: string): Group => {
          let grp = groups.get(key);
          if (!grp) {
            grp = { placement, x: g.x.axis, y: g.y.axis, rule: g.fillRule, dash: g.dash };
            groups.set(key, grp);
          }
          return grp;
        };
        const fg = make(fk);
        const lg = make(lk);
        fg.fill ??= { x: [], y: [], rings: [], polygons: [], color: [] };
        lg.line ??= { x: [], y: [], starts: [], color: [], width: [] };
        accumulateShape(g, fg.fill, lg.line);
        if (g.label) {
          let l = labels.get(placement.key);
          if (!l) labels.set(placement.key, (l = { placement, items: [] }));
          l.items.push(g.label);
        }
      }
    }
    this.#upload(groups, labels);
    this.#layers.end();
  }

  #upload(
    groups: Map<string, Group>,
    labels: Map<string, { placement: LayerPlacement; items: LabelItem[] }>,
  ): void {
    const ctx = this.#ctx;
    const usedFills = new Set<string>();
    const usedLines = new Set<string>();
    for (const [key, grp] of groups) {
      const t = classTransform(grp.x, grp.y, grp.placement.world);
      const { viewport, order } = grp.placement;
      const f = grp.fill;
      if (f && f.polygons.length > 0) {
        usedFills.add(key);
        const data = {
          x: Float64Array.from(f.x),
          y: Float64Array.from(f.y),
          rings: f.rings,
          polygons: f.polygons,
          color: Float32Array.from(f.color),
          fillRule: grp.rule,
        };
        const k = JSON.stringify(f);
        let e = this.#fills.get(key);
        if (!e) {
          const prim = createFillPrimitive(ctx.primitives, data);
          prim.object.renderOrder = order;
          ctx.add(prim, viewport);
          this.#fills.set(key, (e = { prim, key: k }));
        } else if (e.key !== k) {
          e.prim.update(data);
          e.key = k;
        }
        e.prim.setTransform(t);
      }
      const l = grp.line;
      if (l && l.x.length > 0) {
        usedLines.add(key);
        const k = JSON.stringify(l);
        let e = this.#lines.get(key);
        if (!e) {
          const prim = new LinePrimitive(ctx.primitives, {});
          prim.object.renderOrder = order + 0.25;
          ctx.add(prim, viewport);
          this.#lines.set(key, (e = { prim, key: '' }));
        }
        if (e.key !== k) {
          e.prim.update({
            x: Float64Array.from(l.x),
            y: Float64Array.from(l.y),
            starts: l.starts,
            color: Float32Array.from(l.color),
            width: Float32Array.from(l.width),
            dash: grp.dash,
            cap: 'butt',
            join: 'miter',
          });
          e.key = k;
        }
        e.prim.setTransform(t);
      }
    }
    for (const [key, e] of this.#fills) {
      if (usedFills.has(key)) continue;
      ctx.remove(e.prim);
      this.#fills.delete(key);
    }
    for (const [key, e] of this.#lines) {
      if (usedLines.has(key)) continue;
      ctx.remove(e.prim);
      this.#lines.delete(key);
    }
    for (const [key, { placement, items }] of labels) {
      let batch = this.#texts.get(key);
      if (!batch) {
        batch = new TextBatch(ctx, ctx.primitives, placement.viewport, placement.order + 0.5);
        this.#texts.set(key, batch);
      }
      batch.setTransform(placement.world);
      batch.set(items);
    }
    for (const [key, batch] of this.#texts) {
      if (labels.has(key)) continue;
      batch.dispose();
      this.#texts.delete(key);
    }
  }

  #canEdit(s: FullShape): boolean {
    if (s.editable) return true;
    const ctx = this.#ctx;
    const cfg = ctx.fullConfig as
      { editable?: unknown; edits?: Record<string, unknown> } | undefined;
    if (cfg?.edits?.['shapePosition'] === true) return true;
    if (cfg?.editable !== true) return false;
    // Defaulted `edits` are all false; only an explicit input `false` opts out of `editable`.
    const input = findChart(ctx)?.config as { edits?: Record<string, unknown> } | undefined;
    return input?.edits?.['shapePosition'] !== false;
  }

  handlePointer(event: ComponentPointerEvent): boolean {
    const drag = this.#drag;
    if (drag) {
      if (event.type === 'move') {
        drag.dx = event.x - drag.x0;
        drag.dy = event.y - drag.y0;
        event.cursor = CURSORS[drag.mode] ?? `${drag.mode.slice(7)}-resize`;
        this.#draw();
        this.#ctx.invalidate();
      } else if (event.type === 'up' || event.type === 'leave') {
        this.#drag = undefined;
        this.#commit(drag);
      }
      return event.type !== 'leave';
    }
    // Links in shape labels (E2.10).
    for (const batch of this.#texts.values()) {
      if (handleLinkPointer(event, batch.linkAt(event.x, event.y))) return true;
    }
    if (event.type !== 'move' && event.type !== 'down' && event.type !== 'click') return false;
    // Topmost first: upper-layer shapes, then later shapes.
    const order = [...this.#geoms].sort(
      (a, b) =>
        Number(b.shape.layer === 'above') - Number(a.shape.layer === 'above') || b.index - a.index,
    );
    for (const g of order) {
      if (g.index < 0 || !this.#canEdit(g.shape)) continue;
      const mode = hitShape(g, event.x, event.y);
      if (!mode) continue;
      event.cursor = CURSORS[mode] ?? `${mode.slice(7)}-resize`;
      if (event.type === 'down' && event.button === 0) {
        this.#drag = { index: g.index, mode, base: g, x0: event.x, y0: event.y, dx: 0, dy: 0 };
      }
      return true;
    }
    return false;
  }

  #commit(drag: Drag): void {
    const chart = findChart(this.#ctx);
    if (!chart || (drag.dx === 0 && drag.dy === 0)) {
      this.#draw();
      return;
    }
    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dragOverride(drag, this.#env()))) {
      update[`shapes[${drag.index}].${k}`] = v;
    }
    fireAndForget(chart.relayout(update, { gui: true }));
  }

  dispose(): void {
    const ctx = this.#ctx;
    for (const e of this.#fills.values()) ctx.remove(e.prim);
    for (const e of this.#lines.values()) ctx.remove(e.prim);
    for (const b of this.#texts.values()) b.dispose();
    this.#fills.clear();
    this.#lines.clear();
    this.#texts.clear();
    this.#layers.dispose();
  }
}

/** The shapes component (`layout.shapes`, E5.5). */
export const shapesComponent: ComponentModule = {
  name: 'shapes',
  order: 35,
  layoutSchema: { shapes: shapesAttributes },
  supplyLayoutDefaults(_layoutIn, layoutOut) {
    supplyShapeDefaults(layoutOut);
  },
  extremes: (ctx) => shapeExtremes(shapesOf(ctx.fullLayout), ctx.axes, ctx.fullData.length),
  draw: {
    create: (ctx) => new ShapesView(ctx),
  },
};
