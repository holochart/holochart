/**
 * Argument preparation, like the first half of plotly.py's `px._core.build_dataframe`: the data
 * becomes a {@link Table}, every column option (a name or an array) becomes a column name, and the
 * template the figure will use is resolved so colors and symbols can be assigned up front.
 */
import {
  DEFAULT_COLORWAY,
  isPlainObject,
  resolveTemplate,
  type Template,
} from '@mk7s/holochart-core';
import { registry } from '@mk7s/holochart-runtime';
import { toTable, type DataInput, type Table } from '../data/table.ts';
import type { ColumnRef, ContinuousScale } from '../options.ts';

/** Options that name one column. */
export const COLUMN_KEYS = [
  'x',
  'y',
  'z',
  'base',
  'color',
  'symbol',
  'size',
  'text',
  'hoverName',
  'lineDash',
  'pattern',
  'lineGroup',
  'facetRow',
  'facetCol',
  'animationFrame',
  'animationGroup',
  'errorX',
  'errorXMinus',
  'errorY',
  'errorYMinus',
  'names',
  'values',
  'xStart',
  'xEnd',
] as const;

/** Options that name a list of columns. */
export const LIST_KEYS = ['hoverData', 'customData', 'dimensions'] as const;

export type ColumnKey = (typeof COLUMN_KEYS)[number];
export type ListKey = (typeof LIST_KEYS)[number];

/** Plotly's symbol and dash cycles, which px uses when the template has none. */
const SYMBOLS = ['circle', 'diamond', 'square', 'x', 'cross'];
const DASHES = ['solid', 'dot', 'dash', 'longdash', 'dashdot', 'longdashdot'];
const PATTERNS = ['', '/', '\\', 'x', '+', '.'];

/** The prepared arguments of one Express call. */
export interface Args {
  /** Function name, for error messages (`scatter`). */
  readonly fn: string;
  /** The data, with array options added as columns. */
  readonly table: Table;
  /** The options as given. */
  readonly options: Readonly<Record<string, unknown>>;
  /** Column name per column option. */
  readonly cols: Partial<Record<ColumnKey, string>>;
  /** Column names per list option. */
  readonly lists: Partial<Record<ListKey, string[]>>;
  /** `hoverData` given as an object: per column, `false` (hide), `true` or a format. */
  readonly hoverFormats: ReadonlyMap<string, boolean | string>;
  /** Display name of a column (`labels`, else the name). */
  label(column: string): string;
  /** The template the figure renders with (`template` option, else the default). */
  readonly template: Template | null;
  readonly colorway: readonly string[];
  readonly symbolSequence: readonly string[];
  readonly dashSequence: readonly string[];
  readonly patternSequence: readonly string[];
  /** Colorscale for continuous color, as `[position, color]` pairs or a name. */
  readonly continuousScale: string | [number, string][];
}

function isColumnArray(v: unknown): v is ArrayLike<unknown> {
  return (
    Array.isArray(v) ||
    (ArrayBuffer.isView(v) && !(v instanceof DataView)) ||
    (typeof v === 'object' && v !== null && typeof (v as { length?: unknown }).length === 'number')
  );
}

/** `[position, color]` pairs: a list of colors is spread evenly, as px does. */
export function toColorscale(scale: ContinuousScale): string | [number, string][] {
  if (typeof scale === 'string') return scale;
  if (scale.length === 0) return 'Plasma';
  if (typeof scale[0] === 'string') {
    const colors = scale as readonly string[];
    if (colors.length === 1)
      return [
        [0, colors[0] as string],
        [1, colors[0] as string],
      ];
    return colors.map((c, i) => [i / (colors.length - 1), c]);
  }
  return (scale as readonly (readonly [number, string])[]).map(([p, c]) => [p, c]);
}

function stringList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((s): s is string => typeof s === 'string');
  return out.length > 0 ? out : undefined;
}

/** Values of `path` in the template's traces of `type` (`scatter` → `marker.symbol`), in order. */
function templateCycle(template: Template | null, type: string, path: string[]): string[] {
  const list = template?.data?.[type] ?? [];
  const out: string[] = [];
  for (const item of list) {
    let v: unknown = item;
    for (const key of path) v = isPlainObject(v) ? v[key] : undefined;
    if (typeof v === 'string') out.push(v);
  }
  return out;
}

/**
 * Prepare an Express call: normalize the data, resolve column options (names are checked; arrays
 * become columns named after the option) and resolve the template's cycles.
 *
 * @throws {Error} For unknown column names (listing the columns) and arrays of the wrong length.
 */
export function prepare(
  fn: string,
  data: DataInput | null | undefined,
  options: Readonly<Record<string, unknown>>,
): Args {
  let table = toTable(data);
  const labels = (options['labels'] as Readonly<Record<string, string>> | undefined) ?? {};

  const addArray = (base: string, values: ArrayLike<unknown>): string => {
    let name = base;
    for (let k = 1; table.has(name); k++) name = `${base}_${k}`;
    const array = Array.from(values);
    if (table.names.length > 0 && array.length !== table.length) {
      throw new Error(
        `${fn}: '${base}' has ${array.length} values; the data has ${table.length} rows.`,
      );
    }
    table = table.withColumn(name, array);
    return name;
  };
  const resolve = (key: string, ref: unknown, arrayName: string): string => {
    if (typeof ref === 'string') {
      if (!table.has(ref)) {
        throw new Error(
          `${fn}: the value of '${key}' is not the name of a column in the data. Expected one of [${table.names.map((n) => `'${n}'`).join(', ')}] but received: '${ref}'.`,
        );
      }
      return ref;
    }
    if (isColumnArray(ref)) return addArray(arrayName, ref);
    throw new Error(`${fn}: '${key}' must be a column name or an array (got ${typeof ref}).`);
  };

  const cols: Partial<Record<ColumnKey, string>> = {};
  for (const key of COLUMN_KEYS) {
    const ref = options[key];
    if (ref === undefined || ref === null) continue;
    cols[key] = resolve(key, ref, key);
  }

  const lists: Partial<Record<ListKey, string[]>> = {};
  const hoverFormats = new Map<string, boolean | string>();
  for (const key of LIST_KEYS) {
    const ref = options[key] as ColumnRef[] | Record<string, boolean | string> | undefined;
    if (ref === undefined || ref === null) continue;
    if (key === 'hoverData' && isPlainObject(ref)) {
      const names: string[] = [];
      for (const [name, how] of Object.entries(ref)) {
        // `false` hides a line (it need not be a column: `{ x: false }` names the x column).
        const column = table.has(name) ? name : (cols[name as ColumnKey] ?? name);
        hoverFormats.set(column, how);
        if (how !== false) names.push(resolve(key, column, name));
      }
      lists[key] = names;
      continue;
    }
    if (!Array.isArray(ref) && !isColumnArray(ref)) {
      throw new Error(`${fn}: '${key}' must be a list of columns.`);
    }
    lists[key] = Array.from(ref as ArrayLike<ColumnRef>, (r, i) => resolve(key, r, `${key}_${i}`));
  }

  const template = resolveTemplate(options['template'], registry.core).template;
  const tl = (template?.layout ?? {}) as Record<string, unknown>;
  const colorway = stringList(options['colorDiscreteSequence']) ??
    stringList(tl['colorway']) ?? [...DEFAULT_COLORWAY];
  const symbolSequence =
    stringList(options['symbolSequence']) ??
    stringList(templateCycle(template, 'scatter', ['marker', 'symbol'])) ??
    SYMBOLS;
  const dashSequence =
    stringList(options['lineDashSequence']) ??
    stringList(templateCycle(template, 'scatter', ['line', 'dash'])) ??
    DASHES;
  const patternSequence =
    stringList(options['patternShapeSequence']) ??
    stringList(templateCycle(template, 'bar', ['marker', 'pattern', 'shape'])) ??
    PATTERNS;
  const sequential = (tl['colorscale'] as Record<string, unknown> | undefined)?.['sequential'];
  const continuousScale = toColorscale(
    (options['colorContinuousScale'] as ContinuousScale | undefined) ??
      (Array.isArray(sequential) || typeof sequential === 'string'
        ? (sequential as ContinuousScale)
        : 'Plasma'),
  );

  return {
    fn,
    table,
    options,
    cols,
    lists,
    hoverFormats,
    label: (column) => labels[column] ?? column,
    template,
    colorway,
    symbolSequence,
    dashSequence,
    patternSequence,
    continuousScale,
  };
}
