import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { ABSTINENCE } from './data.mts';
import { LOOK, mount } from './ui.mts';

/**
 * Bergamaschi 2013, redrawn from its Table 2: the share of daily cannabis smokers with THC and
 * with THC-COOH still measurable in blood on each day of monitored abstinence, as two lines, and
 * below them (a second subplot on a shared x axis, `yaxis2` domain) how many participants were
 * still resident on that day, as bars. The falling count is why the late percentages jump: on day
 * 30 the 40% is 2 of 5 people.
 */
export const meta: ExampleMeta = {
  title: 'THC in the blood of daily smokers during 30 days of abstinence',
  description:
    'Share of daily cannabis smokers with measurable blood THC and THC-COOH by day of abstinence, with the number still resident as bars on a second subplot.',
  tags: ['demo', 'scatter', 'bar', 'subplots', 'lines', 'medical'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

const THC = '#cc540a';
const COOH = '#5e74d5';

export function run(el: HTMLElement): ExampleHandle {
  const days = ABSTINENCE.map((d) => d.day);
  return mount(el, (narrow) => ({
    data: [
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'THC-COOH (inactive metabolite)',
        x: days,
        y: ABSTINENCE.map((d) => d.coohPct),
        line: { color: COOH, width: 2 },
        marker: { size: 6, color: COOH },
        hovertemplate: 'day %{x}: %{y:.0f}% positive<extra>THC-COOH</extra>',
      },
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'THC',
        x: days,
        y: ABSTINENCE.map((d) => d.thcPct),
        customdata: ABSTINENCE.map((d) => [d.n, d.thcMedian ?? 'none']),
        line: { color: THC, width: 2.5 },
        marker: { size: 7, color: THC },
        hovertemplate:
          'day %{x}: %{y:.0f}% of %{customdata[0]} positive, median %{customdata[1]} µg/L<extra>THC</extra>',
      },
      {
        type: 'bar',
        name: 'Participants still resident',
        x: days,
        y: ABSTINENCE.map((d) => d.n),
        yaxis: 'y2',
        marker: { color: LOOK.zero, line: { width: 0 } },
        hovertemplate: 'day %{x}: %{y} participants<extra></extra>',
        showlegend: false,
      },
    ],
    layout: {
      title: {
        text: narrow ? '' : 'Half of daily smokers still had THC in their blood after two weeks',
      },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      bargap: 0.25,
      xaxis: {
        title: { text: 'Days since admission' },
        range: [-0.7, 30.7],
        dtick: 5,
        anchor: 'y2',
        zeroline: false,
      },
      yaxis: {
        domain: [0.3, 1],
        title: { text: 'Participants at or above 0.25 µg/L, %' },
        range: [0, 105],
        ticksuffix: '%',
      },
      yaxis2: {
        domain: [0, 0.2],
        title: { text: 'Resident' },
        range: [0, 32],
        dtick: 15,
      },
    },
  }));
}
