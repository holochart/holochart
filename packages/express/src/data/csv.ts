/**
 * CSV parsing for Express (plan E23.1): RFC 4180 text into a {@link Table}, with numbers typed
 * the way pandas' `read_csv` types them, so `px`-style inference (numeric, date, categorical) sees
 * the same columns.
 */
import { Table } from './table.ts';

/** Options of {@link fromCSV}. */
export interface CSVOptions {
  /** Field separator, one character. Default `','`. */
  readonly delimiter?: string;
  /** Whether the first record names the columns. Default `true`; `false` names them `0`, `1`, …. */
  readonly header?: boolean;
  /**
   * Type the values (default `true`): in a column whose every non-empty field is a number,
   * the fields become numbers; empty fields become `null` in every column. `false` keeps every
   * field as the string it is (empty fields as `''`).
   */
  readonly typed?: boolean;
}

/** A decimal number as CSV writes it: `12`, `-3.5`, `.5`, `1e-3`, `NaN`, `inf`. */
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$|^[+-]?(?:inf|Infinity)$|^NaN$/;

/**
 * Split RFC 4180 text into records of fields: fields are separated by the delimiter and records by
 * CRLF, LF or CR; a field in double quotes may contain delimiters, line breaks and `""` (one quote).
 * A final line break does not start another record. A byte-order mark is dropped.
 *
 * @throws {Error} For a quote inside an unquoted field, text after a closing quote, or a quoted
 * field that never closes (with the line number).
 */
export function parseCSVRecords(text: string, delimiter = ','): string[][] {
  if (delimiter.length !== 1 || delimiter === '"' || delimiter === '\n' || delimiter === '\r') {
    throw new Error(
      `fromCSV: the delimiter must be one character other than a quote or line break.`,
    );
  }
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let line = 1;
  let i = 0;
  const n = src.length;
  // A record is pending once any character of it has been read.
  let pending = false;
  while (i < n) {
    const ch = src[i] as string;
    if (ch === '"' && field === '') {
      // Quoted field.
      const startLine = line;
      i++;
      for (;;) {
        if (i >= n)
          throw new Error(`fromCSV: a quoted field opened on line ${startLine} never closes.`);
        const c = src[i] as string;
        if (c === '"') {
          if (src[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        if (c === '\n') line++;
        field += c;
        i++;
      }
      pending = true;
      const next = src[i];
      if (next !== undefined && next !== delimiter && next !== '\n' && next !== '\r') {
        throw new Error(`fromCSV: unexpected text after a closing quote on line ${line}.`);
      }
      continue;
    }
    if (ch === delimiter) {
      record.push(field);
      field = '';
      pending = true;
      i++;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      pending = false;
      i += ch === '\r' && src[i + 1] === '\n' ? 2 : 1;
      line++;
      continue;
    }
    if (ch === '"') {
      throw new Error(
        `fromCSV: a quote inside an unquoted field on line ${line}; quote the field.`,
      );
    }
    field += ch;
    pending = true;
    i++;
  }
  if (pending) {
    record.push(field);
    records.push(record);
  }
  return records;
}

function toNumber(s: string): number {
  const t = s.replace(/^\+/, '');
  if (/^-?inf(?:inity)?$/i.test(t)) return t.startsWith('-') ? -Infinity : Infinity;
  return Number(t);
}

/** Column names from a header record: empty names become `Unnamed: i`, repeats get `.1`, `.2`, …. */
function headerNames(fields: readonly string[]): string[] {
  const used = new Map<string, number>();
  return fields.map((raw, i) => {
    const base = raw === '' ? `Unnamed: ${i}` : raw;
    let name = base;
    let k = used.get(base) ?? 0;
    while (used.has(name)) name = `${base}.${++k}`;
    used.set(base, k);
    used.set(name, 0);
    return name;
  });
}

/**
 * Parse CSV text (RFC 4180) into a {@link Table}, like pandas' `read_csv`: the first record names
 * the columns; columns whose non-empty fields are all numbers become numbers; empty fields are
 * missing (`null`). Dates stay ISO strings, which Express reads as dates. Records shorter than the
 * header are padded with missing values.
 *
 * @example
 * ```ts
 * const table = fromCSV('city,temp\n"Paris, FR",21.5\nOslo,12\n');
 * table.column('temp'); // [21.5, 12]
 * ```
 * @throws {Error} For malformed quoting and for records with more fields than the header.
 */
export function fromCSV(text: string, options: CSVOptions = {}): Table {
  const records = parseCSVRecords(text, options.delimiter ?? ',');
  const header = options.header ?? true;
  const typed = options.typed ?? true;
  const width = records.reduce((w, r) => Math.max(w, r.length), 0);
  const names = header
    ? headerNames(records[0] ?? [])
    : Array.from({ length: width }, (_, i) => String(i));
  const body = header ? records.slice(1) : records;
  body.forEach((r, k) => {
    if (r.length > names.length) {
      throw new Error(
        `fromCSV: record ${k + 1 + (header ? 1 : 0)} has ${r.length} fields; the header has ${names.length}.`,
      );
    }
  });
  const columns = new Map<string, unknown[]>();
  names.forEach((name, c) => {
    const raw = body.map((r) => r[c] ?? '');
    if (!typed) {
      columns.set(name, raw);
      return;
    }
    const numeric = raw.some((s) => s !== '') && raw.every((s) => s === '' || NUMBER.test(s));
    columns.set(
      name,
      raw.map((s) => (s === '' ? null : numeric ? toNumber(s) : s)),
    );
  });
  return new Table(columns);
}
