import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { fmtDuration, HALF_LIVES, ROUTE_COLOR, type HalfLife } from './data.mts';
import { LOOK, mount } from './ui.mts';

/**
 * Every elimination half-life of THC and of its urinary metabolite found in the studies, on one
 * log time axis from 2 hours to 2 weeks: reported means as dots, reported ranges as segments (a
 * `lines` trace broken by nulls), colored by route. Each row's label carries how long the study
 * sampled, and the text column on the right prints the value. The estimates climb with the
 * sampling period, not with the route.
 */
export const meta: ExampleMeta = {
  title: 'THC: reported elimination half-lives by route and sampling period',
  description:
    'Reported half-lives of plasma THC and urinary THC-COOH on a log time axis, as dots and range segments colored by route, labelled with each study’s sampling period.',
  tags: ['demo', 'scatter', 'log', 'dot-plot', 'category', 'annotations', 'medical'],
  size: { width: 960, height: 680 },
  testTolerance: 0.004,
};

const MIXED = '#a4a7b5';
const colorOf = (h: HalfLife): string => (h.route === 'mixed' ? MIXED : ROUTE_COLOR[h.route]);

const valueText = (h: HalfLife): string => {
  if (h.hours !== undefined) return fmtDuration(h.hours);
  const [lo, hi] = h.range as readonly [number, number];
  return `${fmtDuration(lo)} to ${fmtDuration(hi)}`;
};

export function run(el: HTMLElement): ExampleHandle {
  const rows = HALF_LIVES.map(
    (h, i) => `${h.label}<br>${h.ref.short} · sampled ${h.sampling}#${i}`,
  );
  // Category values must be unique, so each carries its index; tick labels drop it.
  const ticktext = rows.map((r) => r.replace(/#\d+$/, ''));
  const firstUrine = HALF_LIVES.findIndex((h) => h.group === 'THC-COOH in urine');
  const hover = (h: HalfLife): string =>
    `${h.label} (${h.ref.short})<br>${h.group}: ${valueText(h)}<br>sampled: ${h.sampling}` +
    (h.note ? `<br>${h.note}` : '') +
    (h.tier === 'secondary' ? '<br>quoted from a review' : '');
  const ranged = HALF_LIVES.map((h, i) => ({ h, row: rows[i] as string })).filter(
    ({ h }) => h.range !== undefined,
  );
  const dots = HALF_LIVES.map((h, i) => ({ h, row: rows[i] as string })).filter(
    ({ h }) => h.hours !== undefined,
  );

  return mount(el, (narrow) => ({
    data: [
      ...ranged.map(({ h, row }) => ({
        type: 'scatter' as const,
        mode: 'lines' as const,
        x: [...(h.range as readonly [number, number])],
        y: [row, row],
        line: { color: colorOf(h), width: 7 },
        hovertext: hover(h),
        hoverinfo: 'text' as const,
        showlegend: false,
      })),
      {
        type: 'scatter' as const,
        mode: 'markers' as const,
        x: dots.map(({ h }) => h.hours as number),
        y: dots.map(({ row }) => row),
        marker: {
          size: 13,
          color: dots.map(({ h }) => colorOf(h)),
          line: { color: LOOK.bg, width: 2 },
        },
        hovertext: dots.map(({ h }) => hover(h)),
        hoverinfo: 'text' as const,
        showlegend: false,
      },
    ],
    layout: {
      title: {
        text: narrow ? '' : 'The longer a study samples, the longer the half-life it finds',
      },
      margin: { l: narrow ? 160 : 290, r: narrow ? 20 : 120, t: 60 },
      xaxis: {
        type: 'log',
        title: { text: 'Elimination half-life (log scale)' },
        range: [Math.log10(2), Math.log10(400)],
        tickvals: [3, 6, 12, 24, 48, 96, 168, 336],
        ticktext: ['3 h', '6 h', '12 h', '1 day', '2 days', '4 days', '1 week', '2 weeks'],
        zeroline: false,
      },
      yaxis: {
        autorange: 'reversed',
        categoryorder: 'array',
        categoryarray: rows,
        tickvals: rows,
        ticktext,
      },
      shapes: [
        {
          type: 'line',
          xref: 'paper',
          yref: 'y',
          x0: 0,
          x1: 1,
          y0: firstUrine - 0.5,
          y1: firstUrine - 0.5,
          line: { color: LOOK.zero, width: 1 },
        },
      ],
      annotations: narrow
        ? []
        : [
            ...HALF_LIVES.map((h, i) => ({
              xref: 'paper' as const,
              yref: 'y' as const,
              x: 1.02,
              y: rows[i] as string,
              xanchor: 'left' as const,
              text: valueText(h),
              font: { size: 11, color: LOOK.text },
              showarrow: false,
            })),
            {
              xref: 'paper',
              yref: 'y',
              x: 1,
              y: rows[0] as string,
              yshift: 22,
              xanchor: 'right',
              text: '<b>THC in plasma</b> · orange eaten, purple smoked, grey intravenous or both',
              font: { size: 11, color: LOOK.text },
              showarrow: false,
            },
            {
              xref: 'paper',
              yref: 'y',
              x: 1,
              y: rows[firstUrine] as string,
              yshift: 22,
              xanchor: 'right',
              text: '<b>THC-COOH in urine</b>',
              font: { size: 11, color: LOOK.text },
              showarrow: false,
            },
          ],
    },
  }));
}
