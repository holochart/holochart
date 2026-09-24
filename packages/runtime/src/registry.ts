/**
 * Chart registry (plan E22.2): trace modules, components and templates for a set of charts.
 *
 * Wraps core's pure `Registry` (which drives defaults, validation and update planning) and adds the
 * render-side view of the same modules. Built-ins register through exactly this API, the same one
 * third-party plugins use (E22.1).
 */
import {
  createRegistry,
  DEFAULT_TEMPLATE_NAME,
  holochartTemplate,
  noneTemplate,
  plotlyClassicTemplate,
  type Registry,
} from '@mk7s/holochart-core';
import type { ComponentModule, Registrable, TemplateModule, TraceModule } from './contracts.ts';

/** Summary of what is registered (`registry.list()`). */
export interface RegistryListing {
  readonly traces: readonly {
    readonly type: string;
    readonly categories: readonly string[];
    readonly description: string;
    /** Has render parts (`plot`), i.e. draws something. */
    readonly renders: boolean;
  }[];
  readonly components: readonly { readonly name: string; readonly draws: boolean }[];
  readonly templates: readonly string[];
  readonly defaultTemplate: string | undefined;
}

export interface ChartRegistry {
  /** The core registry: schemas, templates, defaults and edit-type planning. */
  readonly core: Registry;
  /**
   * Register trace modules, components and templates, in any mix. Registering the same object
   * again is a no-op; registering a different module under a taken name replaces it and warns.
   */
  register(...modules: readonly Registrable[]): ChartRegistry;
  getTrace(type: string): TraceModule | undefined;
  getComponent(name: string): ComponentModule | undefined;
  /** Components in draw order (`order`, then registration order). */
  components(): readonly ComponentModule[];
  /**
   * Set the template applied when `layout.template` is unset, by registered name, or `undefined`
   * for none (Plotly's schema defaults). Applies from the next render of each chart (any update,
   * `react` or new chart). Warns when the name is not registered.
   *
   * @example
   * ```ts
   * registry.setDefaultTemplate('plotly-classic'); // Plotly's look for figures without a template
   * ```
   */
  setDefaultTemplate(name: string | undefined): ChartRegistry;
  /** Introspection: everything registered. */
  list(): RegistryListing;
}

export interface ChartRegistryOptions {
  /** Receives duplicate-registration warnings. Default `console.warn`. */
  warn?: (message: string) => void;
}

type Kind = 'trace' | 'component' | 'template';

function kindOf(m: Registrable): Kind {
  const rec = m as unknown as Record<string, unknown>;
  if (rec['kind'] === 'template') return 'template';
  if (typeof rec['type'] === 'string') {
    if (typeof rec['schema'] !== 'object' || typeof rec['supplyDefaults'] !== 'function') {
      throw new TypeError(
        `register(): trace module '${String(rec['type'])}' needs a \`schema\` and \`supplyDefaults\`.`,
      );
    }
    return 'trace';
  }
  if (typeof rec['name'] === 'string') return 'component';
  throw new TypeError(
    'register(): expected a trace module ({ type, schema, … }), a component ({ name, … }) or a template ({ kind: "template", name, template }).',
  );
}

/**
 * Create an isolated registry. Most apps use the shared default {@link registry}; tests and apps
 * that need different module sets side by side create their own and pass it to `createChart`.
 */
export function createChartRegistry(options: ChartRegistryOptions = {}): ChartRegistry {
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const core = createRegistry();
  const traces = new Map<string, TraceModule>();
  const components = new Map<string, ComponentModule>();
  const templates = new Map<string, TemplateModule>();
  let ordered: ComponentModule[] | undefined;

  const replace = <T>(
    map: Map<string, T>,
    what: string,
    name: string,
    module: T,
    same: (a: T, b: T) => boolean = (a, b) => a === b,
  ): boolean => {
    const existing = map.get(name);
    if (existing !== undefined && same(existing, module)) return false;
    if (existing !== undefined) {
      warn(`[holochart] ${what} '${name}' is already registered; the new module replaces it.`);
    }
    map.set(name, module);
    return true;
  };

  const chartRegistry: ChartRegistry = {
    core,
    register(...modules) {
      for (const m of modules) {
        switch (kindOf(m)) {
          case 'trace': {
            const t = m as TraceModule;
            if (replace(traces, 'trace type', t.type, t)) core.register(t);
            break;
          }
          case 'component': {
            const c = m as ComponentModule;
            if (replace(components, 'component', c.name, c)) {
              core.registerComponent(c);
              ordered = undefined;
            }
            break;
          }
          case 'template': {
            const t = m as TemplateModule;
            // Two modules wrapping the same template object are the same registration (the
            // themes package re-exports the built-in templates this registry starts with).
            if (replace(templates, 'template', t.name, t, (a, b) => a.template === b.template))
              core.registerTemplate(t.name, t.template);
            if (t.default === true) core.setDefaultTemplate(t.name);
            break;
          }
        }
      }
      return chartRegistry;
    },
    setDefaultTemplate(name) {
      if (name !== undefined && core.getTemplate(name) === undefined) {
        warn(
          `[holochart] setDefaultTemplate('${name}'): no template '${name}' is registered; figures without \`layout.template\` get Plotly's schema defaults until it is.`,
        );
      }
      core.setDefaultTemplate(name);
      return chartRegistry;
    },
    getTrace: (type) => traces.get(type),
    getComponent: (name) => components.get(name),
    components() {
      // Array.prototype.sort is stable: equal orders keep registration order.
      ordered ??= [...components.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return ordered;
    },
    list() {
      return {
        traces: [...traces.values()].map((t) => ({
          type: t.type,
          categories: [...t.categories],
          description: t.meta.description,
          renders: t.plot !== undefined,
        })),
        components: chartRegistry.components().map((c) => ({
          name: c.name,
          draws: c.draw !== undefined,
        })),
        templates: core.templateNames(),
        defaultTemplate: core.defaultTemplate,
      };
    },
  };
  return chartRegistry;
}

/**
 * The templates the shared {@link registry} starts with (ADR-021): `holochart`, the default look,
 * and Plotly's look as `plotly-classic` and `none`, so every bundle, partial ones included, renders
 * the default look and can switch back with `setDefaultTemplate('plotly-classic')`.
 */
const builtinTemplates: readonly TemplateModule[] = [
  { kind: 'template', name: DEFAULT_TEMPLATE_NAME, template: holochartTemplate, default: true },
  { kind: 'template', name: 'plotly-classic', template: plotlyClassicTemplate },
  { kind: 'template', name: 'none', template: noneTemplate },
];

/**
 * The shared registry used by charts that are not given one. Unlike a fresh
 * {@link createChartRegistry}, it starts with the built-in templates and applies `holochart` to
 * figures without `layout.template` (ADR-021).
 */
export const registry: ChartRegistry = /* @__PURE__ */ createChartRegistry().register(
  ...builtinTemplates,
);

/**
 * Register modules into the shared {@link registry} (plan E21.1 partial bundles):
 *
 * ```ts
 * import { createChart, register } from '@mk7s/holochart-runtime';
 * import { scatter } from '@mk7s/holochart-traces-basic';
 * register(scatter);
 * ```
 */
export function register(...modules: readonly Registrable[]): ChartRegistry {
  return registry.register(...modules);
}

/**
 * Set the template the shared {@link registry} applies when `layout.template` is unset: a
 * registered name, or `undefined` for none. Figures that set `layout.template` are unaffected.
 * Apps migrating from Plotly call it once, before creating charts, to keep Plotly's look:
 *
 * ```ts
 * import { setDefaultTemplate } from '@mk7s/holochart';
 * setDefaultTemplate('plotly-classic');
 * ```
 */
export function setDefaultTemplate(name: string | undefined): ChartRegistry {
  return registry.setDefaultTemplate(name);
}

/** Shorthand for a {@link TemplateModule}. */
export function defineTemplate(
  name: string,
  template: TemplateModule['template'],
  options: { default?: boolean } = {},
): TemplateModule {
  return { kind: 'template', name, template, ...(options.default ? { default: true } : {}) };
}
