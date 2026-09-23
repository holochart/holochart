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
      exclude: [
        '**/*.test.ts',
        '**/index.ts',
        '**/*.glsl.ts',
        '**/*.d.ts',
        '**/__fixtures__/**',
        '**/__testing__/**',
      ],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      // Plan E20.1 targets. Trace calc thresholds (≥ 85%) get added as trace packages land (M1).
      thresholds: {
        'packages/core/src/**/*.ts': { lines: 90, functions: 90, branches: 90, statements: 90 },
      },
    },
  },
});
