import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Six charts created in the same tick whose labels share characters no chart has drawn before.
 * The text engine keeps one glyph atlas for the page and reports a label as typeset as soon as its
 * glyphs are registered, which for glyphs another chart asked for a moment earlier is before they
 * are in the texture (packages/render/src/primitives/text-atlas.ts). Charts 1 to 5 are in that
 * position: chart 0 asks for every character first, in an annotation long enough that generating
 * its glyphs takes several frames, and their titles use subsets of it.
 *
 * Charts 0 to 3 get a WebGL context each and 4 and 5 draw through the shared renderer (ADR-023),
 * so both kinds are covered. `window.__textAtlas` exposes the charts and a settle wait;
 * tests/interaction/text-atlas.spec.ts reads it.
 *
 * Not a visual test: its point is that no chart needs another redraw to show its text.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: charts sharing new glyphs',
  description:
    'Six charts created together whose titles use characters first requested by another chart; window.__textAtlas exposes them for the glyph atlas test.',
  tags: ['dev', 'chart', 'text', 'interaction', 'no-visual-test'],
  size: { width: 960, height: 480 },
};

export const COUNT = 6;
const COLUMNS = 3;
const WIDTH = 320;
const HEIGHT = 240;

/** Every character the other charts' titles use, and many more, so generating them takes a while. */
const GLYPHS = [
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'abcdefghijklmnopqrstuvwxyz',
  '()[]{}!?#%*+=/:;,._-@',
  'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝ',
  'àáâãäåæçèéêëìíîïñòóôõöøùúûüý',
];

const TITLES = [
  'Quick (jab) zest? #1',
  'Vexing: [glyph] WALTZ = 2',
  'Façade über Ålesund; née',
  'JUMPY fox @ {dwarf} + 3%',
  'Crème brûlée, piñata? no!',
];

/** What the example exposes to the interaction test. */
export interface TextAtlasHook {
  charts: Chart[];
  /** Resolves once every chart is ready and none has drawn a frame for `quietMs`. */
  settled(quietMs?: number): Promise<void>;
}

declare global {
  interface Window {
    __textAtlas?: TextAtlasHook;
  }
}

function figure(index: number): Parameters<typeof createChart>[1] {
  const base = {
    data: [{ type: 'scatter' as const, mode: 'lines' as const, x: [0, 1, 2], y: [1, 3, 2] }],
    config: { displayModeBar: false },
  };
  if (index === 0) {
    return {
      ...base,
      layout: {
        margin: { l: 30, r: 10, t: 10, b: 24 },
        showlegend: false,
        annotations: GLYPHS.map((text, line) => ({
          xref: 'paper' as const,
          yref: 'paper' as const,
          x: 0.02,
          y: 0.95 - line * 0.16,
          xanchor: 'left' as const,
          showarrow: false,
          font: { size: 11 },
          text,
        })),
      },
    };
  }
  return {
    ...base,
    layout: {
      margin: { l: 30, r: 10, t: 44, b: 24 },
      showlegend: false,
      title: { text: TITLES[index - 1] as string, font: { size: 14 } },
    },
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const grid = el.ownerDocument.createElement('div');
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${COLUMNS},${WIDTH}px);`;
  el.appendChild(grid);
  const charts: Chart[] = [];
  // All in one tick: that is the case under test.
  for (let index = 0; index < COUNT; index++) {
    const cell = el.ownerDocument.createElement('div');
    cell.dataset['chart'] = String(index);
    cell.style.cssText = `width:${WIDTH}px;height:${HEIGHT}px;`;
    grid.appendChild(cell);
    charts.push(createChart(cell, figure(index)));
  }

  const settled = (quietMs = 500): Promise<void> =>
    Promise.all(charts.map((c) => c.ready)).then(
      () =>
        new Promise<void>((resolve) => {
          let timer = 0;
          const offs: (() => void)[] = [];
          const arm = (): void => {
            clearTimeout(timer);
            timer = window.setTimeout(() => {
              for (const off of offs) off();
              resolve();
            }, quietMs);
          };
          for (const chart of charts) offs.push(chart.on('afterrender', arm));
          arm();
        }),
    );

  window.__textAtlas = { charts, settled };
  return {
    ready: settled(300),
    renderer: (charts[0] as Chart).three.renderer,
    dispose: () => {
      delete window.__textAtlas;
      for (const chart of charts) chart.destroy();
      grid.remove();
    },
  };
}
