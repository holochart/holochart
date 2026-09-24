/**
 * The chart-level accessible description (plan E17.1): the accessible name (`aria-label`) and
 * the structured text of the visually hidden DOM mirror — chart type(s), axes with their ranges
 * formatted like the axes, one summary per trace (the trace module's `describe()`, or a generic
 * line) and the traces' optional data tables, capped at {@link MAX_TABLE_ROWS} rows. Pure: the
 * DOM side is `mirror.ts`.
 */
import {
  formatValue,
  getIn,
  isPlainObject,
  type FullConfig,
  type FullLayout,
  type FullTrace,
} from '@mk7s/holochart-core';
import type { AxisInfo, TraceDescription, TraceModule } from '../contracts.ts';
import { countText, formatAxisValue, listText, accessibleText, traceNameText } from './text.ts';

/** Rows shown per hidden data table; longer data gets a "first N of M" caption. */
export const MAX_TABLE_ROWS = 100;
/** Categories listed by name in an axis description before "and N more". */
const MAX_CATEGORIES = 10;

/** What {@link describeChart} reads from a chart (after a pipeline run). */
export interface DescribeInput {
  readonly fullLayout: FullLayout;
  readonly fullData: readonly FullTrace[];
  readonly fullConfig: FullConfig | undefined;
  /** Cartesian axes by id, in layout order. */
  readonly axes: ReadonlyMap<string, AxisInfo>;
  /** Registered module of trace `index`, if any. */
  module(index: number): TraceModule | undefined;
  /** Calc of trace `index`, or `undefined` when it has none (hidden, not calculated). */
  calc(index: number): { readonly value: unknown } | undefined;
}

/** A hidden data table, ready for the DOM (rows already capped). */
export interface DescribedTable {
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/** The accessible description of a chart. */
export interface ChartDescription {
  /** The accessible name: `config.ariaLabel`, `layout.meta.description`, or title + summary. */
  readonly label: string;
  /** Chart type(s) and trace count, e.g. "Line and bar chart with 3 traces." */
  readonly summary: string;
  /** One sentence per axis. */
  readonly axes: readonly string[];
  /** One summary per trace (visible or legend-only). */
  readonly traces: readonly string[];
  readonly tables: readonly DescribedTable[];
}

/** Build the description of a chart. Trace `describe()` errors fall back to the generic line. */
export function describeChart(input: DescribeInput): ChartDescription {
  const { fullData } = input;
  const kinds: string[] = [];
  const traces: string[] = [];
  const tables: DescribedTable[] = [];
  let shown = 0;
  fullData.forEach((trace, index) => {
    if (trace.visible === false) return;
    const module = input.module(index);
    const calc = input.calc(index);
    const described = calc ? describeTrace(module, trace, calc.value, index, input) : undefined;
    const kind = described?.kind ?? trace.type;
    if (trace.visible === true) {
      shown++;
      if (!kinds.includes(kind)) kinds.push(kind);
    }
    let summary = described?.summary ?? genericSummary(trace, index);
    if (trace.visible !== true) summary += ' Hidden (shown in the legend only).';
    traces.push(summary);
    const table = described?.table;
    if (table && table.columns.length > 0) {
      const rows = table.rows.slice(0, MAX_TABLE_ROWS);
      const total = Math.max(table.total ?? table.rows.length, rows.length);
      const base = accessibleText(table.caption) || traceNameText(trace['name'], index);
      tables.push({
        caption:
          total > rows.length
            ? `${base} (first ${rows.length} of ${countText(total, 'row')})`
            : `${base} (${countText(total, 'row')})`,
        columns: table.columns.map(accessibleText),
        rows,
      });
    }
  });

  const summary = chartSummary(kinds, shown);
  const axes = [...input.axes.values()].map(describeAxis);
  return { label: chartLabel(input, summary), summary, axes, traces, tables };
}

/** "Line and bar chart with 3 traces." / "Pie chart." / "Empty chart." */
export function chartSummary(kinds: readonly string[], traces: number): string {
  if (traces === 0 || kinds.length === 0) return 'Empty chart.';
  const head = listText([...kinds]);
  const text = `${head.charAt(0).toUpperCase()}${head.slice(1)} chart`;
  return traces > 1 ? `${text} with ${traces} traces.` : `${text}.`;
}

/** `config.ariaLabel` ?? `layout.meta.description` ?? title + summary. */
function chartLabel(input: DescribeInput, summary: string): string {
  const own = accessibleText(input.fullConfig?.['ariaLabel']);
  if (own) return own;
  // `meta` is `any` (Plotly's templating data, `%{meta.key}`): only an object's `description`.
  const meta = input.fullLayout['meta'];
  if (isPlainObject(meta)) {
    const description = accessibleText(meta['description']);
    if (description) return description;
  }
  const title = accessibleText(getIn(input.fullLayout, 'title.text'));
  return title ? `${title}. ${summary}` : summary;
}

const AXIS_TYPES: Readonly<Record<string, string>> = {
  linear: 'linear',
  log: 'logarithmic',
  date: 'date',
  category: 'category',
  multicategory: 'multi-category',
};

/** 'X axis "Year": date axis from Jan 2020 to Dec 2024.' */
export function describeAxis(axis: AxisInfo): string {
  const suffix = axis.id.slice(1);
  const title = accessibleText(getIn(axis.full, 'title.text'));
  const name = `${axis.letter.toUpperCase()} axis${suffix ? ` ${suffix}` : ''}${title ? ` "${title}"` : ''}`;
  const type = AXIS_TYPES[axis.type] ?? axis.type;
  if (axis.type === 'category' || axis.type === 'multicategory') {
    const categories = axis.scale.categories ?? [];
    const listed = categories.slice(0, MAX_CATEGORIES).map((c) => accessibleText(c));
    const more = categories.length - listed.length;
    const list = more > 0 ? `${listed.join(', ')} and ${more} more` : listText(listed);
    return categories.length === 0
      ? `${name}: ${type} axis without categories.`
      : `${name}: ${type} axis with ${countText(categories.length, 'category', 'categories')}: ${list}.`;
  }
  // Range ends as tick labels (the axis' own precision: "0 to 22", "Dec 2023 to Jun 2024"),
  // not hover labels, which would give the padded autorange's every digit.
  const [r0, r1] = axis.scale.range;
  const from = tickText(axis, r0);
  const to = tickText(axis, r1);
  return from && to ? `${name}: ${type} axis from ${from} to ${to}.` : `${name}: ${type} axis.`;
}

function tickText(axis: AxisInfo, l: number): string {
  try {
    return accessibleText(formatValue(axis.scale, axis.full, l, false)) || formatAxisValue(axis, l);
  } catch {
    return formatAxisValue(axis, l);
  }
}

function describeTrace(
  module: TraceModule | undefined,
  trace: FullTrace,
  calc: unknown,
  index: number,
  input: DescribeInput,
): TraceDescription | undefined {
  if (!module?.describe) return undefined;
  try {
    return (
      module.describe({
        trace,
        calc,
        index,
        fullLayout: input.fullLayout,
        xaxis: axisOf(input, trace['xaxis']),
        yaxis: axisOf(input, trace['yaxis']),
        maxRows: MAX_TABLE_ROWS,
      }) ?? undefined
    );
  } catch (error) {
    // A broken description must never break the chart: fall back to the generic line.
    console.warn(`holochart: describe() of trace ${index} (${trace.type}) failed`, error);
    return undefined;
  }
}

function axisOf(input: DescribeInput, id: unknown): AxisInfo | undefined {
  return typeof id === 'string' ? input.axes.get(id) : undefined;
}

/** 'Scatter trace "Revenue": 120 points.' for traces without `describe()`. */
function genericSummary(trace: FullTrace, index: number): string {
  const type = trace.type.charAt(0).toUpperCase() + trace.type.slice(1);
  const n = trace['_length'];
  const count = typeof n === 'number' && Number.isFinite(n) ? `: ${countText(n, 'point')}` : '';
  return `${type} trace "${traceNameText(trace['name'], index)}"${count}.`;
}
