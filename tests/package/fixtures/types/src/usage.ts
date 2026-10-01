// Typical usage, type-checked against the installed tarballs with `tsc --noEmit` (strict, no
// skipLibCheck): the full bundle, a partial bundle, Express, locales and three.js interop.
import { createChart, express, register as registerFull, type Chart } from '@mk7s/holochart';
import { de } from '@mk7s/holochart-locales';
import { createChart as createPartialChart, register } from '@mk7s/holochart-runtime';
import { bar, scatter } from '@mk7s/holochart-traces-basic';
import * as THREE from 'three';

export async function fullBundle(el: HTMLElement): Promise<Chart> {
  const chart = createChart(el, {
    data: [{ type: 'scatter', x: [1, 2, 3], y: [2, 1, 3], mode: 'lines+markers', name: 'a' }],
    layout: { title: { text: 'Typed' }, width: 400, height: 300 },
    config: { responsive: true },
  });
  await chart.ready;
  const off = chart.on('plotly_click', (event) => {
    const first = event.points[0];
    if (first) console.log(first.curveNumber, first.pointIndex);
  });
  off();
  chart.on('relayout', (update) => console.log(Object.keys(update)));
  await chart.relayout({ 'xaxis.range': [0, 4] });
  await chart.restyle({ 'marker.color': 'red' }, [0]);

  // three.js interop: the chart's scene takes the app's own three.js objects.
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  chart.three.scene.add(mesh);
  const renderer: THREE.WebGLRenderer = chart.three.renderer;
  console.log(renderer.getPixelRatio(), chart.three.viewports.length);

  // 3D comes with the full bundle.
  const scene = createChart(el, {
    data: [{ type: 'scatter3d', x: [1, 2], y: [3, 4], z: [5, 6], mode: 'markers' }],
  });
  await scene.ready;
  scene.destroy();
  return chart;
}

export function partialBundle(el: HTMLElement): Chart {
  register(scatter, bar, de);
  registerFull();
  return createPartialChart(el, { data: [{ type: 'bar', x: ['a', 'b'], y: [1, 2] }] });
}

export async function expressChart(el: HTMLElement): Promise<void> {
  const rows = [
    { day: 'Mon', total: 12, sex: 'F' },
    { day: 'Tue', total: 15, sex: 'M' },
  ];
  const figure = express.scatter(rows, { x: 'day', y: 'total', color: 'sex' });
  const chart = createChart(el, figure);
  await chart.ready;
}
