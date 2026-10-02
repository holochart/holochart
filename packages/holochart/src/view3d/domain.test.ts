// @vitest-environment jsdom
/**
 * Domain traces in 2.5D (plan E8.9, E9.12) through the whole pipeline on a WebGL-free renderer:
 * the extended modules' attributes, lazy loading (flat pies load nothing), a tilted pie's slices
 * as prisms (the flat arcs hidden), hover mapped through the tilt, and going flat again.
 */
import { extrusionModuleLoaded, meshModuleLoaded } from '@mk7s/holochart-render';
import {
  createChart,
  createChartRegistry,
  type Chart,
  type ChartOptions,
} from '@mk7s/holochart-runtime';
import { pie } from '@mk7s/holochart-traces-basic';
import { treemap } from '@mk7s/holochart-traces-hier';
import type { Object3D, WebGLRenderer } from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extrudedPie, extrudedTreemap, withView3D } from './index.ts';

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
    registry: createChartRegistry().register(...withView3D([pie, treemap])),
    renderRoot: { createRenderer: fakeRenderer },
  };
});

afterEach(() => {
  chart?.destroy();
  chart = undefined;
  container.remove();
});

async function draw(figure: { data: object[]; layout?: Record<string, unknown> }): Promise<Chart> {
  chart = createChart(
    container,
    { ...figure, layout: { showlegend: false, margin: { l: 20, r: 20, t: 20, b: 20 } } },
    options,
  );
  await chart.ready;
  return chart;
}

/** A pie without labels (jsdom has no WebGL to typeset SDF text). */
const PIE = {
  type: 'pie',
  labels: ['A', 'B', 'C', 'D'],
  values: [40, 30, 20, 10],
  sort: false,
  direction: 'clockwise',
  textinfo: 'none',
};

const isPrisms = (o: Object3D): boolean => o.name === 'holochart:extrusion';

describe('the domain traces of the full bundle', () => {
  it('replace pie, treemap and icicle by their extended versions', () => {
    expect(withView3D([pie, treemap]).slice(0, 2)).toEqual([extrudedPie, extrudedTreemap]);
    const keys = Object.keys(extrudedPie.schema.children);
    for (const k of ['depth', 'bevel', 'material', 'tilt', 'perspective'])
      expect(keys).toContain(k);
    expect(extrudedPie.schema.children['tilt']).toMatchObject({ dflt: 0, animatable: true });
    // Treemap and icicle tiles too (their drawing is unit-tested in render, `extrusion-domain`).
    expect(Object.keys(extrudedTreemap.schema.children)).toContain('tilt');
  });
});

describe('pie in 2.5D', () => {
  it('loads nothing and changes nothing when flat', async () => {
    const c = await draw({ data: [PIE] });
    expect(c.fullData[0]?.['depth']).toBe(0);
    expect(c.fullData[0]?.['tilt']).toBe(0);
    // `perspective` only matters (and is only defaulted) with a tilt or a depth.
    expect(c.fullData[0]?.['perspective']).toBeUndefined();
    expect(extrusionModuleLoaded()).toBeNull();
    expect(meshModuleLoaded()).toBeNull();
    expect(c.getTraceObjects(0).some(isPrisms)).toBe(false);
  });

  it('draws tilted slices as prisms, hovers through the tilt, and goes flat again', async () => {
    const c = await draw({ data: [{ ...PIE, depth: 30, tilt: 45 }] });
    expect(c.fullData[0]?.['perspective']).toBe(0.5);
    expect(extrusionModuleLoaded()).not.toBeNull();
    const objects = c.getTraceObjects(0);
    expect(objects.some(isPrisms)).toBe(true);
    // The flat arcs hide while the slices are extruded.
    const flat = objects.filter((o) => !isPrisms(o) && o.type === 'Mesh');
    expect(flat.length).toBeGreaterThan(0);
    expect(flat.every((o) => !o.visible)).toBe(true);
    // The pie: 600×360 px domain at (20, 20), centered at (320, 200), radius 180. Slice B
    // (144–252° clockwise from 12 o'clock) halfway out, on its top, where the tilted pie draws it.
    const calc = c.getCalcdata(0) as { layout: { domain: object } };
    const module = extrusionModuleLoaded()!;
    const cam = new module.DomainCamera(
      calc.layout.domain as { x: number; y: number; width: number; height: number },
      400,
      45,
      0.5,
    );
    const a = (198 * Math.PI) / 180;
    const [sx, sy] = cam.toScreen(320 + Math.sin(a) * 90, 400 - (200 - Math.cos(a) * 90), 30);
    // The runtime's query (container px, overlay px from the bottom) to the module's hover.
    const query = { px: sx, py: sy, xl: sx, yl: sy, mode: 'closest', distance: 20 } as const;
    const points = extrudedPie.hoverPoints!(
      c.getCalcdata(0),
      c.fullData[0]!,
      { ...query, cx: sx, cy: 400 - sy },
      { fullLayout: c.fullLayout! } as never,
    );
    expect(points).toMatchObject([{ pointIndex: 1, color: expect.any(String) }]);
    // Its label anchor: where the tilted pie draws the slice (near the pointer, not the flat pie).
    expect(Math.abs(points[0]!.py - sy)).toBeLessThan(40);

    await c.restyle({ depth: 0, tilt: 0 });
    expect(c.getTraceObjects(0).some(isPrisms)).toBe(false);
    expect(c.getTraceObjects(0).every((o) => o.visible)).toBe(true);
  });
});
