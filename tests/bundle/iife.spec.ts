import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  BUNDLE,
  DIST,
  fontRequests,
  mapSources,
  ORIGIN,
  requireBuilt,
  SCRIPT_PATH,
  servePage,
} from './iife-page.ts';

/**
 * Smoke test for the CDN build: `packages/holochart/dist/holochart.iife.min.js` must be
 * self-contained (three.js bundled, no imports or extra network requests) and expose the full API
 * but the 3D package (the `holochart-3d.iife.min.js` add-on, `iife-3d.spec.ts`) as
 * `window.Holochart`. Its only other files are the built-in default font's faces in `dist/fonts/`
 * (plan E2.18), fetched next to the script when text first needs them.
 */
test.beforeAll(() => requireBuilt(BUNDLE));

test('IIFE exposes window.Holochart and renders with the bundled three.js', async ({ page }) => {
  const { errors, requests } = await servePage(page);
  await page.goto(`${ORIGIN}/`);

  const api = await page.evaluate(() => {
    const hc = (window as unknown as { Holochart?: Record<string, unknown> }).Holochart;
    if (!hc) return null;
    const render = hc.render as Record<string, unknown> | undefined;
    return {
      keys: Object.keys(hc).length,
      supplyDefaults: typeof hc.supplyDefaults,
      validate: typeof hc.validate,
      createRegistry: typeof hc.createRegistry,
      attr: typeof hc.attr,
      createRenderRoot: typeof render?.createRenderRoot,
      expressScatter: typeof (hc.express as Record<string, unknown> | undefined)?.scatter,
    };
  });
  expect(api).not.toBeNull();
  expect(api).toMatchObject({
    supplyDefaults: 'function',
    validate: 'function',
    createRegistry: 'function',
    attr: 'object',
    createRenderRoot: 'function',
    expressScatter: 'function',
  });

  // Exercise core (figure pipeline) and render (WebGL through the bundled three.js).
  const result = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any -- untyped global from the IIFE */
    const hc = (window as any).Holochart;
    const registry = hc.createRegistry();
    const figure = { data: [], layout: { width: 320, height: 200 } };
    const { fullLayout } = hc.supplyDefaults(figure, registry);
    const issues = hc.validate(figure.data, figure.layout, registry);

    const container = document.getElementById('root')!;
    const root = hc.render.createRenderRoot(container, {
      width: 16,
      height: 16,
      pixelRatio: 1,
      responsive: false,
      background: [1, 0, 0, 1],
      preserveDrawingBuffer: true,
    });
    root.renderNow();
    const probe = document.createElement('canvas');
    probe.width = probe.height = 16;
    const ctx = probe.getContext('2d')!;
    ctx.drawImage(root.canvas, 0, 0);
    const pixel = Array.from(ctx.getImageData(8, 8, 1, 1).data);
    const isWebGL2 = root.renderer.getContext() instanceof WebGL2RenderingContext;
    root.destroy();
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return { width: fullLayout.width, issues: issues.length, pixel, isWebGL2 };
  });

  expect(result).toEqual({ width: 320, issues: 0, pixel: [255, 0, 0, 255], isWebGL2: true });

  // The SDF text engine is behind a dynamic import() (plan E21.5). The IIFE cannot load chunks, so
  // the build inlines it: loading it must work without fetching anything (no chunk is served).
  const engine = await page.evaluate(async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped global from the IIFE */
    await (window as any).Holochart.render.preloadTextEngine();
    return 'loaded';
  });
  expect(engine).toBe('loaded');
  // Same for the fill code (plan E21.6).
  const fill = await page.evaluate(async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped global from the IIFE */
    const render = (window as any).Holochart.render;
    await render.preloadFillPrimitive();
    return render.fillPrimitiveLoaded() as boolean;
  });
  expect(fill).toBe(true);
  expect(errors).toEqual([]);
  // Self-contained: nothing is fetched beyond the page's own files, and no font without text.
  expect(requests.filter((url) => !url.startsWith(`${ORIGIN}/`))).toEqual([]);
  expect(fontRequests(requests)).toEqual([]);

  // The sourcemap is served next to the bundle and points at TypeScript sources.
  const sources = mapSources(BUNDLE);
  expect(sources.some((s) => s.endsWith('core/src/defaults/supply-defaults.ts'))).toBe(true);
  expect(sources.some((s) => s.includes('/three/'))).toBe(true);
});

test('IIFE is the 2D bundle: no 3D code, and 3D loads only with the add-on', async ({ page }) => {
  // The 3D package and render's 3D chunks are in the add-on only (`iife-3d.spec.ts`); render's
  // loaders of those chunks stay (public API), asking the add-on for them.
  const sources = mapSources(BUNDLE);
  const threeD = sources.filter((s) =>
    /traces-3d\/|primitives\/(?:mesh(?!-loader)|lighting|line3d|markers3d|spheres|depth-sort|blend3d)/.test(
      s,
    ),
  );
  expect(threeD).toEqual([]);
  expect(readFileSync(resolve(DIST, BUNDLE), 'utf8')).not.toContain('aspectmode'); // scene layout (3D only)

  const { errors } = await servePage(page);
  await page.goto(`${ORIGIN}/`);
  const state = await page.evaluate(async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped global from the IIFE */
    const hc = (window as any).Holochart;
    const mesh = await hc.render.loadMeshModule().then(
      () => 'loaded',
      (error: Error) => error.message,
    );
    return {
      traces3d: typeof hc.traces3d,
      sceneComponent: hc.registry.getComponent('scene') === undefined,
      host: typeof hc.__iife?.provideLazy3D,
      mesh,
    };
  });
  expect(state).toEqual({
    traces3d: 'undefined',
    sceneComponent: true,
    host: 'function',
    mesh: expect.stringContaining('holochart-3d.iife.min.js'),
  });
  expect(errors).toEqual([]);
});

test('IIFE draws text with the shipped default font, loading only the faces it uses', async ({
  page,
}) => {
  const { errors, requests } = await servePage(page);
  await page.goto(`${ORIGIN}/`);
  const fontFile = (face: string) => `${ORIGIN}${SCRIPT_PATH.replace(BUNDLE, `fonts/${face}`)}`;

  // A chart without any text loads no font.
  await page.evaluate(async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped global from the IIFE */
    const hc = (window as any).Holochart;
    const chart = hc.createChart(document.getElementById('root'), {
      data: [{ x: [1, 2, 3], y: [2, 1, 3], mode: 'markers' }],
      layout: {
        width: 240,
        height: 160,
        showlegend: false,
        xaxis: { visible: false },
        yaxis: { visible: false },
      },
    });
    await chart.ready;
    chart.destroy();
  });
  expect(fontRequests(requests)).toEqual([]);

  // Text in an unregistered Helvetica-style family: drawn and measured with TeX Gyre Heros.
  const drawn = await page.evaluate(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any -- untyped global and troika internals */
    const hc = (window as any).Holochart;
    const family = "'Helvetica Neue', Helvetica, Arial, sans-serif";
    const chart = hc.createChart(document.getElementById('root'), {
      data: [{ x: [1, 2, 3], y: [2, 1, 3], name: 'Revenue' }],
      layout: { width: 400, height: 300, font: { family }, title: { text: 'Quarterly revenue' } },
    });
    await chart.ready;
    /** Every troika label: its font file and whether it has been typeset. */
    const labels = (): { text: string; font: string; typeset: boolean }[] => {
      const out: { text: string; font: string; typeset: boolean }[] = [];
      for (const viewport of chart.three.viewports) {
        viewport.scene.traverse((object: any) => {
          if (object.name !== 'holochart:text-batch') return;
          for (const text of object._members.keys()) {
            out.push({ text: text.text, font: text.font, typeset: Boolean(text.textRenderInfo) });
          }
        });
      }
      return out;
    };
    const plain = labels();
    // The metrics oracle measures with the loaded shipped face, not a system font.
    const faces = [...(document as any).fonts]
      .filter((f: FontFace) => f.family.replace(/"/g, '') === 'holochart-builtin-default')
      .map((f: FontFace) => `${f.weight} ${f.style} ${f.status}`);
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = '100px "holochart-builtin-default"';
    const canvasWidth = ctx.measureText('Quarterly revenue').width;
    const oracleWidth = hc.render.measureText('Quarterly revenue', { family, size: 100 }).width;

    await chart.relayout({ 'title.font.weight': 'bold' });
    const bold = labels().filter((l) => l.text === 'Quarterly revenue');
    chart.destroy();
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return { plain, faces, canvasWidth, oracleWidth, bold };
  });

  expect(drawn.plain.length).toBeGreaterThan(3); // title, legend, tick labels
  expect(drawn.plain.map((l) => l.text)).toContain('Quarterly revenue');
  for (const label of drawn.plain) {
    expect(label).toMatchObject({ font: fontFile('texgyreheros-regular.otf'), typeset: true });
  }
  expect(drawn.faces).toEqual(['400 normal loaded']);
  expect(drawn.oracleWidth).toBeCloseTo(drawn.canvasWidth, 3);
  expect(drawn.bold).toEqual([
    { text: 'Quarterly revenue', font: fontFile('texgyreheros-bold.otf'), typeset: true },
  ]);

  // Only the faces used were fetched, from next to the script; nothing else left the page.
  expect([...new Set(fontRequests(requests))].sort()).toEqual([
    'fonts/texgyreheros-bold.otf',
    'fonts/texgyreheros-regular.otf',
  ]);
  expect(requests.filter((url) => !url.startsWith(`${ORIGIN}/`))).toEqual([]);
  expect(errors).toEqual([]);
});

test('IIFE draws the controls whose views load on first use (inlined)', async ({ page }) => {
  const { errors, requests } = await servePage(page);
  await page.goto(`${ORIGIN}/`);
  // Update menus and sliders (plan E21.6): their views are behind a dynamic import() that the
  // single-file build inlines, so they draw by `chart.ready` without fetching anything.
  const dom = await page.evaluate(async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped global from the IIFE */
    const hc = (window as any).Holochart;
    const el = document.getElementById('root')!;
    const buttons = [
      { label: 'A', method: 'relayout', args: [{ 'title.text': 'A' }] },
      { label: 'B', method: 'relayout', args: [{ 'title.text': 'B' }] },
    ];
    const steps = [
      { label: 'one', method: 'skip' },
      { label: 'two', method: 'skip' },
    ];
    const chart = hc.createChart(el, {
      data: [{ x: [1, 2, 3], y: [2, 1, 3] }],
      layout: {
        width: 400,
        height: 300,
        updatemenus: [{ type: 'buttons', buttons }],
        sliders: [{ steps }],
      },
    });
    await chart.ready;
    const out = {
      menuButtons: el.querySelectorAll('.hc-menus .hc-menu-btn').length,
      sliders: el.querySelectorAll('.hc-sliders .hc-slider').length,
      order: [...el.children].map((c) => c.className.split(' ')[0]).filter(Boolean),
    };
    chart.destroy();
    return out;
  });
  expect(dom.menuButtons).toBe(2);
  expect(dom.sliders).toBe(1);
  expect(dom.order.indexOf('hc-menus')).toBeLessThan(dom.order.indexOf('hc-sliders'));
  expect(dom.order.indexOf('hc-sliders')).toBeLessThan(dom.order.indexOf('hc-modebar'));
  // Nothing but the script and the font faces the text uses.
  expect(requests.filter((url) => !url.startsWith(`${ORIGIN}/`))).toEqual([]);
  expect(requests.filter((url) => url.endsWith('.js'))).toEqual([`${ORIGIN}${SCRIPT_PATH}`]);
  expect(errors).toEqual([]);
});
