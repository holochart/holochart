import { fileURLToPath } from 'node:url';
import { defaultClientConditions, defineConfig, searchForWorkspaceRoot } from 'vite';

// Dev sandbox (plan E0.3). Workspace packages resolve to their TypeScript sources through the
// `source` export condition (ADR-013); Vite's default client conditions are kept after it.
// Allow the workspace examples and the local HoloGPU checkout used by the pixel globe demo.
export default defineConfig({
  resolve: {
    conditions: ['source', ...defaultClientConditions],
  },
  server: {
    port: 5173,
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        fileURLToPath(new URL('../../../research/hologpu', import.meta.url)),
      ],
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Examples are code-split per id; three.js alone exceeds the default warning limit.
    chunkSizeWarningLimit: 2048,
    rolldownOptions: { input: ['index.html', 'globe.html'] },
  },
});
