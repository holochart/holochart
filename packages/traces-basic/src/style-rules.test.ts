// @vitest-environment jsdom
/**
 * Style rules (E8.5) over colorscaled colors, with the real scatter and bar modules through the
 * whole pipeline on a WebGL-free renderer: a rule's CSS color merged into a numeric `marker.color`
 * is drawn as that color and the other points keep the colorscale (Plotly draws CSS colors in a
 * colorscaled array as given). Lives here rather than in the runtime, which can't depend on trace
 * packages.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import {
  createChart,
  createChartRegistry,
  type Chart,
  type ChartOptions,
} from '@mk7s/holochart-runtime';
import type { InstancedBufferGeometry, Mesh, ShaderMaterial, WebGLRenderer } from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bar } from './bar/index.ts';
import { barStyle, cssColor } from './bar/style.ts';
import { scatter } from './scatter/index.ts';
import { pointColor } from './scatter/style.ts';

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
    registry: createChartRegistry().register(scatter, bar),
    renderRoot: { createRenderer: fakeRenderer },
  };
});

afterEach(() => {
  chart?.destroy();
  chart = undefined;
  container.remove();
});

const GOLD = 'rgb(255, 215, 0)';
const gold = { when: { y: { gt: 2 } }, set: { 'marker.color': 'gold' } };
const trace = (type: string, styleRules: unknown[]) => ({
  type,
  ...(type === 'scatter' ? { mode: 'markers' } : {}),
  x: [0, 1, 2, 3],
  y: [1, 2, 3, 4],
  marker: { color: [0, 4, 8, 10], colorscale: 'Greys', cmin: 0, cmax: 10 },
  styleRules,
});

/**
 * The instanced marker mesh of trace `i`: whether it maps `aValue` through the colorscale LUT,
 * else its per-point fill colors (`aFill`, u8 RGBA).
 */
function drawnMarkers(c: Chart, i: number): { colorscale: boolean; fill: number[][] } {
  const mesh = c
    .getTraceObjects(i)
    .find((o) => (o as Mesh).geometry?.getAttribute?.('aPos') !== undefined) as Mesh;
  const geometry = mesh.geometry as InstancedBufferGeometry;
  const colorscale = 'USE_COLORSCALE' in (mesh.material as ShaderMaterial).defines;
  if (colorscale) return { colorscale, fill: [] };
  const fill = geometry.getAttribute('aFill').array as ArrayLike<number>;
  const rows = Array.from({ length: geometry.instanceCount }, (_, k) =>
    Array.from({ length: 4 }, (_, j) => fill[4 * k + j]!),
  );
  return { colorscale, fill: rows };
}

function colors(t: FullTrace): unknown {
  return (t['marker'] as Record<string, unknown>)['color'];
}

describe('style rules over colorscaled colors', () => {
  it('scatter draws the rule color as given and maps the other points', async () => {
    chart = createChart(container, { data: [trace('scatter', [gold])] }, options);
    await chart.ready;
    const t = chart.fullData[0]!;
    expect(colors(t)).toEqual([0, 4, GOLD, GOLD]);
    // Per-point colors on the GPU (the colorscale LUT only sees numbers): 0 → black, 4 → 40%.
    const drawn = drawnMarkers(chart, 0);
    expect(drawn.colorscale).toBe(false);
    expect(drawn.fill).toEqual([
      [0, 0, 0, 255],
      [102, 102, 102, 255],
      [255, 215, 0, 255],
      [255, 215, 0, 255],
    ]);
    expect([0, 1, 2].map((i) => pointColor(t, i, chart!.fullLayout))).toEqual([
      'rgb(0, 0, 0)',
      'rgb(102, 102, 102)',
      GOLD,
    ]);
  });

  it('scatter switches back to the colorscale LUT when the rules no longer set colors', async () => {
    chart = createChart(container, { data: [trace('scatter', [gold])] }, options);
    await chart.ready;
    await chart.restyle({ styleRules: [[{ when: { y: { gt: 2 } }, set: { 'marker.size': 9 } }]] });
    expect(drawnMarkers(chart, 0).colorscale).toBe(true);
    await chart.restyle({ styleRules: [[gold]] });
    const drawn = drawnMarkers(chart, 0);
    expect(drawn.colorscale).toBe(false);
    expect(drawn.fill[3]).toEqual([255, 215, 0, 255]);
  });

  it('bar fills the rule color as given and maps the other bars', async () => {
    chart = createChart(container, { data: [trace('bar', [gold])] }, options);
    await chart.ready;
    const t = chart.fullData[0]!;
    expect(colors(t)).toEqual([0, 4, GOLD, GOLD]);
    const style = barStyle(t, 4, null, chart.fullLayout);
    expect([0, 1, 2, 3].map((i) => cssColor(style.fill, i))).toEqual([
      'rgb(0, 0, 0)',
      'rgb(102, 102, 102)',
      GOLD,
      GOLD,
    ]);
  });
});
