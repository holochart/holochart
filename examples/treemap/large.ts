import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Perf check for E13.3 (plan target: a 100k-node treemap renders in < 500 ms): 100,011 nodes —
 * a root, 10 regions, 100 districts and 99,900 shops with random sales — squarified into one
 * instanced rect draw, labels only where they fit. The readout shows the data generation time and
 * the time from `createChart` to `chart.ready` (defaults, the hierarchy, tiling, labels, first
 * frame); both are also on `window.__treemapPerf`. Click a tile to time a drill-down.
 */
export const meta: ExampleMeta = {
  title: 'Treemap: 100k-node benchmark',
  description:
    'A 100,011-node treemap drawn as one instanced GPU rect set, with first-draw timing.',
  tags: ['treemap', 'hierarchical', 'perf', 'large-data', 'no-visual-test'],
  size: { width: 900, height: 600 },
};

const REGIONS = 10;
const DISTRICTS = 10;
const SHOPS = 999;

/** Deterministic sales: log-normal shop values. */
function shops() {
  const random = rng(7);
  const ids: string[] = ['all'];
  const labels: string[] = ['All shops'];
  const parents: string[] = [''];
  const values: number[] = [0];
  for (let r = 0; r < REGIONS; r++) {
    const region = `r${r}`;
    ids.push(region);
    labels.push(`Region ${r + 1}`);
    parents.push('all');
    values.push(0);
    for (let d = 0; d < DISTRICTS; d++) {
      const district = `${region}d${d}`;
      ids.push(district);
      labels.push(`District ${r + 1}.${d + 1}`);
      parents.push(region);
      values.push(0);
      for (let s = 0; s < SHOPS; s++) {
        ids.push(`${district}s${s}`);
        labels.push(`Shop ${s + 1}`);
        parents.push(district);
        values.push(Math.round(Math.exp(random() * 3) * 10));
      }
    }
  }
  return { ids, labels, parents, values };
}

declare global {
  interface Window {
    __treemapPerf?: { nodes: number; generateMs: number; firstDrawMs: number; drillMs?: number };
  }
}

export function run(el: HTMLElement): ExampleHandle {
  el.style.position ||= 'relative';
  const t0 = performance.now();
  const data = shops();
  const generateMs = performance.now() - t0;
  const t1 = performance.now();
  const chart = createChart(el, {
    data: [{ type: 'treemap', ...data }],
    layout: { title: { text: '100,011 nodes' }, margin: { l: 10, r: 10, t: 60, b: 10 } },
  });
  const perf: NonNullable<Window['__treemapPerf']> = {
    nodes: data.ids.length,
    generateMs,
    firstDrawMs: NaN,
  };
  window.__treemapPerf = perf;

  const readout = document.createElement('div');
  readout.style.cssText =
    'position:absolute;top:6px;right:10px;padding:4px 8px;background:rgba(21,21,29,.9);' +
    'color:#a4a7b5;font:12px system-ui,sans-serif;border-radius:4px';
  readout.textContent = `data ${generateMs.toFixed(0)} ms · drawing…`;
  el.appendChild(readout);
  const ready = chart.ready.then(() => {
    perf.firstDrawMs = performance.now() - t1;
    readout.textContent = `data ${generateMs.toFixed(0)} ms · first draw ${perf.firstDrawMs.toFixed(0)} ms`;
  });
  let clicked = 0;
  chart.on('treemapclick', () => {
    clicked = performance.now();
  });
  chart.on('restyle', () => {
    if (!clicked) return;
    perf.drillMs = performance.now() - clicked;
    readout.textContent = `data ${generateMs.toFixed(0)} ms · first draw ${perf.firstDrawMs.toFixed(0)} ms · drill ${perf.drillMs.toFixed(0)} ms`;
    clicked = 0;
  });

  return {
    ready,
    renderer: chart.three.renderer,
    dispose: () => {
      if (window.__treemapPerf === perf) delete window.__treemapPerf;
      readout.remove();
      chart.destroy();
    },
  };
}
