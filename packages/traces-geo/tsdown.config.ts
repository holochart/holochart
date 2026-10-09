import { defineConfig } from 'tsdown';
import { libraryConfig } from '../../scripts/build/tsdown-preset.ts';

/**
 * The basemap topologies `tools/geo-data` writes (ADR-024) and the country-name table of
 * `locationmode: 'country names'`, one lazy chunk each.
 */
const DATA = /[\\/]src[\\/](?:basemap[\\/]generated[\\/][\w-]+|geo[\\/]country-names)\.ts$/;

/**
 * ESM + one bundled `index.d.ts` (ADR-015). `dist/index.js` has attribute-schema descriptions
 * stripped; `dist/index.development.js` keeps them (`development` export condition, ADR-020).
 * The data chunks (`dist/base-110m.js`, …, `dist/country-names.js`; 1.3 MB together) are written once, without
 * sourcemaps, and both builds import them. See scripts/build/tsdown-preset.ts.
 */
export default defineConfig(libraryConfig({ development: true, dataModules: DATA }));
