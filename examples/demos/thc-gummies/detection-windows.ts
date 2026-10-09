import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { DETECTION, fmtDuration, ROUTE_COLOR, type Detection } from './data.mts';
import { LOOK, mount } from './ui.mts';

/**
 * How long tests stay positive, on a log time axis from 6 hours to 6 weeks. A dot is the mean time
 * of the last positive result, a segment the range between individuals (one `lines` trace per
 * row), and a right-pointing triangle the longest time observed where that is what the study
 * reports. Color separates a single eaten dose, a single smoked dose and people stopping regular
 * use.
 */
export const meta: ExampleMeta = {
  title: 'THC: how long blood, oral fluid and urine tests stay positive',
  description:
    'Time to last positive test after a single eaten or smoked dose and after stopping regular use, as dots, range segments and longest-observed markers on a log time axis.',
  tags: ['demo', 'scatter', 'log', 'dot-plot', 'symbols', 'category', 'medical'],
  size: { width: 960, height: 640 },
  testTolerance: 0.004,
};

const PRIOR = '#80838f';
const colorOf = (d: Detection): string => (d.route === 'prior use' ? PRIOR : ROUTE_COLOR[d.route]);

export function run(el: HTMLElement): ExampleHandle {
  const rows = DETECTION.map((d, i) => `${d.label}<br>${d.who}#${i}`);
  const ticktext = rows.map((r) => r.replace(/#\d+$/, ''));
  const hover = (d: Detection): string =>
    `${d.label}, ${d.who} (${d.ref.short})<br>cutoff ${d.cutoff}` +
    (d.mean !== undefined ? `<br>mean last positive ${fmtDuration(d.mean)}` : '') +
    (d.range ? `<br>range ${fmtDuration(d.range[0])} to ${fmtDuration(d.range[1])}` : '') +
    (d.longest !== undefined ? `<br>longest observed ${fmtDuration(d.longest)}` : '') +
    (d.note ? `<br>${d.note}` : '');
  const withRow = DETECTION.map((d, i) => ({ d, row: rows[i] as string }));
  const spans = withRow.filter(({ d }) => d.range !== undefined || d.longest !== undefined);
  const means = withRow.filter(({ d }) => d.mean !== undefined);
  const longest = withRow.filter(({ d }) => d.longest !== undefined);

  return mount(el, (narrow) => ({
    data: [
      ...spans.map(({ d, row }) => {
        const lo = d.range ? d.range[0] : (d.mean ?? d.longest ?? 0);
        const hi = d.range ? d.range[1] : (d.longest ?? 0);
        return {
          type: 'scatter' as const,
          mode: 'lines' as const,
          x: [lo, hi],
          y: [row, row],
          line: { color: colorOf(d), width: d.range ? 5 : 1.5, dash: d.range ? 'solid' : 'dot' },
          hoverinfo: 'skip' as const,
          showlegend: false,
        };
      }),
      {
        type: 'scatter' as const,
        mode: 'markers' as const,
        name: 'Mean last positive (bar: range between people)',
        x: means.map(({ d }) => d.mean as number),
        y: means.map(({ row }) => row),
        marker: {
          size: 13,
          color: means.map(({ d }) => colorOf(d)),
          line: { color: LOOK.bg, width: 2 },
        },
        hovertext: means.map(({ d }) => hover(d)),
        hoverinfo: 'text' as const,
      },
      {
        type: 'scatter' as const,
        mode: 'markers' as const,
        name: 'Longest observed',
        x: longest.map(({ d }) => d.longest as number),
        y: longest.map(({ row }) => row),
        marker: {
          size: 12,
          symbol: 'triangle-right',
          color: longest.map(({ d }) => colorOf(d)),
        },
        hovertext: longest.map(({ d }) => hover(d)),
        hoverinfo: 'text' as const,
      },
    ],
    layout: {
      title: { text: narrow ? '' : 'One edible: two to four days in urine. Regular use: weeks' },
      margin: { l: narrow ? 160 : 250, b: 80 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: {
        type: 'log',
        title: { text: 'Time since the dose, or since stopping (log scale)' },
        range: [Math.log10(6), Math.log10(1000)],
        tickvals: [6, 12, 24, 48, 96, 168, 336, 720],
        ticktext: ['6 h', '12 h', '1 day', '2 days', '4 days', '1 week', '2 weeks', '30 days'],
        zeroline: false,
      },
      yaxis: {
        autorange: 'reversed',
        categoryorder: 'array',
        categoryarray: rows,
        tickvals: rows,
        ticktext,
      },
      annotations: narrow
        ? []
        : [
            {
              xref: 'paper',
              yref: 'paper',
              x: 0,
              y: -0.13,
              xanchor: 'left',
              yanchor: 'top',
              text: 'Orange: one eaten dose. Purple: one smoked dose. Grey: after stopping regular smoking.',
              font: { size: 11, style: 'italic', color: LOOK.tick },
              showarrow: false,
            },
          ],
    },
  }));
}
