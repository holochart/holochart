/**
 * Strip plots (plan E10.6), like plotly.py's `px.strip`: every observation as a jittered point at
 * its category, drawn as a `box` trace with `boxpoints: 'all'` and an invisible box (no fill, no
 * outline), one trace per `color` group laid side by side with `boxmode: 'group'`. Pure: builds a
 * figure (`{ data, layout }`) to pass to `createChart`; nothing is rendered or registered here.
 */

/** Rows (`[{ day, bill }, …]`) or columns (`{ day: [...], bill: [...] }`). */
export type StripData = readonly object[] | Readonly<Record<string, ArrayLike<unknown>>>;

/** Options of {@link strip}: the camelCase counterparts of `px.strip`'s parameters. */
export interface StripOptions {
  /** The table: an array of row objects, or an object of equally long columns. */
  readonly data: StripData;
  /** Column of x values: categories for vertical strips, values for horizontal ones. */
  readonly x?: string;
  /** Column of y values. */
  readonly y?: string;
  /** Column to group by: one trace (color and legend item) per distinct value. */
  readonly color?: string;
  /**
   * `'v'`: strips at x categories over y values; `'h'`: at y categories. Default (as px): `'h'`
   * when only `x` is given or when `x` is numeric and `y` is not, else `'v'`.
   */
  readonly orientation?: 'v' | 'h';
  /** `'group'` (default): color groups side by side at each category; `'overlay'`: on one strip. */
  readonly stripmode?: 'group' | 'overlay';
  /**
   * Spread of the points across the strip, 0–1 of its width (the box `jitter`). Default 0.3
   * (Plotly's default for `boxpoints: 'all'`). A Holochart option; px has none.
   */
  readonly jitter?: number;
  /** Column shown in bold at the top of the hover label. */
  readonly hoverName?: string;
  /** Extra columns listed in the hover label (through `customdata`). */
  readonly hoverData?: readonly string[];
  /** Display names of columns, for hover lines, the legend title and the axis titles. */
  readonly labels?: Readonly<Record<string, string>>;
  /** Fixed colors per `color` value. Other values take `colorDiscreteSequence`, else the colorway. */
  readonly colorDiscreteMap?: Readonly<Record<string, string>>;
  /** Colors for `color` values in order. Default: the template's colorway. */
  readonly colorDiscreteSequence?: readonly string[];
  /**
   * Value orders per column: `{ day: ['Thu', 'Fri', 'Sat', 'Sun'] }` orders the categories of the
   * axis, `{ [color]: [...] }` the traces and legend. Values not listed follow in order of first
   * appearance.
   */
  readonly categoryOrders?: Readonly<Record<string, readonly unknown[]>>;
  /** Figure title. */
  readonly title?: string;
}

/** The figure built by {@link strip}: pass it to `createChart` or adjust it first. */
export interface StripFigure {
  /** One `box` trace per `color` group (a single trace without `color`). */
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
}

function isRows(data: StripData): data is readonly object[] {
  return Array.isArray(data);
}

/** Row count and a cell reader for rows or columns. */
function table(data: StripData): { length: number; get: (column: string, i: number) => unknown } {
  if (isRows(data)) {
    return {
      length: data.length,
      get: (column, i) => (data[i] as Readonly<Record<string, unknown>> | undefined)?.[column],
    };
  }
  const columns = data as Readonly<Record<string, ArrayLike<unknown>>>;
  let length = Infinity;
  for (const values of Object.values(columns)) length = Math.min(length, values.length);
  return {
    length: Number.isFinite(length) ? length : 0,
    get: (column, i) => columns[column]?.[i],
  };
}

/** `ordered` first (only values present in `seen`), then the rest in order of first appearance. */
function order(seen: readonly unknown[], ordered: readonly unknown[] | undefined): unknown[] {
  const present = new Set(seen);
  const out = new Set<unknown>();
  for (const v of ordered ?? []) if (present.has(v)) out.add(v);
  for (const v of seen) out.add(v);
  return [...out];
}

function groupName(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

/** Whether every present value of a column is a number (px's numeric column test). */
function numericColumn(get: (i: number) => unknown, length: number): boolean {
  let any = false;
  for (let i = 0; i < length; i++) {
    const v = get(i);
    if (v === undefined || v === null) continue;
    if (typeof v !== 'number') return false;
    any = true;
  }
  return any;
}

/** Colors per group: the map first, then the sequence continuing after the map's entries. */
function groupColors(
  names: readonly string[],
  map: Readonly<Record<string, string>> | undefined,
  sequence: readonly string[] | undefined,
): Map<string, string | undefined> {
  const assigned = new Map<string, string>(Object.entries(map ?? {}));
  const out = new Map<string, string | undefined>();
  for (const name of names) {
    let color = assigned.get(name);
    if (color === undefined && sequence && sequence.length > 0) {
      color = sequence[assigned.size % sequence.length]!;
      assigned.set(name, color);
    }
    out.set(name, color);
  }
  return out;
}

/**
 * Build a strip plot figure from a table, like plotly.py's `px.strip`: `box` traces with
 * `boxpoints: 'all'`, `pointpos: 0`, `hoveron: 'points'`, a transparent fill and no outline, one
 * per `color` group (with `offsetgroup` = the group, so `boxmode: 'group'` sets them side by side).
 * Differences from px: the outline is removed with `line.width: 0` rather than a transparent line
 * color (so the points keep the trace color from the colorway), and `jitter` is an option.
 *
 * @example
 * ```ts
 * import { createChart, strip } from '@mk7s/holochart';
 *
 * const figure = strip({
 *   data: [
 *     { day: 'Thu', bill: 17.2, smoker: 'No' },
 *     { day: 'Fri', bill: 21.0, smoker: 'Yes' },
 *   ],
 *   x: 'day',
 *   y: 'bill',
 *   color: 'smoker',
 * });
 * createChart(el, figure);
 * ```
 */
export function strip(options: StripOptions): StripFigure {
  const { x, y, color, hoverName } = options;
  const labels = options.labels ?? {};
  const label = (column: string): string => labels[column] ?? column;
  const { length, get } = table(options.data);
  const numeric = (c: string | undefined) =>
    c !== undefined && numericColumn((i) => get(c, i), length);
  const orientation =
    options.orientation ??
    (y === undefined || (x !== undefined && numeric(x) && !numeric(y)) ? 'h' : 'v');
  const posColumn = orientation === 'h' ? y : x;

  const groupsSeen: string[] = [];
  for (let i = 0; i < length; i++)
    groupsSeen.push(color === undefined ? '' : groupName(get(color, i)));
  const names =
    color === undefined
      ? ['']
      : order(groupsSeen, options.categoryOrders?.[color]?.map(groupName)).map(groupName);
  const colors = groupColors(names, options.colorDiscreteMap, options.colorDiscreteSequence);
  const extraColumns = (options.hoverData ?? []).filter((c) => c !== x && c !== y && c !== color);

  const data = names.map((name) => {
    const rows: number[] = [];
    for (let i = 0; i < length; i++) if (groupsSeen[i] === name) rows.push(i);
    const lines: string[] = [];
    if (color !== undefined) lines.push(`${label(color)}=${name}`);
    if (x !== undefined) lines.push(`${label(x)}=%{x}`);
    if (y !== undefined) lines.push(`${label(y)}=%{y}`);
    extraColumns.forEach((c, k) => lines.push(`${label(c)}=%{customdata[${k}]}`));
    const header = hoverName !== undefined ? '<b>%{hovertext}</b><br><br>' : '';
    const trace: Record<string, unknown> = {
      type: 'box',
      orientation,
      name,
      legendgroup: name,
      showlegend: name !== '',
      boxpoints: 'all',
      pointpos: 0,
      jitter: options.jitter ?? 0.3,
      hoveron: 'points',
      fillcolor: 'rgba(0,0,0,0)',
      line: { width: 0 },
      hovertemplate: `${header}${lines.join('<br>')}<extra></extra>`,
    };
    if (color !== undefined) {
      trace['offsetgroup'] = name;
      trace['alignmentgroup'] = 'True';
    }
    if (x !== undefined) trace['x'] = rows.map((i) => get(x, i));
    if (y !== undefined) trace['y'] = rows.map((i) => get(y, i));
    if (hoverName !== undefined) trace['hovertext'] = rows.map((i) => get(hoverName, i));
    if (extraColumns.length > 0) {
      trace['customdata'] = rows.map((i) => extraColumns.map((c) => get(c, i)));
    }
    const c = colors.get(name);
    if (c !== undefined) trace['marker'] = { color: c };
    return trace;
  });

  const layout: Record<string, unknown> = { boxmode: options.stripmode ?? 'group' };
  for (const [letter, column] of [
    ['x', x],
    ['y', y],
  ] as const) {
    if (column === undefined) continue;
    const axis: Record<string, unknown> = { title: { text: label(column) } };
    const ordered = options.categoryOrders?.[column];
    if (ordered && column === posColumn) {
      axis['categoryorder'] = 'array';
      axis['categoryarray'] = [...ordered];
    }
    layout[`${letter}axis`] = axis;
  }
  if (color !== undefined) layout['legend'] = { title: { text: label(color) } };
  if (options.title !== undefined) layout['title'] = { text: options.title };
  return { data, layout };
}
