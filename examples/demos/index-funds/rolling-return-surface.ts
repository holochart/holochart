import { createChart, type Chart, type Scatter3dTrace, type SurfaceTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { fmtDate, pct, RETURN_SCALE, rollingReturn, SPLIT_DATE } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Every holding period at once: a 3D `surface` of SPY's trailing total return (height and color)
 * by the date the period ended (x, every fifth session, so the mesh stays light) and the length
 * of the period in months (y, 1 to 12, a month being 21 sessions). The diverging return scale is
 * centered on zero with a symmetric `cmin` / `cmax`, so red patches are periods that lost money.
 * The x axis counts sessions and is labelled with years (`scene.xaxis.tickvals` / `ticktext`), so
 * the trading days are evenly spaced; `customdata` carries each column's date for the hover label.
 * A `scatter3d` line runs over the surface at the split of the four years (Sep 30, 2024). Narrow
 * containers get a camera further back, so the whole box stays in the frame.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: SPY’s trailing return by holding period',
  description:
    'A 3D surface of SPY’s trailing total return over 1 to 12 months, for every week from October 2022 to September 2026, colored around zero.',
  tags: ['demo', 'surface', 'scatter3d', '3d', 'colorscale', 'camera', 'financial'],
  size: { width: 720, height: 600 },
  testTolerance: 0.004,
};

/** Sessions in a month, and between two columns of the mesh. */
const MONTH = 21;
const STEP = 5;
const MONTHS = Array.from({ length: 12 }, (_, k) => k + 1);

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const full = MONTHS.map((m) => rollingReturn('SPY', MONTH * m));
  const dates = full[0]!.dates;
  // Every fifth session, counted back from the last one so the surface ends on the last close.
  const columns: number[] = [];
  for (let i = dates.length - 1; i >= 0; i -= STEP) columns.unshift(i);
  const z = full.map((r) => columns.map((i) => r.value[i] as number));
  const labels = columns.map((i) => fmtDate(dates[i] as string));

  const flat = z.flat();
  const low = Math.min(...flat);
  const high = Math.max(...flat);
  const bound = Math.ceil(Math.max(-low, high) * 20) / 20;
  const zMin = Math.floor(low * 10) / 10;
  const zMax = Math.ceil(high * 10) / 10;

  // Year ticks: the first session of each calendar year.
  const yearTicks = dates
    .map((d, i) => ({ d, i }))
    .filter(({ d, i }) => i > 0 && d.slice(0, 4) !== (dates[i - 1] as string).slice(0, 4));

  const surface: SurfaceTrace = {
    type: 'surface',
    name: 'SPY trailing return',
    x: columns,
    y: MONTHS,
    z,
    customdata: MONTHS.map(() => labels),
    colorscale: RETURN_SCALE,
    cmin: -bound,
    cmax: bound,
    colorbar: {
      title: { text: 'Total return', side: 'right' },
      tickvals: [-0.4, -0.2, 0, 0.2, 0.4].filter((v) => Math.abs(v) <= bound),
      ticktext: [-0.4, -0.2, 0, 0.2, 0.4]
        .filter((v) => Math.abs(v) <= bound)
        .map((v) => (v === 0 ? '0%' : pct(v))),
      thickness: 12,
      len: 0.6,
    },
    hovertemplate:
      '%{y} months to %{customdata}<br>SPY total return <b>%{z:+.1%}</b><extra></extra>',
  };

  // The split of the four years, as a line lying on the surface.
  const splitAt = dates.indexOf(SPLIT_DATE);
  const split: Scatter3dTrace = {
    type: 'scatter3d',
    mode: 'lines',
    name: `Split, ${fmtDate(SPLIT_DATE)}`,
    x: MONTHS.map(() => splitAt),
    y: MONTHS,
    z: full.map((r) => (r.value[splitAt] as number) + 0.004),
    line: { color: LOOK.title, width: 3 },
    hoverinfo: 'skip',
  };

  const zTicks = [-0.2, 0, 0.2, 0.4].filter((v) => v >= zMin && v <= zMax);
  const chart: Chart = createChart(chartEl, {
    data: [surface, split],
    layout: {
      title: {
        text: narrow ? '' : 'SPY: total return over the trailing 1 to 12 months, week by week',
      },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      showlegend: !narrow,
      margin: { t: narrow ? 16 : 64, l: 0, r: 0, b: 0 },
      scene: {
        aspectmode: 'manual',
        aspectratio: { x: 1.7, y: 1, z: 0.7 },
        xaxis: {
          title: { text: 'Period ending' },
          range: [0, dates.length - 1],
          tickmode: 'array',
          tickvals: yearTicks.map((t) => t.i),
          ticktext: yearTicks.map((t) => `Jan ${t.d.slice(0, 4)}`),
        },
        yaxis: {
          title: { text: 'Months held' },
          range: [1, 12],
          tickmode: 'array',
          tickvals: [1, 3, 6, 9, 12],
        },
        zaxis: {
          // Phones: the colorbar already says it.
          title: { text: narrow ? '' : 'Total return' },
          range: [zMin, zMax],
          tickmode: 'array',
          tickvals: zTicks,
          ticktext: zTicks.map((v) => (v === 0 ? '0%' : pct(v))),
        },
        camera: narrow
          ? { eye: { x: -2.1, y: -2.4, z: 1.2 }, center: { x: -0.38, y: 0.05, z: -0.3 } }
          : { eye: { x: -1.5, y: -1.7, z: 0.85 }, center: { x: -0.22, y: 0.05, z: -0.27 } },
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
