/**
 * `splom` rendering (plan E10.9): one {@link MarkerMatrix} per trace holds every visible
 * dimension as one GPU column (uploaded once) and the per-sample style (uploaded once, shared by
 * every cell); each drawn cell is one instanced draw ({@link MarkerMatrixCell}) in its subplot's
 * scissored viewport, pairing two columns. So `d` dimensions cost `d` column uploads and `d²` draw
 * calls (independent of the sample count), a restyle or a selection updates one set of style
 * buffers for all cells, and zoom / pan only sets each cell's transform uniforms.
 */
import {
  createMarkerMatrix,
  type MarkerMatrix,
  type MarkerMatrixCell,
  type Viewport,
} from '@mk7s/holochart-render';
import type {
  SubplotInfo,
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import { markerStyle, traceRenderOrder, type ScatterCalc } from '@mk7s/holochart-traces-basic';
import type { SplomCalc } from './calc.ts';
import { cellsOf } from './defaults.ts';

/** Markers draw above the trace's other layers, as scatter markers do. */
const MARKER_LAYER = 0.3;

interface DrawnCell {
  readonly cell: MarkerMatrixCell;
  readonly viewport: Viewport;
  readonly subplot: string;
}

/** The shared style of every cell (scatter's marker style, with the selection applied). */
function matrixStyle(ctx: TracePlotContext<SplomCalc>) {
  // `markerStyle` reads `length` and the drawn sizes from the calc.
  const calc = { length: ctx.calc.length, markerSize: ctx.calc.markerSize } as ScatterCalc;
  return markerStyle(ctx.trace, {
    calc,
    fullLayout: ctx.fullLayout,
    selectedPoints: ctx.selectedPoints ?? null,
  });
}

/** Column index in the matrix of each dimension (hidden dimensions have none). */
function columnIndices(calc: SplomCalc): {
  columns: Float64Array[];
  index: (number | undefined)[];
} {
  const columns: Float64Array[] = [];
  const index = calc.columns.map((c) => {
    if (!c) return undefined;
    columns.push(c);
    return columns.length - 1;
  });
  return { columns, index };
}

class SplomView implements TraceView<SplomCalc> {
  #matrix: MarkerMatrix | undefined;
  #index: (number | undefined)[] = [];
  /** Drawn cells by key (`subplot:x:y`). */
  readonly #cells = new Map<string, DrawnCell>();

  constructor(ctx: TracePlotContext<SplomCalc>) {
    this.#sync(ctx);
  }

  update(ctx: TracePlotContext<SplomCalc>, plan: TraceUpdatePlan): void {
    if (plan.calc) {
      // New data: every column is uploaded again (once each), then the style.
      this.#sync(ctx);
      return;
    }
    if (plan.plot || plan.style || plan.selection === true) this.#matrix?.update(matrixStyle(ctx));
    // Layout passes may add or remove subplots: keep the cells in step with `ctx.cells`.
    this.#reconcile(ctx);
    this.#setTransforms(ctx);
  }

  dispose(): void {
    // Disposing the matrix disposes its cells; the runtime then drops them from their viewports.
    this.#matrix?.dispose();
    this.#matrix = undefined;
    this.#cells.clear();
  }

  #sync(ctx: TracePlotContext<SplomCalc>): void {
    const { columns, index } = columnIndices(ctx.calc);
    this.#index = index;
    const style = matrixStyle(ctx);
    if (!this.#matrix) {
      this.#matrix = createMarkerMatrix(ctx.primitives, columns, style);
    } else {
      this.#matrix.setColumns(columns);
      this.#matrix.update(style);
    }
    this.#reconcile(ctx);
    this.#setTransforms(ctx);
  }

  /** Create cells for new subplots, drop cells whose subplot (or viewport) went away. */
  #reconcile(ctx: TracePlotContext<SplomCalc>): void {
    const matrix = this.#matrix;
    if (!matrix) return;
    const bySubplot = new Map<string, { x: number; y: number }>();
    for (const c of cellsOf(ctx.trace)) bySubplot.set(c.xaxis + c.yaxis, c);
    const order = traceRenderOrder(ctx.trace, ctx.index) + MARKER_LAYER;
    const wanted = new Map<string, SubplotInfo>();
    for (const sp of ctx.cells ?? []) {
      const dims = bySubplot.get(sp.id);
      if (!dims) continue;
      const x = this.#index[dims.x];
      const y = this.#index[dims.y];
      if (x === undefined || y === undefined) continue;
      wanted.set(`${sp.id}:${x}:${y}`, sp);
    }
    for (const [key, drawn] of this.#cells) {
      const sp = wanted.get(key);
      if (sp && sp.viewport === drawn.viewport) continue;
      this.#cells.delete(key);
      ctx.remove(drawn.cell);
    }
    for (const [key, sp] of wanted) {
      const drawn = this.#cells.get(key);
      if (drawn) {
        drawn.cell.object.renderOrder = order;
        continue;
      }
      const [, x, y] = key.split(':').map(Number) as [number, number, number];
      const cell = matrix.createCell(x, y, { renderOrder: order });
      ctx.add(cell, sp.viewport);
      this.#cells.set(key, { cell, viewport: sp.viewport, subplot: sp.id });
    }
  }

  #setTransforms(ctx: TracePlotContext<SplomCalc>): void {
    if (this.#cells.size === 0) return;
    const bySubplot = new Map<string, SubplotInfo>();
    for (const sp of ctx.cells ?? []) bySubplot.set(sp.id, sp);
    for (const drawn of this.#cells.values()) {
      const sp = bySubplot.get(drawn.subplot);
      if (sp) drawn.cell.setTransform(sp.transform);
    }
  }
}

/** The splom module's `plot` part. */
export const splomRenderer: TraceRenderer<SplomCalc> = {
  create: (ctx) => new SplomView(ctx),
};
