import { expect, test } from '@playwright/test';
import { BUNDLE, ORIGIN, requireBuilt, servePage } from './iife-page.ts';

/**
 * Without WebGL2 (S1.8): the script-tag build shows an accessible note with the chart's text
 * description instead of a blank box, `newPlot` rejects with `WebGLUnavailableError`, `getChart`
 * finds nothing, and `purge` removes the note. WebGL is switched off by making
 * `canvas.getContext` return `null` for the WebGL context types before the page loads.
 */
test.beforeAll(() => requireBuilt(BUNDLE));

test('without WebGL2, newPlot rejects with WebGLUnavailableError and shows a fallback', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (/webgl/.test(type)) return null;
      return (getContext as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof getContext;
  });
  const { errors } = await servePage(page);
  await page.goto(`${ORIGIN}/`);

  const result = await page.evaluate(async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped global from the IIFE */
    const hc = (window as any).Holochart;
    const el = document.getElementById('root')!;
    const rejection = await hc
      .newPlot(el, [{ type: 'scatter', name: 'Sales', y: [1, 3, 2] }], {
        title: { text: 'Revenue' },
        width: 400,
        height: 300,
      })
      .then(
        () => null,
        (error: Error) => ({
          name: error.name,
          typed: error instanceof hc.WebGLUnavailableError,
          base: error instanceof hc.HolochartError,
        }),
      );
    const note = el.querySelector('.holochart-fallback');
    const state = {
      rejection,
      role: note?.getAttribute('role') ?? null,
      text: note?.textContent ?? '',
      visible: note instanceof HTMLElement && note.offsetHeight > 0,
      chart: hc.getChart(el) === undefined ? 'none' : 'registered',
      canvases: el.querySelectorAll('canvas').length,
    };
    hc.purge(el);
    return { ...state, afterPurge: el.childElementCount };
  });

  expect(result.rejection).toEqual({ name: 'WebGLUnavailableError', typed: true, base: true });
  expect(result.role).toBe('note');
  expect(result.text).toContain('needs WebGL2');
  expect(result.text).toContain('Revenue');
  expect(result.text).toContain('Sales');
  expect(result.visible).toBe(true);
  expect(result.chart).toBe('none');
  expect(result.canvases).toBe(0);
  expect(result.afterPurge).toBe(0);
  // three.js logs why it could not create the context; nothing else should fail.
  expect(errors.filter((e) => !/WebGL/i.test(e))).toEqual([]);
});
