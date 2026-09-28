import { mkdir, writeFile } from 'node:fs/promises';
import { defineConfig } from 'tsdown';
import { libraryConfig } from '../../scripts/build/tsdown-preset.ts';
import { allLocales } from './src/index.ts';
import type { LocaleModule } from '@mk7s/holochart-core';

const NOTICE =
  'Data from plotly.js lib/locales (MIT License, Copyright (c) 2016-2024 Plotly Technologies Inc.).';

/**
 * A `<script>` file for one or more locales, like plotly.js's `dist/plotly-locale-*.js`: it
 * registers them with the `Holochart` global of `holochart.iife.min.js` (load it first), or queues
 * them in `window.HolochartLocales` when that is not there yet (`Holochart.register(...HolochartLocales)`).
 */
function scriptFile(title: string, locales: readonly LocaleModule[]): string {
  const data = JSON.stringify(locales.length === 1 ? locales[0] : locales);
  return `/*! Holochart ${title}. ${NOTICE} */
(function () {
  var locales = [].concat(${data});
  if (typeof Holochart !== 'undefined' && Holochart.register) Holochart.register.apply(null, locales);
  else window.HolochartLocales = (window.HolochartLocales || []).concat(locales);
})();
`;
}

/** Write `dist/scripts/holochart-locale-<name>.js` per locale and `holochart-locales.js` (all). */
async function writeScripts(): Promise<void> {
  const dir = new URL('./dist/scripts/', import.meta.url);
  await mkdir(dir, { recursive: true });
  for (const locale of allLocales) {
    const file = `holochart-locale-${locale.name.toLowerCase()}.js`;
    await writeFile(new URL(file, dir), scriptFile(`locale ${locale.name}`, [locale]));
  }
  await writeFile(new URL('holochart-locales.js', dir), scriptFile('locales', allLocales));
}

/**
 * ESM + one bundled `index.d.ts` (ADR-015; see scripts/build/tsdown-preset.ts), plus the
 * `<script>` files of the IIFE build (`dist/scripts/`, see {@link scriptFile}).
 */
export default defineConfig(
  libraryConfig().map((config) => ({ ...config, onSuccess: writeScripts })),
);
