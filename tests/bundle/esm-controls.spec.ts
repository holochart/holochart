import { expect, test } from '@playwright/test';
import { bundleApp, ORIGIN, serveApp } from './esm-app.ts';

/**
 * The controls' views through an app bundler (plan E21.6): the views of the update menus, sliders,
 * range selector, range slider and selections are lazy chunks (components' `dist/controls-*.js`).
 * A figure without them requests none; a figure with one requests only its chunks, and
 * `chart.ready` resolves once the control is drawn. Needs the packages built (`pnpm build`).
 */
/** The components whose views load on first use, each from a `controls-<name>` chunk. */
const COMPONENTS = ['updatemenus', 'sliders', 'rangeselector', 'rangeslider', 'selections'];

test('ESM: each control loads its view from its own chunk when a figure uses it', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const chunks = await bundleApp();
  const names = [...chunks.keys()];
  for (const component of COMPONENTS) {
    expect(names.filter((n) => n.startsWith(`controls-${component}-`))).toHaveLength(1);
  }

  const { errors, requests } = await serveApp(page, chunks);
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => 'Holochart' in window);
  /** The controls' chunks requested so far, without their hashes. */
  const parts = [...COMPONENTS, 'shared'];
  const controls = (): string[] => {
    const files = requests.map((url) => new URL(url).pathname.slice(1));
    const found = parts.filter((p) => files.some((f) => f.startsWith(`controls-${p}-`)));
    return found.map((p) => `controls-${p}`).sort();
  };

  /** Draw a chart, wait for `ready`, and report what its controls put in the DOM. */
  const draw = (layout: Record<string, unknown>) =>
    page.evaluate(async (l) => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped global */
      const hc = (window as any).Holochart;
      const el = document.getElementById('root')!;
      const chart = hc.createChart(el, {
        data: [{ x: ['2024-01-01', '2024-06-01', '2024-12-31'], y: [2, 1, 3] }],
        layout: { width: 480, height: 360, showlegend: false, ...l },
      });
      await chart.ready;
      const dom = {
        menuButtons: el.querySelectorAll('.hc-menus .hc-menu-btn').length,
        sliders: el.querySelectorAll('.hc-sliders .hc-slider').length,
        rangeButtons: el.querySelectorAll('.hc-rangeselector button').length,
        order: [...el.children].map((c) => c.className.split(' ')[0]).filter(Boolean),
      };
      chart.destroy();
      return dom;
    }, layout);

  const plain = await draw({});
  expect(plain).toMatchObject({ menuButtons: 0, sliders: 0, rangeButtons: 0 });
  expect(controls()).toEqual([]);

  const buttons = [
    { label: 'A', method: 'relayout', args: [{ 'title.text': 'A' }] },
    { label: 'B', method: 'relayout', args: [{ 'title.text': 'B' }] },
  ];
  const menus = await draw({ updatemenus: [{ type: 'buttons', buttons }] });
  expect(menus.menuButtons).toBe(2);
  // Mounted where a synchronously created view would be: before the modebar.
  expect(menus.order.indexOf('hc-menus')).toBeGreaterThanOrEqual(0);
  expect(menus.order.indexOf('hc-menus')).toBeLessThan(menus.order.indexOf('hc-modebar'));
  expect(controls()).toEqual(['controls-shared', 'controls-updatemenus']);

  const range = await draw({
    xaxis: {
      rangeslider: { visible: true },
      rangeselector: { buttons: [{ step: 'month', count: 1 }, { step: 'all' }] },
    },
  });
  expect(range.rangeButtons).toBe(2);
  expect(controls()).toEqual([
    'controls-rangeselector',
    'controls-rangeslider',
    'controls-shared',
    'controls-updatemenus',
  ]);

  expect(requests.filter((url) => !url.startsWith(`${ORIGIN}/`))).toEqual([]);
  expect(errors).toEqual([]);
});
