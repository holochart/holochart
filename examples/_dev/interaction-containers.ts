import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Container edge cases (backlog S2.3):
 *
 * - `hidden`: a chart created in a `display: none` element (an inactive tab, a closed dialog),
 *   without `config.responsive`. `window.__containers.show()` shows the element; the chart then
 *   takes its size (400×250), once.
 * - `framed`: a polar chart in an iframe's document, created by this page's script. Its zoom-box
 *   drag listens on the window while the button is down, which must be the iframe's window.
 *   400×300 px, 20 px margins: the circle has radius 130 px around (200, 150), radial range
 *   [0, 10].
 *
 * Not a visual test: its point is sizing and pointer behavior, covered by
 * tests/interaction/containers.spec.ts.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: hidden and framed containers',
  description:
    'A chart created in a hidden element and a polar chart inside an iframe; exposed on window.__containers.',
  tags: ['dev', 'chart', 'polar', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 600 },
};

/** What the example exposes to the interaction tests. */
export interface ContainersHook {
  hidden: Chart;
  framed: Chart;
  frame: HTMLIFrameElement;
  /** Show the hidden chart's element. */
  show(): void;
  /** `relayout` payloads of the framed chart. */
  relayouts: Record<string, unknown>[];
}

declare global {
  interface Window {
    __containers?: ContainersHook;
  }
}

export function run(el: HTMLElement): ExampleHandle {
  const doc = el.ownerDocument;
  const tab = doc.createElement('div');
  tab.style.cssText = 'width:400px;height:250px;display:none;';
  el.appendChild(tab);
  const hidden = createChart(tab, {
    data: [{ type: 'scatter', x: [0, 1, 2], y: [1, 3, 2] }],
    layout: { margin: { l: 30, r: 10, t: 10, b: 24 }, showlegend: false },
    config: { displayModeBar: false },
  });

  const frame = doc.createElement('iframe');
  frame.style.cssText = 'width:400px;height:300px;border:0;display:block;';
  el.appendChild(frame);
  const inner = frame.contentDocument!;
  inner.body.style.margin = '0';
  const host = inner.createElement('div');
  host.style.cssText = 'width:400px;height:300px;';
  inner.body.appendChild(host);
  const relayouts: Record<string, unknown>[] = [];
  const framed = createChart(host, {
    data: [{ type: 'scatterpolar', mode: 'markers', r: [5, 8], theta: [45, 135] }],
    layout: {
      margin: { l: 20, r: 20, t: 20, b: 20 },
      showlegend: false,
      dragmode: 'zoom',
      polar: { radialaxis: { range: [0, 10] } },
    },
    config: { displayModeBar: false },
  });
  framed.on('relayout', (payload: unknown) => {
    relayouts.push(JSON.parse(JSON.stringify(payload ?? {})) as Record<string, unknown>);
  });

  const hook: ContainersHook = {
    hidden,
    framed,
    frame,
    relayouts,
    show: () => {
      tab.style.display = 'block';
    },
  };
  window.__containers = hook;
  return {
    ready: Promise.all([hidden.ready, framed.ready]).then(() => undefined),
    dispose: () => {
      if (window.__containers === hook) delete window.__containers;
      hidden.destroy();
      framed.destroy();
      tab.remove();
      frame.remove();
    },
  };
}
