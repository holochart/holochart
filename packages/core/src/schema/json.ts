/**
 * Serialize schemas to plain JSON (`plot-schema.json`, plan E1.1): the machine-readable reference
 * used by docs, the playground's editor completions and compat tooling.
 */
import { configSchema } from '../config/schema.ts';
import type { Registry } from '../registry/types.ts';
import { EDIT_FLAGS, VAL_TYPES } from './types.ts';
import type { EditType, SchemaNode } from './types.ts';

/** JSON form of any schema node. */
export type JSONSchemaNode = { [key: string]: unknown };

/** The whole-library schema document. */
export interface PlotSchema {
  traces: Record<
    string,
    { categories: string[]; meta: Record<string, unknown>; attributes: JSONSchemaNode }
  >;
  layout: { attributes: JSONSchemaNode };
  config: { attributes: JSONSchemaNode };
  defs: { valTypes: string[]; editTypes: string[] };
}

function editTypeString(et: EditType): string {
  return typeof et === 'string' ? et : et.join('+');
}

function isNodeList(v: SchemaNode | readonly SchemaNode[]): v is readonly SchemaNode[] {
  return Array.isArray(v);
}

/** JSON-safe copy of a value: functions and phantom fields are dropped, typed arrays become arrays. */
function jsonValue(v: unknown): unknown {
  if (typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') return undefined;
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
    return Array.from(v as unknown as ArrayLike<unknown>);
  }
  if (Array.isArray(v)) return v.map(jsonValue);
  if (typeof v === 'object' && v !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      const j = jsonValue(val);
      if (j !== undefined) out[k] = j;
    }
    return out;
  }
  return v;
}

/**
 * Convert a schema node to JSON. Leaves keep their `valType` and constraints; containers become
 * `{ role: 'object', ...meta, <children> }` and item arrays `{ role: 'items', itemName, items }`,
 * mirroring Plotly's plot-schema layout so existing tooling can read it.
 */
export function schemaToJSON(node: SchemaNode): JSONSchemaNode {
  const out: JSONSchemaNode = {};
  const meta = node as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(meta)) {
    if (k === 'kind' || k === 'children' || k === 'item' || k.startsWith('~')) continue;
    if (k === 'editType') out[k] = editTypeString(v as EditType);
    else if (k === 'items' && node.kind === 'attr') {
      const items = v as SchemaNode | readonly SchemaNode[];
      out[k] = isNodeList(items) ? items.map(schemaToJSON) : schemaToJSON(items);
    } else {
      const j = jsonValue(v);
      if (j !== undefined) out[k] = j;
    }
  }
  if (node.kind === 'object') {
    out['role'] = 'object';
    for (const [k, child] of Object.entries(node.children)) out[k] = schemaToJSON(child);
  } else if (node.kind === 'items') {
    out['role'] = 'items';
    out['items'] = schemaToJSON(node.item);
  }
  return out;
}

/** Build the whole-library schema document from a registry (plan E1.1 `plot-schema.json`). */
export function plotSchema(registry: Registry): PlotSchema {
  const traces: PlotSchema['traces'] = {};
  for (const type of registry.traceTypes()) {
    const mod = registry.getModule(type);
    const schema = registry.getTraceSchema(type);
    if (!mod || !schema) continue;
    traces[type] = {
      categories: [...mod.categories],
      meta: jsonValue(mod.meta) as Record<string, unknown>,
      attributes: schemaToJSON(schema),
    };
  }
  return {
    traces,
    layout: { attributes: schemaToJSON(registry.getLayoutSchema()) },
    config: { attributes: schemaToJSON(configSchema) },
    defs: { valTypes: [...VAL_TYPES], editTypes: [...EDIT_FLAGS] },
  };
}
