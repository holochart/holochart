/**
 * The visible data table (plan E17.3, `config.a11y.dataTable: 'visible'`): one table per trace
 * below the chart, styled like it (font, text and background colors, grid color for rules), with
 * every row of the data. Tables longer than {@link UNVIRTUALIZED_ROWS} are virtualized: a scroll
 * region of at most {@link MAX_TABLE_HEIGHT} px renders only the rows in view (plus
 * {@link ROW_OVERSCAN} on each side) between two spacer rows, formatting each row on demand
 * (`TraceDescription.table.row`), so a million points cost a few dozen DOM rows. `aria-rowcount`
 * and `aria-rowindex` tell assistive technology where the rendered rows are.
 *
 * Inserted after the chart element (a sibling, like Highcharts' data table), not inside it: the
 * chart sizes itself to its element, which must not grow with the table. Loaded lazily with the
 * runtime's `a11y` chunk.
 */
import { getIn, isPlainObject, type FullLayout } from '@mk7s/holochart-core';
import type { DescribedTable } from './describe.ts';
import { countText } from './text.ts';

/** Rows rendered above and below the ones in view. */
export const ROW_OVERSCAN = 8;
/** Height of a table's scroll region, in CSS px. */
export const MAX_TABLE_HEIGHT = 320;
/** Tables with at most this many rows render every row (no windowing). */
export const UNVIRTUALIZED_ROWS = 200;

/** The rows to render: `[start, end)`. */
export interface RowWindow {
  readonly start: number;
  readonly end: number;
}

/**
 * Rows of a virtualized table to render for a scroll position: those intersecting the viewport
 * (`scrollTop` measured from the first row) plus `overscan` rows on each side, clamped to
 * `[0, total)`.
 */
export function rowWindow(
  scrollTop: number,
  viewport: number,
  rowHeight: number,
  total: number,
  overscan = ROW_OVERSCAN,
): RowWindow {
  if (total <= 0 || !(rowHeight > 0)) return { start: 0, end: 0 };
  const first = Math.min(total - 1, Math.floor(Math.max(0, scrollTop) / rowHeight));
  const inView = Math.ceil(Math.max(0, viewport) / rowHeight) + 1;
  return {
    start: Math.max(0, first - overscan),
    end: Math.min(total, first + inView + overscan),
  };
}

/** How the tables look, from the chart's layout. */
export interface TableStyle {
  readonly fontFamily: string;
  /** CSS px; at least 12 (the chart's own text may be smaller, a table of it shouldn't). */
  readonly fontSize: number;
  readonly color: string;
  readonly background: string;
  readonly headerBackground: string;
  readonly rule: string;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v !== '' ? v : fallback;
}

/** The {@link TableStyle} of a chart: its font, paper and plot colors, and x grid color. */
export function tableStyle(fullLayout: FullLayout | undefined): TableStyle {
  const font: Record<string, unknown> = isPlainObject(fullLayout?.['font'])
    ? fullLayout['font']
    : {};
  const size = typeof font['size'] === 'number' ? font['size'] : 12;
  const paper = str(fullLayout?.['paper_bgcolor'], '#ffffff');
  return {
    fontFamily: str(font['family'], 'sans-serif'),
    fontSize: Math.max(12, Math.round(size)),
    color: str(font['color'], '#444444'),
    background: paper,
    headerBackground: str(fullLayout?.['plot_bgcolor'], paper),
    rule: str(getIn(fullLayout, 'xaxis.gridcolor'), 'rgba(128,128,128,0.4)'),
  };
}

let nextId = 0;

/** One trace's table. */
interface Item {
  readonly box: HTMLDivElement;
  readonly title: HTMLDivElement;
  readonly scroll: HTMLDivElement;
  readonly table: HTMLTableElement;
  readonly head: HTMLTableRowElement;
  readonly body: HTMLTableSectionElement;
  data: DescribedTable;
  /** Rendered rows, `[start, end)`; `end < 0` forces a render. */
  start: number;
  end: number;
  frame: number | undefined;
}

/** The visible tables of one chart. */
export class DataTableView {
  /** `div.holochart-data-table`, the chart element's next sibling. */
  readonly root: HTMLDivElement;
  readonly #items: Item[] = [];
  #style: TableStyle = tableStyle(undefined);
  #destroyed = false;

  constructor(anchor: HTMLElement) {
    const root = anchor.ownerDocument.createElement('div');
    root.className = 'holochart-data-table';
    anchor.after(root);
    this.root = root;
  }

  /** Show `tables` styled by `style`, `width` CSS px wide (at most the available width). */
  update(tables: readonly DescribedTable[], style: TableStyle, width: number): void {
    if (this.#destroyed) return;
    this.#style = style;
    const rs = this.root.style;
    // Block layout, and no shrinking inside a flex parent: the scroll regions keep their height.
    rs.cssText =
      `box-sizing:border-box;max-width:100%;width:${Math.max(0, Math.round(width))}px;` +
      'padding:8px 0;flex:none;';
    rs.fontFamily = style.fontFamily;
    rs.fontSize = `${style.fontSize}px`;
    rs.color = style.color;
    rs.background = style.background;
    rs.display = tables.length > 0 ? 'block' : 'none';
    while (this.#items.length > tables.length) this.#remove(this.#items.pop()!);
    tables.forEach((data, k) => {
      const item = this.#items[k] ?? this.#add();
      item.box.style.marginTop = k > 0 ? '12px' : '0';
      item.data = data;
      this.#fill(item);
    });
  }

  /** Remove the tables. Idempotent. */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const item of this.#items) this.#remove(item);
    this.#items.length = 0;
    this.root.remove();
  }

  #add(): Item {
    const doc = this.root.ownerDocument;
    const id = `holochart-data-table-${++nextId}`;
    const box = doc.createElement('div');
    const title = doc.createElement('div');
    title.id = id;
    title.style.cssText = 'font-weight:bold;padding:0 8px 4px;';
    const scroll = doc.createElement('div');
    // A keyboard-scrollable region, named by the title.
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-labelledby', id);
    scroll.style.cssText = `overflow:auto;max-height:${MAX_TABLE_HEIGHT}px;`;
    const table = doc.createElement('table');
    table.setAttribute('aria-labelledby', id);
    table.style.cssText = 'border-collapse:collapse;width:100%;table-layout:fixed;';
    const thead = doc.createElement('thead');
    const head = doc.createElement('tr');
    head.setAttribute('aria-rowindex', '1');
    thead.appendChild(head);
    const body = doc.createElement('tbody');
    table.append(thead, body);
    scroll.appendChild(table);
    box.append(title, scroll);
    this.root.appendChild(box);
    const item: Item = {
      box,
      title,
      scroll,
      table,
      head,
      body,
      data: { title: '', caption: '', columns: [], rows: [], total: 0 },
      start: 0,
      end: -1,
      frame: undefined,
    };
    scroll.addEventListener('scroll', () => this.#schedule(item));
    this.#items.push(item);
    return item;
  }

  #remove(item: Item): void {
    if (item.frame !== undefined) cancelAnimationFrame(item.frame);
    item.box.remove();
  }

  get #rowHeight(): number {
    return Math.round(this.#style.fontSize * 1.8);
  }

  /** Header, caption and sizes after new data or style; then the rows. */
  #fill(item: Item): void {
    const { data } = item;
    const total = rowCount(data);
    item.title.textContent =
      total < data.total
        ? `${data.title} (first ${total} of ${countText(data.total, 'row')})`
        : `${data.title} (${countText(total, 'row')})`;
    item.table.setAttribute('aria-rowcount', String(total + 1));
    const cells = data.columns.map((c, k) => {
      const th = this.root.ownerDocument.createElement('th');
      th.scope = 'col';
      th.textContent = c;
      this.#cell(th, true, k);
      return th;
    });
    item.head.replaceChildren(...cells);
    item.end = -1;
    this.#render(item);
  }

  /** Style cell `column` of a row: the first column labels the row (left), values align right. */
  #cell(el: HTMLTableCellElement, header: boolean, column: number): void {
    const s = this.#style;
    const h = this.#rowHeight;
    el.style.cssText =
      `box-sizing:border-box;height:${h}px;padding:0 8px;white-space:nowrap;overflow:hidden;` +
      `text-overflow:ellipsis;text-align:${column === 0 ? 'left' : 'right'};` +
      `border-bottom:1px solid ${s.rule};font-weight:${header ? 'bold' : 'normal'};`;
    if (header) {
      // Sticky header: stays visible while the rows scroll.
      el.style.position = 'sticky';
      el.style.top = '0';
      el.style.background = s.headerBackground;
    }
  }

  #schedule(item: Item): void {
    if (item.frame !== undefined || this.#destroyed) return;
    item.frame = requestAnimationFrame(() => {
      item.frame = undefined;
      this.#render(item);
    });
  }

  /** Render the rows in view (all of them for short tables) between spacer rows. */
  #render(item: Item): void {
    const { data, scroll } = item;
    const total = rowCount(data);
    const h = this.#rowHeight;
    const win =
      total <= UNVIRTUALIZED_ROWS
        ? { start: 0, end: total }
        : // A virtualized table fills its region: its full height, not the height it has before
          // its first rows exist.
          rowWindow(scroll.scrollTop - h, MAX_TABLE_HEIGHT, h, total);
    if (win.start === item.start && win.end === item.end) return;
    item.start = win.start;
    item.end = win.end;
    const doc = this.root.ownerDocument;
    const columns = data.columns.length;
    const rows: HTMLTableRowElement[] = [];
    const spacer = (height: number): void => {
      if (height <= 0) return;
      const tr = doc.createElement('tr');
      tr.setAttribute('aria-hidden', 'true');
      const td = doc.createElement('td');
      td.colSpan = Math.max(1, columns);
      td.style.cssText = `height:${height}px;padding:0;border:0;`;
      tr.appendChild(td);
      rows.push(tr);
    };
    spacer(win.start * h);
    for (let i = win.start; i < win.end; i++) {
      const values = rowOf(data, i);
      const tr = doc.createElement('tr');
      tr.setAttribute('aria-rowindex', String(i + 2));
      for (let c = 0; c < columns; c++) {
        const td = doc.createElement('td');
        td.textContent = values[c] ?? '';
        this.#cell(td, false, c);
        tr.appendChild(td);
      }
      rows.push(tr);
    }
    spacer((total - win.end) * h);
    item.body.replaceChildren(...rows);
  }
}

/** Rows a visible table has: every row with a row accessor, else the rows given. */
export function rowCount(table: DescribedTable): number {
  return table.row ? table.total : table.rows.length;
}

/** Row `i` of a visible table. */
export function rowOf(table: DescribedTable, i: number): readonly string[] {
  return table.row ? table.row(i) : (table.rows[i] ?? []);
}
