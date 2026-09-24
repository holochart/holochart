/** Registry implementation (plan §4.4, E22). */
import { layoutSchema } from '../layout/schema.ts';
import { attr } from '../schema/attr.ts';
import type { Children, ObjectNode } from '../schema/types.ts';
import type { Template } from '../templates/templates.ts';
import { formatIssue, type Issue } from '../validate/issues.ts';
import {
  cartesianTraceAttributes,
  commonTraceAttributes,
  domainTraceAttributes,
} from './trace-attributes.ts';
import type { ComponentModule, Registry, TraceModule } from './types.ts';

/**
 * Create an empty registry. Trace packages register their modules into it; the full bundle
 * creates one shared registry.
 *
 * @example
 * ```ts
 * const registry = createRegistry().register(scatter, bar).registerTemplate('dark', dark);
 * const { fullData, fullLayout } = supplyDefaults(figure, registry);
 * ```
 */
export function createRegistry(): Registry {
  const modules = new Map<string, TraceModule>();
  const components = new Map<string, ComponentModule>();
  const templates = new Map<string, Template>();
  const traceSchemas = new Map<string, ObjectNode>();
  const warned = new Set<string>();
  let layout: ObjectNode | undefined;
  let defaultTemplate: string | undefined;

  const invalidate = (): void => {
    traceSchemas.clear();
    layout = undefined;
  };

  const registry: Registry = {
    register(...mods) {
      for (const m of mods) modules.set(m.type, m);
      invalidate();
      return registry;
    },

    registerComponent(...comps) {
      for (const c of comps) components.set(c.name, c);
      invalidate();
      return registry;
    },

    getModule: (type) => modules.get(type),
    traceTypes: () => [...modules.keys()],
    components: () => [...components.values()],

    getTraceSchema(type) {
      const cached = traceSchemas.get(type);
      if (cached) return cached;
      const mod = modules.get(type);
      if (!mod) return undefined;
      const children: Children = {
        ...commonTraceAttributes,
        ...(mod.categories.includes('cartesian') ? cartesianTraceAttributes : {}),
        ...(mod.categories.includes('domain') ? domainTraceAttributes : {}),
        ...mod.schema.children,
      };
      const node: ObjectNode = {
        ...mod.schema,
        description: mod.schema.description ?? mod.meta.description,
        children,
      };
      traceSchemas.set(type, node);
      return node;
    },

    getLayoutSchema() {
      if (layout) return layout;
      let children: Children = { ...layoutSchema.children };
      for (const m of modules.values())
        if (m.layoutSchema) children = { ...children, ...m.layoutSchema };
      for (const c of components.values())
        if (c.layoutSchema) children = { ...children, ...c.layoutSchema };
      layout = attr.object(children, {
        editType: layoutSchema.editType,
        description: layoutSchema.description,
      });
      return layout;
    },

    registerTemplate(name, template) {
      templates.set(name, template);
      return registry;
    },
    getTemplate: (name) => templates.get(name),
    templateNames: () => [...templates.keys()],

    setDefaultTemplate(name) {
      defaultTemplate = name;
      return registry;
    },
    get defaultTemplate() {
      return defaultTemplate;
    },

    warnOnce(issue: Issue) {
      const key = `${issue.code}:${issue.path}`;
      if (warned.has(key)) return;
      warned.add(key);
      console.warn(formatIssue(issue));
    },
  };
  return registry;
}
