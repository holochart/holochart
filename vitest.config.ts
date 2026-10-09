import { readdirSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const NINETY = { lines: 90, functions: 90, branches: 90, statements: 90 };
const TRACE_CALC = { lines: 85, functions: 85, branches: 85, statements: 85 };

/** Every `packages/traces-*`, so a new trace package gets the calc threshold without an edit here. */
const tracePackages = readdirSync(new URL('./packages', import.meta.url)).filter((name) =>
  name.startsWith('traces-'),
);

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
      // Plan E20.1 targets, backlog S2.7. Each glob is checked on its own, over all its files.
      thresholds: {
        'packages/core/src/**/*.ts': NINETY,
        // Measured when added (S2.7): runtime 98.9 / 97.1 / 93.9 / 97.2 and render
        // 98.2 / 96.8 / 94.3 / 97.4 (% lines / functions / branches / statements). What the unit
        // suite leaves out is mostly of two kinds. Code that only runs in a browser: the
        // primitives' per-frame hooks (they need a WebGL renderer drawing) and waiting for
        // `document.fonts`; the visual and interaction suites run those in Chromium. And guards:
        // calls after dispose or destroy, fallbacks for values the defaults always fill.
        'packages/runtime/src/**/*.ts': NINETY,
        'packages/render/src/**/*.ts': NINETY,
        // Trace calc modules (`calc.ts`, `calc-*.ts`), per trace package.
        ...Object.fromEntries(
          tracePackages.map((name) => [`packages/${name}/src/**/calc*.ts`, TRACE_CALC]),
        ),
      },
    },
  },
});
