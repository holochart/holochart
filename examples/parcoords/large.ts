import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 100,000 lines across eight axes (plan E10.10): every line is one polyline of a single GPU line
 * primitive (one draw call), colored per vertex. Brushing recolors the lines in place (no geometry
 * is rebuilt), and resizing only changes the transform. Dragging an axis moves the lines on drop
 * at this size (live below about 400k vertices).
 */
export const meta: ExampleMeta = {
  title: 'Parallel coordinates: 100k lines',
  description: '100,000 rows across eight axes in one draw call; brush any axis to filter them.',
  tags: ['parcoords', 'statistical', 'domain', 'perf', 'large-data', 'no-visual-test'],
};

const ROWS = 100_000;
const DIMS = 8;

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(3));
  const columns = Array.from({ length: DIMS }, () => new Float64Array(ROWS));
  for (let i = 0; i < ROWS; i++) {
    const f = normal();
    const g = normal();
    for (let d = 0; d < DIMS; d++) {
      const w = Math.cos((d * Math.PI) / DIMS);
      columns[d]![i] = 100 + 20 * (w * f + Math.sqrt(1 - w * w) * g) + 8 * normal();
    }
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'parcoords',
        line: { color: columns[0]!, showscale: true },
        dimensions: columns.map((values, d) => ({
          label: `Sensor ${d + 1}`,
          values,
          ...(d === 2 ? { constraintrange: [110, 140] } : {}),
        })),
      },
    ],
    layout: {
      title: { text: `${ROWS.toLocaleString('en-US')} lines, one draw call` },
      margin: { t: 64, l: 48, r: 72, b: 32 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
