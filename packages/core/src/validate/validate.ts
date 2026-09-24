/**
 * Figure validation (plan E1.3): walk user input against the schema and report every unknown
 * attribute, invalid value, deprecated attribute, unknown trace type and unknown template.
 *
 * Validation never throws and never mutates input, whatever it is given (property-tested). It
 * does not look inside data arrays or per-point arrays: those can hold millions of values and bad
 * points are handled (skipped) by the calc stage.
 */
import { configSchema } from '../config/schema.ts';
import { coerceValue, describeExpected } from '../coerce/coerce.ts';
import { resolveDataRefs } from '../data/datasets.ts';
import type { FigureInput } from '../defaults/types.ts';
import type { Registry } from '../registry/types.ts';
import { resolveChild } from '../schema/walk.ts';
import type { AttrSpec, ObjectNode, SchemaNode } from '../schema/types.ts';
import { isPlainObject } from '../util/objects.ts';
import type { Issue } from './issues.ts';
import { suggest } from './suggest.ts';

/** Options for {@link validate}. */
export interface ValidateOptions {
  /** The figure's `config`, validated against the config schema. */
  config?: unknown;
  /** The figure's `datasets`, used to resolve `'@column'` references (plan E1.6). */
  datasets?: FigureInput['datasets'];
}

function preview(v: unknown): string {
  if (typeof v === 'string') return `'${v.length > 40 ? `${v.slice(0, 40)}…` : v}'`;
  if (typeof v === 'function') return 'a function';
  if (Array.isArray(v)) return `an array of length ${v.length}`;
  if (typeof v === 'object' && v !== null) return 'an object';
  return String(v);
}

function childPath(base: string, key: string | number): string {
  return typeof key === 'number' ? `${base}[${key}]` : base === '' ? key : `${base}.${key}`;
}

function checkAttr(spec: AttrSpec, value: unknown, path: string, issues: Issue[]): void {
  if (value === undefined || value === null) return;
  if (spec.deprecated !== undefined) {
    issues.push({
      path,
      message: `is deprecated: ${spec.deprecated}`,
      value,
      code: 'deprecated',
      severity: 'warning',
    });
  }
  const r = coerceValue(spec, value);
  const expected = describeExpected(spec);
  if (!r.ok) {
    const fallback = spec.dflt === undefined ? 'ignored' : 'using the default';
    issues.push({
      path,
      message: `invalid value ${preview(value)}; expected ${expected} (${fallback})`,
      value,
      expected,
      code: 'invalid-value',
      severity: 'error',
    });
  } else if (r.note !== undefined) {
    issues.push({
      path,
      message: r.note,
      value,
      expected,
      code: 'out-of-range',
      severity: 'warning',
    });
  }
}

function checkNode(node: SchemaNode, value: unknown, path: string, issues: Issue[]): void {
  if (node.kind === 'attr') {
    checkAttr(node, value, path, issues);
    return;
  }
  if (value === undefined || value === null) return;
  if (node.kind === 'items') {
    if (!Array.isArray(value)) {
      issues.push({
        path,
        message: `expected an array of ${node.itemName} objects, got ${preview(value)}`,
        value,
        expected: `an array of ${node.itemName} objects`,
        code: 'invalid-container',
        severity: 'error',
      });
      return;
    }
    value.forEach((item, i) => checkNode(node.item, item, childPath(path, i), issues));
    return;
  }
  if (!isPlainObject(value)) {
    issues.push({
      path,
      message: `expected an object, got ${preview(value)}`,
      value,
      expected: 'an object',
      code: 'invalid-container',
      severity: 'error',
    });
    return;
  }
  checkObject(node, value, path, issues);
}

function checkObject(
  node: ObjectNode,
  value: Record<string, unknown>,
  path: string,
  issues: Issue[],
): void {
  for (const [key, v] of Object.entries(value)) {
    // Underscore keys are internal (e.g. `_index` when full output is fed back in).
    if (key.startsWith('_')) continue;
    const child = resolveChild(node, key);
    const p = childPath(path, key);
    if (child === undefined) {
      const suggestion = suggest(key, Object.keys(node.children));
      issues.push({
        path: p,
        message: `unknown attribute '${key}'${suggestion !== undefined ? `; did you mean '${suggestion}'?` : ''}`,
        value: v,
        code: 'unknown-attribute',
        severity: 'warning',
        ...(suggestion !== undefined ? { suggestion } : {}),
      });
      continue;
    }
    checkNode(child, v, p, issues);
  }
}

/** The item schema a template's `<itemName>defaults` key applies to, if `key` is one. */
function itemDefaultsNode(layout: ObjectNode, key: string): ObjectNode | undefined {
  const itemName = key.slice(0, -'defaults'.length);
  for (const child of Object.values(layout.children)) {
    if (child.kind === 'items' && child.itemName === itemName) return child.item;
  }
  return undefined;
}

function checkTemplate(template: unknown, registry: Registry, issues: Issue[]): void {
  const path = 'layout.template';
  if (template === undefined || template === null || template === false) return;
  if (typeof template === 'string') {
    for (const raw of template.split('+')) {
      const name = raw.trim();
      if (name === '' || registry.getTemplate(name)) continue;
      const suggestion = suggest(name, registry.templateNames());
      issues.push({
        path,
        message: `unknown template '${name}'${suggestion !== undefined ? `; did you mean '${suggestion}'?` : ''}`,
        value: template,
        expected: `a registered template name (${registry.templateNames().join(', ') || 'none registered'})`,
        code: 'unknown-template',
        severity: 'warning',
        ...(suggestion !== undefined ? { suggestion } : {}),
      });
    }
    return;
  }
  if (!isPlainObject(template)) {
    issues.push({
      path,
      message: `expected a template name or { layout, data } object, got ${preview(template)}`,
      value: template,
      code: 'invalid-container',
      severity: 'error',
    });
    return;
  }
  // Template contents are validated against the same schemas, so typos in themes surface too.
  const layout = template['layout'];
  if (isPlainObject(layout)) {
    // `<itemName>defaults` (e.g. `annotationdefaults`) exists only in templates: it is checked
    // against the item schema of its array container instead of being an unknown attribute.
    const schema = registry.getLayoutSchema();
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(layout)) {
      const item = key.endsWith('defaults') ? itemDefaultsNode(schema, key) : undefined;
      if (item) checkNode(item, value, `${path}.layout.${key}`, issues);
      // Defined, not assigned: `rest['__proto__'] = v` would replace rest's prototype instead of
      // copying an own `__proto__` key (which is then reported as unknown, like anywhere else).
      else
        Object.defineProperty(rest, key, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
    }
    checkNode(schema, rest, `${path}.layout`, issues);
  } else if (layout !== undefined) {
    checkNode(registry.getLayoutSchema(), layout, `${path}.layout`, issues);
  }
  const data = template['data'];
  if (isPlainObject(data)) {
    for (const [type, list] of Object.entries(data)) {
      const schema = registry.getTraceSchema(type);
      const p = `${path}.data.${type}`;
      if (!schema) {
        issues.push(unknownType(type, p, registry));
        continue;
      }
      if (!Array.isArray(list)) {
        issues.push({
          path: p,
          message: `expected an array of ${type} trace defaults`,
          value: list,
          code: 'invalid-container',
          severity: 'error',
        });
        continue;
      }
      list.forEach((t, i) => checkNode(schema, t, childPath(p, i), issues));
    }
  }
}

function unknownType(type: string, path: string, registry: Registry): Issue {
  const suggestion = suggest(type, registry.traceTypes());
  return {
    path,
    message: `unknown trace type '${type}'${suggestion !== undefined ? `; did you mean '${suggestion}'?` : ''} (the trace is hidden)`,
    value: type,
    expected: `one of ${
      registry
        .traceTypes()
        .map((t) => `'${t}'`)
        .join(', ') || '(no trace types registered)'
    }`,
    code: 'unknown-trace-type',
    severity: 'error',
    ...(suggestion !== undefined ? { suggestion } : {}),
  };
}

/**
 * Validate a figure and return every issue found (empty when valid).
 *
 * @param data - The `data` array (anything; non-arrays are reported).
 * @param layout - The `layout` object.
 * @param registry - Supplies trace schemas, the merged layout schema and template names.
 * @param options - Optional `config` (validated against the config schema) and `datasets`
 * (so `'@column'` references are resolved before checking, plan E1.6).
 *
 * @example
 * ```ts
 * validate([{ type: 'scatter', mode: 'line' }], {}, registry);
 * // [{ path: 'data[0].mode', message: "invalid value 'line'; expected any combination of …" }]
 * ```
 */
export function validate(
  data: unknown,
  layout: unknown,
  registry: Registry,
  options: ValidateOptions = {},
): Issue[] {
  const { config, datasets } = options;
  const issues: Issue[] = [];

  if (data !== undefined && data !== null && !Array.isArray(data)) {
    issues.push({
      path: 'data',
      message: `expected an array of traces, got ${preview(data)}`,
      value: data,
      code: 'invalid-container',
      severity: 'error',
    });
  } else if (Array.isArray(data)) {
    data.forEach((trace: unknown, i) => {
      const path = `data[${i}]`;
      if (!isPlainObject(trace)) {
        issues.push({
          path,
          message: `expected a trace object, got ${preview(trace)}`,
          value: trace,
          code: 'invalid-container',
          severity: 'error',
        });
        return;
      }
      const rawType = trace['type'];
      const type = typeof rawType === 'string' ? rawType : 'scatter';
      if (rawType !== undefined && typeof rawType !== 'string') {
        issues.push({
          path: `${path}.type`,
          message: `expected a trace type name, got ${preview(rawType)}`,
          value: rawType,
          code: 'invalid-value',
          severity: 'error',
        });
      }
      const schema = registry.getTraceSchema(type);
      if (!schema) {
        issues.push(unknownType(type, `${path}.type`, registry));
        return;
      }
      const resolved = resolveDataRefs(trace, schema, datasets, path);
      issues.push(...resolved.issues);
      checkObject(schema, resolved.trace, path, issues);
    });
  }

  if (layout !== undefined && layout !== null) {
    if (!isPlainObject(layout)) {
      issues.push({
        path: 'layout',
        message: `expected an object, got ${preview(layout)}`,
        value: layout,
        code: 'invalid-container',
        severity: 'error',
      });
    } else {
      const { template, ...rest } = layout;
      checkObject(registry.getLayoutSchema(), rest, 'layout', issues);
      checkTemplate(template, registry, issues);
    }
  }

  if (config !== undefined && config !== null) checkNode(configSchema, config, 'config', issues);
  return issues;
}
