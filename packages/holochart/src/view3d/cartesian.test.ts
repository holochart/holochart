// @vitest-environment jsdom
/**
 * Extruded cartesian traces besides bars (plan E8.9) through the whole pipeline on a WebGL-free
 * renderer: funnel and waterfall prisms with their connectors lifted onto the front faces, heatmap
 * cells as columns over the flat heatmap, and scatter fills as slabs with the lines on their front
 * (and `depth` defaulted for filled traces only).
 */
import { createChart, createChartRegistry, type Chart } from '@mk7s/holochart-runtime';
import { bar, scatter } from '@mk7s/holochart-traces-basic';
import { funnel, waterfall } from '@mk7s/holochart-traces-finance';
import { heatmap } from '@mk7s/holochart-traces-sci';
import type { Object3D, WebGLRenderer } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { withView3D } from './index.ts';

/** `userData` flag of objects the 2.5D view does not clip (render's `UNCLIPPED`). */
const UNCLIPPED = 'hcUnclipped';
const EXTRUSION = 'holochart:extrusion';

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

let chart: Chart | undefined;

afterEach(() => {
  chart?.destroy();
  chart = undefined;
});

async function draw(figure: { data: unknown[]; layout?: Record<string, unknown> }): Promise<Chart> {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 640 });
  Object.defineProperty(container, 'clientHeight', { value: 400 });
  document.body.appendChild(container);
  chart = createChart(
    container,
    {
      ...figure,
      // Axes without labels: no SDF text to typeset (jsdom has no WebGL).
      layout: { xaxis: { visible: false }, yaxis: { visible: false }, ...figure.layout },
    },
    {
      registry: createChartRegistry().register(
        ...withView3D([scatter, bar, funnel, waterfall, heatmap]),
      ),
      renderRoot: { createRenderer: fakeRenderer },
    },
  );
  await chart.ready;
  return chart;
}

const extrusionOf = (c: Chart, i: number): Object3D | undefined =>
  c.getTraceObjects(i).find((o) => o.name === EXTRUSION);

describe('funnel and waterfall', () => {
  it('extrude the stages; connector regions and lines lie on the front faces', async () => {
    const c = await draw({
      data: [
        {
          type: 'funnel',
          y: ['a', 'b', 'c'],
          x: [30, 20, 10],
          depth: '50%',
          textinfo: 'none',
          connector: { line: { width: 2 } },
        },
      ],
      layout: { view3d: { enabled: true } },
    });
    expect(c.fullData[0]?.['depth']).toBe('50%');
    expect(c.fullData[0]?.['bevel']).toEqual({ size: 0, segments: 3 });
    const objects = c.getTraceObjects(0);
    const extrusion = extrusionOf(c, 0);
    expect(extrusion).toBeDefined();
    // The flat rects hide; the connector fill and lines are lifted (unclipped).
    const rest = objects.filter((o) => o !== extrusion && o.visible);
    expect(rest.length).toBeGreaterThanOrEqual(2);
    expect(rest.every((o) => o.userData[UNCLIPPED] === true)).toBe(true);
    await c.restyle({ depth: 0 });
    expect(extrusionOf(c, 0)).toBeUndefined();
    expect(c.getTraceObjects(0).some((o) => o.userData[UNCLIPPED])).toBe(false);
  });

  it('extrude waterfall steps with their connector lines lifted', async () => {
    const c = await draw({
      data: [
        {
          type: 'waterfall',
          x: ['a', 'b', 'c'],
          y: [5, -2, null],
          measure: ['relative', 'relative', 'total'],
          textinfo: 'none',
          depth: 16,
        },
      ],
    });
    const extrusion = extrusionOf(c, 0);
    expect(extrusion).toBeDefined();
    // The connector line (and the labels) lifted.
    const lifted = c.getTraceObjects(0).filter((o) => o !== extrusion && o.visible);
    expect(lifted.some((o) => o.type === 'Mesh')).toBe(true);
    expect(lifted.every((o) => o.userData[UNCLIPPED] === true)).toBe(true);
  });
});

describe('heatmap', () => {
  it('stands its cells up as columns over the flat heatmap', async () => {
    const c = await draw({
      data: [
        {
          type: 'heatmap',
          z: [
            [1, 2, 3],
            [4, 5, NaN],
          ],
          depth: 50,
          xgap: 2,
        },
      ],
      layout: { view3d: { enabled: true, tilt: 30 } },
    });
    const extrusion = extrusionOf(c, 0);
    expect(extrusion).toBeDefined();
    // The flat heatmap stays: the floor.
    const flat = c.getTraceObjects(0).filter((o) => o !== extrusion);
    expect(flat.some((o) => o.visible)).toBe(true);
    await c.restyle({ depth: 0 });
    expect(extrusionOf(c, 0)).toBeUndefined();
  });

  it('keeps flat heatmaps without the 2.5D attributes set', async () => {
    const c = await draw({ data: [{ type: 'heatmap', z: [[1, 2]] }] });
    expect(c.fullData[0]?.['depth']).toBe(0);
    expect(c.fullData[0]?.['bevel']).toBeUndefined();
    expect(extrusionOf(c, 0)).toBeUndefined();
  });
});

describe('area (scatter fill)', () => {
  it('draws the fill as a slab with the line on its front; flat again at depth 0', async () => {
    const c = await draw({
      data: [{ type: 'scatter', y: [1, 3, 2], fill: 'tozeroy', mode: 'lines', depth: 20 }],
      layout: { view3d: { enabled: true } },
    });
    const extrusion = extrusionOf(c, 0);
    expect(extrusion).toBeDefined();
    const others = c.getTraceObjects(0).filter((o) => o !== extrusion);
    // The flat fill hides; the line is lifted.
    expect(others.filter((o) => !o.visible)).toHaveLength(1);
    const line = others.find((o) => o.visible)!;
    expect(line.userData[UNCLIPPED]).toBe(true);
    await c.restyle({ depth: 0 });
    expect(extrusionOf(c, 0)).toBeUndefined();
    expect(c.getTraceObjects(0).every((o) => o.visible)).toBe(true);
    expect(line.userData[UNCLIPPED]).toBeUndefined();
  });

  it('stacks areas as layers of one slab', async () => {
    const c = await draw({
      data: [
        { type: 'scatter', y: [1, 2, 1], stackgroup: 'a', depth: 10 },
        { type: 'scatter', y: [2, 1, 2], stackgroup: 'a', depth: 10 },
      ],
    });
    expect(extrusionOf(c, 0)).toBeDefined();
    expect(extrusionOf(c, 1)).toBeDefined();
  });

  it('defaults depth for filled traces only', async () => {
    const c = await draw({
      data: [
        { type: 'scatter', y: [1, 2] },
        { type: 'scatter', y: [1, 2], fill: 'tozeroy' },
      ],
    });
    expect('depth' in c.fullData[0]!).toBe(false);
    expect(c.fullData[1]?.['depth']).toBe(0);
  });
});
