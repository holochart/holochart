import { defaultClientConditions, defineConfig } from 'vite';

// Dev sandbox (plan E0.3). Workspace packages resolve to their TypeScript sources through the
// `source` export condition (ADR-013); Vite's default client conditions are kept after it.
// `server.fs.allow` defaults to the pnpm workspace root, so `examples/` outside this app is served.
export default defineConfig({
  resolve: {
    conditions: ['source', ...defaultClientConditions],
  },
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Examples are code-split per id; three.js alone exceeds the default warning limit.
    chunkSizeWarningLimit: 2048,
  },
});
