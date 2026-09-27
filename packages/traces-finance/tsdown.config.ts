import { defineConfig } from 'tsdown';
import { libraryConfig } from '../../scripts/build/tsdown-preset.ts';

/**
 * ESM + one bundled `index.d.ts` (ADR-015). `dist/index.js` has attribute-schema descriptions
 * stripped; `dist/index.development.js` keeps them (`development` export condition, ADR-020).
 * See scripts/build/tsdown-preset.ts.
 */
export default defineConfig(libraryConfig({ development: true }));
