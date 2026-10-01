// A Vite app using the installed `@mk7s/holochart` tarball: one 2D chart and one 3D chart (the 3D
// code is in lazily loaded chunks). The smoke test waits for `window.holochartFixture`.
import { createChart } from '@mk7s/holochart';

async function draw(): Promise<Record<string, unknown>> {
  const chart2d = createChart(document.getElementById('chart2d')!, {
    data: [{ type: 'scatter', x: [1, 2, 3], y: [2, 1, 3], name: 'Revenue' }],
    layout: { width: 400, height: 300, title: { text: 'Vite 2D' } },
  });
  const chart3d = createChart(document.getElementById('chart3d')!, {
    data: [{ type: 'scatter3d', x: [1, 2, 3], y: [3, 1, 2], z: [2, 3, 1], mode: 'markers' }],
    layout: { width: 400, height: 300, title: { text: 'Vite 3D' } },
  });
  await Promise.all([chart2d.ready, chart3d.ready]);
  return {
    viewports2d: chart2d.three.viewports.length,
    viewports3d: chart3d.three.viewports.length,
    webgl2: chart2d.three.renderer.getContext() instanceof WebGL2RenderingContext,
  };
}

declare global {
  interface Window {
    holochartFixture?: Promise<Record<string, unknown>>;
  }
}
window.holochartFixture = draw();
