/**
 * The tabular data model of Express (plan E23.1): one {@link Table} type that every Express
 * function reads, built from row objects, an object of columns, an Apache Arrow table (duck-typed:
 * no Arrow dependency) or a CSV text (`fromCSV`, in `csv.ts`). Columns are plain arrays; each
 * column's type (numeric, date or categorical) is inferred on first use, the way pandas' dtypes
 * drive plotly.py's `px`.
 */
import { formatDate, isDateString, isValidDate } from '@mk7s/holochart-core';

/** What a column holds, as Express's grouping, colors and axes see it. */
export type ColumnType = 'numeric' | 'date' | 'categorical';

/** An Arrow vector, duck-typed: `get(i)` and `length`, and `toArray()` when available. */
export interface ArrowLikeVector {
  readonly length: number;
  get(index: number): unknown;
  toArray?(): ArrayLike<unknown>;
}

/**
 * An Apache Arrow table, duck-typed (`apache-arrow`'s `Table` fits): its row count, its schema's
 * field names and a column by name. Express never imports Arrow itself.
 */
export interface ArrowLikeTable {
  readonly numRows: number;
  readonly schema: { readonly fields: readonly { readonly name: string }[] };
  getChild(name: string): ArrowLikeVector | null | undefined;
}

/** Rows: `[{ country: 'Chad', pop: 1.2e7 }, …]`. Column names are the keys, in first-seen order. */
export type RowsInput = readonly object[];

/** Columns: `{ country: [...], pop: Float64Array }`, all the same length. */
export type ColumnsInput = Readonly<Record<string, ArrayLike<unknown>>>;

/**
 * Everything Express accepts as data: rows, columns, an Arrow-like table or a {@link Table}
 * (e.g. from `fromCSV`).
 */
export type DataInput = RowsInput | ColumnsInput | ArrowLikeTable | Table;

/** A missing value: `null`, `undefined` or `NaN` (pandas' NA). */
export function isMissing(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
}

/**
 * The type of a column of values, as px decides from pandas dtypes: `numeric` when every present
 * value is a number (or bigint), `date` when every present value is a `Date` or an ISO-8601 date
 * string (`2024-03-01`, `2024-03-01 12:30`, …), else `categorical` (strings, booleans, mixes, and
 * columns with no present value). Missing values (`null`, `undefined`, `NaN`) are ignored; numeric
 * strings are categories, as in pandas (`fromCSV` parses numbers first).
 */
export function inferColumnType(values: ArrayLike<unknown>): ColumnType {
  let numeric = true;
  let date = true;
  let any = false;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (isMissing(v)) continue;
    any = true;
    if (typeof v !== 'number' && typeof v !== 'bigint') numeric = false;
    if (!isValidDate(v) && !isDateString(v)) date = false;
    if (!numeric && !date) return 'categorical';
  }
  if (!any) return 'categorical';
  return numeric ? 'numeric' : 'date';
}

/**
 * A value as it goes into a figure: `Date`s become Plotly date strings (`2024-03-01`,
 * `2024-03-01 12:30`, UTC) and bigints numbers; everything else as is.
 */
export function plainValue(v: unknown): unknown {
  if (v instanceof Date) return isValidDate(v) ? (formatDate(v.getTime()) ?? null) : null;
  if (typeof v === 'bigint') return Number(v);
  return v;
}

/**
 * An immutable table of named, equally long columns. Built by {@link toTable} (which every Express
 * function calls on its data) or `fromCSV`.
 *
 * @example
 * ```ts
 * const t = toTable([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
 * t.names;            // ['a', 'b']
 * t.column('a');      // [1, 2]
 * t.type('b');        // 'categorical'
 * ```
 */
export class Table {
  /** Column names, in order. */
  readonly names: readonly string[];
  /** Number of rows. */
  readonly length: number;
  readonly #columns: ReadonlyMap<string, readonly unknown[]>;
  readonly #types = new Map<string, ColumnType>();

  /**
   * @param columns - Columns by name; they must all have the same length.
   * @throws {Error} When columns differ in length.
   */
  constructor(
    columns: ReadonlyMap<string, readonly unknown[]> | Record<string, readonly unknown[]>,
  ) {
    const map =
      columns instanceof Map
        ? (columns as ReadonlyMap<string, readonly unknown[]>)
        : new Map(Object.entries(columns));
    let length: number | undefined;
    for (const [name, values] of map) {
      if (length === undefined) length = values.length;
      else if (values.length !== length) {
        throw new Error(
          `Express: all columns must have the same length; column '${name}' has ${values.length} values, the first column ${length}.`,
        );
      }
    }
    this.#columns = map;
    this.names = [...map.keys()];
    this.length = length ?? 0;
  }

  /** Whether the table has a column called `name`. */
  has(name: string): boolean {
    return this.#columns.has(name);
  }

  /**
   * The values of a column.
   *
   * @throws {Error} When there is no such column (the message lists the columns).
   */
  column(name: string): readonly unknown[] {
    const values = this.#columns.get(name);
    if (values === undefined) {
      throw new Error(
        `Express: no column '${name}' in the data. Expected one of [${this.names.map((n) => `'${n}'`).join(', ')}].`,
      );
    }
    return values;
  }

  /** The inferred type of a column (see {@link inferColumnType}); computed once. */
  type(name: string): ColumnType {
    let t = this.#types.get(name);
    if (t === undefined) {
      t = inferColumnType(this.column(name));
      this.#types.set(name, t);
    }
    return t;
  }

  /** A new table with one more column (or a column replaced). */
  withColumn(name: string, values: readonly unknown[]): Table {
    if (this.names.length > 0 && values.length !== this.length) {
      throw new Error(
        `Express: column '${name}' has ${values.length} values; the data has ${this.length} rows.`,
      );
    }
    const next = new Map(this.#columns);
    next.set(name, values);
    return new Table(next);
  }

  /** The table as row objects. */
  toRows(): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = [];
    for (let i = 0; i < this.length; i++) {
      const row: Record<string, unknown> = {};
      for (const [name, values] of this.#columns) row[name] = values[i];
      out.push(row);
    }
    return out;
  }

  /** The table as an object of columns (the arrays themselves, not copies). */
  toColumns(): Record<string, readonly unknown[]> {
    return Object.fromEntries(this.#columns);
  }
}

function isArrowLike(data: object): data is ArrowLikeTable {
  const t = data as Partial<ArrowLikeTable>;
  return (
    typeof t.numRows === 'number' &&
    typeof t.getChild === 'function' &&
    Array.isArray(t.schema?.fields)
  );
}

/** Arrow values as plain JS: bigints (int64, timestamps) become numbers. */
function arrowColumn(vector: ArrowLikeVector | null | undefined, rows: number): unknown[] {
  const out = new Array<unknown>(rows).fill(null);
  if (!vector) return out;
  const array = typeof vector.toArray === 'function' ? vector.toArray() : undefined;
  for (let i = 0; i < rows; i++) {
    const v = array && array.length === rows ? array[i] : vector.get(i);
    out[i] = typeof v === 'bigint' ? Number(v) : (v ?? null);
  }
  return out;
}

/**
 * Normalize any {@link DataInput} into a {@link Table}.
 *
 * - **Rows** (`[{ a: 1, b: 'x' }, …]`): columns are the keys of all rows, in first-seen order; a
 *   row without a key has `undefined` there.
 * - **Columns** (`{ a: [...], b: [...] }`): typed arrays are copied into plain arrays; all
 *   columns must be equally long.
 * - **Arrow tables** (anything with `numRows`, `schema.fields` and `getChild(name)`): one column
 *   per schema field; bigints become numbers.
 * - A {@link Table} is returned as is; `null` / `undefined` give an empty table (then every
 *   column must be given as an array in the options, as px allows).
 *
 * @throws {Error} For other inputs and for columns of different lengths.
 */
export function toTable(data: DataInput | null | undefined): Table {
  if (data === null || data === undefined) return new Table(new Map());
  if (data instanceof Table) return data;
  if (Array.isArray(data)) {
    const rows = data as readonly object[];
    const names: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (row === null || typeof row !== 'object') {
        throw new Error('Express: rows must be objects ({ column: value, … }).');
      }
      for (const key of Object.keys(row)) {
        if (!seen.has(key)) {
          seen.add(key);
          names.push(key);
        }
      }
    }
    const columns = new Map<string, unknown[]>();
    for (const name of names) {
      columns.set(
        name,
        rows.map((row) => (row as Record<string, unknown>)[name]),
      );
    }
    return new Table(columns);
  }
  if (typeof data !== 'object') {
    throw new Error(
      `Express: data must be rows, an object of columns, an Arrow table or a Table (got ${typeof data}). Parse CSV text with fromCSV first.`,
    );
  }
  if (isArrowLike(data)) {
    const columns = new Map<string, unknown[]>();
    for (const field of data.schema.fields) {
      columns.set(field.name, arrowColumn(data.getChild(field.name), data.numRows));
    }
    return new Table(columns);
  }
  const columns = new Map<string, unknown[]>();
  for (const [name, values] of Object.entries(data as ColumnsInput)) {
    if (values === null || typeof values !== 'object' || typeof values.length !== 'number') {
      throw new Error(`Express: column '${name}' is not an array.`);
    }
    columns.set(name, Array.from(values));
  }
  return new Table(columns);
}

/** The inferred type of every column of `data`, by name (see {@link inferColumnType}). */
export function columnTypes(data: DataInput): Record<string, ColumnType> {
  const table = toTable(data);
  return Object.fromEntries(table.names.map((n) => [n, table.type(n)]));
}
