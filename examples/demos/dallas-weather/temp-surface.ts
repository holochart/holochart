import { createChart, type Chart, type SurfaceTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { MONTH_NAMES, N, slot, slotDate, TEMP_SCALE, TMAX, YEAR, YEARS } from './analysis.mts';
import { chartConfig, frame, isNarrow, settled } from './ui.mts';

/**
 * The whole record as a landscape: a `surface` with the week of the year (1 to 52) along x, the
 * year along y and the mean daily high of that week as the height, colored with the diverging
 * temperature scale (`colorscale`, `cmin` / `cmax`). The week axis is labelled with month names
 * (`scene.xaxis.tickvals` / `ticktext`), the box is stretched along the years
 * (`scene.aspectratio`) and the camera looks along the ridge from the recent end.
 *
 * Every year is one wave, low in winter and high in summer, so the summers line up as a ridge
 * running through the decades, with cold snaps as notches in the winter edges.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: every week since 1940 as a surface',
  description:
    'A 3D surface of the mean daily high at Dallas Love Field for each week of each year since 1940: week by year by temperature.',
  tags: ['demo', 'surface', '3d', 'colorscale', 'camera', 'time series'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

const WEEKS = 52;
/** Week of the year 0–51 of a day-of-year slot; the last week takes the year's extra days. */
const weekOf = (s: number): number => Math.min(WEEKS - 1, Math.floor(s / 7));

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const first = YEARS[0] as number;
  const sum = YEARS.map(() => new Array<number>(WEEKS).fill(0));
  const count = YEARS.map(() => new Array<number>(WEEKS).fill(0));
  for (let i = 0; i < N; i++) {
    const t = TMAX[i];
    const row = (YEAR[i] as number) - first;
    if (t === null || t === undefined || row < 0 || row >= YEARS.length) continue;
    const w = weekOf(slot(i));
    (sum[row] as number[])[w] = ((sum[row] as number[])[w] as number) + t;
    (count[row] as number[])[w] = ((count[row] as number[])[w] as number) + 1;
  }
  // A week with no reading at all takes the mean of its neighbors in the same year.
  const z = sum.map((row, y) =>
    row.map((s, w) => {
      const n = (count[y] as number[])[w] as number;
      if (n > 0) return Math.round((s / n) * 10) / 10;
      const near: number[] = [];
      for (const d of [-1, 1]) {
        const m = (count[y] as number[])[w + d];
        if (m) near.push((row[w + d] as number) / m);
      }
      return near.length ? near.reduce((a, b) => a + b, 0) / near.length : null;
    }),
  );
  const flat = z.flat().filter((v): v is number => v !== null);
  const lo = Math.floor(Math.min(...flat) / 10) * 10;
  const hi = Math.ceil(Math.max(...flat) / 10) * 10;
  const weeks = Array.from({ length: WEEKS }, (_, w) => w + 1);
  // The first day of each week, for hover ("week of Jul 15").
  const weekStart = weeks.map((w) => {
    const d = slotDate((w - 1) * 7);
    return `${MONTH_NAMES[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
  });
  // Month ticks on the week axis: the week in which each month starts.
  const monthTicks = MONTH_NAMES.map((_, k) => {
    const s = Math.round((Date.UTC(2000, k, 1) - Date.UTC(2000, 0, 1)) / 86_400_000);
    return s / 7 + 1;
  });

  const surface: SurfaceTrace = {
    type: 'surface',
    name: 'Mean daily high',
    x: weeks,
    y: [...YEARS],
    z,
    customdata: YEARS.map(() => weekStart),
    colorscale: TEMP_SCALE,
    cmin: lo,
    cmax: hi,
    colorbar: {
      title: { text: 'Mean high (°F)', side: 'right' },
      thickness: 12,
      len: 0.7,
    },
    hovertemplate: 'Week of %{customdata}, %{y}<br>mean high <b>%{z:.0f} °F</b><extra></extra>',
  };

  const chart: Chart = createChart(chartEl, {
    data: [surface],
    layout: {
      title: {
        text: narrow
          ? ''
          : `${YEARS.length} years of weekly highs: summer is a ridge through the decades`,
      },
      margin: { t: narrow ? 16 : 40, l: 0, r: 0, b: 0 },
      scene: {
        aspectmode: 'manual',
        aspectratio: { x: 1.3, y: 1.7, z: 0.55 },
        xaxis: {
          title: { text: '' },
          range: [1, WEEKS],
          tickmode: 'array',
          tickvals: monthTicks.filter((_, k) => k % 2 === 0),
          ticktext: MONTH_NAMES.filter((_, k) => k % 2 === 0),
        },
        yaxis: { title: { text: 'Year' }, range: [first, YEARS[YEARS.length - 1] as number] },
        zaxis: { title: { text: '' }, range: [lo, hi], ticksuffix: ' °F' },
        camera: { eye: { x: -1.55, y: 1.92, z: 1.1 }, center: { x: 0, y: 0, z: -0.35 } },
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
