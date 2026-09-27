import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction } from './helpers.ts';

/**
 * Indicator transitions (plan E12.7, E7.3) on `indicator/interaction`: an angular gauge (trace 0)
 * and a bullet gauge (trace 1), both at 100 on a 0–1000 axis. `react` with a `layout.transition`
 * to 900 counts the drawn numbers up frame by frame and settles exactly on the new value.
 */
const EXAMPLE = 'indicator/interaction';

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

interface Run {
  /** The drawn number of each trace, sampled every animation frame while transitioning. */
  samples: [string, string][];
  /** After the transition. */
  final: [string, string];
  values: unknown[];
}

/** Start a transition to `value` and sample the drawn numbers every frame until it settles. */
function transitionTo(page: Page, value: number, duration: number): Promise<Run> {
  return page.evaluate(
    async ([to, ms]) => {
      /* eslint-disable @typescript-eslint/no-explicit-any -- untyped hook and troika internals */
      const chart = (window as any).__interaction.chart;
      /** The largest text a trace draws: its number. */
      const number = (index: number): string => {
        let best = '';
        let size = -1;
        for (const root of chart.getTraceObjects(index)) {
          root.traverse((object: any) => {
            if (object.name !== 'holochart:text-batch') return;
            for (const text of object._members.keys()) {
              if (text.fontSize > size) {
                size = text.fontSize;
                best = String(text.text);
              }
            }
          });
        }
        return best;
      };
      const figure = JSON.parse(JSON.stringify({ data: chart.data, layout: chart.layout }));
      figure.data[0].value = to;
      figure.data[1].value = to;
      figure.layout.transition = { duration: ms, easing: 'linear' };
      const samples: [string, string][] = [];
      let settled = false;
      const done = chart.react(figure).then(() => (settled = true));
      while (!settled) {
        await new Promise((r) => requestAnimationFrame(r));
        samples.push([number(0), number(1)]);
      }
      await done;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return {
        samples,
        final: [number(0), number(1)] as [string, string],
        values: chart.fullData.map((t: any) => t.value),
      };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    },
    [value, duration] as const,
  );
}

test('react with a transition counts the numbers up and settles on the new value', async ({
  page,
}) => {
  const run = await transitionTo(page, 900, 1200);
  expect(run.final).toEqual(['900', '900']);
  expect(run.values).toEqual([900, 900]);
  for (const trace of [0, 1]) {
    const shown = run.samples.map((s) => Number(s[trace]));
    // In-between values were drawn, and they only went up.
    expect(shown.some((v) => v > 100 && v < 900)).toBe(true);
    for (let i = 1; i < shown.length; i++) expect(shown[i]).toBeGreaterThanOrEqual(shown[i - 1]!);
  }
  const names = (await events(page)).map((e) => e.name);
  expect(names).toEqual(['transitioning', 'transitioned']);
});

test('a new transition interrupts the running one and settles on its value', async ({ page }) => {
  // Start a long transition up, then go down before it ends.
  await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any -- untyped hook */
    const chart = (window as any).__interaction.chart;
    const figure = JSON.parse(JSON.stringify({ data: chart.data, layout: chart.layout }));
    figure.data[0].value = 1000;
    figure.layout.transition = { duration: 5000, easing: 'linear' };
    void chart.react(figure).catch(() => undefined);
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });
  await expect.poll(async () => (await events(page)).map((e) => e.name)).toContain('transitioning');
  const run = await transitionTo(page, 50, 300);
  expect(run.final).toEqual(['50', '50']);
  expect(run.values).toEqual([50, 50]);
});
