/**
 * Gantt / timeline figures (plan E9.14), like plotly.py's `px.timeline`: each row of a table
 * becomes a horizontal `bar` on a date x axis, starting at its `base` (the start date) with a
 * length of `end - start` in ms. Pure: builds a figure (`{ data, layout }`) to pass to
 * `createChart`, nothing is rendered or registered here.
 */
import { dateToMs } from '@mk7s/holochart-core';

/** Rows (`[{ task, start, end }, …]`) or columns (`{ task: [...], start: [...], end: [...] }`). */
export type TimelineData =
  readonly Readonly<Record<string, unknown>>[] | Readonly<Record<string, ArrayLike<unknown>>>;

/** Options of {@link timeline}: the camelCase counterparts of `px.timeline`'s parameters. */
export interface TimelineOptions {
  /** The table: an array of row objects, or an object of equally long columns. */
  readonly data: TimelineData;
  /** Column of start dates (date strings, `Date`s or ms since the epoch). */
  readonly xStart: string;
  /** Column of end dates. */
  readonly xEnd: string;
  /** Column of row labels (tasks): the categories of the y axis. */
  readonly y: string;
  /** Column to group by: one trace (and legend item) per distinct value. */
  readonly color?: string;
  /** Column of labels drawn on the bars (`textposition: 'auto'`). */
  readonly text?: string;
  /** Column shown in bold at the top of the hover label. */
  readonly hoverName?: string;
  /** Extra columns listed in the hover label (through `customdata`). */
  readonly hoverData?: readonly string[];
  /** Display names of columns, for hover lines, the legend title and the y axis title. */
  readonly labels?: Readonly<Record<string, string>>;
  /** Fixed colors per `color` value. Other values take `colorDiscreteSequence`, else the colorway. */
  readonly colorDiscreteMap?: Readonly<Record<string, string>>;
  /** Colors for `color` values in order. Default: the template's colorway (no `marker.color`). */
  readonly colorDiscreteSequence?: readonly string[];
  /**
   * Value orders per column, e.g. `{ Resource: ['Ana', 'Ben'] }` orders the traces and legend,
   * `{ Task: [...] }` the rows. Values not listed follow in order of first appearance. Rows listed
   * for `y` are kept even without a bar, so rows of other traces (milestones) can be placed too.
   */
  readonly categoryOrders?: Readonly<Record<string, readonly unknown[]>>;
  /** Figure title. */
  readonly title?: string;
  /**
   * List rows top-down, the first row (or the first entry of `categoryOrders[y]`) at the top, as
   * Gantt charts read. Default `true`; `false` keeps Plotly's bottom-up category order.
   */
  readonly reverseY?: boolean;
  /** Bar opacity (`marker.opacity`), 0–1. */
  readonly opacity?: number;
}

/** The figure built by {@link timeline}: pass it to `createChart` or adjust it first. */
export interface TimelineFigure {
  /** One horizontal `bar` trace per `color` group (a single trace without `color`). */
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
}

const DAY_MS = 86_400_000;

function isRows(data: TimelineData): data is readonly Readonly<Record<string, unknown>>[] {
  return Array.isArray(data);
}

/** Row count and a cell reader for rows or columns. */
function table(data: TimelineData): {
  length: number;
  get: (column: string, i: number) => unknown;
} {
  if (isRows(data)) {
    return { length: data.length, get: (column, i) => data[i]?.[column] };
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

/** Group key (and trace name) of a `color` value: its string form, so `1` and `'1'` share one. */
function groupName(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

/**
 * Colors per group, as px assigns them: the map first, then the sequence continuing after the
 * map's entries. Without a sequence, unmapped groups get no color (the colorway applies).
 */
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
 * Build a Gantt chart figure from a table, like plotly.py's `px.timeline`: one horizontal `bar`
 * trace per `color` group, `base` = the start dates (as given), `x` = durations in ms,
 * `barmode: 'overlay'` and a date x axis. Rows whose start or end is not a valid date are
 * skipped. Differences from px: rows read top-down by default (`reverseY`), colors come from the
 * template's colorway unless `colorDiscreteMap` / `colorDiscreteSequence` is given, and hover
 * dates show the time of day only when some start or end has one.
 *
 * @example
 * ```ts
 * import { createChart, timeline } from '@mk7s/holochart';
 *
 * const figure = timeline({
 *   data: [
 *     { Task: 'Design', Start: '2026-03-02', Finish: '2026-03-13', Team: 'UX' },
 *     { Task: 'Build', Start: '2026-03-09', Finish: '2026-04-03', Team: 'Dev' },
 *   ],
 *   xStart: 'Start',
 *   xEnd: 'Finish',
 *   y: 'Task',
 *   color: 'Team',
 * });
 * createChart(el, figure);
 * ```
 */
export function timeline(options: TimelineOptions): TimelineFigure {
  const { xStart, xEnd, y, color, text, hoverName } = options;
  const labels = options.labels ?? {};
  const label = (column: string): string => labels[column] ?? column;
  const reverseY = options.reverseY ?? true;
  const { length, get } = table(options.data);

  // Valid rows, with their group.
  const rows: { i: number; start: number; end: number; group: string }[] = [];
  const groupsSeen: string[] = [];
  const ySeen: unknown[] = [];
  for (let i = 0; i < length; i++) {
    const start = dateToMs(get(xStart, i));
    const end = dateToMs(get(xEnd, i));
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const group = color === undefined ? '' : groupName(get(color, i));
    rows.push({ i, start, end, group });
    groupsSeen.push(group);
    ySeen.push(get(y, i));
  }

  const names =
    color === undefined
      ? ['']
      : order(groupsSeen, options.categoryOrders?.[color]?.map(groupName)).map(groupName);
  const colors = groupColors(names, options.colorDiscreteMap, options.colorDiscreteSequence);

  // Hover: dates without a time of day unless some bar starts or ends within a day.
  const withTime = rows.some((r) => r.start % DAY_MS !== 0 || r.end % DAY_MS !== 0);
  const dateFormat = withTime ? '%Y-%m-%d %H:%M' : '%Y-%m-%d';
  const extraColumns = (options.hoverData ?? []).filter(
    (c) => c !== xStart && c !== xEnd && c !== y,
  );

  const data = names.map((name) => {
    const members = rows.filter((r) => r.group === name);
    const lines: string[] = [];
    if (color !== undefined) lines.push(`${label(color)}=${name}`);
    lines.push(`${label(xStart)}=%{base|${dateFormat}}`, `${label(xEnd)}=%{x|${dateFormat}}`);
    lines.push(`${label(y)}=%{y}`);
    if (text !== undefined) lines.push(`${label(text)}=%{text}`);
    extraColumns.forEach((c, k) => lines.push(`${label(c)}=%{customdata[${k}]}`));
    const header = hoverName !== undefined ? '<b>%{hovertext}</b><br><br>' : '';

    const trace: Record<string, unknown> = {
      type: 'bar',
      orientation: 'h',
      name,
      legendgroup: name,
      showlegend: name !== '',
      base: members.map((r) => get(xStart, r.i)),
      x: members.map((r) => r.end - r.start),
      y: members.map((r) => get(y, r.i)),
      hovertemplate: `${header}${lines.join('<br>')}<extra></extra>`,
    };
    if (text !== undefined) {
      trace['text'] = members.map((r) => get(text, r.i));
      trace['textposition'] = 'auto';
    }
    if (hoverName !== undefined) trace['hovertext'] = members.map((r) => get(hoverName, r.i));
    if (extraColumns.length > 0) {
      trace['customdata'] = members.map((r) => extraColumns.map((c) => get(c, r.i)));
    }
    const marker: Record<string, unknown> = {};
    const c = colors.get(name);
    if (c !== undefined) marker['color'] = c;
    if (options.opacity !== undefined) marker['opacity'] = options.opacity;
    if (Object.keys(marker).length > 0) trace['marker'] = marker;
    return trace;
  });

  const yaxis: Record<string, unknown> = { title: { text: label(y) } };
  const yOrder = options.categoryOrders?.[y];
  if (reverseY || yOrder) {
    // Category axes run bottom-up: list the rows reversed so the first one is at the top.
    const rowsOrder = [...new Set([...(yOrder ?? []), ...ySeen])];
    yaxis['categoryorder'] = 'array';
    yaxis['categoryarray'] = reverseY ? rowsOrder.reverse() : rowsOrder;
  }
  const layout: Record<string, unknown> = {
    barmode: 'overlay',
    xaxis: { type: 'date' },
    yaxis,
  };
  if (color !== undefined) layout['legend'] = { title: { text: label(color) } };
  if (options.title !== undefined) layout['title'] = { text: options.title };
  return { data, layout };
}
