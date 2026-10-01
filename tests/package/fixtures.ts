import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT, type Pack } from './packs.ts';

/**
 * Fixture projects of the pack-and-install smoke test (`pnpm test:package`): copies
 * `tests/package/fixtures/*` into a directory outside the workspace and installs the packed
 * tarballs into them, as a user's project would get them from npm.
 *
 * The fixtures are one throwaway pnpm workspace (a single install), each project with only its own
 * dependencies (pnpm's strict `node_modules`). Every `@mk7s/*` package is overridden to its tarball
 * (the tarballs depend on each other by version, which is not on npm); third-party packages are
 * pinned to the versions of the repo's lockfile, so the install works from the pnpm store without
 * the registry (`--offline`, the default) and tests our tarballs, not upstream drift (the
 * `three (latest)` CI leg covers that).
 */

/** The fixture projects (directories of `tests/package/fixtures/`). */
export const FIXTURES = ['node-esm', 'types', 'vite', 'html'] as const;

/**
 * Third-party versions of the repo's lockfile: every package with a single locked version, and the
 * catalog's (which win where the lockfile has several, e.g. `vite`).
 */
export function lockfilePins(): Record<string, string> {
  const lockfile = readFileSync(resolve(ROOT, 'pnpm-lock.yaml'), 'utf8');
  // Top-level sections (`catalogs:`, `packages:`, ...) by name.
  const sections = new Map<string, string>();
  let current = '';
  for (const line of lockfile.split('\n')) {
    const top = /^(\S[^:]*):/.exec(line);
    if (top) current = top[1]!;
    else sections.set(current, `${sections.get(current) ?? ''}${line}\n`);
  }
  const versions = new Map<string, Set<string>>();
  // packages: '<name>@<version>':
  const keys = (sections.get('packages') ?? '').matchAll(
    /^ {2}'?((?:@[^@/\s']+\/)?[^@\s']+)@([^'\s(]+)'?:$/gm,
  );
  for (const [, name, version] of keys) {
    if (!versions.has(name!)) versions.set(name!, new Set());
    versions.get(name!)!.add(version!);
  }
  const pins: Record<string, string> = {};
  for (const [name, set] of versions) if (set.size === 1) pins[name] = [...set][0]!;
  // catalogs: default: <name>: { specifier, version }
  const catalog = (sections.get('catalogs') ?? '').matchAll(
    /^ {4}'?([^'\s:]+)'?:\n {6}specifier: [^\n]+\n {6}version: (\S+)$/gm,
  );
  for (const [, name, version] of catalog) pins[name!] = version!;
  return pins;
}

/** Install mode: `offline` (default; store only) or `prefer-offline` (CI, see the workflow). */
const INSTALL_MODE =
  process.env.PACKAGE_INSTALL_MODE === 'prefer-offline' ? 'prefer-offline' : 'offline';

/** Copy the fixtures into `root` and install the packs into them. */
export function createFixtures(root: string, packs: readonly Pack[]): void {
  for (const name of FIXTURES) {
    cpSync(resolve(ROOT, 'tests/package/fixtures', name), join(root, name), { recursive: true });
  }
  const overrides: Record<string, string> = { ...lockfilePins() };
  for (const pack of packs) overrides[pack.name] = `file:${pack.tarball}`;
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'holochart-package-fixtures', private: true }, null, 2)}\n`,
  );
  // JSON is YAML: the workspace file of the throwaway fixture workspace.
  writeFileSync(
    join(root, 'pnpm-workspace.yaml'),
    `${JSON.stringify({ packages: [...FIXTURES], overrides }, null, 2)}\n`,
  );
  execFileSync(
    'pnpm',
    ['install', `--${INSTALL_MODE}`, '--no-frozen-lockfile', '--reporter=append-only'],
    {
      cwd: root,
      stdio: 'inherit',
      // Not the repo's settings: the fixture workspace stands alone, like a user's project.
      env: withoutNpmConfig(process.env),
    },
  );
}

/** `env` without the `npm_config_*` / `pnpm_config_*` a parent `pnpm run` passes down. */
export function withoutNpmConfig(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !/^(npm|pnpm)_(config|package|lifecycle)_/i.test(key)),
  );
}
