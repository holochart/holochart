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
 *
 * An ESM entry's size is its **initial** chunk (what loads before the page runs); code behind a
 * dynamic `import()` (the SDF text engine, E21.5) is measured separately as that entry's lazy
 * chunks (see bundle.ts), reported per entry and gated by a `lazyOf` row. The built-in default
 * font's faces (E2.18) are lazy chunks too, but each is measured on its own ({@link LAZY_PARTS}):
 * a page loads one face at a time, and only the faces its text uses.
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
  /** Measure the lazy (dynamically imported) chunks of the entry with this id, instead. */
  lazyOf?: string;
  /** With `lazyOf`: measure this part of the lazy chunks ({@link LAZY_PARTS}) instead. */
  lazyPart?: string;
}

/**
 * Lazy chunks measured separately from the rest of an entry's lazy code: the built-in default
 * font's faces (TeX Gyre Heros as `data:` URL modules, one chunk each). `lazyPart` of a chunk
 * whose modules are one font face, else `undefined`.
 */
export const LAZY_PARTS = ['font-regular', 'font-bold', 'font-italic', 'font-bolditalic'] as const;

const FONT_MODULE = /[\\/]texgyreheros-(regular|bold|italic|bolditalic)(?:-[\w-]+)?\.(?:js|ts)$/;

/** The {@link LAZY_PARTS} entry a module belongs to, if any. */
export function lazyPartOf(moduleId: string): string | undefined {
  const face = FONT_MODULE.exec(moduleId)?.[1];
  return face ? `font-${face}` : undefined;
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
    // Initial chunk only (the text engine is the lazy row below). 90 kB was set before the text
    // engine's weight was known; raised to 165 kB after M1 wave 2, then tightened to measured + ~10%
    // after the E21.5 diet (M2 wave 0: lazy text engine, stripped descriptions; 107.9 kB). Raised to
    // measured + ~10% after M2 wave 1 by decision (area fills, fonts, grid: 129.2 kB); E21.6 splits
    // the fill code out so scatter without fills doesn't load it.
    limit: '142 kB',
    imports: [
      { pkg: 'runtime', names: ['createChart', 'register'] },
      { pkg: 'traces-basic', names: ['scatter'] },
    ],
  },
  {
    // Plan E21.5: troika-three-text + bidi-js + webgl-sdf-generator + troika-worker-utils, loaded
    // with a dynamic import() on first text use; the same chunk for every entry that has text.
    // Measured 44.2 kB when split out (2026-09-23); budget = measured + ~10%.
    id: 'text-engine-lazy',
    name: 'text engine (lazy chunk of core + scatter)',
    limit: '49 kB',
    lazyOf: 'partial-core-scatter',
  },
  ...fontRows(),
  {
    // The future `holochart-basic` CDN variant: runtime, components, and the basic traces.
    id: 'partial-basic',
    name: 'partial: basic (runtime + components + traces-basic + themes)',
    // Initial chunk only. Raised from 150 kB to 200 / 215 kB in M1 (waves 2 and 3), then tightened
    // to measured + ~10% after the E21.5 diet (M2 wave 0: 154.1 kB), then raised to measured + ~10%
    // after M2 wave 1 by decision (pie, shapes, images, themes and colors: 192.9 kB).
    limit: '212 kB',
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

/**
 * Plan E2.18: the built-in default font (TeX Gyre Heros), one lazy chunk per face, loaded the first
 * time text needs that face (a chart with plain text loads only the regular face; charts without
 * text load none). The same chunks for every entry that has text. Each face is a base64 `data:`
 * URL of a ~135 kB OTF file: about 85 kB min+gz. Measured 2026-09-23; budget = measured + ~10%.
 */
function fontRows(): SizeEntry[] {
  const faces = [
    ['regular', 'regular', '95 kB'],
    ['bold', 'bold', '95 kB'],
    ['italic', 'italic', '98 kB'],
    ['bolditalic', 'bold italic', '95 kB'],
  ] as const;
  return faces.map(([face, label, limit]) => ({
    id: `font-${face}-lazy`,
    name: `default font, ${label} face (lazy chunk of core + scatter)`,
    limit,
    lazyOf: 'partial-core-scatter',
    lazyPart: `font-${face}`,
  }));
}

/**
 * Lazy chunks of an entry, concatenated (written by bundle.ts only when there are any): the rest
 * of its lazy code, or one of its {@link LAZY_PARTS}.
 */
export function lazyFile(id: string, part?: string): string {
  return path.join(OUT_DIR, part ? `${id}.lazy.${part}.js` : `${id}.lazy.js`);
}

/** Path of the file size-limit measures for an entry, relative to the repo root. */
export function measuredFile(entry: SizeEntry): string {
  if (entry.lazyOf) return path.relative(ROOT, lazyFile(entry.lazyOf, entry.lazyPart));
  return entry.file ?? path.relative(ROOT, path.join(OUT_DIR, `${entry.id}.js`));
}

/** Written by bundle.ts next to the bundles: how each entry was actually built. */
export const MANIFEST = path.join(OUT_DIR, 'manifest.json');

export interface ManifestEntry {
  id: string;
  /** Set when wanted named exports don't exist yet and the entry fell back to `export *`. */
  note?: string;
  /** Set when the entry has lazy chunks (in `lazyFile(id)`): how many, and which packages. */
  lazy?: { chunks: number; packages: string[] };
  /** Lazy chunks measured on their own (in `lazyFile(id, part)`): chunk count per part. */
  lazyParts?: Record<string, number>;
}
