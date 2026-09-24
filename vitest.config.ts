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
    // fast-check seeding (plan E20.1): FC_SEED / FC_PATH, seeds and replay commands on failure.
    setupFiles: ['tests/property/setup.ts'],
    // The schema property suites take ~0.2–1 s each alone, but a full parallel run on a busy
    // machine stretched them past Vitest's 5 s default (timeouts, not property failures; the
    // setup file prints their seeds). Hangs are still caught.
    testTimeout: 30_000,
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
