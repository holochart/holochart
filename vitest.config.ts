import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Resolve workspace packages to their TypeScript sources (see package.json "source" export condition).
    conditions: ['source'],
  },
  // Tests run in Vite's SSR environment, which has its own resolve conditions; without these,
  // workspace packages resolve to their (possibly stale or missing) dist builds.
  ssr: {
    resolve: {
      conditions: ['source'],
      externalConditions: ['source'],
    },
  },
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'tools/*/src/**/*.test.ts',
      // Repo tooling: lint rules, visual-diff helpers (Playwright specs are *.spec.ts, not run here).
      'tests/**/*.test.ts',
    ],
    environment: 'node',
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts', '**/*.glsl.ts', '**/*.d.ts'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      // Plan E20.1 targets: core ≥ 90%, trace calc ≥ 85%. Disabled until the packages are
      // populated (M0); enable by uncommenting. Paths are globs relative to the repo root.
      // thresholds: {
      //   'packages/core/src/**/*.ts': { lines: 90, functions: 90, branches: 90, statements: 90 },
      //   'packages/traces-*/src/**/calc*.ts': { lines: 85, functions: 85, branches: 85, statements: 85 },
      // },
    },
  },
});
