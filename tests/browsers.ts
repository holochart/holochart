import type { PlaywrightTestOptions, PlaywrightWorkerOptions, Project } from '@playwright/test';

/**
 * Which browser a Playwright suite runs on (backlog S2.5). The default, locally and in PR CI, is
 * headless Chromium with software GL (ANGLE + SwiftShader): project `chromium-swiftshader`.
 * `HOLOCHART_BROWSER=firefox` or `=webkit` runs the same specs on Playwright's Firefox or WebKit
 * build instead (project `firefox` / `webkit`); the nightly workflow
 * (.github/workflows/browsers-nightly.yml) does that for the interaction and bundle suites, which
 * do not compare pixels against baselines. The visual suite stays Chromium-only: its baselines
 * are SwiftShader frames.
 *
 *   pnpm exec playwright install firefox webkit
 *   HOLOCHART_BROWSER=firefox pnpm test:interaction
 *   HOLOCHART_BROWSER=webkit pnpm test:bundle
 *
 * Specs that cannot run on a browser skip there with the reason (`test.skip(browserName !== ...)`),
 * and known product differences are `test.fixme` for that browser only; both are listed in
 * docs/release/browser-support.md.
 */
export type BrowserName = 'chromium' | 'firefox' | 'webkit';

const requested = process.env.HOLOCHART_BROWSER ?? 'chromium';
if (requested !== 'chromium' && requested !== 'firefox' && requested !== 'webkit') {
  throw new Error(`HOLOCHART_BROWSER must be chromium, firefox or webkit, not "${requested}"`);
}

/** The browser this run uses. */
export const BROWSER: BrowserName = requested;

/** The one project of this run, with the launch options its browser needs for WebGL2. */
export function browserProject(
  chromiumArgs: readonly string[],
): Project<PlaywrightTestOptions, PlaywrightWorkerOptions> {
  if (BROWSER === 'firefox') {
    return {
      name: 'firefox',
      use: {
        browserName: 'firefox',
        launchOptions: {
          firefoxUserPrefs: {
            // Headless Firefox on a machine without a GPU (CI) otherwise refuses WebGL.
            'webgl.force-enabled': true,
            'webgl.disabled': false,
          },
        },
      },
    };
  }
  if (BROWSER === 'webkit') return { name: 'webkit', use: { browserName: 'webkit' } };
  return {
    name: 'chromium-swiftshader',
    use: { browserName: 'chromium', launchOptions: { args: [...chromiumArgs] } },
  };
}
