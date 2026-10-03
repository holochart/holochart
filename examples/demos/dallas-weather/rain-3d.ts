import { createChart, type Bar3dTrace, type Chart, type FigureInput } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { CURRENT_YEAR, FIRST_YEAR, MONTH_NAMES, MONTHLY_RAIN } from './analysis.mts';
import { monthName, RAIN_SCALE } from './rain.mts';
import { chartConfig, frame, isNarrow, settled } from './ui.mts';

/**
 * Average monthly rain by decade as a landscape of 3D bars (`bar3d`, a Holochart extension):
 * months across, decades in depth (the 1940s at the back), each bar as tall as the average rain
 * of that month in that decade. Bars are colored by height through a blue colorscale
 * (`marker.colorscale` with no color array) with a colorbar. Both floor axes are categories; the
 * month axis keeps calendar order with `categoryorder: 'array'`. Months without a complete rain
 * record are skipped in the averages. Two ridges run through every decade, May and October, with
 * the July and August valley between them. Drag to orbit.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: monthly rain by decade in 3D',
  description:
    'Average rain of each calendar month in each decade since the 1940s as 3D bars, colored by height.',
  tags: ['demo', 'bar3d', '3d', 'bar', 'colorscale', 'colorbar', 'categorical'],
  size: { width: 960, height: 600 },
  testTolerance: 0.004,
};

interface Cell {
  decade: string;
  month: number;
  rain: number;
  years: number;
}

function cells(): { decades: string[]; cells: Cell[] } {
  const decades: string[] = [];
  const out: Cell[] = [];
  for (let d = Math.floor(FIRST_YEAR / 10) * 10; d <= CURRENT_YEAR; d += 10) {
    const label = `${d}s`;
    decades.push(label);
    MONTH_NAMES.forEach((_, m) => {
      const v: number[] = [];
      for (let y = Math.max(d, FIRST_YEAR); y <= Math.min(d + 9, CURRENT_YEAR); y++) {
        const r = MONTHLY_RAIN[y - FIRST_YEAR]?.[m];
        if (r !== null && r !== undefined) v.push(r);
      }
      if (v.length > 0) {
        out.push({
          decade: label,
          month: m + 1,
          rain: v.reduce((a, b) => a + b, 0) / v.length,
          years: v.length,
        });
      }
    });
  }
  return { decades, cells: out };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const { decades, cells: c } = cells();
  const best = c.reduce((a, b) => (b.rain > a.rain ? b : a));
  const top = Math.ceil(best.rain);

  const bars = {
    type: 'bar3d',
    name: 'Rain',
    x: c.map((v) => MONTH_NAMES[v.month - 1] as string),
    y: c.map((v) => v.decade),
    z: c.map((v) => Math.round(v.rain * 100) / 100),
    text: c.map(
      (v) =>
        `${monthName(v.month)} in the ${v.decade}<br><b>${v.rain.toFixed(2)} in</b> a month ` +
        `on average<br>(${v.years} year${v.years === 1 ? '' : 's'} of data)`,
    ),
    hovertemplate: '%{text}<extra></extra>',
    width: 0.74,
    depth: 0.74,
    marker: {
      colorscale: RAIN_SCALE,
      cmin: 0,
      cmax: top,
      showscale: !narrow,
      colorbar: { title: { text: 'Rain per<br>month, in' }, thickness: 12, len: 0.6, dtick: 1 },
      line: { width: 0.5 },
    },
  } satisfies Bar3dTrace;

  const figure: FigureInput = {
    data: [bars],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Average monthly rain by decade: the wettest was ${monthName(best.month)} in the ${best.decade}, ${best.rain.toFixed(1)} inches a month`,
      },
      margin: { t: narrow ? 8 : 36, l: 0, r: 0, b: 0 },
      scene: {
        camera: { eye: { x: 0.7, y: -2.0, z: 1.15 }, center: { x: 0.05, y: 0, z: -0.1 } },
        aspectmode: 'manual',
        aspectratio: { x: 1.8, y: 1.35, z: 0.64 },
        xaxis: {
          title: { text: '' },
          type: 'category',
          categoryorder: 'array',
          categoryarray: MONTH_NAMES,
        },
        yaxis: {
          title: { text: '' },
          type: 'category',
          categoryorder: 'array',
          // Reversed, so the latest decade is in front.
          categoryarray: [...decades].reverse(),
        },
        zaxis: { title: { text: 'Inches' }, range: [0, top], dtick: 1 },
      },
    },
    config: chartConfig(narrow),
  };
  const chart: Chart = createChart(chartEl, figure);

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
