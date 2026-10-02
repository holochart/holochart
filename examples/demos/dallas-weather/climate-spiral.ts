import { createChart, type Chart, type Scatter3dTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  FIRST_YEAR,
  MONTH_NAMES,
  MONTHLY_MEAN,
  NORMAL_FROM,
  NORMAL_TO,
  TEMP_SCALE,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The climate spiral of Dallas: one point per month of the record on a `scatter3d` line that goes
 * round a circle once a year (January at the back, clockwise seen from above) and climbs with
 * the years. The distance from the axis is the month's difference from its 1991–2020 average
 * plus a fixed offset, so a warm month swings outward and a cold one inward; the line is colored
 * by the same difference (`line.color` with a diverging `colorscale` centered on zero).
 *
 * Two dotted circles mark "no difference" at the bottom and the top, and month names sit around
 * the top one (a `text` trace). The horizontal axes carry no numbers of their own, so they are
 * hidden (`scene.xaxis.visible: false`).
 *
 * Single months in one city swing by 10 °F or more, far more than the warming, so the spiral is
 * ragged; still, the early turns sit mostly inside the reference circle and the latest ones
 * mostly on or outside it.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: climate spiral',
  description:
    'Every month since 1940 on a 3D spiral: once round per year, distance from the axis and color by the difference from the 1991–2020 average.',
  tags: ['demo', 'scatter3d', '3d', 'lines', 'colorscale', 'text', 'climate'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

/** Color range, °F either side of normal. */
const CLIM = 8;

interface Point {
  year: number;
  month: number;
  diff: number;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  // The 1991–2020 average of each calendar month.
  const normal = MONTH_NAMES.map((_, k) => {
    const v: number[] = [];
    for (let y = NORMAL_FROM; y <= NORMAL_TO; y++) {
      const t = MONTHLY_MEAN[y - FIRST_YEAR]?.[k];
      if (t !== null && t !== undefined) v.push(t);
    }
    return v.reduce((a, b) => a + b, 0) / v.length;
  });
  const points: Point[] = MONTHLY_MEAN.flatMap((row, y) =>
    row.flatMap((t, k) =>
      t === null ? [] : [{ year: FIRST_YEAR + y, month: k, diff: t - (normal[k] as number) }],
    ),
  );
  const span = Math.ceil(Math.max(...points.map((p) => Math.abs(p.diff))));
  // Keeps the coldest month away from the axis.
  const offset = span + 4;
  const angle = (month: number): number => (month / 12) * 2 * Math.PI;
  // January at +y, going clockwise seen from above.
  const px = (radius: number, month: number): number => radius * Math.sin(angle(month));
  const py = (radius: number, month: number): number => radius * Math.cos(angle(month));
  const height = (p: Point): number => p.year + p.month / 12;
  const signed = (v: number): string => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(1)} °F`;

  const spiral: Scatter3dTrace = {
    type: 'scatter3d',
    mode: 'lines',
    name: 'Monthly difference from normal',
    x: points.map((p) => px(offset + p.diff, p.month)),
    y: points.map((p) => py(offset + p.diff, p.month)),
    z: points.map(height),
    text: points.map((p) => `${MONTH_NAMES[p.month]} ${p.year}: <b>${signed(p.diff)}</b>`),
    line: {
      color: points.map((p) => p.diff),
      colorscale: TEMP_SCALE,
      // Tighter than the full range, so ordinary months show their color too.
      cmin: -CLIM,
      cmax: CLIM,
      width: 2,
      colorbar: {
        title: { text: `Difference from ${NORMAL_FROM}–${NORMAL_TO} (°F)`, side: 'right' },
        thickness: 12,
        len: 0.7,
      },
    },
    hovertemplate: '%{text}<extra></extra>',
    showlegend: false,
  };

  const firstZ = height(points[0] as Point);
  const lastZ = height(points[points.length - 1] as Point);
  const circle = (z: number): Scatter3dTrace => ({
    type: 'scatter3d',
    mode: 'lines',
    name: 'No difference',
    x: Array.from({ length: 97 }, (_, i) => px(offset, i / 8)),
    y: Array.from({ length: 97 }, (_, i) => py(offset, i / 8)),
    z: Array.from({ length: 97 }, () => z),
    line: { color: LOOK.title, width: 1.5, dash: 'dot' },
    hoverinfo: 'skip',
    showlegend: false,
  });
  const months: Scatter3dTrace = {
    type: 'scatter3d',
    mode: 'text',
    name: 'Months',
    x: MONTH_NAMES.map((_, k) => px(offset + span + 3, k)),
    y: MONTH_NAMES.map((_, k) => py(offset + span + 3, k)),
    z: MONTH_NAMES.map(() => lastZ),
    text: [...MONTH_NAMES],
    textfont: { size: 10, color: LOOK.text },
    hoverinfo: 'skip',
    showlegend: false,
  };

  // The takeaway in numbers: the mean difference of the first and of the last ten years.
  const meanDiff = (from: number, to: number): number => {
    const v = points.filter((p) => p.year >= from && p.year <= to).map((p) => p.diff);
    return v.reduce((a, b) => a + b, 0) / v.length;
  };
  const lastFull = FIRST_YEAR + MONTHLY_MEAN.length - 2;
  const early = meanDiff(FIRST_YEAR, FIRST_YEAR + 9);
  const late = meanDiff(lastFull - 9, lastFull);
  const edge = offset + span + 4;
  const versus = (v: number): string => `${Math.abs(v).toFixed(1)} °F ${v < 0 ? 'below' : 'above'}`;

  const chart: Chart = createChart(chartEl, {
    data: [spiral, circle(firstZ), circle(lastZ), months],
    layout: {
      title: {
        text: narrow
          ? ''
          : `${FIRST_YEAR}–${FIRST_YEAR + 9} ran ${versus(early)} the ${NORMAL_FROM}–${NORMAL_TO} average, ` +
            `${lastFull - 9}–${lastFull} ${versus(late)} it`,
      },
      margin: { t: narrow ? 16 : 40, l: 0, r: 0, b: 0 },
      scene: {
        aspectmode: 'manual',
        aspectratio: { x: 1, y: 1, z: 1.25 },
        xaxis: { visible: false, range: [-edge, edge] },
        yaxis: { visible: false, range: [-edge, edge] },
        zaxis: { title: { text: 'Year' }, range: [FIRST_YEAR, Math.ceil(lastZ) + 1] },
        camera: { eye: { x: 1.1, y: -1.5, z: 1.35 }, center: { x: 0, y: 0, z: -0.1 } },
      },
    },
    config: chartConfig(narrow),
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
