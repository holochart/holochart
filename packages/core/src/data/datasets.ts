/**
 * Column references into figure-level datasets (plan E1.6).
 *
 * A trace may name a dataset and point data attributes at its columns:
 *
 * ```ts
 * { datasets: { sales: { date: [...], revenue: Float64Array.of(...) } },
 *   data: [{ type: 'bar', dataset: 'sales', x: '@date', y: '@revenue', marker: { color: '@region' } }] }
 * ```
 *
 * {@link resolveDataRefs} swaps each `'@column'` for the column itself, by reference, before
 * validation and coercion see the trace. Only attributes that take per-point arrays
 * (`data_array`, or `arrayOk`) are resolved; elsewhere `'@…'` is ordinary text. On those
 * attributes a literal string starting with `@` is written `'@@…'`.
 */
import { isArrayLike } from '../coerce/coerce.ts';
import type { FigureInput } from '../defaults/types.ts';
import { isAttr, isItemsNode, isObjectNode, resolveChild } from '../schema/walk.ts';
import type { AttrSpec, ObjectNode } from '../schema/types.ts';
import { isPlainObject } from '../util/objects.ts';
import type { Issue } from '../validate/issues.ts';
import { suggest } from '../validate/suggest.ts';

/** Result of {@link resolveDataRefs}. */
export interface ResolvedTrace {
  /** The input trace when nothing needed resolving; otherwise a structurally shared copy. */
  readonly trace: Readonly<Record<string, unknown>>;
  /** Problems found; each unresolved reference is reported exactly once here. */
  readonly issues: Issue[];
}

/** True if `v` is a column reference (`'@name'`), not an escaped literal (`'@@name'`). */
export function isColumnRef(v: unknown): v is `@${string}` {
  return typeof v === 'string' && v.charCodeAt(0) === 64 && v.charCodeAt(1) !== 64;
}

function takesArrays(spec: AttrSpec): boolean {
  return spec.valType === 'data_array' || spec.arrayOk === true;
}

function childPath(base: string, key: string | number): string {
  return typeof key === 'number' ? `${base}[${key}]` : base === '' ? key : `${base}.${key}`;
}

function quoteList(names: readonly string[], max = 8): string {
  const shown = names.slice(0, max).map((n) => `'${n}'`);
  if (names.length > max) shown.push(`… (${names.length - max} more)`);
  return shown.join(', ');
}

/** Lookup state shared across one trace walk. */
interface Ctx {
  /** Resolved columns, or `undefined` when the trace has no usable dataset. */
  readonly columns: Readonly<Record<string, unknown>> | undefined;
  readonly datasetName: string | undefined;
  /**
   * Why references cannot resolve when `columns` is undefined: `'none'` (no `dataset` on the
   * trace — reported per reference) or `'reported'` (a bad dataset, already reported once or left
   * to schema validation, so references are dropped quietly).
   */
  readonly missing: 'none' | 'reported';
  readonly issues: Issue[];
}

/**
 * The replacement for a string on an array-taking attribute: the column, the unescaped literal,
 * or `undefined` to drop the attribute (so it falls back to its default). Returns `v` itself when
 * nothing changes.
 */
function resolveString(v: string, path: string, ctx: Ctx): unknown {
  if (v.charCodeAt(0) !== 64) return v;
  if (v.charCodeAt(1) === 64) return v.slice(1);
  const name = v.slice(1);
  const { columns, datasetName } = ctx;
  if (columns === undefined || datasetName === undefined) {
    if (ctx.missing === 'none') {
      ctx.issues.push({
        path,
        message: `column reference '${v}' needs a \`dataset\` on the trace (write '@${v}' for a literal string)`,
        value: v,
        expected: 'a data array, or a column reference together with `dataset`',
        code: 'invalid-value',
        severity: 'error',
      });
    }
    return undefined;
  }
  if (!Object.hasOwn(columns, name)) {
    const names = Object.keys(columns);
    const suggestion = suggest(name, names);
    ctx.issues.push({
      path,
      message: `dataset '${datasetName}' has no column '${name}'${suggestion !== undefined ? `; did you mean '@${suggestion}'?` : ''}`,
      value: v,
      expected:
        names.length > 0
          ? `one of ${quoteList(names.map((n) => `@${n}`))}`
          : 'a column (the dataset is empty)',
      code: 'invalid-value',
      severity: 'error',
      ...(suggestion !== undefined ? { suggestion: `@${suggestion}` } : {}),
    });
    return undefined;
  }
  const column = columns[name];
  if (!isArrayLike(column)) {
    ctx.issues.push({
      path,
      message: `column '${name}' of dataset '${datasetName}' is not an array`,
      value: v,
      expected: 'an Array or typed array column',
      code: 'invalid-value',
      severity: 'error',
    });
    return undefined;
  }
  return column;
}

const DROP = Symbol('drop');

function resolveObject(
  obj: Readonly<Record<string, unknown>>,
  node: ObjectNode,
  path: string,
  ctx: Ctx,
): Readonly<Record<string, unknown>> {
  let out: Record<string, unknown> | undefined;
  // Walk the keys the user wrote rather than the whole schema: a trace sets a handful of
  // attributes, its schema declares hundreds.
  for (const key of Object.keys(obj)) {
    const child = resolveChild(node, key);
    if (child === undefined) continue;
    const v = obj[key];
    let next: unknown = v;
    if (isAttr(child)) {
      if (typeof v !== 'string' || !takesArrays(child)) continue;
      const r = resolveString(v, childPath(path, key), ctx);
      next = r === undefined ? DROP : r;
    } else if (isObjectNode(child)) {
      if (!isPlainObject(v)) continue;
      next = resolveObject(v, child, childPath(path, key), ctx);
    } else if (isItemsNode(child)) {
      if (!Array.isArray(v)) continue;
      next = resolveItems(v, child.item, childPath(path, key), ctx);
    }
    if (next === v) continue;
    out ??= { ...obj };
    if (next === DROP) delete out[key];
    else out[key] = next;
  }
  return out ?? obj;
}

function resolveItems(
  list: readonly unknown[],
  item: ObjectNode,
  path: string,
  ctx: Ctx,
): readonly unknown[] {
  let out: unknown[] | undefined;
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if (!isPlainObject(v)) continue;
    const next = resolveObject(v, item, childPath(path, i), ctx);
    if (next === v) continue;
    out ??= [...list];
    out[i] = next;
  }
  return out ?? list;
}

/**
 * Replace `'@column'` references in a trace with columns of the dataset it names.
 *
 * Resolution applies to attributes that accept per-point arrays (`data_array` or `arrayOk`),
 * including nested containers (`marker.color: '@region'`) and item arrays. Columns are inserted
 * by reference (zero-copy). `'@@text'` on those attributes is unescaped to the literal `'@text'`.
 * `'@…'` strings elsewhere, and on attributes unknown to the schema, are left untouched.
 *
 * The input is never mutated. When nothing needs resolving, the same trace object is returned, so
 * callers can compare by reference; otherwise only the containers on the way to a change are
 * copied.
 *
 * A reference that cannot be resolved (no `dataset` on the trace, unknown column, non-array
 * column) produces one `invalid-value` error and is removed from the returned trace, so the
 * attribute falls back to its default and validation does not report it a second time. An unknown
 * dataset name is reported once, at `<path>.dataset`, with a "did you mean" suggestion. A
 * `dataset` that is not a non-blank string is left to schema validation, which already rejects it.
 *
 * Call this before validating or coercing the trace.
 *
 * @param trace - The user's trace object.
 * @param schema - The trace type's full schema (`registry.getTraceSchema(type)`).
 * @param datasets - `figure.datasets`.
 * @param path - Path prefix for issues, e.g. `data[0]`.
 *
 * @example
 * ```ts
 * const { trace } = resolveDataRefs(
 *   { type: 'scatter', dataset: 'sales', x: '@date', y: '@revenue' },
 *   registry.getTraceSchema('scatter')!,
 *   { sales: { date, revenue } },
 *   'data[0]',
 * );
 * trace.x === date; // true
 * ```
 */
export function resolveDataRefs(
  trace: Readonly<Record<string, unknown>>,
  schema: ObjectNode,
  datasets: FigureInput['datasets'],
  path: string,
): ResolvedTrace {
  const issues: Issue[] = [];
  const name: unknown = trace['dataset'];
  let columns: Readonly<Record<string, unknown>> | undefined;
  let missing: Ctx['missing'] = 'none';

  if (name !== undefined && name !== null) {
    missing = 'reported';
    if (typeof name === 'string' && name.trim() !== '') {
      // `datasets` comes from untyped user input: check its shape rather than trust the type.
      const all: unknown = datasets;
      const table = isPlainObject(all) && Object.hasOwn(all, name) ? all[name] : undefined;
      if (isPlainObject(table)) {
        columns = table;
      } else if (table !== undefined) {
        issues.push({
          path: `datasets.${name}`,
          message: `dataset '${name}' must be an object of columns`,
          value: table,
          expected: 'an object such as { date: [...], revenue: Float64Array }',
          code: 'invalid-container',
          severity: 'error',
        });
      } else {
        const names = isPlainObject(all) ? Object.keys(all) : [];
        const suggestion = suggest(name, names);
        issues.push({
          path: childPath(path, 'dataset'),
          message: `unknown dataset '${name}'${suggestion !== undefined ? `; did you mean '${suggestion}'?` : ''}`,
          value: name,
          expected:
            names.length > 0
              ? `one of ${quoteList(names)}`
              : 'a key of `figure.datasets` (none are defined)',
          code: 'invalid-value',
          severity: 'error',
          ...(suggestion !== undefined ? { suggestion } : {}),
        });
      }
    }
  }

  const ctx: Ctx = {
    columns,
    datasetName: typeof name === 'string' ? name : undefined,
    missing,
    issues,
  };
  return { trace: resolveObject(trace, schema, path, ctx), issues };
}
