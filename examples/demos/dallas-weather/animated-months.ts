import { createChart, type BarTrace, type Chart, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLD,
  CURRENT_YEAR,
  FIRST_YEAR,
  HOT,
  MONTH_NAMES,
  MONTHLY_MEAN,
  NORMAL_FROM,
  NORMAL_TO,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { decadeOf } from './years-events.mts';

/**
 * The seasonal curve, decade by decade, as an animation: one frame per decade from the 1940s to
 * the 2020s (`frames`). The upper panel is the mean temperature of each calendar month in that
 * decade (a `scatter` line with markers) over the 1991–2020 normal, a fixed dotted line that the
 * frames do not touch; the lower panel is the difference from that normal as a `bar` trace, blue
 * below and red above. Each frame names the two traces it changes (`traces`) and gives their new
 * `y` (and bar colors); scatter and bar traces tween between frames.
 *
 * Play runs through the decades and Pause stops (`layout.updatemenus`); the `layout.sliders`
 * decade slider follows playback and can be dragged. Nothing plays until Play is pressed: the
 * chart rests on the first decade. The two panels share the month axis (`yaxis2` with its own
 * `domain`, both anchored to `x`).
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: the seasons, decade by decade',
  description:
    'An animation of the mean temperature of each calendar month, one frame per decade from the 1940s to the 2020s, against the 1991–2020 normal, with Play and Pause buttons and a decade slider.',
  tags: ['demo', 'animation', 'frames', 'scatter', 'bar', 'sliders', 'updatemenus', 'subplots'],
  size: { width: 960, height: 560 },
  testTolerance: 0.004,
};

const round1 = (v: number): number => Math.round(v * 10) / 10;

/** Mean of each calendar month over the years `from`–`to` (months without data are skipped). */
function monthlyMeans(from: number, to: number): number[] {
  return MONTH_NAMES.map((_, m) => {
    const v: number[] = [];
    for (let y = Math.max(from, FIRST_YEAR); y <= Math.min(to, CURRENT_YEAR); y++) {
      const t = MONTHLY_MEAN[y - FIRST_YEAR]?.[m];
      if (t !== null && t !== undefined) v.push(t);
    }
    return v.reduce((a, b) => a + b, 0) / v.length;
  });
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const normal = monthlyMeans(NORMAL_FROM, NORMAL_TO);
  const decades: number[] = [];
  for (let d = decadeOf(FIRST_YEAR); d <= decadeOf(CURRENT_YEAR); d += 10) decades.push(d);
  const steps = decades.map((decade) => {
    const mean = monthlyMeans(decade, decade + 9);
    const diff = mean.map((v, m) => round1(v - (normal[m] as number)));
    return {
      label: `${decade}s`,
      curve: { y: mean.map(round1) },
      bars: { y: diff, marker: { color: diff.map((d) => (d >= 0 ? HOT : COLD)) } },
    };
  });
  const first = steps[0] as (typeof steps)[number];
  const span = Math.ceil(Math.max(...steps.flatMap((s) => s.bars.y.map(Math.abs)))) + 1;
  const months = [...MONTH_NAMES];

  const normalTrace: ScatterTrace = {
    type: 'scatter',
    mode: 'lines',
    name: `${NORMAL_FROM}–${NORMAL_TO} normal`,
    x: months,
    y: normal.map(round1),
    line: { color: LOOK.text, width: 1.5, dash: 'dot' },
    hovertemplate: '%{x}: normal <b>%{y:.1f} °F</b><extra></extra>',
  };
  const curve: ScatterTrace = {
    type: 'scatter',
    mode: 'lines+markers',
    name: 'This decade',
    x: months,
    ...first.curve,
    line: { color: LOOK.title, width: 2 },
    marker: { color: LOOK.title, size: 7 },
    hovertemplate: '%{x}: <b>%{y:.1f} °F</b><extra></extra>',
  };
  const bars: BarTrace = {
    type: 'bar',
    name: 'Difference from normal',
    x: months,
    ...first.bars,
    yaxis: 'y2',
    width: 0.6,
    showlegend: false,
    hovertemplate: '%{x}: <b>%{y:+.1f} °F</b> against normal<extra></extra>',
  };

  const frameMs = 900;
  const animation = (duration: number): Record<string, unknown> => ({
    frame: { duration, redraw: false },
    transition: { duration: Math.round(duration * 0.7), easing: 'cubic-in-out' },
  });

  const chart: Chart = createChart(chartEl, {
    data: [curve, bars, normalTrace],
    frames: steps.map((s) => ({ name: s.label, traces: [0, 1], data: [s.curve, s.bars] })),
    layout: {
      title: {
        text: narrow ? '' : 'The seasonal curve through the decades, against today’s normal',
      },
      hovermode: 'closest',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { t: narrow ? 40 : 84, b: 120, r: 24 },
      xaxis: { type: 'category', anchor: 'y2', fixedrange: true },
      yaxis: {
        domain: [0.44, 1],
        range: [38, 92],
        title: { text: narrow ? '°F' : 'Mean temperature (°F)' },
        ticksuffix: '°',
        zeroline: false,
        fixedrange: true,
      },
      yaxis2: {
        domain: [0, 0.32],
        anchor: 'x',
        range: [-span, span],
        title: { text: narrow ? 'vs normal' : 'Against normal (°F)' },
        tickformat: '+.0f',
        zerolinecolor: LOOK.zero,
        fixedrange: true,
      },
      updatemenus: [
        {
          type: 'buttons',
          direction: 'left',
          showactive: false,
          x: 0,
          xanchor: 'left',
          y: -0.14,
          yanchor: 'top',
          pad: { t: 12 },
          buttons: [
            {
              label: 'Play',
              method: 'animate',
              args: [null, { ...animation(frameMs), fromcurrent: true }],
            },
            {
              label: 'Pause',
              method: 'animate',
              args: [[null], { ...animation(0), mode: 'immediate' }],
            },
          ],
        },
      ],
      sliders: [
        {
          active: 0,
          x: narrow ? 0.34 : 0.16,
          len: narrow ? 0.66 : 0.84,
          y: -0.14,
          yanchor: 'top',
          pad: { t: 12 },
          currentvalue: { prefix: 'Decade: ', xanchor: 'right' },
          transition: { duration: 400, easing: 'cubic-in-out' },
          steps: steps.map((s) => ({
            label: s.label,
            method: 'animate',
            args: [[s.label], { ...animation(400), mode: 'immediate' }],
          })),
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
