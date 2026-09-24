/**
 * `table` renderer (plan E9.13, E22.1). Tables are domain traces: they draw into the overlay
 * viewport, whose world units are container px with a bottom-left origin, so container `(x, y)` is
 * world `(x, height − y)`.
 *
 * ## Virtualization
 *
 * Only the rows on screen (and a margin of one screenful above and below, for measuring) are laid
 * out; only the visible ones become GPU instances and labels. Row heights are measured lazily
 * (`rows.ts`), laid-out rows are cached, and a scroll re-uploads the visible window only: a 100k-row
 * table costs what its visible rows cost.
 *
 * ## Primitives
 *
 * - Cell backgrounds and outlines: instanced rects, one set for the body (clipped to the body, as
 *   Plotly clips the scroll area) and one for the header; a dragged column gets its own pair drawn
 *   above the others.
 * - Text: one batched SDF text primitive per column for the body and one for the header, each
 *   clipped to its column (Plotly clips every column's text to the column).
 * - The scrollbar: a rounded rect right of the table, shown while the pointer moves over the table
 *   or scrolls it and hidden a second later (Plotly).
 *
 * Clipping is a GL scissor per primitive (`clip.ts`), since the overlay viewport is unclipped.
 */
import { toRGBA } from '@mk7s/holochart-core';
import {
  createRectPrimitive,
  createTextPrimitive,
  IDENTITY_TRANSFORM,
  type RectData,
  type RectPrimitive,
  type RGBA,
  type TextLabel,
  type TextPrimitive,
  subscribeFontChanges,
} from '@mk7s/holochart-render';
import {
  getChart,
  type ComponentPointerEvent,
  type TracePlotContext,
  type TraceRenderer,
  type TraceView,
} from '@mk7s/holochart-runtime';
import type { TableCalc } from './calc.ts';
import { CELL_PAD, LINE_SPACING } from './cells.ts';
import { ScissorClip, type ClipRect } from './clip.ts';
import {
  scrollbarState,
  SCROLLBAR_OFFSET,
  SCROLLBAR_WIDTH,
  TableInteraction,
  UPLIFT,
  OVERDRAG,
  type TableHitGeometry,
} from './interaction.ts';
import {
  columnWidths,
  layoutHeader,
  layoutRow,
  placeColumns,
  type HeaderLayout,
  type LaidOutCell,
} from './layout.ts';
import { layoutRows, RowHeights, type RowWindow, type ScrollAnchor } from './rows.ts';

/**
 * Render orders in the overlay (like pie, below figure components in [-10, 0)): body, header,
 * then a dragged column above both, then the scrollbar; trace order within each layer, then
 * column order for the per-column text.
 */
const ORDER = {
  bodyRects: -9.5,
  bodyText: -9.25,
  headerRects: -9,
  headerText: -8.75,
  dragBodyRects: -8.5,
  dragBodyText: -8.25,
  dragHeaderRects: -8,
  dragHeaderText: -7.75,
  scrollbar: -7.5,
} as const;
const orderOf = (layer: number, index: number, column = 0): number =>
  layer + Math.min(index, 999) * 1e-4 + Math.min(column, 999) * 1e-7;

/** Laid-out rows kept for re-drawing while scrolling (cleared on any restyle or resize). */
const ROW_CACHE_SIZE = 4096;
/** How long the scrollbar stays after the last pointer activity (Plotly's hide delay). */
const SCROLLBAR_HIDE_MS = 1000;

/** Rect instances collected for one rect primitive. */
class RectBatch {
  readonly x0: number[] = [];
  readonly y0: number[] = [];
  readonly x1: number[] = [];
  readonly y1: number[] = [];
  readonly fill: number[] = [];
  readonly border: number[] = [];
  readonly width: number[] = [];
  readonly radius: number[] = [];

  push(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    fill: RGBA,
    border: RGBA,
    width: number,
    radius = 0,
  ): void {
    this.x0.push(x0);
    this.y0.push(y0);
    this.x1.push(x1);
    this.y1.push(y1);
    this.fill.push(fill[0], fill[1], fill[2], fill[3]);
    this.border.push(border[0], border[1], border[2], border[3]);
    this.width.push(width);
    this.radius.push(radius);
  }

  data(): Partial<RectData> {
    return {
      x0: Float64Array.from(this.x0),
      y0: Float64Array.from(this.y0),
      x1: Float64Array.from(this.x1),
      y1: Float64Array.from(this.y1),
      fill: Float32Array.from(this.fill),
      borderColor: Float32Array.from(this.border),
      borderWidth: Float32Array.from(this.width),
      cornerRadius: Float32Array.from(this.radius),
      // Plotly strokes cell outlines centered on the edges, crisp (`shape-rendering: crispEdges`).
      borderAlign: 'center',
      snap: true,
    };
  }
}

/** A rect primitive with its clip. */
interface ClippedRects {
  readonly rects: RectPrimitive;
  readonly clip: ScissorClip;
}

/** The text primitives of one column. */
interface ColumnText {
  readonly body: TextPrimitive;
  readonly header: TextPrimitive;
  readonly bodyClip: ScissorClip;
  readonly headerClip: ScissorClip;
}

/** Everything one redraw produces. */
interface Frame {
  readonly bodyRects: RectBatch;
  readonly headerRects: RectBatch;
  readonly dragBodyRects: RectBatch;
  readonly dragHeaderRects: RectBatch;
  readonly scrollbar: RectBatch;
  readonly bodyLabels: Map<number, TextLabel[]>;
  readonly headerLabels: Map<number, TextLabel[]>;
}

/** The chart that owns a pointer event's target (the canvas inside the chart's element). */
function chartOf(event: ComponentPointerEvent): ReturnType<typeof getChart> {
  let node = (event.native?.target ?? null) as Node | null;
  while (node) {
    if (typeof HTMLElement !== 'undefined' && node instanceof HTMLElement) {
      const chart = getChart(node);
      if (chart) return chart;
    }
    node = node.parentNode;
  }
  return undefined;
}

/** Scrollbar color: Plotly's black at 40 % on light paper, white at 40 % on dark paper. */
function scrollbarColor(paper: unknown): RGBA {
  const bg = typeof paper === 'string' ? toRGBA(paper) : null;
  const light = !bg || 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2] > 0.5 || bg[3] < 0.5;
  return light ? [0, 0, 0, 0.4] : [1, 1, 1, 0.4];
}

class TableView implements TraceView<TableCalc> {
  #ctx: TracePlotContext<TableCalc> | undefined;
  #calc: TableCalc | undefined;
  #rows = new RowHeights(0, 20);
  readonly #rowCache = new Map<number, { cells: LaidOutCell[]; height: number }>();
  #header: HeaderLayout = { rows: [], height: 0 };
  #widths: number[] = [];
  #rect = { x: 0, y: 0, width: 0, height: 0 };
  #anchor: ScrollAnchor = { row: 0, offset: 0 };
  #window: RowWindow = { scrollY: 0, first: 0, last: -1, anchor: { row: 0, offset: 0 } };
  #drag: { index: number; x: number; order: readonly number[] } | undefined;
  /** Order shown after a column drop until the restyle it triggered arrives. */
  #pendingOrder: readonly number[] | undefined;
  #geometry: TableHitGeometry | undefined;
  #scrollbarShown = false;
  #hideTimer: ReturnType<typeof setTimeout> | undefined;
  #disposed = false;
  readonly #unsubscribeFonts: () => void;

  #body: ClippedRects | undefined;
  #headerRects: ClippedRects | undefined;
  #dragBody: ClippedRects | undefined;
  #dragHeader: ClippedRects | undefined;
  #scrollbar: RectPrimitive | undefined;
  readonly #text = new Map<number, ColumnText>();

  readonly #interaction = new TableInteraction({
    geometry: () => this.#geometry,
    scrollTo: (y) => this.#scrollTo(y),
    dragColumn: (drag) => {
      this.#drag = drag;
      this.#redraw();
    },
    reorder: (order, event) => this.#reorder(order, event),
    activity: () => this.#activity(),
  });

  constructor(ctx: TracePlotContext<TableCalc>) {
    // Text measured before a web font loaded is off: measure again once it has. Deferred to a
    // microtask so the metrics oracle (listening to the same notifications) has dropped its cache.
    let queued = false;
    const refresh = (): void => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        this.#remeasure();
        this.#redraw();
      });
    };
    const unsubscribe = subscribeFontChanges(refresh);
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    fonts?.addEventListener?.('loadingdone', refresh);
    this.#unsubscribeFonts = () => {
      unsubscribe();
      fonts?.removeEventListener?.('loadingdone', refresh);
    };
    this.update(ctx);
  }

  /**
   * Any update measures the header and the visible rows again (the plan does not matter): the
   * work is bounded by the visible rows, updates don't happen while scrolling, and a layout pass
   * after web fonts loaded must not keep measurements taken with a fallback font. The scroll
   * anchor (a row and an offset into it) keeps the same rows on screen.
   */
  update(ctx: TracePlotContext<TableCalc>): void {
    this.#ctx = ctx;
    const size = ctx.viewport.size;
    const rect = ctx.domain?.rect ??
      ctx.plotArea ?? { x: 0, y: 0, width: size.width, height: size.height };
    // Plotly floors the group size to whole px.
    this.#rect = {
      x: rect.x,
      y: rect.y,
      width: Math.max(0, Math.floor(rect.width)),
      height: Math.max(0, Math.floor(rect.height)),
    };
    if (ctx.calc !== this.#calc) {
      this.#calc = ctx.calc;
      this.#pendingOrder = undefined;
      this.#drag = undefined;
      if (this.#rows.count !== ctx.calc.rowCount) {
        this.#rows = new RowHeights(ctx.calc.rowCount, this.#rows.base);
      }
    }
    this.#remeasure();
    this.#redraw();
  }

  /** Forget measured rows and lay the header out again (text, fonts, formats or widths changed). */
  #remeasure(): void {
    const ctx = this.#ctx;
    if (!ctx || this.#disposed) return;
    const base = Number((ctx.trace['cells'] as { height?: unknown } | undefined)?.height);
    this.#rows.reset(Number.isFinite(base) && base > 0 ? base : 20);
    this.#widths = columnWidths(ctx.calc, this.#rect.width);
    this.#rowCache.clear();
    this.#header = layoutHeader(ctx.trace, ctx.calc, this.#widths);
  }

  handlePointer(event: ComponentPointerEvent): boolean {
    return this.#interaction.handle(event);
  }

  dispose(): void {
    this.#disposed = true;
    this.#unsubscribeFonts();
    if (this.#hideTimer !== undefined) clearTimeout(this.#hideTimer);
    this.#hideTimer = undefined;
    // Primitives were added through ctx.add: the runtime removes and disposes them.
    this.#text.clear();
  }

  // ---- state changes from the interaction ------------------------------------------------------

  #scrollTo(y: number): boolean {
    const before = this.#window.scrollY;
    this.#anchor = this.#rows.anchorAt(y);
    this.#redraw();
    return Math.abs(this.#window.scrollY - before) > 1e-6;
  }

  #activity(): void {
    if (this.#disposed) return;
    if (this.#hideTimer !== undefined) clearTimeout(this.#hideTimer);
    this.#hideTimer = setTimeout(() => {
      this.#hideTimer = undefined;
      if (this.#disposed || !this.#scrollbarShown) return;
      this.#scrollbarShown = false;
      this.#redraw();
    }, SCROLLBAR_HIDE_MS);
    if (!this.#scrollbarShown) {
      this.#scrollbarShown = true;
      this.#redraw();
    }
  }

  /** A column drop: show the new order and restyle `columnorder` (display rank per data column). */
  #reorder(order: readonly number[], event: ComponentPointerEvent): void {
    const ctx = this.#ctx;
    if (!ctx) return;
    this.#pendingOrder = order;
    this.#redraw();
    const ranks = new Array<number>(order.length);
    order.forEach((column, rank) => (ranks[column] = rank));
    chartOf(event)
      ?.restyle({ columnorder: [ranks] }, [ctx.index], { gui: true })
      .catch(() => undefined);
  }

  // ---- drawing ---------------------------------------------------------------------------------

  #rowCells(row: number): { cells: LaidOutCell[]; height: number } {
    let hit = this.#rowCache.get(row);
    if (!hit) {
      const ctx = this.#ctx!;
      hit = layoutRow(ctx.trace, ctx.calc, 'cells', row, this.#widths);
      if (this.#rowCache.size >= ROW_CACHE_SIZE) this.#rowCache.clear();
      this.#rowCache.set(row, hit);
    }
    return hit;
  }

  #redraw(): void {
    const ctx = this.#ctx;
    const calc = this.#calc;
    if (!ctx || !calc || this.#disposed) return;
    const { x: tx, y: ty, width, height } = this.#rect;
    const canvasHeight = ctx.viewport.size.height;
    const header = this.#header;
    const bodyTop = ty + header.height;
    const viewHeight = Math.max(0, height - header.height);
    const margin = Math.ceil(viewHeight / Math.max(1, this.#rows.base));
    this.#window = layoutRows(
      this.#rows,
      this.#anchor,
      viewHeight,
      (i) => this.#rowCells(i).height,
      margin,
    );
    this.#anchor = this.#window.anchor;
    const { scrollY, first, last } = this.#window;

    const order = this.#drag?.order ?? this.#pendingOrder ?? calc.order;
    const columns = placeColumns(this.#widths, order);
    const drag = this.#drag;
    const frame: Frame = {
      bodyRects: new RectBatch(),
      headerRects: new RectBatch(),
      dragBodyRects: new RectBatch(),
      dragHeaderRects: new RectBatch(),
      scrollbar: new RectBatch(),
      bodyLabels: new Map(),
      headerLabels: new Map(),
    };
    for (const c of calc.columns) {
      frame.bodyLabels.set(c.index, []);
      frame.headerLabels.set(c.index, []);
    }
    const colX = (index: number, x: number): number =>
      tx + (drag && drag.index === index ? drag.x : x);
    const lift = (index: number): number => (drag && drag.index === index ? -UPLIFT : 0);

    // Body rows (only the visible window).
    for (let i = first; i <= last; i++) {
      const row = this.#rowCells(i);
      const top = bodyTop + this.#rows.top(i) - scrollY;
      const h = this.#rows.height(i);
      for (const column of columns) {
        const cell = row.cells[column.index];
        if (!cell) continue;
        const dragged = drag?.index === column.index;
        const x = colX(column.index, column.x);
        const y = top + lift(column.index);
        const batch = dragged ? frame.dragBodyRects : frame.bodyRects;
        this.#pushCell(batch, frame.bodyLabels, cell, x, y, column.width, h, canvasHeight);
      }
    }
    // Header rows.
    let top = ty;
    for (const row of header.rows) {
      for (const column of columns) {
        const cell = row.cells[column.index];
        if (!cell) continue;
        const dragged = drag?.index === column.index;
        const x = colX(column.index, column.x);
        const batch = dragged ? frame.dragHeaderRects : frame.headerRects;
        const y = top + lift(column.index);
        this.#pushCell(
          batch,
          frame.headerLabels,
          cell,
          x,
          y,
          column.width,
          row.height,
          canvasHeight,
        );
      }
      top += row.height;
    }
    // Scrollbar (Plotly's glyph: 8 px wide with round caps, 5 px right of the table).
    const bar = scrollbarState(this.#rows.total, viewHeight, scrollY);
    if (this.#scrollbarShown && !drag && bar.barWiggleRoom > 0 && bar.wiggleRoom > 0) {
      const x0 = tx + width + SCROLLBAR_OFFSET;
      const y0 = bodyTop + bar.topY;
      const color = scrollbarColor(ctx.fullLayout['paper_bgcolor']);
      frame.scrollbar.push(
        x0,
        canvasHeight - (y0 + bar.barLength),
        x0 + SCROLLBAR_WIDTH,
        canvasHeight - y0,
        color,
        [0, 0, 0, 0],
        0,
        SCROLLBAR_WIDTH / 2,
      );
    }

    this.#geometry = {
      x: tx,
      y: ty,
      width,
      height,
      headerHeight: header.height,
      columns,
      scrollY,
      scrollbar: bar,
    };
    this.#upload(ctx, frame, columns, bodyTop, viewHeight);
  }

  #pushCell(
    batch: RectBatch,
    labels: Map<number, TextLabel[]>,
    cell: LaidOutCell,
    x: number,
    y: number,
    width: number,
    height: number,
    canvasHeight: number,
  ): void {
    const { style, layout } = cell;
    batch.push(
      x,
      canvasHeight - (y + height),
      x + width,
      canvasHeight - y,
      style.fill,
      style.lineColor,
      style.lineWidth,
    );
    const text = layout.lines.join('\n');
    if (text.trim() === '') return;
    const align = style.align;
    const lx =
      align === 'left' ? x + CELL_PAD : align === 'right' ? x + width - CELL_PAD : x + width / 2;
    labels.get(cell.column)?.push({
      text,
      x: lx,
      y: canvasHeight - (y + layout.baseline),
      font: style.font,
      color: style.color,
      anchorX: align,
      anchorY: 'baseline',
      // Plotly positions a multi-line block by its alignment; its lines stay left-aligned.
      align: layout.lines.length > 1 ? 'left' : align,
      lineHeight: LINE_SPACING,
    });
  }

  #rects(
    ctx: TracePlotContext<TableCalc>,
    current: ClippedRects | undefined,
    batch: RectBatch,
    order: number,
    clip: ClipRect | null,
  ): ClippedRects {
    const data = batch.data();
    let entry = current;
    if (!entry) {
      const rects = createRectPrimitive(ctx.primitives, data);
      ctx.add(rects);
      const scissor = new ScissorClip();
      scissor.attach(rects.object);
      entry = { rects, clip: scissor };
    } else entry.rects.update(data);
    entry.rects.object.renderOrder = order;
    entry.rects.setTransform(IDENTITY_TRANSFORM);
    entry.clip.rect = clip;
    const size = ctx.viewport.size;
    entry.clip.size = { width: size.width, height: size.height };
    return entry;
  }

  #upload(
    ctx: TracePlotContext<TableCalc>,
    frame: Frame,
    columns: readonly { index: number; x: number; width: number }[],
    bodyTop: number,
    viewHeight: number,
  ): void {
    const { x: tx, y: ty, width } = this.#rect;
    const index = ctx.index;
    const bodyClip: ClipRect = {
      x: tx - OVERDRAG,
      y: bodyTop,
      width: width + 2 * OVERDRAG,
      height: viewHeight,
    };
    this.#body = this.#rects(
      ctx,
      this.#body,
      frame.bodyRects,
      orderOf(ORDER.bodyRects, index),
      bodyClip,
    );
    this.#headerRects = this.#rects(
      ctx,
      this.#headerRects,
      frame.headerRects,
      orderOf(ORDER.headerRects, index),
      null,
    );
    this.#dragBody = this.#rects(
      ctx,
      this.#dragBody,
      frame.dragBodyRects,
      orderOf(ORDER.dragBodyRects, index),
      bodyClip,
    );
    this.#dragHeader = this.#rects(
      ctx,
      this.#dragHeader,
      frame.dragHeaderRects,
      orderOf(ORDER.dragHeaderRects, index),
      null,
    );
    const bar = frame.scrollbar.data();
    if (!this.#scrollbar) {
      this.#scrollbar = createRectPrimitive(ctx.primitives, { ...bar, snap: false });
      ctx.add(this.#scrollbar);
    } else this.#scrollbar.update({ ...bar, snap: false });
    this.#scrollbar.object.renderOrder = orderOf(ORDER.scrollbar, index);
    this.#scrollbar.setTransform(IDENTITY_TRANSFORM);

    // Text: one body and one header primitive per column, clipped to the column.
    const half = Math.ceil((this.#calc?.maxLineWidth ?? 0) / 2);
    const size = ctx.viewport.size;
    const seen = new Set<number>();
    for (const column of columns) {
      seen.add(column.index);
      const dragged = this.#drag?.index === column.index;
      const left = tx + (dragged ? this.#drag!.x : column.x) - half;
      const lift = dragged ? UPLIFT : 0;
      let text = this.#text.get(column.index);
      const body = frame.bodyLabels.get(column.index) ?? [];
      const head = frame.headerLabels.get(column.index) ?? [];
      if (!text) {
        const entry: ColumnText = {
          body: createTextPrimitive(ctx.primitives, { labels: body }),
          header: createTextPrimitive(ctx.primitives, { labels: head }),
          bodyClip: new ScissorClip(),
          headerClip: new ScissorClip(),
        };
        ctx.add(entry.body);
        ctx.add(entry.header);
        entry.bodyClip.attach(entry.body.object);
        entry.headerClip.attach(entry.header.object);
        this.#text.set(column.index, entry);
        text = entry;
      } else {
        text.body.update({ labels: body });
        text.header.update({ labels: head });
      }
      text.body.object.renderOrder = orderOf(
        dragged ? ORDER.dragBodyText : ORDER.bodyText,
        index,
        column.index,
      );
      text.header.object.renderOrder = orderOf(
        dragged ? ORDER.dragHeaderText : ORDER.headerText,
        index,
        column.index,
      );
      text.body.setTransform(IDENTITY_TRANSFORM);
      text.header.setTransform(IDENTITY_TRANSFORM);
      const clipWidth = column.width + 2 * half;
      text.bodyClip.rect = { x: left, y: bodyTop, width: clipWidth, height: viewHeight };
      text.headerClip.rect = {
        x: left,
        y: ty - lift - half,
        width: clipWidth,
        height: this.#header.height + 2 * half,
      };
      text.bodyClip.size = { width: size.width, height: size.height };
      text.headerClip.size = { width: size.width, height: size.height };
    }
    for (const [key, text] of this.#text) {
      if (seen.has(key)) continue;
      ctx.remove(text.body);
      ctx.remove(text.header);
      this.#text.delete(key);
    }
    ctx.invalidate();
  }
}

/** The table `plot` part: one {@link TableView} per visible table. */
export const tableRenderer: TraceRenderer<TableCalc> = {
  create: (ctx) => new TableView(ctx),
};
