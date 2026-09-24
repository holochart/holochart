/**
 * Attribute schema for the docs quality gates: the same registry and flattening the attribute
 * reference is generated from (tools/schema-gen, plan E19.3), so the gates and the reference pages
 * always count the same attributes.
 */
import { plotSchema, type JSONSchemaNode, type PlotSchema } from '@mk7s/holochart-core';
import { discoverRegistry } from '../../../../tools/schema-gen/src/docs/discover.ts';
import {
  allEntries,
  flattenAttributes,
  type AttributeEntry,
} from '../../../../tools/schema-gen/src/docs/render.ts';

/** One schema namespace: `layout`, `config`, or a trace type. */
export interface Namespace {
  name: string;
  kind: 'trace' | 'layout' | 'config';
  entries: AttributeEntry[];
}

/** Flatten a plot schema into namespaces (layout, config, then traces alphabetically). */
export function namespacesOf(schema: PlotSchema): Namespace[] {
  const flat = (attrs: JSONSchemaNode): AttributeEntry[] => allEntries(flattenAttributes(attrs));
  return [
    { name: 'layout', kind: 'layout' as const, entries: flat(schema.layout.attributes) },
    { name: 'config', kind: 'config' as const, entries: flat(schema.config.attributes) },
    ...Object.keys(schema.traces)
      .sort()
      .map((type) => ({
        name: type,
        kind: 'trace' as const,
        entries: flat((schema.traces[type] as PlotSchema['traces'][string]).attributes),
      })),
  ];
}

/** Discover every workspace trace/component module and build the plot schema. */
export async function loadNamespaces(
  repoRoot: string,
): Promise<{ namespaces: Namespace[]; warnings: string[] }> {
  const { registry, warnings } = await discoverRegistry(repoRoot);
  return { namespaces: namespacesOf(plotSchema(registry)), warnings };
}

/** Result of the attribute-description gate. */
export interface DescriptionReport {
  /** Leaf attributes (`valType`), the gated set. */
  attributes: number;
  described: number;
  /** `<namespace>:<path>` of leaf attributes without a description (gate failures). */
  missing: string[];
  /** Containers (`role: object` / `items`); reported, not gated. */
  containers: number;
  /** `<namespace>:<path>` of containers without a description. */
  containersMissing: string[];
}

function hasDescription(node: JSONSchemaNode): boolean {
  const d = node['description'];
  return typeof d === 'string' && d.trim() !== '';
}

/**
 * Gate 1: every leaf attribute has a non-empty description. Containers (`role: object` and
 * `items`) only group their children, and their reference entry is a heading above the children's
 * descriptions, so missing container descriptions are listed but do not fail the gate.
 */
export function checkDescriptions(namespaces: readonly Namespace[]): DescriptionReport {
  const report: DescriptionReport = {
    attributes: 0,
    described: 0,
    missing: [],
    containers: 0,
    containersMissing: [],
  };
  for (const ns of namespaces) {
    for (const e of ns.entries) {
      const ok = hasDescription(e.node);
      if (e.kind === 'attr') {
        report.attributes++;
        if (ok) report.described++;
        else report.missing.push(`${ns.name}:${e.path}`);
      } else {
        report.containers++;
        if (!ok) report.containersMissing.push(`${ns.name}:${e.path}`);
      }
    }
  }
  return report;
}
