/**
 * The accessible DOM mirror of a chart (plan E17.1, ADR-005): the canvas is invisible to
 * assistive technology, so the chart element gets an ARIA role and name, and a visually hidden
 * (not `display: none`, which would hide it from screen readers too) description with the chart
 * type, axes, one summary per trace and optional data tables.
 *
 * ## Roles
 *
 * - Static charts (`config.staticPlot`): `role="img"` with `aria-label`, and `aria-describedby`
 *   pointing at the text part of the description. An image's children are presentational, which
 *   fits a chart without controls; the description still reaches screen readers as the image's
 *   accessible description.
 * - Interactive charts: `role="figure"` with the same name and description. The plan suggested
 *   `role="application"`, but ARIA practice reserves it for widgets that implement their whole
 *   keyboard model (it switches screen readers out of browse mode, so the description and the data
 *   tables could no longer be read line by line). A figure keeps its content browsable — the
 *   modebar toolbar, the description list and the tables. Keyboard navigation of the data (E6.5)
 *   has its own small `role="application"` focus target over the plot area (`fx/focus.ts`).
 *
 * Attributes the page already set on the element (`role`, `aria-label`, `aria-describedby`) are
 * left alone, and everything the mirror set is restored on destroy.
 *
 * ## Summary and data tables
 *
 * The generated overview (E17.2) follows the chart type summary as its own paragraph. Data tables
 * (E17.3, `config.a11y.dataTable`) are hidden tables here (`'hidden'`, the default), a visible,
 * virtualized table after the chart element (`'visible'`, `table-view.ts`, loaded on first use;
 * the hidden copies are then left out) or none (`false`).
 *
 * ## Updates
 *
 * {@link A11yMirror.invalidate} says what changed after a pipeline run: content changes (data,
 * layout, traces) rebuild right away, axis range changes (zoom, pan, resize) are debounced and
 * streaming appends throttled, so a drag or a 60 Hz stream never rebuilds per frame; hover and
 * selection don't touch it. A rebuild that produces the same text leaves the DOM alone.
 */
import type { FullLayout } from '@mk7s/holochart-core';
import type { ChartDescription, DescribedTable } from './describe.ts';
import type { DataTableView } from './table-view.ts';
import { VISUALLY_HIDDEN } from './text.ts';

/** What changed, as far as the description is concerned. */
export type A11yChange = 'content' | 'range' | 'stream' | 'none';

/** Quiet time after the last axis range change before the description follows. */
export const RANGE_DEBOUNCE_MS = 300;
/** Longest a streaming chart's description lags behind the data. */
export const STREAM_THROTTLE_MS = 500;

type Managed = 'role' | 'aria-label' | 'aria-describedby';

let nextId = 0;

/** Options for {@link A11yMirror}. */
export interface A11yMirrorOptions {
  /** `false` for `config.staticPlot` charts (`role="img"`). */
  readonly interactive: boolean;
  /** The current description, or `undefined` before the first pipeline run. */
  readonly describe: () => ChartDescription | undefined;
  /** `config.a11y.dataTable`. Default: `'hidden'`. */
  readonly dataTable?: 'hidden' | 'visible' | false;
  /** The layout and width (CSS px) the visible tables are styled and sized after. */
  readonly figure?: () => { readonly layout: FullLayout | undefined; readonly width: number };
}

/** The hidden description and ARIA attributes of one chart element. */
export class A11yMirror {
  /** The visually hidden description (`div.holochart-a11y`). */
  readonly root: HTMLDivElement;
  readonly #el: HTMLElement;
  readonly #options: A11yMirrorOptions;
  readonly #text: HTMLDivElement;
  readonly #tables: HTMLDivElement;
  /** Attributes the mirror set (the page had none): removed on destroy. */
  readonly #owned = new Set<Managed>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #timerKind: A11yChange | undefined;
  #key = '';
  #destroyed = false;
  /** The visible tables (`dataTable: 'visible'`) and their code, once loaded. */
  #view: DataTableView | undefined;
  #tableCode: typeof import('./table-view.ts') | undefined;
  #viewLoad: Promise<void> | undefined;

  constructor(el: HTMLElement, options: A11yMirrorOptions) {
    this.#el = el;
    this.#options = options;
    const doc = el.ownerDocument;
    const id = `holochart-a11y-${++nextId}`;
    const root = doc.createElement('div');
    root.className = 'holochart-a11y';
    root.style.cssText = VISUALLY_HIDDEN;
    const text = doc.createElement('div');
    text.id = `${id}-text`;
    const tables = doc.createElement('div');
    root.append(text, tables);
    el.appendChild(root);
    this.root = root;
    this.#text = text;
    this.#tables = tables;
    this.#claim('role', options.interactive ? 'figure' : 'img');
    this.#claim('aria-describedby', text.id);
  }

  /**
   * Bring the mirror up to date after a pipeline run: `content` now, `range` debounced
   * ({@link RANGE_DEBOUNCE_MS}), `stream` throttled ({@link STREAM_THROTTLE_MS}), `none` never.
   */
  invalidate(change: A11yChange): void {
    if (this.#destroyed || change === 'none') return;
    if (change === 'content') {
      this.update();
      return;
    }
    if (change === 'stream') {
      // Throttle: a pending rebuild (of either kind) already covers this append.
      if (this.#timer === undefined) this.#defer('stream', STREAM_THROTTLE_MS);
      return;
    }
    // Range: debounce, unless a stream rebuild is already due sooner.
    if (this.#timerKind === 'stream') return;
    this.#defer('range', RANGE_DEBOUNCE_MS);
  }

  /** Rebuild now (cancels a pending deferred rebuild). */
  update(): void {
    if (this.#destroyed) return;
    this.#cancel();
    const description = this.#options.describe();
    if (!description) return;
    this.#claim('aria-label', description.label);
    const mode = this.#options.dataTable ?? 'hidden';
    // The visible tables re-render the rows in view: data past the hidden rows may have changed.
    if (mode === 'visible') this.#showTables(description.tables);
    // Skip the DOM work when nothing an assistive technology reads changed.
    const key = JSON.stringify([
      description.summary,
      description.overview,
      description.axes,
      description.traces,
    ]);
    const tablesKey = mode === 'hidden' ? JSON.stringify(description.tables) : '';
    if (key + tablesKey === this.#key) return;
    this.#key = key + tablesKey;
    this.#renderText(description);
    this.#renderTables(mode === 'hidden' ? description.tables : []);
  }

  /** The visible tables (their code loads on first use). */
  #showTables(tables: readonly DescribedTable[]): void {
    const code = this.#tableCode;
    if (code) {
      const figure = this.#options.figure?.();
      this.#view ??= new code.DataTableView(this.#el);
      this.#view.update(tables, code.tableStyle(figure?.layout), figure?.width ?? 0);
      return;
    }
    this.#viewLoad ??= import('./table-view.ts').then(
      (m) => {
        this.#tableCode = m;
        // Show the latest description, not the one that started the load.
        this.update();
      },
      (error: unknown) => console.warn('holochart: loading the data table failed', error),
    );
  }

  /** Resolves once the visible tables' code has loaded (immediately without visible tables). */
  get tablesReady(): Promise<void> {
    return this.#viewLoad ?? Promise.resolve();
  }

  /** Whether a debounced / throttled rebuild is pending. */
  get pending(): boolean {
    return this.#timer !== undefined;
  }

  /** Remove the description and restore the element's attributes. Idempotent. */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#cancel();
    for (const name of this.#owned) this.#el.removeAttribute(name);
    this.#owned.clear();
    this.root.remove();
    this.#view?.destroy();
    this.#view = undefined;
  }

  #defer(kind: A11yChange, ms: number): void {
    this.#cancel();
    this.#timerKind = kind;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#timerKind = undefined;
      this.update();
    }, ms);
  }

  #cancel(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#timerKind = undefined;
  }

  /** Set a managed attribute, unless the page set it before the chart did. */
  #claim(name: Managed, value: string): void {
    if (!this.#owned.has(name)) {
      if (this.#el.hasAttribute(name)) return;
      this.#owned.add(name);
    }
    if (this.#el.getAttribute(name) !== value) this.#el.setAttribute(name, value);
  }

  #renderText(d: ChartDescription): void {
    const doc = this.#el.ownerDocument;
    const nodes: HTMLElement[] = [];
    const p = doc.createElement('p');
    p.textContent = d.summary;
    nodes.push(p);
    if (d.overview) {
      const overview = doc.createElement('p');
      overview.textContent = d.overview;
      nodes.push(overview);
    }
    const list = (label: string, items: readonly string[]): void => {
      if (items.length === 0) return;
      // A text heading, not `aria-label`: in the flattened description (`aria-describedby`) a
      // labelled list would read as its label only.
      const heading = doc.createElement('p');
      heading.id = `${this.#text.id}-${label.toLowerCase()}`;
      heading.textContent = `${label}:`;
      const ul = doc.createElement('ul');
      ul.setAttribute('aria-labelledby', heading.id);
      nodes.push(heading);
      for (const item of items) {
        const li = doc.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
      }
      nodes.push(ul);
    };
    list('Axes', d.axes);
    list('Traces', d.traces);
    this.#text.replaceChildren(...nodes);
  }

  #renderTables(tables: readonly DescribedTable[]): void {
    const doc = this.#el.ownerDocument;
    this.#tables.replaceChildren(
      ...tables.map((t) => {
        const table = doc.createElement('table');
        const caption = doc.createElement('caption');
        caption.textContent = t.caption;
        const head = doc.createElement('thead');
        const headRow = doc.createElement('tr');
        for (const c of t.columns) {
          const th = doc.createElement('th');
          th.scope = 'col';
          th.textContent = c;
          headRow.appendChild(th);
        }
        head.appendChild(headRow);
        const body = doc.createElement('tbody');
        for (const row of t.rows) {
          const tr = doc.createElement('tr');
          for (let k = 0; k < t.columns.length; k++) {
            const td = doc.createElement('td');
            td.textContent = row[k] ?? '';
            tr.appendChild(td);
          }
          body.appendChild(tr);
        }
        table.append(caption, head, body);
        return table;
      }),
    );
  }
}
