import { createChart, type Chart, type LayoutAnnotation, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { daysOf, linreg, MONTH, PRCP, TMAX, YEARS } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { YEAR_SCALE } from './years-events.mts';

/**
 * Each summer (June to August) as one bubble: total rain against the mean daily high, with
 * bubble area in proportion to the number of days of 100 °F or more (`marker.sizemode: 'area'`,
 * `sizeref`, `sizemin`) and color by year on a sequential scale with a colorbar
 * (`marker.colorscale`, `marker.colorbar`). Summers with a missing rain reading are left out.
 * The dotted line is a least-squares fit; its slope is quoted in the note.
 *
 * Dry summers are hot summers: wet ground and cloud keep the afternoons cooler, dry ground lets
 * them run away. 1980 and 2011, the two hottest, are among the driest. Annotations label them and
 * the wettest summer.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: dry summers are hot summers',
  description:
    'A bubble chart of every summer since 1940: June to August rain against the mean daily high, bubble size by the number of 100 °F days, color by year, with a fitted line.',
  tags: [
    'demo',
    'scatter',
    'bubble',
    'markers',
    'sizeref',
    'colorscale',
    'colorbar',
    'annotations',
  ],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

interface Summer {
  year: number;
  rain: number;
  meanHigh: number;
  days100: number;
}

/** June to August of each complete year with a rain reading on every day. */
function summers(): Summer[] {
  return YEARS.flatMap((year): Summer[] => {
    const idx = daysOf(year).filter((i) => (MONTH[i] as number) >= 6 && (MONTH[i] as number) <= 8);
    const rain = idx.map((i) => PRCP[i]);
    if (rain.some((p) => p === null || p === undefined)) return [];
    const highs = idx.map((i) => TMAX[i]).filter((t): t is number => t !== null && t !== undefined);
    if (highs.length < idx.length - 5) return [];
    return [
      {
        year,
        rain: (rain as number[]).reduce((a, b) => a + b, 0),
        meanHigh: highs.reduce((a, b) => a + b, 0) / highs.length,
        days100: highs.filter((t) => t >= 100).length,
      },
    ];
  });
}

/** Bubble diameter of the summer with the most 100 °F days, in px. */
const MAX_PX = 34;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const all = summers();
  const most = Math.max(...all.map((s) => s.days100));
  const maxRain = Math.max(...all.map((s) => s.rain));
  const wettest = all.find((s) => s.rain === maxRain) as Summer;
  const fit = linreg(
    all.map((s) => s.rain),
    all.map((s) => s.meanHigh),
  );
  const cooler = fit.m < 0 ? 'cooler' : 'warmer';
  const firstYear = (all[0] as Summer).year;
  const lastYear = (all[all.length - 1] as Summer).year;
  const colorTicks: number[] = [];
  for (let y = Math.ceil(firstYear / 20) * 20; y <= lastYear; y += 20) colorTicks.push(y);

  const maxPx = narrow ? MAX_PX * 0.6 : MAX_PX;
  const bubbles: ScatterTrace = {
    type: 'scatter',
    mode: 'markers',
    name: 'Summers',
    x: all.map((s) => s.rain),
    y: all.map((s) => s.meanHigh),
    customdata: all.map((s) => [s.year, s.days100]),
    marker: {
      color: all.map((s) => s.year),
      colorscale: YEAR_SCALE,
      cmin: firstYear,
      cmax: lastYear,
      showscale: !narrow,
      colorbar: {
        title: { text: 'Year', side: 'right' },
        tickvals: colorTicks,
        tickformat: 'd',
        thickness: 12,
      },
      size: all.map((s) => s.days100),
      sizemode: 'area',
      sizeref: most / maxPx ** 2,
      sizemin: 3,
      opacity: 0.8,
      line: { color: LOOK.bg, width: 1 },
    },
    hovertemplate:
      '<b>Summer %{customdata[0]}</b><br>%{x:.1f} in of rain, mean high %{y:.1f} °F<br>' +
      '%{customdata[1]} days of 100 °F or more<extra></extra>',
  };
  const x0 = 0;
  const x1 = Math.ceil(maxRain) + 1;
  const line: ScatterTrace = {
    type: 'scatter',
    mode: 'lines',
    name: 'Least-squares line',
    x: [x0, x1],
    y: [fit.b + fit.m * x0, fit.b + fit.m * x1],
    line: { color: LOOK.text, width: 1.25, dash: 'dot' },
    hoverinfo: 'skip',
  };

  const label = (s: Summer, text: string, ax: number, ay: number): LayoutAnnotation => ({
    x: s.rain,
    y: s.meanHigh,
    text,
    showarrow: true,
    arrowhead: 0,
    arrowwidth: 1,
    arrowcolor: LOOK.tick,
    ax: narrow ? ax / 2 : ax,
    ay: narrow ? ay / 2 : ay,
    font: { size: 11, color: LOOK.title },
  });
  const named = [1980, 2011].flatMap((year) => {
    const s = all.find((v) => v.year === year);
    return s ? [s] : [];
  });
  const labels: LayoutAnnotation[] = [
    ...named.map((s, k) =>
      label(
        s,
        narrow ? String(s.year) : `${s.year}: ${s.days100} days of 100 °F+`,
        k === 0 ? 150 : 110,
        k === 0 ? 8 : -14,
      ),
    ),
    label(
      wettest,
      narrow
        ? String(wettest.year)
        : `${wettest.year}, the wettest: ${wettest.rain.toFixed(1)} in, ${wettest.days100} days of 100 °F+`,
      -60,
      34,
    ),
  ];

  const highs = all.map((s) => s.meanHigh);
  const chart: Chart = createChart(chartEl, {
    data: [line, bubbles],
    layout: {
      title: {
        text: narrow
          ? ''
          : 'Dry summers are hot summers. Bubble size shows the days of 100 °F or more',
      },
      hovermode: 'closest',
      showlegend: false,
      margin: narrow ? { r: 16 } : {},
      xaxis: {
        title: { text: 'Rain, June to August (inches)' },
        range: [x0 - 0.6, x1],
        zeroline: false,
      },
      yaxis: {
        title: { text: 'Mean daily high, June to August (°F)' },
        range: [Math.floor(Math.min(...highs)) - 1, Math.ceil(Math.max(...highs)) + 1.5],
        ticksuffix: '°',
        zeroline: false,
      },
      annotations: [
        ...labels,
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.99,
          xanchor: 'right',
          y: 0.98,
          yanchor: 'top',
          align: 'right',
          showarrow: false,
          text: narrow
            ? `${Math.abs(fit.m).toFixed(1)} °F ${cooler} per extra inch of rain`
            : `Dotted line: each extra inch of summer rain goes with<br>afternoons ${Math.abs(fit.m).toFixed(1)} °F ${cooler} on average (${all.length} summers)`,
          font: { size: 11, color: LOOK.title },
        },
      ],
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
