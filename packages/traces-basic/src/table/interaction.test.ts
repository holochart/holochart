import { supplyDefaults } from '@mk7s/holochart-core';
import { createResourceManager, type Primitive, type Viewport } from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type ComponentPointerEvent,
  type TracePlotContext,
} from '@mk7s/holochart-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calcTable, type TableCalc } from './calc.ts';
import { intersect, scissorFor } from './clip.ts';
import { table } from './index.ts';
import { cellLabel, columnWidths, layoutHeader, layoutRow } from './layout.ts';
import {
  dragOrder,
  scrollbarState,
  TableInteraction,
  zoneAt,
  type TableHitGeometry,
  type TableInteractionHost,
} from './interaction.ts';

// troika typesets in a worker with browser globals; the view test only needs its object graph.
// Mocked by path, like the pie and scatter tests: traces-basic does not depend on troika.
vi.mock('../../../render/node_modules/troika-three-text', async () => {
  const { Object3D } = await import('three');
  type Node = InstanceType<typeof Object3D>;
  const noopDispose = (o: object): void => {
    Object.assign(o, { dispose: (): void => {} });
  };
  class Text extends Object3D {
    constructor() {
      super();
      noopDispose(this);
    }
  }
  class BatchedText extends Object3D {
    material: unknown = null;
    addText(text: Node): void {
      this.add(text);
    }
    removeText(text: Node): void {
      this.remove(text);
    }
    constructor() {
      super();
      noopDispose(this);
    }
    sync(callback?: () => void): void {
      callback?.();
    }
  }
  return { Text, BatchedText, configureTextBuilder: () => {}, preloadFont: () => {} };
});

function pointer(
  type: ComponentPointerEvent['type'],
  x: number,
  y: number,
  native?: Partial<WheelEvent>,
): ComponentPointerEvent {
  return {
    type,
    x,
    y,
    button: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    native: native as Event | undefined,
    cursor: undefined,
  };
}

function wheel(x: number, y: number, deltaY: number) {
  const preventDefault = vi.fn();
  return {
    event: pointer('wheel', x, y, { deltaY, deltaMode: 0, preventDefault }),
    preventDefault,
  };
}

/** A table at (100, 50), 300 × 200 px, 30 px header, 1000 px of rows. */
function fakeHost(scroll = 0) {
  let scrollY = scroll;
  const geometry = (): TableHitGeometry => ({
    x: 100,
    y: 50,
    width: 300,
    height: 200,
    headerHeight: 30,
    columns: [
      { index: 0, x: 0, width: 100 },
      { index: 1, x: 100, width: 100 },
      { index: 2, x: 200, width: 100 },
    ],
    scrollY,
    scrollbar: scrollbarState(1000, 170, scrollY),
  });
  const host = {
    geometry,
    scrollTo: vi.fn((y: number) => {
      const next = Math.max(0, Math.min(1000 - 170, y));
      const moved = next !== scrollY;
      scrollY = next;
      return moved;
    }),
    dragColumn: vi.fn(),
    reorder: vi.fn(),
    activity: vi.fn(),
  } satisfies TableInteractionHost;
  return { host, scroll: () => scrollY };
}

describe('scrollbar math (Plotly renderScrollbarKit)', () => {
  it('sizes the glyph by the visible fraction, with a minimum', () => {
    const s = scrollbarState(1000, 200, 400);
    expect(s.barLength).toBeCloseTo(40);
    expect(s.wiggleRoom).toBe(800);
    expect(s.barWiggleRoom).toBeCloseTo(160);
    expect(s.topY).toBeCloseTo(80);
    expect(s.dragMultiplier).toBeCloseTo(5);
    expect(scrollbarState(1e6, 200, 0).barLength).toBeCloseTo(1.618 * 8);
    expect(scrollbarState(100, 200, 0).wiggleRoom).toBe(0);
  });
});

describe('table zones and pointer handling', () => {
  it('finds the header, the cells and the scrollbar zone', () => {
    const g = fakeHost().host.geometry();
    expect(zoneAt(g, 150, 60)).toBe('header');
    expect(zoneAt(g, 150, 150)).toBe('cells');
    expect(zoneAt(g, 409, 150)).toBe('scrollbar');
    expect(zoneAt(g, 50, 150)).toBeUndefined();
    expect(zoneAt(g, 150, 300)).toBeUndefined();
  });

  it('takes the wheel only inside the table, preventing the page scroll only when it moved', () => {
    const { host, scroll } = fakeHost();
    const interaction = new TableInteraction(host);
    const outside = wheel(50, 150, 100);
    expect(interaction.handle(outside.event)).toBe(false);
    const inside = wheel(150, 150, 100);
    expect(interaction.handle(inside.event)).toBe(true);
    expect(scroll()).toBe(100);
    expect(inside.preventDefault).toHaveBeenCalledOnce();
    // At the top already: still taken (no chart zoom), but the page may scroll.
    const up = wheel(150, 150, -500);
    interaction.handle(up.event);
    const again = wheel(150, 150, -50);
    expect(interaction.handle(again.event)).toBe(true);
    expect(again.preventDefault).not.toHaveBeenCalled();
    // Line-mode deltas are converted to px.
    interaction.handle(
      pointer('wheel', 150, 150, { deltaY: 1, deltaMode: 1, preventDefault() {} }),
    );
    expect(scroll()).toBe(40);
  });

  it('scrolls when the rows are dragged, and keeps the gesture outside the table', () => {
    const { host, scroll } = fakeHost(200);
    const interaction = new TableInteraction(host);
    expect(interaction.handle(pointer('down', 150, 200))).toBe(true);
    expect(interaction.handle(pointer('move', 150, 150))).toBe(true);
    expect(scroll()).toBe(250);
    expect(interaction.handle(pointer('move', 600, 500))).toBe(true);
    expect(scroll()).toBe(0);
    expect(interaction.handle(pointer('up', 600, 500))).toBe(true);
    expect(interaction.active).toBe(false);
  });

  it('drags the scrollbar with its multiplier and jumps when pressed beside the glyph', () => {
    const { host, scroll } = fakeHost();
    const interaction = new TableInteraction(host);
    const s = host.geometry().scrollbar;
    // Press on the glyph (top of the body), drag 10 px.
    interaction.handle(pointer('down', 409, 50 + 30 + 5));
    interaction.handle(pointer('move', 409, 50 + 30 + 15));
    expect(scroll()).toBeCloseTo(10 * s.dragMultiplier);
    interaction.handle(pointer('up', 409, 95));
    // Press near the bottom of the track: the glyph centers on the pointer.
    interaction.handle(pointer('down', 409, 50 + 30 + 160));
    expect(scroll()).toBeGreaterThan(700);
    interaction.handle(pointer('up', 409, 240));
  });

  it('reorders columns by dragging a header cell and reports the new order on release', () => {
    const { host } = fakeHost();
    const interaction = new TableInteraction(host);
    expect(interaction.handle(pointer('down', 150, 60))).toBe(true);
    // Small moves don't start a drag.
    interaction.handle(pointer('move', 151, 60));
    expect(host.dragColumn).not.toHaveBeenCalled();
    // Column 0 (center 50) moves right past column 1's center (150).
    interaction.handle(pointer('move', 260, 60));
    expect(host.dragColumn).toHaveBeenLastCalledWith({ index: 0, x: 110, order: [1, 0, 2] });
    interaction.handle(pointer('up', 260, 60));
    expect(host.dragColumn).toHaveBeenLastCalledWith(undefined);
    expect(host.reorder).toHaveBeenCalledOnce();
    expect(host.reorder.mock.calls[0]?.[0]).toEqual([1, 0, 2]);
  });

  it('does not report a reorder when the column ends where it started', () => {
    const { host } = fakeHost();
    const interaction = new TableInteraction(host);
    interaction.handle(pointer('down', 150, 60));
    interaction.handle(pointer('move', 170, 60));
    interaction.handle(pointer('up', 150, 60));
    expect(host.reorder).not.toHaveBeenCalled();
  });

  it("sorts the dragged column's center among the others (Plotly)", () => {
    const columns = [
      { index: 0, x: 0, width: 100 },
      { index: 1, x: 100, width: 50 },
      { index: 2, x: 150, width: 50 },
    ];
    expect(dragOrder(columns, [0, 1, 2], 2, -30)).toEqual([2, 0, 1]);
    expect(dragOrder(columns, [0, 1, 2], 0, 30)).toEqual([0, 1, 2]);
    expect(dragOrder(columns, [0, 1, 2], 0, 80)).toEqual([1, 0, 2]);
  });

  it('takes clicks and double-clicks over the table, and sets cursors on move', () => {
    const { host } = fakeHost();
    const interaction = new TableInteraction(host);
    expect(interaction.handle(pointer('dblclick', 150, 150))).toBe(true);
    const move = pointer('move', 150, 60);
    expect(interaction.handle(move)).toBe(true);
    expect(move.cursor).toBe('ew-resize');
    const body = pointer('move', 150, 150);
    interaction.handle(body);
    expect(body.cursor).toBe('ns-resize');
    expect(host.activity).toHaveBeenCalled();
    expect(interaction.handle(pointer('click', 20, 20))).toBe(false);
  });
});

describe('links in cells', () => {
  const link = { href: 'https://example.com/a', target: '_blank' };
  /** A link over x 110–150 in the first body row (y 80–100) and in the first header cell. */
  function linkHost() {
    const { host } = fakeHost();
    const linkAt = vi.fn((x: number, y: number) =>
      x >= 110 && x <= 150 && ((y >= 80 && y <= 100) || (y >= 55 && y <= 70)) ? link : null,
    );
    return { host: { ...host, linkAt } satisfies TableInteractionHost, linkAt };
  }
  const open = vi.fn();
  afterEach(() => {
    open.mockClear();
    vi.unstubAllGlobals();
  });

  it('shows a pointer over a link and opens it on click, without an opener', () => {
    vi.stubGlobal('window', { open });
    const { host } = linkHost();
    const interaction = new TableInteraction(host);
    const over = pointer('move', 120, 90);
    interaction.handle(over);
    expect(over.cursor).toBe('pointer');
    const beside = pointer('move', 180, 90);
    interaction.handle(beside);
    expect(beside.cursor).toBe('ns-resize');
    interaction.handle(pointer('down', 120, 90));
    interaction.handle(pointer('move', 121, 90));
    interaction.handle(pointer('up', 121, 90));
    expect(interaction.handle(pointer('click', 121, 90))).toBe(true);
    expect(open).toHaveBeenCalledExactlyOnceWith('https://example.com/a', '_blank', 'noopener');
    // A click elsewhere in the table opens nothing.
    interaction.handle(pointer('down', 180, 90));
    interaction.handle(pointer('up', 180, 90));
    interaction.handle(pointer('click', 180, 90));
    expect(open).toHaveBeenCalledOnce();
  });

  it('scrolls on a drag that starts on a link, and opens nothing', () => {
    vi.stubGlobal('window', { open });
    const { host } = linkHost();
    const interaction = new TableInteraction(host);
    interaction.handle(pointer('down', 120, 90));
    interaction.handle(pointer('move', 120, 60));
    expect(host.scrollTo).toHaveBeenCalled();
    interaction.handle(pointer('move', 120, 89));
    interaction.handle(pointer('up', 120, 89));
    interaction.handle(pointer('click', 120, 89));
    expect(open).not.toHaveBeenCalled();
  });

  it('opens a header link on click without moving the column; a drag moves it instead', () => {
    vi.stubGlobal('window', { open });
    const { host } = linkHost();
    const interaction = new TableInteraction(host);
    const over = pointer('move', 120, 60);
    interaction.handle(over);
    expect(over.cursor).toBe('pointer');
    interaction.handle(pointer('down', 120, 60));
    interaction.handle(pointer('up', 120, 60));
    interaction.handle(pointer('click', 120, 60));
    expect(open).toHaveBeenCalledOnce();
    expect(host.dragColumn).not.toHaveBeenCalled();
    interaction.handle(pointer('down', 120, 60));
    interaction.handle(pointer('move', 240, 60));
    interaction.handle(pointer('up', 240, 60));
    interaction.handle(pointer('click', 240, 60));
    expect(host.reorder).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledOnce();
  });

  it('ignores secondary buttons', () => {
    vi.stubGlobal('window', { open });
    const { host } = linkHost();
    const interaction = new TableInteraction(host);
    interaction.handle({ ...pointer('down', 120, 90), button: 2 });
    interaction.handle({ ...pointer('up', 120, 90), button: 2 });
    interaction.handle({ ...pointer('click', 120, 90), button: 2 });
    expect(open).not.toHaveBeenCalled();
  });
});

describe('clip rects', () => {
  it('maps container px to a GL scissor through the drawn viewport', () => {
    const size = { width: 400, height: 300 };
    expect(scissorFor({ x: 10, y: 20, width: 100, height: 50 }, size, [0, 0, 400, 300])).toEqual([
      10, 230, 100, 50,
    ]);
    // An export at twice the size scales the rect.
    expect(scissorFor({ x: 10, y: 20, width: 100, height: 50 }, size, [0, 0, 800, 600])).toEqual([
      20, 460, 200, 100,
    ]);
    expect(intersect([0, 0, 10, 10], [5, 5, 10, 10])).toEqual([5, 5, 5, 5]);
    expect(intersect([0, 0, 10, 10], [20, 20, 5, 5])).toEqual([20, 20, 0, 0]);
  });
});

describe('table view', () => {
  const registry = createChartRegistry().register(table);
  const rows = Array.from({ length: 5000 }, (_, i) => i);

  function createView(
    data: Record<string, unknown> = {
      header: { values: ['n', 'n²'] },
      cells: { values: [rows, rows.map((v) => v * v)] },
    },
  ) {
    const { fullData, fullLayout } = supplyDefaults(
      { data: [{ type: 'table', ...data }], layout: {} },
      registry.core,
    );
    const trace = fullData[0]!;
    const added: Primitive<unknown>[] = [];
    const ctx: TracePlotContext<TableCalc> = {
      trace,
      calc: calcTable(trace),
      index: 0,
      fullLayout,
      subplot: undefined,
      xaxis: undefined,
      yaxis: undefined,
      transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
      viewport: { size: { width: 600, height: 400, pixelRatio: 1 } } as unknown as Viewport,
      domain: { x: [0, 1], y: [0, 1], rect: { x: 50, y: 40, width: 500, height: 300 } },
      primitives: { resources: createResourceManager(), invalidate: vi.fn() },
      add: (p) => {
        added.push(p as Primitive<unknown>);
        return p;
      },
      remove: (p) => {
        added.splice(added.indexOf(p as Primitive<unknown>), 1);
        p.dispose();
      },
      invalidate: vi.fn(),
    };
    return { view: table.plot!.create(ctx), added, ctx };
  }

  it('draws the visible rows only and takes the wheel only over the table', () => {
    const { view, added } = createView();
    // Rect sets (body, header, dragged column ×2, scrollbar) and a body + header text per column.
    expect(added.length).toBe(5 + 2 * 2);
    const body = added[0] as unknown as { instanceCount: number };
    // 300 px − 28 px header over 20 px rows: at most 15 visible rows × 2 columns.
    expect(body.instanceCount).toBeLessThanOrEqual(15 * 2);
    expect(body.instanceCount).toBeGreaterThan(0);

    const outside = wheel(20, 100, 120);
    expect(view.handlePointer!(outside.event)).toBe(false);
    const inside = wheel(300, 200, 120);
    expect(view.handlePointer!(inside.event)).toBe(true);
    expect(inside.preventDefault).toHaveBeenCalledOnce();
    view.dispose?.();
  });

  it('opens a link in a cell drawn by the view, and shows a pointer over it', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    const { view, ctx } = createView({
      header: { values: ['Name', '<a href="https://example.com/h" target="_self">Docs</a>'] },
      cells: {
        values: [
          ['first', 'second'],
          ['<a href="https://example.com/1">one</a> link', 'plain'],
        ],
        align: 'left',
      },
    });
    // Where the renderer draws the first body cell of column 1: the same layout and label.
    const widths = columnWidths(ctx.calc, 500);
    const header = layoutHeader(ctx.trace, ctx.calc, widths);
    const row = layoutRow(ctx.trace, ctx.calc, 'cells', 0, widths);
    const label = cellLabel(row.cells[1]!, 50 + widths[0]!, 40 + header.height, widths[1]!)!;
    const x = label.x + 3;
    const y = label.y - 3;
    const move = pointer('move', x, y);
    expect(view.handlePointer!(move)).toBe(true);
    expect(move.cursor).toBe('pointer');
    view.handlePointer!(pointer('down', x, y));
    view.handlePointer!(pointer('up', x, y));
    view.handlePointer!(pointer('click', x, y));
    expect(open).toHaveBeenCalledExactlyOnceWith('https://example.com/1', '_blank', 'noopener');
    // The header link, with its target.
    const head = cellLabel(header.rows[0]!.cells[1]!, 50 + widths[0]!, 40, widths[1]!)!;
    view.handlePointer!(pointer('down', head.x + 2, head.y - 3));
    view.handlePointer!(pointer('up', head.x + 2, head.y - 3));
    view.handlePointer!(pointer('click', head.x + 2, head.y - 3));
    expect(open).toHaveBeenLastCalledWith('https://example.com/h', '_self', 'noopener');
    // Plain cells have none.
    const plain = pointer('move', 50 + 10, 40 + header.height + 10);
    view.handlePointer!(plain);
    expect(plain.cursor).not.toBe('pointer');
    vi.unstubAllGlobals();
    view.dispose?.();
  });
});
