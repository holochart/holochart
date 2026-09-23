/**
 * Templates (plan E1.5, customization cascade layer 2 in plan §8).
 *
 * A template is `{ layout, data }`: `layout` supplies layout defaults and `data` supplies
 * per-trace-type defaults that cycle across traces of that type (the k-th scatter trace uses
 * `data.scatter[k % n]`), as in Plotly. Named templates live in a registry and can be composed
 * with `+`: `'dark+presentation'` applies `presentation` over `dark`.
 */
import { deepMerge, isPlainObject } from '../util/objects.ts';

/** A figure template. */
export interface Template {
  /** Layout defaults. Array containers use named items plus `<itemName>defaults` (e.g. `annotationdefaults`). */
  layout?: Record<string, unknown>;
  /** Per-trace-type defaults, cycled across traces of that type. */
  data?: Record<string, readonly Record<string, unknown>[]>;
}

/** Where named templates are looked up (implemented by the registry). */
export interface TemplateSource {
  getTemplate(name: string): Template | undefined;
  /** Name of the template used when `layout.template` is unset, if any. */
  readonly defaultTemplate: string | undefined;
}

function mergeTraceLists(
  a: readonly Record<string, unknown>[],
  b: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  if (a.length === 0) return [...b];
  if (b.length === 0) return [...a];
  // Merge element-wise while preserving both cycles: item i combines a[i % |a|] and b[i % |b|].
  const n = Math.max(a.length, b.length);
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    out.push(deepMerge(a[i % a.length], b[i % b.length]) as Record<string, unknown>);
  }
  return out;
}

/**
 * Compose templates left to right; later templates win. Layout is deep-merged (arrays replaced);
 * per-type trace lists are merged element-wise so both templates' cycles survive.
 */
export function composeTemplates(...templates: readonly Template[]): Template {
  let layout: Record<string, unknown> | undefined;
  let data: Record<string, readonly Record<string, unknown>[]> | undefined;
  for (const t of templates) {
    if (isPlainObject(t.layout)) {
      layout = (layout ? deepMerge(layout, t.layout) : { ...t.layout }) as Record<string, unknown>;
    }
    if (isPlainObject(t.data)) {
      data = { ...data };
      for (const [type, list] of Object.entries(t.data)) {
        if (!Array.isArray(list)) continue;
        data[type] = mergeTraceLists(data[type] ?? [], list.filter(isPlainObject));
      }
    }
  }
  const out: Template = {};
  if (layout) out.layout = layout;
  if (data) out.data = data;
  return out;
}

/** Result of resolving `layout.template`. */
export interface ResolvedTemplate {
  /** The template to apply, or `null` for none. */
  template: Template | null;
  /** Names in a string spec that are not registered. */
  missing: string[];
}

/**
 * Resolve a `layout.template` value: a template object, a registered name, a `+`-composition of
 * names, `null`/`false` for no template, or `undefined` for the registry's default template.
 */
export function resolveTemplate(spec: unknown, source: TemplateSource): ResolvedTemplate {
  if (spec === undefined) {
    const name = source.defaultTemplate;
    return {
      template: name === undefined ? null : (source.getTemplate(name) ?? null),
      missing: [],
    };
  }
  if (isPlainObject(spec)) return { template: spec as Template, missing: [] };
  if (typeof spec !== 'string') return { template: null, missing: [] };

  const found: Template[] = [];
  const missing: string[] = [];
  for (const raw of spec.split('+')) {
    const name = raw.trim();
    if (name === '') continue;
    const t = source.getTemplate(name);
    if (t) found.push(t);
    else missing.push(name);
  }
  const template = found.length > 1 ? composeTemplates(...found) : (found[0] ?? null);
  return { template, missing };
}

/**
 * The template trace for the `typeIndex`-th trace of `type`, cycling through the list.
 */
export function templateTraceFor(
  template: Template | null,
  type: string,
  typeIndex: number,
): Record<string, unknown> | undefined {
  const list = template?.data?.[type];
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const item: unknown = list[typeIndex % list.length];
  return isPlainObject(item) ? item : undefined;
}
