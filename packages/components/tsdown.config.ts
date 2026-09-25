import { defineConfig } from 'tsdown';
import { libraryConfig } from '../../scripts/build/tsdown-preset.ts';

/**
 * The views loaded on first use (`src/shared/lazy-view.ts`), by component: the modules the
 * components import with a dynamic `import()`.
 */
const LAZY_VIEW =
  /[\\/]src[\\/](?:(updatemenus|sliders|rangeslider|selections)[\\/]view|rangeselector[\\/](rangeselector))\.ts$/;
/** Modules only those views import (the API commands of update menus and sliders). */
const LAZY_ONLY = /[\\/]src[\\/]updatemenus[\\/]commands\.ts$/;

/**
 * Chunk file names: the lazily loaded views are `controls-<component>-<hash>.js`, and code only
 * they share `controls-shared-<hash>.js`, so apps (and the size report,
 * `tests/bundle/size/entries.ts`) can tell them apart; other chunks keep rolldown's
 * `[name]-[hash].js`.
 */
function chunkFileNames(suffix: string) {
  return (chunk: { facadeModuleId: string | null; moduleIds: readonly string[] }): string => {
    const match = chunk.facadeModuleId ? LAZY_VIEW.exec(chunk.facadeModuleId) : null;
    const component = match?.[1] ?? match?.[2];
    if (component) return `controls-${component}-[hash]${suffix}`;
    const lazyOnly =
      chunk.moduleIds.length > 0 && chunk.moduleIds.every((id) => LAZY_ONLY.test(id));
    return lazyOnly ? `controls-shared-[hash]${suffix}` : `[name]-[hash]${suffix}`;
  };
}

/**
 * ESM + one bundled `index.d.ts` (ADR-015). `dist/index.js` has attribute-schema descriptions
 * stripped; `dist/index.development.js` keeps them (`development` export condition, ADR-020).
 * See scripts/build/tsdown-preset.ts.
 *
 * The views of the update menus, sliders, range selector, range slider and selections load on
 * first use (plan E21.6, `src/shared/lazy-view.ts`): nothing imports them statically, so rolldown
 * emits each as its own chunk (`dist/controls-*.js`), which app bundlers split out in turn and the
 * IIFE inlines. Code they share with the entry lands in shared chunks that `index.js` imports.
 */
const [production, development] = libraryConfig({ development: true }) as [
  Record<string, unknown>,
  Record<string, unknown>,
];

export default defineConfig([
  { ...production, outputOptions: { chunkFileNames: chunkFileNames('.js') } },
  {
    ...development,
    outputOptions: {
      ...(development['outputOptions'] as Record<string, unknown>),
      chunkFileNames: chunkFileNames('.development.js'),
    },
  },
]);
