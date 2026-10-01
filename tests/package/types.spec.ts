import { test } from '@playwright/test';
import { runIn } from './run.ts';

/**
 * TypeScript consumers (`fixtures/types`): typical usage of the full bundle, a partial bundle,
 * Express, locales, three.js interop and the script-tag global (`@mk7s/holochart/global`) type-checks against the shipped `.d.ts` files with
 * `tsc --noEmit` (strict, `skipLibCheck: false`), with `three` and `@types/three` installed.
 */
for (const [resolution, config] of [
  ['bundler', 'tsconfig.json'],
  ['node16', 'tsconfig.node16.json'],
] as const) {
  test(`TypeScript (moduleResolution: ${resolution}): typical usage type-checks`, () => {
    runIn('types', 'tsc', ['-p', config, '--pretty', 'false']);
  });
}
