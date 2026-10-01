import { expect, test } from '@playwright/test';
import { runIn } from './run.ts';

/**
 * Node consumers of the installed tarballs (`fixtures/node-esm`): every package imports in plain
 * Node ESM, without a DOM or a bundler, and the full bundle's key exports and figure pipeline work
 * (`check.mjs`); CommonJS gets the same module through require(esm) (`require.cjs`, backlog
 * decision 3).
 */
test('Node ESM: every package imports, key exports and the figure pipeline work', () => {
  expect(runIn('node-esm', 'node', ['check.mjs'])).toContain('node-esm: ok');
});

test('Node CommonJS: require() loads the ESM-only packages (require(esm))', () => {
  expect(runIn('node-esm', 'node', ['require.cjs'])).toContain('node-cjs: ok');
});
