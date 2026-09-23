import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: false, // declarations are emitted by tsc (tsup's dts step injects baseUrl, deprecated in TS 6)
  sourcemap: true,
  clean: true,
  external: [],
});
