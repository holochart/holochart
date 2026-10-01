import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The publishable packages (every non-private `packages/*`) packed as users download them:
 * `pnpm pack` applies `publishConfig` (e.g. the published `exports` without `source`) and turns
 * `workspace:*` into real versions, which `npm pack` does not. Needs the packages built.
 *
 * CLI: `node tests/package/packs.ts <dir>` packs them all into `<dir>`; point `HOLOCHART_PACKS` at
 * it so `lint.ts` and the smoke test check those same tarballs (CI does).
 */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export interface Pack {
  name: string;
  version: string;
  /** The package's directory in the workspace. */
  dir: string;
  /** Absolute path of the tarball. */
  tarball: string;
}

/** The publishable packages' names, versions and directories, in `packages/` order. */
export function publishablePackages(): Omit<Pack, 'tarball'>[] {
  const dirs = readdirSync(resolve(ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(ROOT, 'packages', entry.name))
    .sort();
  return dirs.flatMap((dir) => {
    const file = resolve(dir, 'package.json');
    if (!existsSync(file)) return [];
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
      name: string;
      version: string;
      private?: boolean;
    };
    return manifest.private ? [] : [{ name: manifest.name, version: manifest.version, dir }];
  });
}

/** `pnpm pack` every publishable package into `outDir`. */
export function packAll(outDir: string): Pack[] {
  mkdirSync(outDir, { recursive: true });
  return publishablePackages().map((pkg) => {
    const out = execFileSync('pnpm', ['pack', '--pack-destination', outDir, '--json'], {
      cwd: pkg.dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const { filename } = JSON.parse(out) as { filename: string };
    return { ...pkg, tarball: resolve(outDir, filename) };
  });
}

/**
 * The packs to check: the tarballs in `$HOLOCHART_PACKS` when it has every publishable package's
 * (at its current version), else freshly packed into `fallbackDir`.
 */
export function getPacks(fallbackDir: string): Pack[] {
  const given = process.env.HOLOCHART_PACKS;
  if (given) {
    const packs = publishablePackages().map((pkg) => ({
      ...pkg,
      // pnpm's tarball name: `@scope/name` → `scope-name-<version>.tgz`.
      tarball: resolve(given, `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`),
    }));
    if (packs.every((pack) => existsSync(pack.tarball))) return packs;
    console.warn(`HOLOCHART_PACKS=${given} lacks some tarballs; packing afresh.`);
  }
  return packAll(fallbackDir);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error('Usage: node tests/package/packs.ts <out-dir>');
    process.exit(2);
  }
  for (const pack of packAll(resolve(outDir))) console.log(`${pack.name}: ${pack.tarball}`);
}
