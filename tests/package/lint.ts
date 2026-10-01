/**
 * Package quality gates (backlog S1.3): `publint` and `@arethetypeswrong/cli` (attw) on the tarball
 * of every publishable package, packed with `pnpm pack` (`packs.ts`), so they see what npm gets.
 * Neither tool is a dependency of the repo: both run through `pnpm dlx` at pinned versions (older
 * than pnpm's `minimumReleaseAge`, ADR-016). Bump them deliberately, like a dependency.
 *
 * Usage: `pnpm lint:package` (builds first), or `node tests/package/lint.ts` on built packages;
 * with `HOLOCHART_PACKS` set (`packs.ts`), it checks the tarballs there instead of packing.
 * Exits non-zero when any package has a problem; every package is checked before exiting.
 *
 * - publint `--strict`: warnings fail too (suggestions are printed only). It checks `exports`,
 *   `files`, the module format of each file and that every path in package.json is in the tarball.
 * - attw `--profile esm-only`: the packages are ESM-only (backlog decision 3), so the `node10`
 *   and `node16` (from CJS) resolutions are not checked. Those are where the "CJS resolves to ESM"
 *   and "resolution failed" findings of an ESM-only package come from, by design. `node16`
 *   (from ESM) and `bundler` must resolve to ESM JavaScript with matching types. No rule is
 *   ignored outright, so a real problem in a supported mode (missing or mistyped types, a `.d.ts`
 *   that is CJS-flavoured, a missing file) still fails.
 * - attw `--exclude-entrypoints` for the script-tag builds (`./holochart.iife.min.js`,
 *   `./holochart-3d.iife.min.js`): they are classic scripts that set `window.Holochart`, not
 *   modules to import, so "no types" for an `import` of them is expected. `pnpm test:package` checks them
 *   instead: the HTML fixture loads them, and the TypeScript fixture types `window.Holochart`
 *   with `@mk7s/holochart/global`.
 * - attw `--no-definitely-typed`: the packages ship their own types; this avoids a registry lookup
 *   of `@types/*` stubs that do not exist.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPacks } from './packs.ts';

export const PUBLINT = 'publint@0.3.24';
export const ATTW = '@arethetypeswrong/cli@0.18.5';

/** Entry points attw skips, per package (see above). */
const ATTW_EXCLUDE: Record<string, string[]> = {
  '@mk7s/holochart': ['./holochart.iife.min.js', './holochart-3d.iife.min.js'],
};

function run(args: string[]): boolean {
  try {
    execFileSync('pnpm', ['--silent', 'dlx', ...args], { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

const dir = mkdtempSync(join(tmpdir(), 'holochart-packs-'));
const failures: string[] = [];
try {
  const packs = getPacks(dir);
  for (const pack of packs) {
    console.log(`\n=== ${pack.name}@${pack.version}`);
    if (!run([PUBLINT, 'run', pack.tarball, '--strict'])) failures.push(`${pack.name}: publint`);
    const exclude = ATTW_EXCLUDE[pack.name] ?? [];
    const attw = [ATTW, pack.tarball, '--profile', 'esm-only', '--no-definitely-typed'];
    if (exclude.length > 0) attw.push('--exclude-entrypoints', ...exclude);
    if (!run([...attw, '--format', 'table-flipped'])) failures.push(`${pack.name}: attw`);
  }
  console.log(`\nChecked ${packs.length} packages with ${PUBLINT} and ${ATTW}.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\nPackage checks failed:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exitCode = 1;
}
