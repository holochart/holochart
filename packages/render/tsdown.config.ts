import { defineConfig } from 'tsdown';
import { libraryConfig } from '../../scripts/build/tsdown-preset.ts';

/**
 * ESM + one bundled `index.d.ts` (ADR-015). The production strip-descriptions plugin (ADR-020)
 * runs here too; this package declares no attribute schemas, so it has no development build.
 * See scripts/build/tsdown-preset.ts.
 */
export default defineConfig(libraryConfig());
