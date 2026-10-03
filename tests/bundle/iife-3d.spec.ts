import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import {
  BUNDLE,
  BUNDLE_3D,
  DIST,
  mapSources,
  ORIGIN,
  requireBuilt,
  servePage,
} from './iife-page.ts';

/**
 * The 3D add-on of the script-tag build (ADR-015): `holochart-3d.iife.min.js`, loaded after
 * `holochart.iife.min.js`, registers the 3D scene into the main script's registry, adds the 3D
 * package's exports to `window.Holochart` and provides render's lazily loaded 3D chunks to the main
 * script's loaders — with the main script's three.js, runtime and render, never copies of its own.
 */
test.beforeAll(() => requireBuilt(BUNDLE, BUNDLE_3D));

test('3D add-on bundles only 3D code', () => {
  const sources = mapSources(BUNDLE_3D);
  const shared = sources.filter(
    (s) =>
      !/(?:traces-3d\/src\/|render\/src\/primitives\/|render\/src\/precision\.ts$|^\.\.\/src\/iife-3d\.ts$|^\.\.\/src\/view3d\/view\.ts$)/.test(
        s,
      ),
  );
  expect(shared).toEqual([]);
  expect(sources.some((s) => s.endsWith('traces-3d/src/scene/component.ts'))).toBe(true);
  expect(sources.some((s) => s.endsWith('render/src/primitives/mesh.ts'))).toBe(true);
  // The 2.5D view component's view (`layout.view3d`) comes with render's 2.5D chunk.
  expect(sources.some((s) => s.endsWith('src/view3d/view.ts'))).toBe(true);
  // No three.js (its duplicate-instance warning lives in its core module), no render root.
  const code = readFileSync(resolve(DIST, BUNDLE_3D), 'utf8');
  expect(code).not.toContain('Multiple instances of Three.js');
  expect(sources.filter((s) => s.includes('/three/') || s.includes('render-root'))).toEqual([]);
});

test('3D add-on draws a scene with the main script’s three.js and render', async ({
  page,
  browserName,
}) => {
  // Known issue (docs/release/browser-support.md, F1): Firefox logs the driver's link warning for
  // the `holochart:mesh` program ("Output of vertex shader ... not read by fragment shader"), which
  // three reports with console.warn. The scene draws.
  test.fixme(browserName === 'firefox', 'F1: mesh shader link warning on Firefox');
  const { errors, warnings, requests } = await servePage(page, [BUNDLE, BUNDLE_3D]);
  await page.goto(`${ORIGIN}/`);

  const result = await page.evaluate(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any -- untyped globals from the IIFEs */
    const hc = (window as any).Holochart;
    const three = hc.__iife.three;
    const exports = {
      // The scene component and the trace modules (M6 wave 1: `scatter3d` and more).
      traces3d: Array.isArray(hc.traces3d) && hc.traces3d.includes(hc.scatter3d),
      scene: hc.registry.getComponent('scene') === hc.sceneComponent,
      functions: [
        'acquireScene',
        'sceneOf',
        'sceneScales',
        'sceneExtent',
        'buildSceneLayout',
      ].filter((name) => typeof hc[name] !== 'function'),
    };

    // A minimal 3D trace on the scene contract (like examples/_lib/scene-points.ts): a flat red
    // quad through the middle of the axis box, drawn by render's lazily loaded mesh primitive,
    // which the add-on provided to the main script's loader.
    let lazy: any;
    hc.register({
      type: 'testquad3d',
      categories: ['gl3d'],
      schema: hc.attr.object({ scene: hc.sceneIdAttribute }),
      meta: { description: 'test' },
      supplyDefaults(_in: unknown, _out: unknown, ctx: any) {
        ctx.coerce('scene');
      },
      subplotDomain: hc.sceneSubplotDomain,
      crossTraceLayout: hc.sceneCrossTraceLayout,
      calc() {
        const unit = hc.sceneExtent(Float64Array.of(0, 1));
        return { sceneExtremes: { x: unit, y: unit, z: unit } };
      },
      plot: {
        create(ctx: any) {
          const scene = hc.acquireScene(ctx, hc.sceneOf(ctx.trace), ctx.calc.scene);
          const corners = [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ].flatMap(([x, y]) => scene.toWorld(x, y, 0.5));
          lazy = hc.render.createLazyMeshPrimitive(ctx.primitives, {
            positions: Float32Array.from(corners),
            indices: Uint32Array.of(0, 1, 2, 0, 2, 3),
            color: [1, 0, 0, 1],
            material: { type: 'flat' },
          });
          ctx.add(lazy, scene.viewport);
          return { update() {}, dispose() {} };
        },
      },
    });
    const el = document.getElementById('root')!;
    const chart = hc.createChart(el, {
      data: [{ type: 'testquad3d' }],
      layout: { width: 320, height: 320, margin: { l: 0, r: 0, t: 0, b: 0 }, showlegend: false },
    });
    await chart.ready;
    chart.three.renderer.domElement.id = 'scene-canvas';

    const objects: any[] = [];
    for (const viewport of chart.three.viewports)
      viewport.scene.traverse((o: any) => objects.push(o));
    const walls = objects.find((o) => o.renderOrder === -3);
    const lines = objects.find((o) => o.renderOrder === -2);
    const lm3d = await hc.render.loadLinesMarkers3D();
    const drawn = {
      exports,
      // The add-on's objects are the main script's three.js classes.
      allObject3D: objects.every((o) => o instanceof three.Object3D),
      walls:
        walls instanceof three.Mesh &&
        walls.material instanceof three.MeshBasicMaterial &&
        walls.geometry.getAttribute('position')?.count > 0,
      lines:
        lines instanceof three.LineSegments && lines.geometry.getAttribute('position')?.count > 0,
      // The mesh chunk came from the add-on through the main script's loader (one loader state).
      meshLoaded: hc.render.meshModuleLoaded() !== null && lazy.mesh !== null,
      mesh:
        lazy.object instanceof three.Mesh &&
        lazy.object.material instanceof three.ShaderMaterial &&
        lazy.object.geometry instanceof three.BufferGeometry &&
        objects.includes(lazy.object),
      linesMarkers3D:
        typeof lm3d.createLine3D === 'function' && hc.render.linesMarkers3DModule() === lm3d,
      // One three.js on the page: it registers its revision once.
      threeRevision: (window as any).__THREE__ === three.REVISION,
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return drawn;
  });

  expect(result).toEqual({
    exports: { traces3d: true, scene: true, functions: [] },
    allObject3D: true,
    walls: true,
    lines: true,
    meshLoaded: true,
    mesh: true,
    linesMarkers3D: true,
    threeRevision: true,
  });

  // The quad fills the middle of the scene, flat red.
  const png = PNG.sync.read(await page.locator('#scene-canvas').screenshot());
  const i = (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4;
  const [r, g, b] = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
  expect(r).toBeGreaterThan(200);
  expect(Math.max(g, b)).toBeLessThan(60);

  expect(errors).toEqual([]);
  expect(warnings.filter((w) => /three/i.test(w))).toEqual([]);
  // Nothing but the two scripts and the font faces the text uses.
  expect(requests.filter((url) => !url.startsWith(`${ORIGIN}/`))).toEqual([]);
  expect(requests.filter((url) => url.endsWith('.js')).map((url) => url.split('/').pop())).toEqual([
    BUNDLE,
    BUNDLE_3D,
  ]);
});

test('3D add-on fails loudly without the main script, and loads once', async ({ page }) => {
  const alone = await servePage(page, [BUNDLE_3D]);
  await page.goto(`${ORIGIN}/`);
  expect(alone.errors).toEqual([expect.stringContaining('needs holochart.iife.min.js')]);

  const twice = await servePage(page, [BUNDLE, BUNDLE_3D, BUNDLE_3D]);
  await page.goto(`${ORIGIN}/`);
  expect(twice.errors).toEqual([]);
  expect(twice.warnings).toEqual([expect.stringContaining('loaded twice')]);
  const scenes = await page.evaluate(() => {
    type Registry = { list(): { components: { name: string }[] } };
    const hc = (window as unknown as { Holochart: { registry: Registry } }).Holochart;
    return hc.registry.list().components.filter((c) => c.name === 'scene').length;
  });
  expect(scenes).toBe(1);
});

/** A bar chart with depth in the 2.5D view; what it drew. */
async function draw25D(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any -- untyped globals from the IIFEs */
    const hc = (window as any).Holochart;
    const chart = hc.createChart(document.getElementById('root')!, {
      data: [{ type: 'bar', y: [3, 1, 2], depth: 20 }],
      layout: { width: 320, height: 240, view3d: { enabled: true } },
    });
    await chart.ready;
    const vp = chart.subplots.get('xy').viewport;
    const objects: any[] = chart.getTraceObjects(0);
    return {
      tilted: Boolean(vp.projector),
      extruded: objects.some((o) => o.name === 'holochart:extrusion'),
      flatBars: objects.some((o) => o.type === 'Mesh' && o.visible),
      loaded: hc.render.extrusionModuleLoaded() !== null,
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });
}

test('2.5D view and extruded bars come with the 3D add-on', async ({ page }) => {
  const { errors, warnings } = await servePage(page, [BUNDLE, BUNDLE_3D]);
  await page.goto(`${ORIGIN}/`);
  expect(await draw25D(page)).toEqual({
    tilted: true,
    extruded: true,
    flatBars: false,
    loaded: true,
  });
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

test('2.5D without the 3D add-on draws flat, with one warning', async ({ page }) => {
  const { errors, warnings } = await servePage(page, [BUNDLE]);
  await page.goto(`${ORIGIN}/`);
  expect(await draw25D(page)).toEqual({
    tilted: false,
    extruded: false,
    flatBars: true,
    loaded: false,
  });
  expect(errors).toEqual([]);
  expect(warnings).toEqual([expect.stringContaining('holochart-3d.iife.min.js')]);
});

/** A tilted, extruded pie (a domain trace in 2.5D, E9.12); what it drew. */
async function drawPie25D(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any -- untyped globals from the IIFEs */
    const hc = (window as any).Holochart;
    const chart = hc.createChart(document.getElementById('root')!, {
      data: [{ type: 'pie', values: [3, 1, 2], textinfo: 'none', depth: 20, tilt: 40 }],
      layout: { width: 320, height: 240, showlegend: false },
    });
    await chart.ready;
    const objects: any[] = chart.getTraceObjects(0);
    return {
      extruded: objects.some((o) => o.name === 'holochart:extrusion'),
      flatSlices: objects.some((o) => o.type === 'Mesh' && o.visible),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });
}

test('3D pies come with the 3D add-on', async ({ page, browserName }) => {
  // Known issue (docs/release/browser-support.md, F1): Firefox logs the driver's link warning for
  // the `holochart:mesh` program ("Output of vertex shader ... not read by fragment shader"), which
  // three reports with console.warn. The scene draws.
  test.fixme(browserName === 'firefox', 'F1: mesh shader link warning on Firefox');
  const { errors, warnings } = await servePage(page, [BUNDLE, BUNDLE_3D]);
  await page.goto(`${ORIGIN}/`);
  expect(await drawPie25D(page)).toEqual({ extruded: true, flatSlices: false });
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

test('3D pies without the 3D add-on draw flat, with one warning', async ({ page }) => {
  const { errors, warnings } = await servePage(page, [BUNDLE]);
  await page.goto(`${ORIGIN}/`);
  expect(await drawPie25D(page)).toEqual({ extruded: false, flatSlices: true });
  expect(errors).toEqual([]);
  expect(warnings).toEqual([expect.stringContaining('holochart-3d.iife.min.js')]);
});
