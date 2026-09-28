/**
 * `sunburst`, `treemap` and `icicle` (plan E13.1, E23.6): px.sunburst, px.treemap and px.icicle —
 * one hierarchy trace from `names` / `parents` / `ids` / `values` columns, or built from `path`
 * (a list of columns from the root level down) as plotly.py's `process_dataframe_hierarchy`
 * builds it: one node per distinct path prefix, values summed, colors aggregated.
 */
import type { Args } from '../core/args.ts';
import { prepare } from '../core/args.ts';
import type { Config } from '../core/config.ts';
import { buildFigure } from '../core/engine.ts';
import { groupValue, valueText } from '../core/labels.ts';
import { expressFunction } from '../core/render.ts';
import { isMissing, Table, type DataInput } from '../data/table.ts';
import type {
  ColumnRef,
  CommonOptions,
  ContinuousColorOptions,
  DiscreteColorOptions,
  ExpressFigure,
  HoverOptions,
} from '../options.ts';
import { defined } from './shared.ts';

/** Options of {@link sunburst}, {@link treemap} and {@link icicle}: px's arguments in camelCase. */
export interface HierarchyOptions
  extends CommonOptions, DiscreteColorOptions, ContinuousColorOptions, HoverOptions {
  /**
   * Columns of the levels, from the root down (`['continent', 'country']`): each row is a leaf,
   * and every distinct path prefix a node, with its values summed. A missing entry ends a row's
   * path early (its later entries must be missing too). Not with `ids` / `parents`.
   */
  readonly path?: readonly ColumnRef[];
  /** Column of node labels (`labels`). */
  readonly names?: ColumnRef;
  /** Column of node sizes (`values`). With `path`, summed per node; default: one per row. */
  readonly values?: ColumnRef;
  /** Column of parent ids (`parents`), `''` for roots. */
  readonly parents?: ColumnRef;
  /** Column of node ids (`ids`), when labels repeat. */
  readonly ids?: ColumnRef;
  /** How values add up: `'total'` (default with `path`) or `'remainder'` (the trace's default). */
  readonly branchvalues?: 'total' | 'remainder';
  /** Levels drawn from the root down (`maxdepth`); -1 draws them all. */
  readonly maxdepth?: number;
}

export type SunburstOptions = HierarchyOptions;
export type TreemapOptions = HierarchyOptions;
export type IcicleOptions = HierarchyOptions;

/** The label of discrete values that differ within a node (px). */
const MIXED = '(?)';

/** A value of a `values` column as a number (px casts it to floats): NaN when missing. */
function toNumber(fn: string, column: string, v: unknown): number {
  if (isMissing(v)) return NaN;
  const n =
    typeof v === 'string' && v.trim() !== ''
      ? Number(v)
      : typeof v === 'bigint' || typeof v === 'boolean'
        ? Number(v)
        : v;
  if (typeof n !== 'number' || Number.isNaN(n)) {
    throw new Error(`${fn}: column '${column}' of values could not be converted to numbers.`);
  }
  return n;
}

/** `name`, or `name_1`, `name_2`, … when the table has a column called so. */
function freeName(table: Table, name: string): string {
  let out = name;
  for (let k = 1; table.has(out); k++) out = `${name}_${k}`;
  return out;
}

/**
 * px's `process_dataframe_hierarchy`: the rows of the `path` columns become one row per node —
 * leaves first, then each level up to the roots, each level in order of first appearance — with
 * `labels` (the level's value), `id` (the path joined by `/`) and `parent` (the parent's id, `''`
 * for roots). `values` (or a `count` of rows) are summed; a numeric `color` becomes the
 * values-weighted mean, other columns (a discrete `color`, `hoverName`, `hoverData`,
 * `customData`) keep their value when all rows agree, else `'(?)'`. With a discrete `color` the
 * nodes are sorted by it, so `'(?)'` takes the first color. `color` is added to `hoverData`.
 *
 * @throws {Error} When a missing entry has a present child, a row stops above another row's
 *   node (not a leaf), or `values` are not numbers.
 */
export function pathArgs(args: Args): Args {
  const { fn, table, cols } = args;
  const path = args.lists.path ?? [];
  const n = table.length;
  const levels = path.map((c) => table.column(c).map(groupValue));
  const at = (k: number, i: number): unknown => levels[k]?.[i];
  const prefix = (i: number, length: number) =>
    JSON.stringify(levels.slice(0, length).map((l) => l[i]));

  // Leaves: a row's depth is its number of leading present entries.
  const depth: number[] = [];
  const inner = new Set<string>();
  for (let i = 0; i < n; i++) {
    let d = 0;
    while (d < path.length && !isMissing(at(d, i))) d++;
    for (let k = d + 1; k < path.length; k++) {
      if (!isMissing(at(k, i))) {
        throw new Error(
          `${fn}: None entries cannot have not-None children (path of row ${i}: ${prefix(i, path.length)}).`,
        );
      }
    }
    depth.push(d);
    for (let k = 0; k < d; k++) inner.add(prefix(i, k));
  }
  for (let i = 0; i < n; i++) {
    const d = depth[i] as number;
    if (d < path.length && inner.has(prefix(i, d))) {
      throw new Error(
        `${fn}: non-leaf rows are not permitted (path of row ${i}: ${prefix(i, path.length)}).`,
      );
    }
  }

  // Values (a count of rows without `values`); a `values` column that is also `color` is summed
  // as `<name>_sum`, as px does.
  const valuesColumn = cols.values;
  const colorColumn = cols.color;
  const weights = valuesColumn
    ? table.column(valuesColumn).map((v) => toNumber(fn, valuesColumn, v))
    : new Array<number>(n).fill(1);
  const valueName =
    valuesColumn === undefined
      ? freeName(table, 'count')
      : valuesColumn === colorColumn
        ? `${valuesColumn}_sum`
        : valuesColumn;
  const continuous = colorColumn !== undefined && table.type(colorColumn) === 'numeric';
  const sum = (rows: readonly number[], of: (i: number) => number): number => {
    let s = 0;
    for (const i of rows) {
      const v = of(i);
      if (!Number.isNaN(v)) s += v; // pandas' sum skips NaN
    }
    return s;
  };
  const weight = (i: number) => weights[i] as number;
  const aggregators = new Map<string, (rows: readonly number[]) => unknown>();
  aggregators.set(valueName, (rows) => sum(rows, weight));
  const discrete = (column: string) => {
    const values = table.column(column);
    return (rows: readonly number[]): unknown => {
      const first = groupValue(values[rows[0] as number]);
      const key = JSON.stringify([first ?? null]);
      for (const i of rows) {
        if (JSON.stringify([groupValue(values[i]) ?? null]) !== key) return MIXED;
      }
      return first;
    };
  };
  for (const column of [
    colorColumn,
    cols.hoverName,
    ...(args.lists.hoverData ?? []),
    ...(args.lists.customData ?? []),
  ]) {
    // Generated columns win over data columns of the same name (px drops those).
    if (column === undefined || aggregators.has(column) || RESERVED.has(column)) continue;
    if (column === colorColumn && continuous) {
      const colors = table.column(column).map((v) => (isMissing(v) ? NaN : Number(v)));
      aggregators.set(column, (rows) => {
        const mean = sum(rows, (i) => (colors[i] as number) * weight(i)) / sum(rows, weight);
        return Number.isFinite(mean) ? mean : null;
      });
    } else if (column === valuesColumn) aggregators.set(column, (rows) => sum(rows, weight));
    else aggregators.set(column, discrete(column));
  }

  // Nodes, from the leaves up.
  const labels: string[] = [];
  const parents: string[] = [];
  const ids: string[] = [];
  const out = new Map<string, unknown[]>([...aggregators.keys()].map((c) => [c, []]));
  for (let level = path.length - 1; level >= 0; level--) {
    const groups = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      if ((depth[i] as number) <= level) continue;
      const key = prefix(i, level + 1);
      const rows = groups.get(key);
      if (rows) rows.push(i);
      else groups.set(key, [i]);
    }
    for (const rows of groups.values()) {
      const parts = levels.slice(0, level + 1).map((l) => valueText(l[rows[0] as number]));
      labels.push(parts[level] as string);
      ids.push(parts.join('/'));
      parents.push(parts.slice(0, -1).join('/'));
      for (const [column, aggregate] of aggregators) out.get(column)?.push(aggregate(rows));
    }
  }

  const columns = new Map<string, unknown[]>([
    ['labels', labels],
    ['parent', parents],
    ['id', ids],
    ...out,
  ]);
  if (colorColumn !== undefined && !continuous) {
    // px sorts the nodes by color (as text, missing last), so `'(?)'` comes first.
    const color = columns.get(colorColumn) as unknown[];
    const text = (k: number) => (isMissing(color[k]) ? undefined : valueText(color[k]));
    const order = labels
      .map((_, k) => k)
      .sort((a, b) => {
        const ta = text(a);
        const tb = text(b);
        if (ta === tb) return 0;
        if (ta === undefined) return 1;
        if (tb === undefined) return -1;
        return ta < tb ? -1 : 1;
      });
    for (const [name, values] of columns) {
      columns.set(
        name,
        order.map((k) => values[k]),
      );
    }
  }

  const hoverData = [...(args.lists.hoverData ?? [])];
  if (
    colorColumn !== undefined &&
    !hoverData.includes(colorColumn) &&
    args.hoverFormats.get(colorColumn) !== false
  ) {
    hoverData.push(colorColumn);
  }
  return {
    ...args,
    table: new Table(columns),
    cols: defined({
      names: 'labels',
      parents: 'parent',
      ids: 'id',
      values: valueName,
      color: colorColumn,
      hoverName: cols.hoverName,
    }) as Args['cols'],
    lists: defined({ hoverData, customData: args.lists.customData }) as Args['lists'],
  };
}

/** Columns `pathArgs` generates. */
const RESERVED = new Set(['labels', 'parent', 'id']);

function buildHierarchyFigure(
  type: 'sunburst' | 'treemap' | 'icicle',
  data: DataInput | null | undefined,
  options: HierarchyOptions,
): ExpressFigure {
  const hasPath = options.path !== undefined && options.path !== null;
  if (hasPath && (options.ids != null || options.parents != null)) {
    throw new Error(`${type}: \`path\` and \`ids\` / \`parents\` are mutually exclusive.`);
  }
  const prepared = prepare(type, data, options as Record<string, unknown>);
  const args = hasPath ? pathArgs(prepared) : prepared;
  const config: Config = {
    specs: [
      {
        type,
        attrs: [
          'hoverName',
          'names',
          'values',
          'parents',
          'ids',
          'customData',
          'hoverData',
          'color',
        ],
        patch: defined({
          branchvalues: options.branchvalues ?? (hasPath ? 'total' : undefined),
          maxdepth: options.maxdepth,
        }),
      },
    ],
    groupers: [],
    continuousColor: 'pie',
    inlineColorscale: true,
    subplotType: 'domain',
    ...(options.colorDiscreteSequence
      ? { layoutPatch: { [`${type}colorway`]: [...options.colorDiscreteSequence] } }
      : {}),
  };
  return buildFigure(args, config);
}

/**
 * A sunburst chart (`px.sunburst`): one `sunburst` trace, from `names` / `parents` / `ids` /
 * `values` columns or built from `path` (with `branchvalues: 'total'`); `color` colors the
 * sectors, through a colorscale when numeric (values-weighted means on inner nodes), else from the
 * colorway or `colorDiscreteMap` (`'(?)'` for nodes whose rows differ).
 *
 * @example
 * ```ts
 * const figure = sunburst(rows, { path: ['continent', 'country'], values: 'pop', color: 'lifeExp' });
 * ```
 */
export const sunburst = expressFunction<SunburstOptions>((data, options) =>
  buildHierarchyFigure('sunburst', data, options),
);

/**
 * A treemap (`px.treemap`): one `treemap` trace of nested rectangles, with the options of
 * {@link sunburst}.
 *
 * @example
 * ```ts
 * const figure = treemap(rows, { path: ['continent', 'country'], values: 'pop', color: 'continent' });
 * ```
 */
export const treemap = expressFunction<TreemapOptions>((data, options) =>
  buildHierarchyFigure('treemap', data, options),
);

/**
 * An icicle chart (`px.icicle`): one `icicle` trace of adjoined rectangles cascading from the root,
 * with the options of {@link sunburst}.
 *
 * @example
 * ```ts
 * const figure = icicle(rows, { path: ['continent', 'country'], values: 'pop' });
 * ```
 */
export const icicle = expressFunction<IcicleOptions>((data, options) =>
  buildHierarchyFigure('icicle', data, options),
);
