/**
 * Automated accessibility audit (plan E20.8): axe-core over a sample of examples in a real
 * browser — every chart family, the DOM controls (legend, modebar, update menus, slider, range
 * selector, range slider), the visible data table, the keyboard focus target with its hover label
 * and live region, an open dropdown, and a light and a dark high-contrast theme.
 *
 * Each audit covers the chart only: the element the example renders into, plus a visible data
 * table the chart adds after its element. The sandbox's own chrome (example picker, stats
 * overlay) is not the library's and is left out; so are axe's page-level rules (landmarks, page
 * title, `lang`), which judge the host page.
 *
 * Rules: WCAG 2.0 / 2.1 A and AA, plus axe's best practices. What is drawn in the canvas (trace
 * colors, tick labels, titles, legend text) cannot be checked by axe: the canvas is `aria-hidden`
 * and described by the accessible mirror (a11y.spec.ts). DOM text over the canvas (slider labels,
 * the trace name beside a hover label) comes back as "incomplete" from the color-contrast rule
 * for the same reason; incomplete checks do not fail a test and are attached to its report.
 *
 * Any violation fails its test unless `ALLOWED` lists that rule, example and element, with the
 * reason. `AXE_STRICT=1` ignores the list, to see the known violations too:
 *
 *   AXE_STRICT=1 pnpm test:interaction axe.spec.ts
 */
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type { AxeResults, ContextObject, ImpactValue, Result, RunOptions } from 'axe-core';
import { TEST_CONTAINER_ID } from '../../apps/sandbox/src/test-protocol.ts';
import { openExample, parkPointer } from '../visual/harness.ts';
import { openInteraction } from './helpers.ts';

/** axe-core's browser build, injected into the page. */
const AXE_SCRIPT = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

/**
 * How an example is opened: `test` is the sandbox's test mode (`&test=1`, as the visual suite
 * opens it: no chrome, ready when `window.__exampleReady` resolves); `interaction` is the normal
 * sandbox at the example's test size, for examples tagged `no-visual-test`, which test mode does
 * not run and which say they are ready through `window.__interaction`.
 */
type Mode = 'test' | 'interaction';

interface Sample {
  id: string;
  mode: Mode;
  /** What the example adds to the sample. */
  covers: string;
}

const SAMPLES: readonly Sample[] = [
  { id: 'scatter/basic', mode: 'test', covers: 'scatter, legend, modebar' },
  { id: 'bar/grouped', mode: 'test', covers: 'bar' },
  { id: 'pie/donut', mode: 'test', covers: 'pie' },
  { id: 'heatmap/basic', mode: 'test', covers: 'heatmap, colorbar' },
  { id: 'histogram/overlay', mode: 'test', covers: 'histogram' },
  { id: 'box/grouped', mode: 'test', covers: 'box' },
  { id: 'sunburst/basic', mode: 'test', covers: 'sunburst' },
  { id: 'treemap/pathbar', mode: 'test', covers: 'treemap, path bar' },
  { id: 'sankey/basic', mode: 'test', covers: 'sankey' },
  { id: 'parcoords/basic', mode: 'test', covers: 'parallel coordinates' },
  { id: 'polar/radar', mode: 'test', covers: 'polar' },
  { id: 'scatter3d/basic', mode: 'test', covers: '3D scatter' },
  { id: 'surface/basic', mode: 'test', covers: 'surface' },
  { id: 'table/basic', mode: 'test', covers: 'table trace' },
  { id: 'indicator/gauge', mode: 'test', covers: 'indicator' },
  { id: 'timeseries/range-slider', mode: 'test', covers: 'range slider, range selector' },
  { id: 'accessibility/data-table', mode: 'test', covers: 'visible data table' },
  { id: 'accessibility/keyboard-focus', mode: 'test', covers: 'focused plot area, hover label' },
  { id: 'themes/high-contrast-dark', mode: 'test', covers: 'dark high-contrast theme' },
  { id: 'themes/plotly', mode: 'test', covers: 'light Plotly theme' },
  { id: '_dev/updatemenus-dropdown', mode: 'test', covers: 'dropdown update menus' },
  {
    id: '_dev/keyboard-navigation',
    mode: 'interaction',
    covers: 'legend, update menu buttons, slider, modebar, range selector',
  },
];

/** Examples audited again with a point selected from the keyboard (hover label, live region). */
const KEYBOARD_SAMPLES: readonly Sample[] = SAMPLES.filter((s) =>
  [
    '_dev/keyboard-navigation',
    'themes/plotly',
    'themes/high-contrast-dark',
    // Stops of traces whose keyboard code loads on first focus (S2.14): a hierarchy node, and a
    // box with one label per statistic.
    'sunburst/basic',
    'box/grouped',
  ].includes(s.id),
);

interface Allowed {
  /** axe rule id. */
  rule: string;
  /** Example id. */
  example: string;
  /** The failing element: a part of its axe target (CSS selector). Other elements still fail. */
  target: string;
  reason: string;
}

/**
 * Known violations, which need a change in the library (not in this file). Remove an entry with
 * the fix; do not add one for something a test can avoid.
 */
const ALLOWED: readonly Allowed[] = [
  // The built-in template's range selector (packages/core/src/templates/builtin.ts): 9 px text
  // #a4a7b5 on the pressed button's `activecolor` #3e3e4c is 4.39:1, under AA's 4.5:1.
  {
    rule: 'color-contrast',
    example: 'timeseries/range-slider',
    target: '.hc-rangeselector-btn--active',
    reason: 'built-in template: range selector text on activecolor is 4.39:1',
  },
  {
    rule: 'color-contrast',
    example: '_dev/keyboard-navigation',
    target: '.hc-rangeselector-btn--active',
    reason: 'built-in template: range selector text on activecolor is 4.39:1',
  },
  // Hover labels take the trace color as background and pick white or #444 for the text
  // (Plotly's rule, `contrastColor` in packages/runtime/src/fx/hover.ts): white on the plotly
  // theme's first colorway color #636efa is 4.08:1.
  {
    rule: 'color-contrast',
    example: 'themes/plotly',
    target: '.holochart-hoverlabel-text',
    reason: 'hover label text color (white or #444) on the trace color is 4.08:1',
  },
];

function allowedFor(rule: string, example: string, target: string): Allowed | undefined {
  if (process.env.AXE_STRICT) return undefined;
  return ALLOWED.find((a) => a.rule === rule && a.example === example && target.includes(a.target));
}

/** Open the example and wait for its first frame; returns the selector of its container. */
async function open(page: Page, sample: Sample): Promise<string> {
  if (sample.mode === 'interaction') {
    await openInteraction(page, sample.id);
    await parkPointer(page);
    return '.example';
  }
  const result = await openExample(page, sample.id);
  expect(result.skipped, `${sample.id} is tagged no-visual-test: open it as 'interaction'`).toBe(
    false,
  );
  await parkPointer(page);
  return `#${TEST_CONTAINER_ID}`;
}

/** Run axe on the example container and on data tables the chart added outside it. */
async function audit(page: Page, container: string): Promise<AxeResults> {
  const loaded = await page.evaluate(() => 'axe' in window);
  if (!loaded) await page.addScriptTag({ path: AXE_SCRIPT });
  return page.evaluate(
    async ([selector, tags]) => {
      const axe = (window as unknown as { axe: typeof import('axe-core') }).axe;
      const root = document.querySelector(selector);
      if (!root) throw new Error(`no ${selector} in the page`);
      const tables = [...document.querySelectorAll('.holochart-data-table')].filter(
        (table) => !root.contains(table),
      );
      const context: ContextObject = { include: [root, ...tables] };
      const options: RunOptions = {
        runOnly: { type: 'tag', values: [...tags] },
        resultTypes: ['violations', 'incomplete', 'passes'],
      };
      return axe.run(context, options);
    },
    [container, TAGS] as const,
  );
}

const IMPACT_ORDER: readonly (ImpactValue | undefined)[] = [
  'critical',
  'serious',
  'moderate',
  'minor',
];

function targetOf(node: Result['nodes'][number]): string {
  return node.target.map(String).join(' ');
}

/** A readable list of violations: rule, impact, help, and each node's target, HTML and failure. */
function describeViolations(violations: readonly Result[]): string {
  const sorted = [...violations].sort(
    (a, b) => IMPACT_ORDER.indexOf(a.impact) - IMPACT_ORDER.indexOf(b.impact),
  );
  return sorted
    .map((v) => {
      const nodes = v.nodes.map((node, i) => {
        const summary = (node.failureSummary ?? '').replace(/\n\s*/g, '\n       ');
        return [
          `  ${i + 1}. target: ${targetOf(node)}`,
          `     html:   ${node.html}`,
          `     ${summary}`,
        ].join('\n');
      });
      return [
        `[${v.impact ?? 'unknown'}] ${v.id}: ${v.help}`,
        `  ${v.helpUrl}`,
        `  tags: ${v.tags.join(', ')}`,
        ...nodes,
      ].join('\n');
    })
    .join('\n\n');
}

/** Fail on violations that `ALLOWED` does not list; attach the full result to the report. */
async function expectNoViolations(
  page: Page,
  container: string,
  example: string,
  state: string,
): Promise<void> {
  const results = await audit(page, container);
  // Something must have been checked: a missing or empty container would pass vacuously.
  expect(results.passes.length, 'rules axe could check and that passed').toBeGreaterThan(10);
  const allowed: string[] = [];
  const unexpected: Result[] = [];
  for (const violation of results.violations) {
    const nodes = violation.nodes.filter((node) => {
      const entry = allowedFor(violation.id, example, targetOf(node));
      if (entry) allowed.push(`${violation.id} at ${targetOf(node)}: ${entry.reason}`);
      return !entry;
    });
    if (nodes.length > 0) unexpected.push({ ...violation, nodes });
  }
  for (const description of allowed) {
    test.info().annotations.push({ type: 'axe allowed', description });
  }
  await test.info().attach(`axe: ${state}`, {
    contentType: 'application/json',
    body: JSON.stringify(
      {
        example,
        state,
        violations: results.violations,
        allowed,
        incomplete: results.incomplete,
        passes: results.passes.map((p) => p.id),
      },
      null,
      2,
    ),
  });
  const count = unexpected.reduce((n, v) => n + v.nodes.length, 0);
  expect(
    unexpected.map((v) => v.id),
    `axe: ${unexpected.length} rule(s) violated by ${count} element(s) in ${example} (${state})\n\n` +
      `${describeViolations(unexpected)}\n`,
  ).toEqual([]);
}

for (const sample of SAMPLES) {
  test(`${sample.id}: no axe violations after load (${sample.covers})`, async ({ page }) => {
    const container = await open(page, sample);
    await expectNoViolations(page, container, sample.id, 'after load');
  });
}

for (const sample of KEYBOARD_SAMPLES) {
  test(`${sample.id}: no axe violations with a keyboard-selected point`, async ({ page }) => {
    const container = await open(page, sample);
    // The plot area's focus target (packages/runtime/src/fx/focus.ts); ArrowRight selects the
    // first point: its hover label shows and the live region announces it.
    const target = page.getByRole('application', { name: /^Chart data/ });
    await target.focus();
    await expect(target).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.holochart-live')).toHaveText(/\S/);
    await expect(
      page.locator('.holochart-hoverlabel').filter({ visible: true }).first(),
    ).toBeVisible();
    await expectNoViolations(page, container, sample.id, 'keyboard-selected point');
  });
}

test('_dev/updatemenus-dropdown: no axe violations with a dropdown open', async ({ page }) => {
  const id = '_dev/updatemenus-dropdown';
  const container = await open(page, { id, mode: 'test', covers: '' });
  const header = page.locator(`${container} [aria-haspopup="listbox"]`).first();
  await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(`${container} [role="listbox"]`).first()).toBeVisible();
  await expectNoViolations(page, container, id, 'dropdown open');
});
