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
 * chunks (see bundle.ts), reported per entry and gated by a `lazyOf` row. Some lazy chunks are
 * measured on their own ({@link LAZY_PARTS}): the fill primitive (E21.6), loaded the first time a
 * chart draws a fill, the views of the controls (E21.6: update menus, sliders, range selector,
 * range slider, selection outlines), loaded the first time a figure uses one, the animation code
 * (E7.3, E7.4: transitions, frames, `animate`), loaded the first time a chart animates, and the
 * built-in default font's faces (E2.18), of which a page loads one at a time, and only the faces
 * its text uses.
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

/** The built-in default font's faces (TeX Gyre Heros as `data:` URL modules, one chunk each). */
export const FONT_PARTS = ['font-regular', 'font-bold', 'font-italic', 'font-bolditalic'] as const;

/**
 * Lazy chunks measured separately from the rest of an entry's lazy code (a chunk belongs to a part
 * when all its modules do, see {@link lazyPartOf}): the fill primitive (plan E21.6: render's
 * `dist/fill-lazy.js` and earcut, which only it uses), the controls' views (E21.6: components'
 * `dist/controls-*.js`, one chunk per component, summed), the animation code (E7.3, E7.4:
 * runtime's `dist/animation-*.js`), the line level of detail (E16.2: traces-basic's
 * `dist/line-lod-*.js`), the custom marker symbols and image sprites (E8.11: render's
 * `dist/custom-markers-*.js`), the style rules and functions (E8.5, E8.6: runtime's
 * `dist/styles-*.js`), the pattern fills (E8.10: render's `dist/pattern-code-*.js`), the sankey
 * flow particles (E13.5c: traces-hier's `dist/flow-*.js`), the accessibility code (E17.2, E17.3:
 * runtime's `dist/summary-*.js` and `dist/table-view-*.js`), the keyboard access (E6.5, E17.4:
 * runtime's `dist/keyboard-*.js`, components' `dist/legend-keys-*.js`), the legend scrolling
 * (E5.2: components' `dist/legend-scroll-*.js`) and the {@link FONT_PARTS}.
 */
export const LAZY_PARTS = [
  'fill',
  'controls',
  'animation',
  'lod',
  'markers',
  'style',
  'pattern',
  'flow',
  'a11y',
  'keyboard',
  'legend-scroll',
  ...FONT_PARTS,
] as const;

const FONT_MODULE = /[\\/]texgyreheros-(regular|bold|italic|bolditalic)(?:-[\w-]+)?\.(?:js|ts)$/;
/** render's lazily loaded fill chunk (built or from sources), and earcut. */
const FILL_MODULE =
  /[\\/](?:render[\\/](?:dist[\\/]fill-lazy\.js|src[\\/]primitives[\\/]fill(?:-lazy|-triangulate|-arrangement|\.glsl)?\.ts)|node_modules[\\/]earcut[\\/].*)$/;

/**
 * components' lazily loaded views and the code only they use (`src/shared/lazy-view.ts`): built
 * (`dist/controls-*.js`), or from sources.
 */
const CONTROLS_MODULE =
  /[\\/]components[\\/](?:dist[\\/]controls-[\w-]+\.js|src[\\/](?:(?:updatemenus|sliders|rangeslider|selections)[\\/]view|rangeselector[\\/](?:rangeselector|step)|updatemenus[\\/]commands|(?:rangeslider|selections)[\\/]geometry)\.ts)$/;

/**
 * runtime's lazily loaded animation code (transitions, frames, `animate`, easings; `src/anim/`):
 * built (`dist/animation-*.js`), or from sources (`types.ts` is type-only).
 */
const ANIMATION_MODULE =
  /[\\/]runtime[\\/](?:dist[\\/]animation-[\w-]+\.js|src[\\/]anim[\\/](?:animation|easing|frames|interpolate)\.ts)$/;

/**
 * traces-basic's lazily loaded line level of detail (the min/max pyramid of big lines, E16.2):
 * built (`dist/line-lod-*.js`), or from sources.
 */
const LOD_MODULE =
  /[\\/]traces-basic[\\/](?:dist[\\/]line-lod-[\w-]+\.js|src[\\/]scatter[\\/]line-lod\.ts)$/;

/**
 * render's lazily loaded custom-marker code (E8.11: the SDF generator, the symbol and image atlases
 * and their shader code): built (`dist/custom-markers-*.js`), or from sources.
 */
const MARKERS_MODULE =
  /[\\/]render[\\/](?:dist[\\/]custom-markers-[\w-]+\.js|src[\\/]markers[\\/]custom-(?:markers|sdf)\.ts)$/;

/**
 * runtime's lazily loaded style rules and style functions (E8.5, E8.6: compiling, validating and
 * applying rules, evaluating functions): built (`dist/styles-*.js`), or from sources.
 */
const STYLE_MODULE =
  /[\\/]runtime[\\/](?:dist[\\/]styles-[\w-]+\.js|src[\\/]style[\\/]styles\.ts)$/;

/**
 * render's lazily loaded pattern-fill code (E8.10: the pattern shader code and the attribute
 * writer): built (`dist/pattern-code-*.js`), or from sources.
 */
const PATTERN_MODULE =
  /[\\/]render[\\/](?:dist[\\/]pattern-code-[\w-]+\.js|src[\\/]primitives[\\/]pattern-code\.ts)$/;

/**
 * traces-hier's lazily loaded sankey flow particles (E13.5c: the particle primitive, its shaders
 * and the center-line sampling): built (`dist/flow-*.js`), or from sources.
 */
const FLOW_MODULE =
  /[\\/]traces-hier[\\/](?:dist[\\/]flow-[\w-]+\.js|src[\\/]sankey[\\/]flow\.ts)$/;

/**
 * runtime's lazily loaded accessibility code (E17.2, E17.3: the generated summaries and the visible
 * data table): built (`dist/summary-*.js`, `dist/table-view-*.js`), or from sources.
 */
const A11Y_MODULE =
  /[\\/]runtime[\\/](?:dist[\\/](?:summary|table-view)-[\w-]+\.js|src[\\/]a11y[\\/](?:summary|table-view)\.ts)$/;

/**
 * The lazily loaded keyboard access (E6.5, E17.4: the data navigation, loaded on the chart's first
 * focus, and the legend's key targets, loaded with the first legend): built
 * (`dist/keyboard-*.js`, `dist/legend-keys-*.js`), or from sources.
 */
const KEYBOARD_MODULE =
  /[\\/](?:runtime[\\/](?:dist[\\/]keyboard-[\w-]+\.js|src[\\/]fx[\\/]keyboard\.ts)|components[\\/](?:dist[\\/]legend-keys-[\w-]+\.js|src[\\/]legend[\\/]legend-keys\.ts))$/;

/**
 * The lazily loaded legend scrolling (E5.2: the scrolled legend's viewport, scrollbar and scroll
 * input, loaded the first time a legend is taller than its `maxheight`): built
 * (`dist/legend-scroll-*.js`), or from sources.
 */
const LEGEND_SCROLL_MODULE =
  /[\\/]components[\\/](?:dist[\\/]legend-scroll-[\w-]+\.js|src[\\/]legend[\\/]legend-scroll\.ts)$/;

/** The {@link LAZY_PARTS} entry a module belongs to, if any. */
export function lazyPartOf(moduleId: string): string | undefined {
  if (FILL_MODULE.test(moduleId)) return 'fill';
  if (CONTROLS_MODULE.test(moduleId)) return 'controls';
  if (ANIMATION_MODULE.test(moduleId)) return 'animation';
  if (LOD_MODULE.test(moduleId)) return 'lod';
  if (MARKERS_MODULE.test(moduleId)) return 'markers';
  if (STYLE_MODULE.test(moduleId)) return 'style';
  if (PATTERN_MODULE.test(moduleId)) return 'pattern';
  if (FLOW_MODULE.test(moduleId)) return 'flow';
  if (A11Y_MODULE.test(moduleId)) return 'a11y';
  if (KEYBOARD_MODULE.test(moduleId)) return 'keyboard';
  if (LEGEND_SCROLL_MODULE.test(moduleId)) return 'legend-scroll';
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
  {
    id: 'traces-stats',
    name: '@mk7s/holochart-traces-stats',
    imports: [{ pkg: 'traces-stats' }],
  },
  // Report-only (M4): the scientific traces, never in `basic`.
  { id: 'traces-sci', name: '@mk7s/holochart-traces-sci', imports: [{ pkg: 'traces-sci' }] },
  // Report-only (M4 wave 2): the financial traces, never in `basic`.
  {
    id: 'traces-finance',
    name: '@mk7s/holochart-traces-finance',
    imports: [{ pkg: 'traces-finance' }],
  },
  // Report-only (M5 wave 0): the hierarchical and flow traces, never in `basic`.
  {
    id: 'traces-hier',
    name: '@mk7s/holochart-traces-hier',
    imports: [{ pkg: 'traces-hier' }],
  },
  { id: 'themes', name: '@mk7s/holochart-themes', imports: [{ pkg: 'themes' }] },
  { id: 'express', name: '@mk7s/holochart-express', imports: [{ pkg: 'express' }] },
  // Report-only (M5 wave 0): every locale module at once; never in `basic` or the full bundle.
  { id: 'locales', name: '@mk7s/holochart-locales', imports: [{ pkg: 'locales' }] },
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
    // measured + ~10% after M2 wave 1 by decision (area fills, fonts, grid: 129.2 kB), and again after
    // M2 wave 2 (rich text, accessibility, export: 139.0 kB). E21.6 splits the fill code out so
    // scatter without fills doesn't load it. Raised to 157 kB for M5 by decision (M5 wave 1: locales
    // plumbing, style/a11y hooks: 152.1 kB on CI).
    limit: '157 kB',
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
  {
    // Plan E21.6: the fill primitive, earcut and the exact fill-rule code, loaded with a dynamic
    // import() the first time a chart draws a fill (scatter `fill`, stacked areas, shapes,
    // annotation boxes); the same chunk for every entry that draws fills. Measured 8.55 kB when
    // split out (2026-09-24); budget = measured + ~10%.
    id: 'fill-lazy',
    name: 'fill primitive (lazy chunk of core + scatter)',
    limit: '9.4 kB',
    lazyOf: 'partial-core-scatter',
    lazyPart: 'fill',
  },
  {
    // Plan E7.3 / E7.4 (M3 wave 3): transitions, frames and `animate` — the interpolation, easings,
    // frame queue and timing — loaded with a dynamic import() the first time a chart animates
    // (`animate`, `addFrames` / `deleteFrames`, or `react` with a `layout.transition`); the same
    // chunk for every entry with the runtime. Measured 5.81 kB when split out (2026-09-25);
    // budget = measured + ~10%.
    id: 'animation-lazy',
    name: 'animation (lazy chunk of core + scatter)',
    limit: '6.4 kB',
    lazyOf: 'partial-core-scatter',
    lazyPart: 'animation',
  },
  {
    // Plan E16.2 (M4 wave 0): the min/max pyramid of big scatter lines (100k points or more),
    // loaded with a dynamic import() the first time a chart draws one; the same chunk for every
    // entry with scatter. Measured 2.08 kB when split out (2026-09-27); budget = measured + ~10%.
    id: 'lod-lazy',
    name: 'line level of detail (lazy chunk of core + scatter)',
    limit: '2.3 kB',
    lazyOf: 'partial-core-scatter',
    lazyPart: 'lod',
  },
  {
    // Plan E8.11 (M4 wave 0): custom marker symbols and image sprites — the SVG-path SDF generator,
    // the symbol and image atlases, image and glyph loading and their shader code — loaded with a
    // dynamic import() the first time a custom symbol is registered or a marker image is drawn.
    // Measured 3.55 kB when split out (2026-09-27); budget = measured + ~10%.
    id: 'custom-markers-lazy',
    name: 'custom marker symbols and images (lazy chunk of core + scatter)',
    limit: '3.9 kB',
    lazyOf: 'partial-core-scatter',
    lazyPart: 'markers',
  },
  {
    // Plan E8.10 (M4 wave 2): pattern fills — Plotly's per-item pattern rules (fill modes, default
    // and contrast colors, legend sizes), the pattern shader code injected into the rect, arc and
    // fill shaders, and the pattern attribute writer — loaded with a dynamic import() the first
    // time a chart draws a pattern (`marker.pattern`, `fillpattern`). Measured 2.04 kB when split
    // out (2026-09-27); budget = measured + ~10%.
    id: 'pattern-lazy',
    name: 'pattern fills (lazy chunk of core + scatter)',
    limit: '2.25 kB',
    lazyOf: 'partial-core-scatter',
    lazyPart: 'pattern',
  },
  {
    // Plan E8.5 / E8.6 (M4 wave 0): style rules (compiling and validating `when` / `set`, applying
    // them per point) and style functions, loaded with a dynamic import() the first time a trace
    // has `styleRules` or a function-valued attribute. Budget = measured + ~10% when split out
    // (see the M4 wave 0 report).
    id: 'style-lazy',
    name: 'style rules and functions (lazy chunk of core + scatter)',
    limit: '4 kB',
    lazyOf: 'partial-core-scatter',
    lazyPart: 'style',
  },
  {
    // Plan E17.2 / E17.3 (M5 wave 1): the generated chart summaries (trend analysis, localized
    // sentence templates) and the visible, virtualized data table, loaded with a dynamic import()
    // after a chart's first description (summaries, on by default) or when `config.a11y.dataTable`
    // is `'visible'`; two chunks, summed here. Measured 5.25 kB when split out (2026-09-28);
    // budget = measured + ~10%.
    id: 'a11y-lazy',
    name: 'chart summaries and data table (lazy chunks of core + scatter)',
    limit: '5.8 kB',
    lazyOf: 'partial-core-scatter',
    lazyPart: 'a11y',
  },
  ...fontRows(),
  {
    // The future `holochart-basic` CDN variant: runtime, components, and the basic traces.
    id: 'partial-basic',
    name: 'partial: basic (runtime + components + traces-basic + themes)',
    // Initial chunk only. Raised from 150 kB to 200 / 215 kB in M1 (waves 2 and 3), then tightened
    // to measured + ~10% after the E21.5 diet (M2 wave 0: 154.1 kB), then raised to measured + ~10%
    // after M2 wave 1 by decision (pie, shapes, images, themes and colors: 192.9 kB), and again after
    // M2 wave 2 (table, rich text, accessibility, export, timeline: 212.5 kB). M3 wave 2 keeps it:
    // the controls' views load on first use (the row below; 243.5 → 232.2 kB). Raised to 238 kB after
    // M4 wave 0 by decision (style rules, custom markers and line LOD hooks, legend group titles,
    // bar periods: 235.7 kB; their heavy code is in the lazy rows above), and to 242 kB after M4
    // wave 2 by decision (patterns' plumbing, funnel axis defaults, legend parts: 238.6 kB on CI,
    // which measures ~0.3% more than a local macOS run; CI is the reference). Raised to 248 kB for
    // M5 by decision (M5 wave 1: locales, a11y config and summary hooks: ~241.6 kB on CI; wave 2 adds
    // keyboard, touch and focus handling).
    limit: '248 kB',
    imports: [
      { pkg: 'runtime' },
      { pkg: 'components' },
      { pkg: 'traces-basic' },
      { pkg: 'themes' },
    ],
  },
  {
    // Plan E21.6: the views of the update menus, sliders, range selector, range slider and
    // selection outlines (DOM controls and outlines most figures never show), each loaded with a
    // dynamic import() the first time a figure uses that component; one chunk per component,
    // summed here (a figure using all five). Measured 14.49 kB when split out (2026-09-25);
    // budget = measured + ~10%.
    id: 'controls-lazy',
    name: 'controls views (lazy chunks of basic)',
    limit: '16 kB',
    lazyOf: 'partial-basic',
    lazyPart: 'controls',
  },
  {
    // Plan E6.5 / E17.4 (M5 wave 2): keyboard navigation of the data (loaded on the chart's first
    // focus) and the legend's key targets (loaded with the first legend of an interactive chart);
    // two chunks, summed here. Measured 5.03 kB when split out (2026-09-28); budget = measured +
    // ~10%.
    id: 'keyboard-lazy',
    name: 'keyboard navigation and legend keys (lazy chunks of basic)',
    limit: '5.5 kB',
    lazyOf: 'partial-basic',
    lazyPart: 'keyboard',
  },
  {
    // Plan E5.2 (M5 wave 3): scrolling legends — the scrolled content's viewport, the scrollbar,
    // wheel, drag, touch and keyboard scrolling — loaded with a dynamic import() the first time a
    // legend is taller than its `maxheight`. Measured 1.62 kB when split out
    // (2026-09-28); budget = measured + ~10%.
    id: 'legend-scroll-lazy',
    name: 'legend scrolling (lazy chunk of basic)',
    limit: '1.8 kB',
    lazyOf: 'partial-basic',
    lazyPart: 'legend-scroll',
  },
  {
    id: 'full',
    name: '@mk7s/holochart (full, ESM)',
    // Raised from 450 kB to 475 kB for M5 by decision (M5 wave 1: treemap/icicle, Express hierarchy,
    // accessibility, sankey flow: ~451.6 kB on CI).
    limit: '475 kB',
    imports: [{ pkg: 'holochart' }],
  },
  {
    // Plan E13.5c (M5 wave 1): the sankey flow particles (`link.flow`) — the particle primitive,
    // its shaders and the center-line sampling — loaded with a dynamic import() the first time a
    // sankey sets `link.flow`. Measured 3.21 kB when split out (2026-09-28); budget = measured +
    // ~10%.
    id: 'flow-lazy',
    name: 'sankey flow particles (lazy chunk of full)',
    limit: '3.6 kB',
    lazyOf: 'full',
    lazyPart: 'flow',
  },
  {
    // Self-contained script-tag build: the full bundle plus three.js (~170-190 kB min+gz on its
    // own). Budget = full + a three.js allowance of ~200 kB: 650 kB, raised to 690 kB for M5 by
    // decision (M5 wave 1: ~666.8 kB on CI; the IIFE inlines every lazy chunk, so a11y summaries and
    // tables, sankey flow and patterns count here in full).
    id: 'iife',
    name: '@mk7s/holochart IIFE (includes three)',
    limit: '690 kB',
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
