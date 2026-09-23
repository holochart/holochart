/**
 * Supply defaults (plan E1.4): turn user input into complete `fullData` / `fullLayout` /
 * `fullConfig`, so later stages never check for `undefined`.
 *
 * Order matters and mirrors Plotly:
 * 1. config, then validation (strict mode throws here);
 * 2. template resolution;
 * 3. base layout (font first, because other fonts inherit from it; colorway before traces);
 * 4. traces — common attributes, then each module's conditional defaults, with template traces
 *    cycled per type and colorway colors cycled per trace index;
 * 5. trace-module and component layout attributes;
 * 6. cartesian axis discovery (`fullLayout._subplots`);
 * 7. `showlegend`, whose default depends on the traces.
 *
 * The result is a fixed point: feeding the (underscore-stripped) output back in produces the same
 * output (property-tested).
 */
import { configSchema } from '../config/schema.ts';
import { resolveDataRefs } from '../data/datasets.ts';
import { layoutSchema } from '../layout/schema.ts';
import { getIn, setIn } from '../path/path.ts';
import type { LayoutDefaultsContext, Registry, TraceDefaultsContext } from '../registry/types.ts';
import { getNodeAtPath } from '../schema/walk.ts';
import type { ObjectNode } from '../schema/types.ts';
import { resolveTemplate, templateTraceFor, type Template } from '../templates/templates.ts';
import { ValidationError, type Issue } from '../validate/issues.ts';
import { validate } from '../validate/validate.ts';
import { isPlainObject } from '../util/objects.ts';
import { supplyCartesianAxes } from './axes.ts';
import { coerceAtPath, coerceContainer } from './container.ts';
import type { FigureInput, FullConfig, FullLayout, FullTrace } from './types.ts';

/** Options for {@link supplyDefaults}. */
export interface SupplyDefaultsOptions {
  /**
   * Receives each validation issue (non-strict mode). Defaults to `registry.warnOnce`, which logs
   * each path once.
   */
  onIssue?: (issue: Issue) => void;
  /** Skip validation (e.g. on hot update paths where input was already validated). */
  validate?: boolean;
}

/** Output of {@link supplyDefaults}. */
export interface SupplyDefaultsResult {
  fullData: FullTrace[];
  fullLayout: FullLayout;
  fullConfig: FullConfig;
  /** Validation issues found in the input (empty when `validate: false`). */
  issues: Issue[];
}

const BASE_LAYOUT_KEYS = new Set(Object.keys(layoutSchema.children));
const LATE_LAYOUT_KEYS = new Set(['font', 'showlegend', 'template']);
const EARLY_LAYOUT_KEYS = new Set([...BASE_LAYOUT_KEYS].filter((k) => !LATE_LAYOUT_KEYS.has(k)));

function reportIssues(
  issues: readonly Issue[],
  strict: boolean,
  onIssue: (issue: Issue) => void,
): void {
  if (strict) {
    const first = issues.find((i) => i.code !== 'deprecated');
    if (first) throw new ValidationError(first);
  }
  for (const issue of issues) onIssue(issue);
}

function coerceContainerAt(
  schema: ObjectNode,
  input: unknown,
  output: Record<string, unknown>,
  template: unknown,
  path: string,
  overrides?: Readonly<Record<string, unknown>>,
): void {
  const node = getNodeAtPath(schema, path);
  if (node?.kind !== 'object') throw new Error(`coerceContainer('${path}'): not a container`);
  let container = getIn(output, path);
  if (!isPlainObject(container)) {
    container = {};
    setIn(output, path, container);
  }
  coerceContainer(node, getIn(input, path), container as Record<string, unknown>, {
    template: getIn(template, path),
    ...(overrides ? { overrides } : {}),
  });
}

function supplyTrace(
  userTrace: Record<string, unknown>,
  index: number,
  typeIndex: (type: string) => number,
  registry: Registry,
  template: Template | null,
  fullLayout: FullLayout,
  datasets: FigureInput['datasets'],
): FullTrace {
  const input = userTrace;
  const rawType = input['type'];
  const type = typeof rawType === 'string' && rawType !== '' ? rawType : 'scatter';
  const mod = registry.getModule(type);
  const schema = registry.getTraceSchema(type);
  if (!mod || !schema) {
    return { type, visible: false, _index: index, _input: input, _module: undefined };
  }
  // Column references ('@date') are swapped for dataset columns before coercion; issues were
  // already reported by validation. `_input` keeps the user's original object.
  const traceIn = resolveDataRefs(input, schema, datasets, `data[${index}]`).trace;

  const tmpl = templateTraceFor(template, type, typeIndex(type));
  const out = { type } as FullTrace;
  const colorway = fullLayout.colorway;
  const ctx: TraceDefaultsContext = {
    coerce: <T>(path: string, dflt?: unknown) =>
      coerceAtPath(schema, traceIn, out, tmpl, path, dflt) as T,
    coerceContainer: (path, overrides) =>
      coerceContainerAt(schema, traceIn, out, tmpl, path, overrides),
    template: tmpl,
    fullLayout,
    defaultColor: colorway[index % colorway.length] as string,
    index,
  };

  const visible = ctx.coerce<FullTrace['visible']>('visible');
  ctx.coerce('name', `trace ${index}`);
  for (const key of [
    'uid',
    'showlegend',
    'legendgroup',
    'legendrank',
    'legendwidth',
    'opacity',
    'meta',
    'customdata',
    'ids',
  ]) {
    ctx.coerce(key);
  }
  ctx.coerceContainer('legendgrouptitle');
  for (const key of ['hovertext', 'hoverinfo', 'hovertemplate', 'selectedpoints']) ctx.coerce(key);
  ctx.coerceContainer('hoverlabel');
  ctx.coerce('uirevision');
  if (mod.categories.includes('cartesian')) {
    ctx.coerce('xaxis');
    ctx.coerce('yaxis');
  }
  if (visible !== false) mod.supplyDefaults(traceIn, out, ctx);

  out._index = index;
  out._input = input;
  out._module = mod;
  return out;
}

/**
 * Compute `fullData`, `fullLayout` and `fullConfig` for a figure.
 *
 * @throws {ValidationError} In `config.strict` mode, on the first validation issue that is not a
 * deprecation notice. Otherwise issues are passed to `options.onIssue` (default: warn once per path).
 */
export function supplyDefaults(
  figure: FigureInput,
  registry: Registry,
  options: SupplyDefaultsOptions = {},
): SupplyDefaultsResult {
  const dataIn = Array.isArray(figure.data) ? figure.data : [];
  const layoutIn: Record<string, unknown> = isPlainObject(figure.layout) ? figure.layout : {};

  const fullConfig = coerceContainer(configSchema, figure.config) as FullConfig;
  const issues =
    options.validate === false
      ? []
      : validate(figure.data, figure.layout, registry, {
          config: figure.config,
          datasets: figure.datasets,
        });
  reportIssues(issues, fullConfig.strict, options.onIssue ?? ((i) => registry.warnOnce(i)));

  const { template } = resolveTemplate(layoutIn['template'], registry);
  const tLayout = isPlainObject(template?.layout) ? template.layout : undefined;
  const schema = registry.getLayoutSchema();

  // Base layout. `font` goes first so `title.font` can inherit from it.
  const fullLayout = {} as FullLayout;
  coerceContainer(schema, layoutIn, fullLayout, { template: tLayout, only: new Set(['font']) });
  const font = fullLayout.font;
  coerceContainer(schema, layoutIn, fullLayout, {
    template: tLayout,
    only: EARLY_LAYOUT_KEYS,
    overrides: {
      'title.font.family': font.family,
      'title.font.size': Math.round(font.size * 1.4),
      'title.font.color': font.color,
      'title.font.weight': font.weight,
      'title.font.style': font.style,
    },
  });
  fullLayout.template = template;

  // Traces.
  const typeCounts = new Map<string, number>();
  const nextTypeIndex = (type: string): number => {
    const n = typeCounts.get(type) ?? 0;
    typeCounts.set(type, n + 1);
    return n;
  };
  // `Array.from` visits holes of a sparse `data` array (as `undefined` → a default trace);
  // `map` would keep them as holes, which later stages cannot read.
  const fullData = Array.from(dataIn, (raw: unknown, i) =>
    supplyTrace(
      isPlainObject(raw) ? raw : {},
      i,
      nextTypeIndex,
      registry,
      template,
      fullLayout,
      figure.datasets,
    ),
  );

  // Layout attributes owned by trace modules (only when that trace type is shown) and components.
  const layoutCtx: LayoutDefaultsContext = {
    coerce: <T>(path: string, dflt?: unknown) =>
      coerceAtPath(schema, layoutIn, fullLayout, tLayout, path, dflt) as T,
    fullData,
    template,
  };
  const activeModules = new Set(
    fullData.filter((t) => t.visible !== false && t._module).map((t) => t._module),
  );
  for (const owner of [...activeModules, ...registry.components()]) {
    if (!owner) continue;
    if (owner.layoutSchema) {
      const only = new Set(Object.keys(owner.layoutSchema).filter((k) => !BASE_LAYOUT_KEYS.has(k)));
      coerceContainer(schema, layoutIn, fullLayout, { template: tLayout, only });
    }
    owner.supplyLayoutDefaults?.(layoutIn, fullLayout, layoutCtx);
  }

  fullLayout._subplots = supplyCartesianAxes(layoutIn, fullLayout, fullData, tLayout, schema);

  const legendEntries = fullData.filter(
    (t) =>
      t.visible !== false &&
      t['showlegend'] !== false &&
      t._module?.categories.includes('showLegend') === true,
  ).length;
  coerceContainer(schema, layoutIn, fullLayout, {
    template: tLayout,
    only: new Set(['showlegend']),
    overrides: { showlegend: legendEntries > 1 },
  });

  return { fullData, fullLayout, fullConfig, issues };
}
