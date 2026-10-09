/**
 * Builds every schema-derived artifact checked into the repo (plan E1.2): `plot-schema.json` and
 * the generated TypeScript input types of figures (backlog S1.6). Returns contents instead of
 * writing them so the CLI and the staleness test share one code path.
 *
 * The types follow the packages, so a partial bundle imports only the types of what it registers:
 *
 * - `packages/core/src/generated/`: `BaseLayout` (the layout attributes every bundle has) and
 *   `Config`, and the attribute groups every trace shares (`CommonTraceAttributes`,
 *   `CartesianTraceAttributes`, …).
 * - `packages/<traces-*>/src/generated/traces.ts`: one type per trace module of the package
 *   (`TableTrace`, with a literal `type`) and their union (`TracesBasic`), built on core's groups.
 *   A trace module the full bundle extends is named `Base<Type>Trace` here (`BaseBarTrace`): the
 *   plain name is the full bundle's type, which has more attributes.
 * - `packages/holochart/src/generated/figure.ts`: what the full bundle registers: `Data`, the union
 *   of every trace type (the trace modules it extends, such as `bar` with 2.5D `depth`, get types
 *   of their own), and `Layout`, with the layout attributes of every trace and component.
 *
 * Trace modules and components are found the way the attribute reference finds them
 * (`docs/discover.ts`), so the types match the documented attributes. Types of containers shared
 * by identity (`colorbar`, `hoverlabel`, …) are declared once and imported where reused.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as prettier from 'prettier';
import {
  cartesianTraceAttributes,
  commonTraceAttributes,
  configSchema,
  createRegistry,
  domainTraceAttributes,
  extrusionAttributes,
  layoutSchema,
  plotSchema,
  type Children,
  type ObjectNode,
  type SchemaNode,
  type CoreTraceModule,
} from '@mk7s/holochart-core';
import {
  createTypeFile,
  traceTypeName,
  type KnownType,
  type TypeBase,
  type TypeFile,
} from './codegen/generate-types.ts';
import { discoverPackages, type DiscoveredPackage } from './docs/discover.ts';

/** Absolute path of the repository root (this file lives in `tools/schema-gen/src`). */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Command that regenerates the checked-in files. */
export const GEN_COMMAND = 'pnpm --filter @mk7s/holochart-schema-gen gen';

const CORE = '@mk7s/holochart-core';

/**
 * Exported trace attribute containers declared under a name of their own before the package's
 * traces, so the traces sharing them read well (`marker.colorbar?: Colorbar`).
 */
const NAMED_CONTAINERS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  '@mk7s/holochart-traces-basic': { colorbarAttributes: 'Colorbar' },
};

/**
 * Format with the repo's Prettier config so `prettier --write` is a no-op on generated files and
 * they never show up as formatting noise in diffs.
 */
async function format(relPath: string, source: string): Promise<string> {
  const filepath = path.join(REPO_ROOT, relPath);
  const config = await prettier.resolveConfig(filepath);
  return prettier.format(source, { ...config, filepath });
}

const objectOf = (children: Children): ObjectNode => ({ kind: 'object', children });

/** `file.emitted` as other files see it: imported from `from`. */
function exported(file: TypeFile, from: string, into: Map<SchemaNode, KnownType>): void {
  for (const [node, type] of file.emitted) into.set(node, { ...type, from });
}

/** The union type name of a trace package: `@mk7s/holochart-traces-basic` → `TracesBasic`. */
function packageUnionName(name: string): string {
  const suffix = name.replace(/^@mk7s\/holochart-/, '');
  return suffix
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

/** The core files and the attribute groups trace types build on. */
function coreFiles(known: Map<SchemaNode, KnownType>): {
  files: Record<string, string>;
  bases: TypeBase[];
} {
  const layout = createTypeFile();
  // The names `Layout` and `LayoutTitle` are the full bundle's, which declares more attributes
  // (those of its traces and components): the base types get names of their own, and their
  // containers, which the full bundle reuses, keep the `Layout` prefix (`LayoutFont`, …).
  layout.object(layoutSchema.children.title as ObjectNode, 'BaseLayoutTitle', {
    prefix: 'LayoutTitle',
  });
  layout.object(layoutSchema, 'BaseLayout', { alias: true, prefix: 'Layout' });
  const config = createTypeFile();
  config.object(configSchema, 'Config', { alias: true });

  const groups = createTypeFile();
  const group = (children: Children, name: string, prefix: string, doc: string): TypeBase => {
    groups.object(objectOf(children), name, {
      alias: true,
      perPoint: true,
      exclude: ['type'],
      prefix,
      doc: [doc],
    });
    return { type: { name, from: CORE, perPoint: true }, children };
  };
  const bases = [
    group(
      commonTraceAttributes,
      'CommonTraceAttributes',
      'Trace',
      'Attributes every trace type has (`name`, `visible`, `hovertemplate`, …).',
    ),
    group(
      cartesianTraceAttributes,
      'CartesianTraceAttributes',
      'Trace',
      'Attributes of traces drawn on cartesian axes: the axes they use.',
    ),
    group(
      domainTraceAttributes,
      'DomainTraceAttributes',
      'Trace',
      'Attributes of traces placed by a fraction of the plot area (pie, treemap, …).',
    ),
    group(
      extrusionAttributes,
      'ExtrusionAttributes',
      'Extrusion',
      "2.5D attributes (Holochart extension) of the traces the full bundle extrudes (`bar`, `pie`, …). Partial bundles add them with core's `withExtrusion`.",
    ),
  ];
  for (const file of [layout, config, groups]) exported(file, CORE, known);
  return {
    files: {
      'packages/core/src/generated/layout.ts': layout.render(),
      'packages/core/src/generated/config.ts': config.render(),
      'packages/core/src/generated/trace-attributes.ts': groups.render(),
    },
    bases,
  };
}

/** A generated trace type, for the full bundle to reuse or extend. */
interface TraceType {
  readonly module: CoreTraceModule;
  readonly type: KnownType;
  /** The trace's full schema in its package (common attributes included). */
  readonly schema: ObjectNode;
}

/**
 * Generate every schema-derived file.
 *
 * @returns Map from path (relative to the repo root, `/`-separated) to formatted file content.
 * @throws If a package fails to import (the types would silently lose its traces).
 */
export async function generateAll(): Promise<Record<string, string>> {
  const { packages, fullBundle, warnings } = await discoverPackages(REPO_ROOT);
  if (warnings.length > 0 || !fullBundle) {
    throw new Error(`schema-gen: discovery failed:\n${warnings.join('\n') || 'no full bundle'}`);
  }
  /** Types declared by each package, by schema node. */
  const knownBy = new Map<string, Map<SchemaNode, KnownType>>();
  const knownFor = (pkg: DiscoveredPackage): Map<SchemaNode, KnownType> => {
    const out = new Map(knownBy.get(CORE));
    for (const dep of pkg.dependencies) for (const [n, t] of knownBy.get(dep) ?? []) out.set(n, t);
    return out;
  };

  const coreKnown = new Map<SchemaNode, KnownType>();
  const core = coreFiles(coreKnown);
  knownBy.set(CORE, coreKnown);
  const raw: Record<string, string> = { ...core.files };

  // Trace types the full bundle registers a module of its own for (`bar` with 2.5D `depth`, …).
  const extended = new Set(fullBundle.traces.map((module) => module.type));
  const traceTypes = new Map<string, TraceType>();
  for (const pkg of packages) {
    if (pkg.traces.length === 0) continue;
    const registry = createRegistry().register(...pkg.traces);
    const file = createTypeFile({ importFrom: CORE, known: knownFor(pkg) });
    const named = NAMED_CONTAINERS[pkg.name] ?? {};
    if (Object.keys(named).length > 0) {
      for (const [exportName, typeName] of Object.entries(named)) {
        const node = pkg.exports[exportName] as ObjectNode | undefined;
        if (node?.kind !== 'object') throw new Error(`schema-gen: ${pkg.name}#${exportName}?`);
        file.object(node, typeName, { perPoint: true });
      }
    }
    const names: string[] = [];
    for (const module of pkg.traces) {
      const schema = registry.getTraceSchema(module.type)!;
      const plain = traceTypeName(module.type);
      const name = file.trace({
        type: module.type,
        schema,
        bases: core.bases,
        // The plain name is the full bundle's type; nested containers keep it as their prefix.
        ...(extended.has(module.type) && { name: `Base${plain}`, prefix: plain }),
      });
      names.push(name);
      traceTypes.set(module.type, { module, type: { name, from: pkg.name }, schema });
    }
    file.union(packageUnionName(pkg.name), names, [
      `Any trace of \`${pkg.name}\`, discriminated on \`type\`. Type a partial bundle's figures with it: \`FigureInput<${packageUnionName(pkg.name)}>\`.`,
    ]);
    const known = new Map<SchemaNode, KnownType>();
    exported(file, pkg.name, known);
    knownBy.set(pkg.name, known);
    raw[`packages/${pkg.dir}/src/generated/traces.ts`] = file.render();
  }

  raw[`packages/${fullBundle.dir}/src/generated/figure.ts`] = fullBundleFile(
    packages,
    fullBundle,
    traceTypes,
    core.bases,
    knownFor(fullBundle),
  );
  raw['packages/core/src/generated/plot-schema.json'] = JSON.stringify(
    plotSchema(createRegistry()),
    null,
    2,
  );
  const out: Record<string, string> = {};
  for (const [rel, source] of Object.entries(raw)) out[rel] = await format(rel, source);
  return out;
}

/** `Data` and `Layout` of the full bundle, which registers every package's modules. */
function fullBundleFile(
  packages: readonly DiscoveredPackage[],
  fullBundle: DiscoveredPackage,
  traceTypes: ReadonlyMap<string, TraceType>,
  bases: readonly TypeBase[],
  known: ReadonlyMap<SchemaNode, KnownType>,
): string {
  const registry = createRegistry();
  for (const p of [...packages, fullBundle]) {
    if (p.traces.length > 0) registry.register(...p.traces);
    if (p.components.length > 0) registry.registerComponent(...p.components);
  }
  const file = createTypeFile({
    importFrom: CORE,
    known,
    header:
      'Generated by tools/schema-gen from the attribute schemas of every module the full bundle\n' +
      'registers (plan E1.2, backlog S1.6). Do not edit by hand.\n' +
      'Regenerate with `pnpm --filter @mk7s/holochart-schema-gen gen`.',
  });

  const members: [string, string | KnownType][] = [];
  for (const type of registry.traceTypes()) {
    const module = registry.getModule(type)!;
    const base = traceTypes.get(type);
    if (!base) throw new Error(`schema-gen: no package declares the '${type}' trace type`);
    if (base.module === module) {
      members.push([type, base.type]);
      continue;
    }
    // A module the full bundle extends (2.5D `depth`, …): the package's type and what it adds.
    const name = file.trace({
      type,
      schema: registry.getTraceSchema(type)!,
      bases: [{ type: base.type, children: base.schema.children, discriminated: true }, ...bases],
    });
    members.push([type, name]);
  }
  file.record('TraceTypes', members, [
    'The trace type of each trace `type` the full bundle registers. `Data` is the union of its',
    'values. A plugin registering a trace type of its own adds it here, so figures with it type-check:',
    '',
    '```ts',
    "declare module '@mk7s/holochart' {",
    '  interface TraceTypes {',
    "    sparkline: { type: 'sparkline'; values?: readonly number[] };",
    '  }',
    '}',
    '```',
  ]);
  file.alias('Data', 'TraceTypes[keyof TraceTypes]', [
    'Any trace of the full bundle, discriminated on `type` (a trace without `type` is a scatter',
    "trace). Narrow it with `trace.type === 'bar'`, or pick one with `Extract<Data, { type: 'bar' }>`.",
  ]);
  // Declared whole rather than on core's `Layout` (whose `title` the title component replaces):
  // `Omit<Layout, 'title'>` would lose the numbered axes (`keyof` reduces `'xaxis2'` into
  // `` `xaxis${number}` ``). Its containers are core's types all the same.
  file.object(registry.getLayoutSchema(), 'Layout', {
    alias: true,
    doc: [
      'Figure layout: the base layout and the layout attributes of every trace type and component',
      'of the full bundle (legend, annotations, `barmode`, 3D `scene`, …).',
    ],
  });
  return file.render();
}
