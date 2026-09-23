import path from 'node:path';

/**
 * Bundle-size budgets (plan E21.1, §5 "Size tracking"). Single source of truth for
 * `tests/bundle/size/bundle.ts` (which builds one measurement bundle per entry) and
 * `.size-limit.ts` (which measures them). See docs/release/bundle-size.md.
 *
 * Sizes are minified + gzipped, in decimal kB (1 kB = 1000 bytes, size-limit's unit). Every ESM
 * entry is bundled from the packages' built `dist/` with all dependencies included except `three`
 * (a peer dependency, ADR-003), so a number is what that import adds to an app that already has
 * three. The IIFE bundles three itself (ADR-015) and has its own budget.
 */

export const ROOT = path.resolve(import.meta.dirname, '../../..');
/** Measurement bundles (gitignored via `dist/`). */
export const OUT_DIR = path.join(ROOT, 'tests/bundle/size/dist');

/** Built ESM entry of a workspace package, e.g. `packageDist('runtime')`. */
export function packageDist(dir: string): string {
  return path.join(ROOT, 'packages', dir, 'dist/index.js');
}

/** `export *` of a package, or named exports when every wanted name exists (see bundle.ts). */
export interface EntryImport {
  /** Directory under `packages/`. */
  pkg: string;
  /** Names a typical app imports. Omitted: the whole package (`export *`). */
  names?: readonly string[];
}

export interface SizeEntry {
  /** Stable id: output file name and key in the JSON report. */
  id: string;
  /** Label shown by size-limit and in the CI report. */
  name: string;
  /** Budget, e.g. `'90 kB'`. Omitted: measured and reported, but not gated. */
  limit?: string;
  /** What the entry re-exports (bundled by bundle.ts). */
  imports?: readonly EntryImport[];
  /** A prebuilt file measured as-is (relative to the repo root), instead of `imports`. */
  file?: string;
}

/** One entry per published package: the cost of `import … from '<package>'`. */
const PACKAGES: readonly SizeEntry[] = [
  { id: 'core', name: '@mk7s/holochart-core', imports: [{ pkg: 'core' }] },
  { id: 'render', name: '@mk7s/holochart-render', imports: [{ pkg: 'render' }] },
  { id: 'runtime', name: '@mk7s/holochart-runtime', imports: [{ pkg: 'runtime' }] },
  { id: 'components', name: '@mk7s/holochart-components', imports: [{ pkg: 'components' }] },
  {
    id: 'traces-basic',
    name: '@mk7s/holochart-traces-basic',
    imports: [{ pkg: 'traces-basic' }],
  },
  { id: 'themes', name: '@mk7s/holochart-themes', imports: [{ pkg: 'themes' }] },
];

export const SIZE_ENTRIES: readonly SizeEntry[] = [
  ...PACKAGES,
  {
    // Plan E21.1: `import { createChart, register } from '@mk7s/holochart-runtime';
    // import { scatter } from '@mk7s/holochart-traces-basic'; register(scatter);`
    id: 'partial-core-scatter',
    name: 'partial: core + scatter',
    // Raised from 90 kB after M1 wave 2 (measured 148.5 kB: ~40 kB is the SDF text engine). E21.5
    // (bundle diet) lazy-loads text and strips schema descriptions, then tightens this again.
    limit: '165 kB',
    imports: [
      { pkg: 'runtime', names: ['createChart', 'register'] },
      { pkg: 'traces-basic', names: ['scatter'] },
    ],
  },
  {
    // The future `holochart-basic` CDN variant: runtime, components, and the basic traces.
    id: 'partial-basic',
    name: 'partial: basic (runtime + components + traces-basic + themes)',
    // Raised from 150 kB after M1 wave 2 (measured 181 kB); see E21.5.
    limit: '200 kB',
    imports: [
      { pkg: 'runtime' },
      { pkg: 'components' },
      { pkg: 'traces-basic' },
      { pkg: 'themes' },
    ],
  },
  {
    id: 'full',
    name: '@mk7s/holochart (full, ESM)',
    limit: '450 kB',
    imports: [{ pkg: 'holochart' }],
  },
  {
    // Self-contained script-tag build: the full bundle plus three.js (~170-190 kB min+gz on its
    // own). Budget = full (450 kB) + a three.js allowance of 200 kB.
    id: 'iife',
    name: '@mk7s/holochart IIFE (includes three)',
    limit: '650 kB',
    file: 'packages/holochart/dist/holochart.iife.min.js',
  },
];

/** Path of the file size-limit measures for an entry, relative to the repo root. */
export function measuredFile(entry: SizeEntry): string {
  return entry.file ?? path.relative(ROOT, path.join(OUT_DIR, `${entry.id}.js`));
}

/** Written by bundle.ts next to the bundles: how each entry was actually built. */
export const MANIFEST = path.join(OUT_DIR, 'manifest.json');

export interface ManifestEntry {
  id: string;
  /** Set when wanted named exports don't exist yet and the entry fell back to `export *`. */
  note?: string;
}
