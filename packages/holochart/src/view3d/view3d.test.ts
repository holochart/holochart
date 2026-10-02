// @vitest-environment jsdom
/**
 * The full bundle's 2.5D support (plan E8.9, E9.10) through the whole pipeline on a WebGL-free
 * renderer: `layout.view3d` defaults, lazy loading (flat charts load no 2.5D or mesh code), the
 * projector on the subplot (with its decor viewport for the axes), extruded bars, and turning it
 * off again.
 */
import { extrusionModuleLoaded, meshModuleLoaded, type Viewport } from '@mk7s/holochart-render';
import {
  createChart,
  createChartRegistry,
  type Chart,
  type ChartOptions,
} from '@mk7s/holochart-runtime';
import { bar, scatter } from '@mk7s/holochart-traces-basic';
import type { WebGLRenderer } from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extrudedBar, extrudedScatter, view3dComponent, withView3D } from './index.ts';

function fakeRenderer(): WebGLRenderer {
  const noop = (): void => {};
  return {
    domElement: document.createElement('canvas'),
    autoClear: true,
    info: { autoReset: true, reset: noop },
    renderLists: { dispose: noop },
    setPixelRatio: noop,
    setSize: noop,
    setRenderTarget: noop,
    setClearColor: noop,
    clear: noop,
    setScissor: noop,
    setScissorTest: noop,
    setViewport: noop,
    render: noop,
    dispose: noop,
    forceContextLoss: noop,
  } as unknown as WebGLRenderer;
}

let container: HTMLElement;
let options: ChartOptions;
let chart: Chart | undefined;

beforeEach(() => {
  container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 640 });
  Object.defineProperty(container, 'clientHeight', { value: 400 });
  document.body.appendChild(container);
  options = {
    registry: createChartRegistry().register(...withView3D([scatter, bar])),
    renderRoot: { createRenderer: fakeRenderer },
  };
});

afterEach(() => {
  chart?.destroy();
  chart = undefined;
  container.remove();
});

/** Axes without labels: no SDF text to typeset (jsdom has no WebGL). */
const NO_TEXT = { xaxis: { visible: false }, yaxis: { visible: false } };

async function draw(figure: { data: object[]; layout?: Record<string, unknown> }): Promise<Chart> {
  chart = createChart(container, { ...figure, layout: { ...NO_TEXT, ...figure.layout } }, options);
  await chart.ready;
  return chart;
}

const viewports = (c: Chart): string[] => c.three.root.viewports.map((v: Viewport) => v.name);

describe('the 2.5D modules of the full bundle', () => {
  it('replace bar by its extruded version and add the view3d component', () => {
    const list = withView3D([scatter, bar]);
    expect(list).toEqual([extrudedScatter, extrudedBar, view3dComponent]);
    expect(Object.keys(extrudedBar.schema.children)).toContain('depth');
  });
});

describe('lazy loading', () => {
  it('loads no 2.5D or mesh code for flat charts', async () => {
    const c = await draw({
      data: [
        { type: 'bar', y: [1, 2, 3] },
        { type: 'bar', y: [1, 2, 3], depth: 0 },
      ],
    });
    expect(c.fullLayout?.['view3d']).toEqual({
      enabled: false,
      tilt: 20,
      rotation: -20,
      perspective: 0.5,
      interactive: true,
    });
    expect(c.fullData[1]?.['depth']).toBe(0);
    expect(extrusionModuleLoaded()).toBeNull();
    expect(meshModuleLoaded()).toBeNull();
    expect(c.subplots.get('xy')?.viewport.projector).toBeFalsy();
  });
});

describe('layout.view3d', () => {
  it('tilts the subplot, draws its axes with it, and goes flat again', async () => {
    const c = await draw({
      data: [{ type: 'scatter', y: [1, 3, 2] }],
      layout: { view3d: { enabled: true, tilt: 30, rotation: 10 } },
    });
    expect(extrusionModuleLoaded()).not.toBeNull();
    // The view doesn't need the mesh code.
    expect(meshModuleLoaded()).toBeNull();
    const vp = c.subplots.get('xy')!.viewport;
    const projector = vp.projector as unknown as {
      angles: { tilt: number; rotation: number; perspective: number };
    };
    expect(projector.angles).toEqual({ tilt: 30, rotation: 10, perspective: 0.5 });
    expect(vp.clip).toBe(false);
    expect(viewports(c)).toContain('view3d-xy');
    await c.relayout({ 'view3d.tilt': 45 });
    expect(projector.angles.tilt).toBe(45);
    await c.relayout({ 'view3d.enabled': false });
    expect(vp.projector).toBeFalsy();
    expect(vp.clip).toBe(true);
    expect(viewports(c)).not.toContain('view3d-xy');
  });

  it('draws bars with depth extruded', async () => {
    const c = await draw({
      data: [{ type: 'bar', y: [1, 2, 3], depth: 20, bevel: { size: 2 } }],
      layout: { view3d: { enabled: true } },
    });
    expect(meshModuleLoaded()).not.toBeNull();
    const objects = c.getTraceObjects(0);
    const extrusion = objects.find((o) => o.name === 'holochart:extrusion');
    expect(extrusion).toBeDefined();
    // The flat rects hide while the bars are extruded.
    const flat = objects.filter((o) => o.name !== 'holochart:extrusion' && o.type === 'Mesh');
    expect(flat.every((o) => !o.visible)).toBe(true);
    await c.restyle({ depth: 0 });
    expect(c.getTraceObjects(0).some((o) => o.name === 'holochart:extrusion')).toBe(false);
  });
});
