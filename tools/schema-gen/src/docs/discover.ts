/**
 * Builds the registry the attribute reference documents: core's base layout/config plus every
 * trace module and layout component exported by the workspace's trace and component packages.
 *
 * Packages are discovered from `packages/*\/package.json` and imported from their TypeScript
 * sources (the `source` export condition, ADR-013), so the reference always matches the working
 * tree. Modules are recognized by shape rather than by name, so new packages and exports need no
 * changes here. A package that fails to import is reported and skipped: a half-finished trace
 * package must not break the docs build.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createRegistry,
  type ComponentModule,
  type Registry,
  type TraceModule,
} from '@mk7s/holochart-core';

/** Packages scanned for trace modules and components. */
const PACKAGE_NAME = /^@mk7s\/holochart-(traces-[\w-]+|components)$/;

/** True for objects shaped like a {@link TraceModule}. */
export function isTraceModule(v: unknown): v is TraceModule {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  const schema = m['schema'] as { kind?: unknown } | undefined;
  return (
    typeof m['type'] === 'string' &&
    Array.isArray(m['categories']) &&
    typeof schema === 'object' &&
    schema !== null &&
    schema.kind === 'object' &&
    typeof m['supplyDefaults'] === 'function' &&
    typeof m['meta'] === 'object'
  );
}

/** True for objects shaped like a {@link ComponentModule} that contribute layout attributes. */
export function isComponentModule(v: unknown): v is ComponentModule {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m['name'] === 'string' &&
    m['type'] === undefined &&
    (typeof m['layoutSchema'] === 'object' || typeof m['supplyLayoutDefaults'] === 'function')
  );
}

/** Collect trace modules and components from a module namespace (also looks inside arrays). */
export function collectModules(exports: Record<string, unknown>): {
  traces: TraceModule[];
  components: ComponentModule[];
} {
  const traces = new Set<TraceModule>();
  const components = new Set<ComponentModule>();
  const visit = (v: unknown): void => {
    if (isTraceModule(v)) traces.add(v);
    else if (isComponentModule(v)) components.add(v);
  };
  for (const value of Object.values(exports)) {
    if (Array.isArray(value)) value.forEach(visit);
    else visit(value);
  }
  return { traces: [...traces], components: [...components] };
}

/** Outcome of {@link discoverRegistry}. */
export interface Discovery {
  registry: Registry;
  /** Package name → trace types and component names it contributed. */
  contributions: Record<string, string[]>;
  /** Packages that could not be imported, with the reason. */
  warnings: string[];
}

interface PackageJson {
  name?: string;
  exports?: Record<string, unknown>;
}

function sourceEntry(pkg: PackageJson): string | undefined {
  const root = pkg.exports?.['.'];
  if (typeof root === 'object' && root !== null) {
    const source = (root as Record<string, unknown>)['source'];
    if (typeof source === 'string') return source;
  }
  return undefined;
}

/**
 * Create a registry holding every trace module and component found in the workspace.
 *
 * @param repoRoot - Absolute path of the repository root.
 */
export async function discoverRegistry(repoRoot: string): Promise<Discovery> {
  const registry = createRegistry();
  const contributions: Record<string, string[]> = {};
  const warnings: string[] = [];
  const packagesDir = path.join(repoRoot, 'packages');
  const dirs = (await readdir(packagesDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const dir of dirs) {
    let pkg: PackageJson;
    try {
      pkg = JSON.parse(await readFile(path.join(packagesDir, dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    if (!pkg.name || !PACKAGE_NAME.test(pkg.name)) continue;
    const entry = sourceEntry(pkg);
    if (!entry) {
      warnings.push(`${pkg.name}: no "source" export condition; skipped.`);
      continue;
    }
    let exports: Record<string, unknown>;
    try {
      exports = await import(pathToFileURL(path.join(packagesDir, dir, entry)).href);
    } catch (err) {
      warnings.push(`${pkg.name}: import failed (${(err as Error).message}); skipped.`);
      continue;
    }
    const { traces, components } = collectModules(exports);
    if (traces.length > 0) registry.register(...traces);
    if (components.length > 0) registry.registerComponent(...components);
    contributions[pkg.name] = [...traces.map((t) => t.type), ...components.map((c) => c.name)];
  }
  return { registry, contributions, warnings };
}
