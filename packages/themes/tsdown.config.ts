import { defineConfig } from 'tsdown';

/**
 * ESM + one bundled `index.d.ts` (ADR-015). `dependencies` and `peerDependencies` (e.g. `three`,
 * ADR-003) are external automatically; declarations come from tsc via rolldown-plugin-dts.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  sourcemap: true,
  dts: true,
  clean: true,
});
