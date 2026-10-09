/**
 * Builds the registry the attribute reference documents: core's base layout/config plus every
 * trace module and layout component exported by the workspace's trace and component packages,
 * then what the full bundle (`@mk7s/holochart`) adds or replaces: its 2.5D view component and the
 * trace modules it registers extended (`bar` with `depth`, plan E8.9), which are not in the trace
 * packages because the `basic` bundle has no room for them.
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
  type CoreComponentModule,
  type Registry,
  type CoreTraceModule,
} from '@mk7s/holochart-core';

/**
 * Packages scanned for trace modules and components (the runtime has one: `fx`, the interaction
 * layout attributes every chart registers).
 */
const PACKAGE_NAME = /^@mk7s\/holochart-(traces-[\w-]+|components|runtime)$/;
/** The full bundle, scanned last for the modules only it has (see the module comment). */
const FULL_BUNDLE = '@mk7s/holochart';

/** True for objects shaped like a {@link CoreTraceModule}. */
export function isTraceModule(v: unknown): v is CoreTraceModule {
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

/** True for objects shaped like a {@link CoreComponentModule} that contribute layout attributes. */
export function isComponentModule(v: unknown): v is CoreComponentModule {
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
  traces: CoreTraceModule[];
  components: CoreComponentModule[];
} {
  const traces = new Set<CoreTraceModule>();
  const components = new Set<CoreComponentModule>();
  const visit = (v: unknown): void => {
    if (isTraceModule(v)) traces.add(v);
    else if (isComponentModule(v)) components.add(v);
  };
  for (const value of Object.values(exports)) {
    if (Array.isArray(value)) value.forEach(visit);
    else visit(value);
  }
  // Sorted, not in export order: a module namespace lists its exports sorted, while the same
  // module loaded by Vitest lists them as declared.
  const byKey =
    <T>(key: (v: T) => string) =>
    (a: T, b: T) =>
      key(a) < key(b) ? -1 : 1;
  return {
    traces: [...traces].sort(byKey((t) => t.type)),
    components: [...components].sort(byKey((c) => c.name)),
  };
}

/** A workspace package scanned for modules (see {@link discoverPackages}). */
export interface DiscoveredPackage {
  /** Package name, e.g. `'@mk7s/holochart-traces-basic'`. */
  name: string;
  /** Directory under `packages/`, e.g. `'traces-basic'`. */
  dir: string;
  /** Workspace (`@mk7s/*`) packages it depends on. */
  dependencies: string[];
  /** Trace modules it exports that no package scanned before it exports. */
  traces: CoreTraceModule[];
  /** Components it exports that no package scanned before it exports. */
  components: CoreComponentModule[];
  /** The package's exports (its TypeScript sources'). */
  exports: Record<string, unknown>;
}

/** Outcome of {@link discoverPackages}. */
export interface PackageDiscovery {
  /** Trace and component packages, in dependency order (a package after its dependencies). */
  packages: DiscoveredPackage[];
  /**
   * The full bundle (`@mk7s/holochart`), with the modules it registers that the packages don't
   * export (extended trace modules, the 2.5D view component).
   */
  fullBundle: DiscoveredPackage | undefined;
  /** Packages that could not be imported, with the reason. */
  warnings: string[];
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
  dependencies?: Record<string, string>;
}

function sourceEntry(pkg: PackageJson): string | undefined {
  const root = pkg.exports?.['.'];
  if (typeof root === 'object' && root !== null) {
    const source = (root as Record<string, unknown>)['source'];
    if (typeof source === 'string') return source;
  }
  return undefined;
}

function workspaceDependencies(pkg: PackageJson): string[] {
  return Object.keys(pkg.dependencies ?? {})
    .filter((d) => d.startsWith('@mk7s/'))
    .sort();
}

/** Packages sorted so that each comes after the packages it depends on (then by name). */
function dependencyOrder<T extends { name: string; dependencies: string[] }>(list: T[]): T[] {
  const byName = new Map(list.map((p) => [p.name, p]));
  const out: T[] = [];
  const seen = new Set<string>();
  const visit = (p: T): void => {
    if (seen.has(p.name)) return;
    seen.add(p.name);
    for (const d of p.dependencies) {
      const dep = byName.get(d);
      if (dep) visit(dep);
    }
    out.push(p);
  };
  for (const p of [...list].sort((a, b) => (a.name < b.name ? -1 : 1))) visit(p);
  return out;
}

/**
 * Import every trace and component package of the workspace (and the full bundle) from its
 * TypeScript sources and collect the modules each one contributes.
 *
 * @param repoRoot - Absolute path of the repository root.
 */
export async function discoverPackages(repoRoot: string): Promise<PackageDiscovery> {
  const warnings: string[] = [];
  const packagesDir = path.join(repoRoot, 'packages');
  const dirs = (await readdir(packagesDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const found: DiscoveredPackage[] = [];
  let full: { dir: string; pkg: PackageJson } | undefined;

  for (const dir of dirs) {
    let pkg: PackageJson;
    try {
      pkg = JSON.parse(await readFile(path.join(packagesDir, dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    if (pkg.name === FULL_BUNDLE) full = { dir, pkg };
    if (!pkg.name || !PACKAGE_NAME.test(pkg.name)) continue;
    const entry = sourceEntry(pkg);
    if (!entry) {
      warnings.push(`${pkg.name}: no "source" export condition; skipped.`);
      continue;
    }
    try {
      const exports: Record<string, unknown> = await import(
        pathToFileURL(path.join(packagesDir, dir, entry)).href
      );
      const dependencies = workspaceDependencies(pkg);
      found.push({ name: pkg.name, dir, dependencies, traces: [], components: [], exports });
    } catch (err) {
      warnings.push(`${pkg.name}: import failed (${(err as Error).message}); skipped.`);
    }
  }

  const packages = dependencyOrder(found);
  const traces = new Set<CoreTraceModule>();
  const components = new Set<CoreComponentModule>();
  for (const p of packages) {
    const modules = collectModules(p.exports);
    // Modules re-exported from a dependency belong to that dependency.
    p.traces = modules.traces.filter((t) => !traces.has(t));
    p.components = modules.components.filter((c) => !components.has(c));
    p.traces.forEach((t) => traces.add(t));
    p.components.forEach((c) => components.add(c));
  }

  let fullBundle: DiscoveredPackage | undefined;
  const entry = full && sourceEntry(full.pkg);
  if (full && entry) {
    try {
      const exports: Record<string, unknown> = await import(
        pathToFileURL(path.join(packagesDir, full.dir, entry)).href
      );
      // Of the modules it registers, only those the trace and component packages don't have (the
      // others are the same objects).
      const modules = collectModules({ builtins: exports['builtins'] });
      fullBundle = {
        name: FULL_BUNDLE,
        dir: full.dir,
        dependencies: workspaceDependencies(full.pkg),
        traces: modules.traces.filter((t) => !traces.has(t)),
        components: modules.components.filter((c) => !components.has(c)),
        exports,
      };
    } catch (err) {
      warnings.push(`${FULL_BUNDLE}: import failed (${(err as Error).message}); skipped.`);
    }
  }
  return { packages, fullBundle, warnings };
}

/**
 * Create a registry holding every trace module and component found in the workspace, as the full
 * bundle registers them (its extended modules replace the packages' ones).
 *
 * @param repoRoot - Absolute path of the repository root.
 */
export async function discoverRegistry(repoRoot: string): Promise<Discovery> {
  const { packages, fullBundle, warnings } = await discoverPackages(repoRoot);
  const registry = createRegistry();
  const contributions: Record<string, string[]> = {};
  // Registration order (directory order, then the full bundle) is the reference's trace order.
  const ordered = [...packages].sort((a, b) => (a.dir < b.dir ? -1 : 1));
  for (const p of fullBundle ? [...ordered, fullBundle] : ordered) {
    if (p.traces.length > 0) registry.register(...p.traces);
    if (p.components.length > 0) registry.registerComponent(...p.components);
    contributions[p.name] = [...p.traces.map((t) => t.type), ...p.components.map((c) => c.name)];
  }
  return { registry, contributions, warnings };
}
