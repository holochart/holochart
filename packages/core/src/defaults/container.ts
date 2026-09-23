/**
 * Schema-driven container coercion: fills an output object from user input, a template
 * container and schema defaults, recursing into nested objects and item arrays.
 *
 * Precedence for every attribute (plan §8, layers 1–4):
 * valid user value > valid template value > caller override (`overrides`) > schema `dflt`.
 */
import { canonicalDefault, coerceValue } from '../coerce/coerce.ts';
import { getIn, setIn } from '../path/path.ts';
import { getNodeAtPath } from '../schema/walk.ts';
import type { AttrSpec, ItemsNode, ObjectNode } from '../schema/types.ts';
import { deepMerge, isPlainObject } from '../util/objects.ts';

/**
 * Resolve one attribute value with template support. `null`/`undefined` mean unset at every
 * level; invalid values fall through to the next source.
 */
export function resolveWithTemplate(
  spec: AttrSpec,
  input: unknown,
  template: unknown,
  dflt: unknown,
): unknown {
  if (input !== undefined && input !== null) {
    const r = coerceValue(spec, input);
    if (r.ok) return r.value;
  }
  if (template !== undefined && template !== null) {
    const r = coerceValue(spec, template);
    if (r.ok) return r.value;
  }
  return canonicalDefault(spec, dflt);
}

/** Options for {@link coerceContainer}. */
export interface CoerceContainerOptions {
  /** The template container at the same level (e.g. `template.layout.margin`). */
  template?: unknown;
  /** Replacement defaults keyed by path relative to the container (e.g. `'title.font.size'`). */
  overrides?: Readonly<Record<string, unknown>>;
  /** Top-level keys to leave alone (coerced elsewhere). */
  skip?: ReadonlySet<string>;
  /** If set, only these top-level keys are coerced. */
  only?: ReadonlySet<string>;
}

function asObject(v: unknown): Record<string, unknown> | undefined {
  return isPlainObject(v) ? v : undefined;
}

function coerceInto(
  node: ObjectNode,
  input: Record<string, unknown> | undefined,
  output: Record<string, unknown>,
  template: Record<string, unknown> | undefined,
  overrides: Readonly<Record<string, unknown>> | undefined,
  prefix: string,
  opts: CoerceContainerOptions,
): void {
  for (const [key, child] of Object.entries(node.children)) {
    if (prefix === '' && (opts.skip?.has(key) === true || (opts.only && !opts.only.has(key)))) {
      continue;
    }
    const rel = prefix === '' ? key : `${prefix}.${key}`;
    if (child.kind === 'attr') {
      const dflt = overrides && Object.hasOwn(overrides, rel) ? overrides[rel] : child.dflt;
      const value = resolveWithTemplate(child, input?.[key], template?.[key], dflt);
      if (value !== undefined) output[key] = value;
      else delete output[key];
    } else if (child.kind === 'object') {
      // Subplot families (xaxis, xaxis2, …) depend on discovered subplots; handled by the caller.
      if (child.subplot !== undefined) continue;
      const out = asObject(output[key]) ?? {};
      output[key] = out;
      coerceInto(
        child,
        asObject(input?.[key]),
        out,
        asObject(template?.[key]),
        overrides,
        rel,
        opts,
      );
    } else {
      output[key] = coerceItems(
        child,
        input?.[key],
        template?.[key],
        template?.[`${child.itemName}defaults`],
      );
    }
  }
}

/**
 * Coerce every attribute of `node` from `input` into `output` (mutated and returned).
 * Containers are always created; attributes without a value or default are left absent.
 */
export function coerceContainer(
  node: ObjectNode,
  input: unknown,
  output: Record<string, unknown> = {},
  opts: CoerceContainerOptions = {},
): Record<string, unknown> {
  coerceInto(node, asObject(input), output, asObject(opts.template), opts.overrides, '', opts);
  return output;
}

/**
 * Coerce an item array (plan E1.5 `templateitemname`), following Plotly's array templating:
 *
 * - `<itemName>defaults` in the template applies to every item.
 * - A user item with `templateitemname: 'n'` merges over the template item named `n`. If there is
 *   no such template item, the user item is kept but hidden (`visible: false`).
 * - Named template items no user item references are appended, so template-level decorations
 *   (watermarks, reference lines) appear on every figure. They get `_index: -1`.
 * - Unnamed template items are ignored: there would be no way to override or remove them.
 */
export function coerceItems(
  node: ItemsNode,
  input: unknown,
  templateItems: unknown,
  templateDefaults: unknown,
): Record<string, unknown>[] {
  const tItems = Array.isArray(templateItems) ? templateItems.filter(isPlainObject) : [];
  const named = new Map<string, Record<string, unknown>>();
  for (const t of tItems) {
    const name = t['name'];
    if (typeof name === 'string' && name !== '' && !named.has(name)) named.set(name, t);
  }
  const itemDefaults = asObject(templateDefaults);
  const used = new Set<string>();
  const out: Record<string, unknown>[] = [];

  const userItems = Array.isArray(input) ? (input as unknown[]) : [];
  userItems.forEach((raw, i) => {
    const item = asObject(raw) ?? {};
    const ref = item['templateitemname'];
    let tmpl = itemDefaults;
    if (typeof ref === 'string' && ref !== '') {
      const match = named.get(ref);
      if (!match) {
        // Plotly semantics: a dangling reference hides the item instead of guessing.
        out.push({ visible: false, templateitemname: ref, _index: i });
        return;
      }
      used.add(ref);
      tmpl = itemTemplate(itemDefaults, match);
    }
    const full = coerceContainer(node.item, item, {}, { template: tmpl });
    full['_index'] = i;
    out.push(full);
  });

  for (const [name, t] of named) {
    if (used.has(name)) continue;
    const tmpl = itemTemplate(itemDefaults, t);
    const full = coerceContainer(node.item, { templateitemname: name }, {}, { template: tmpl });
    full['_index'] = -1;
    out.push(full);
  }
  return out;
}

function itemTemplate(
  defaults: Record<string, unknown> | undefined,
  named: Record<string, unknown>,
): Record<string, unknown> {
  // Spread: deepMerge may return `named` itself, which belongs to the (shared) template.
  const merged = { ...(deepMerge(defaults, named) as Record<string, unknown>) };
  // A template item's `name` identifies it in the template; items link to it through
  // `templateitemname`, so the name itself is not inherited.
  delete merged['name'];
  return merged;
}

/** Coerce the attribute at `path` of `schema` (the trace/layout `coerce` helper). */
export function coerceAtPath(
  schema: ObjectNode,
  input: unknown,
  output: Record<string, unknown>,
  template: unknown,
  path: string,
  dflt?: unknown,
): unknown {
  const spec = getNodeAtPath(schema, path);
  if (spec?.kind !== 'attr') {
    throw new Error(`coerce('${path}'): not an attribute of this schema`);
  }
  const value = resolveWithTemplate(
    spec,
    getIn(input, path),
    getIn(template, path),
    dflt === undefined ? spec.dflt : dflt,
  );
  if (value !== undefined) setIn(output, path, value);
  return value;
}
