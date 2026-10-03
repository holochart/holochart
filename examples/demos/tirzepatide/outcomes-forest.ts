import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, fmtHr, OUTCOMES, type Outcome } from './data.mts';
import { LOOK, mount, NO_EFFECT_LINE } from './ui.mts';

/**
 * Primary results of the GLP-1 receptor agonist outcome trials and of tirzepatide's two outcome
 * trials, as a forest plot: hazard ratios on a log axis with asymmetric `error_x` intervals,
 * squares sized by the number randomised (area proportional to n). The two groups are separate
 * traces, and each row's text column on the right repeats the estimate. This is a display of
 * individual trial results, not a meta-analysis: there is no pooled estimate.
 */
export const meta: ExampleMeta = {
  title: 'GLP-1 receptor agonist and tirzepatide outcome trials',
  description:
    'Primary hazard ratios of twelve outcome trials as a forest plot on a log axis, squares sized by trial size, with the estimates as a text column.',
  tags: ['demo', 'scatter', 'error-bars', 'log', 'forest-plot', 'medical', 'annotations'],
  size: { width: 960, height: 600 },
  testTolerance: 0.004,
};

const GROUPS = [
  { key: 'GLP-1 receptor agonist vs placebo', color: COLOR.sema },
  { key: 'Tirzepatide', color: COLOR.tirz15 },
] as const;

export function run(el: HTMLElement): ExampleHandle {
  const rows = OUTCOMES.map((o) => o.label);
  const size = (o: Outcome): number => 5 + Math.sqrt(o.n) / 9;
  const hover = (o: Outcome): string =>
    `${o.trial} (${o.ref.short}): ${o.drug} vs ${o.comparator}<br>` +
    `n = ${o.n.toLocaleString('en-US')}, median follow-up ${o.followUp}<br>` +
    `${o.endpoint}: HR ${fmtHr(o)}<br>events ${o.events ?? 'n/a'}${o.note ? `<br>${o.note}` : ''}`;

  return mount(el, (narrow) => ({
    data: GROUPS.map((g) => {
      const trials = OUTCOMES.filter((o) => o.group === g.key);
      return {
        type: 'scatter' as const,
        mode: 'markers' as const,
        name: g.key,
        x: trials.map((o) => o.hr),
        y: trials.map((o) => o.label),
        marker: { symbol: 'square', color: g.color, opacity: 1, size: trials.map(size) },
        error_x: {
          type: 'data' as const,
          array: trials.map((o) => o.hi - o.hr),
          arrayminus: trials.map((o) => o.hr - o.lo),
          color: '#9aa0b4',
          thickness: 1.5,
          width: 3,
        },
        hovertext: trials.map(hover),
        hoverinfo: 'text' as const,
      };
    }),
    layout: {
      title: { text: narrow ? '' : 'Outcome trials: every point estimate favours treatment' },
      margin: { l: narrow ? 130 : 230, r: narrow ? 20 : 150, b: 110 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: {
        type: 'log',
        range: [Math.log10(0.38), Math.log10(1.3)],
        tickvals: [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.2],
        title: { text: 'Hazard ratio, primary endpoint (log scale)' },
        zeroline: false,
      },
      yaxis: { autorange: 'reversed', categoryorder: 'array', categoryarray: rows },
      shapes: [
        {
          type: 'line',
          xref: 'x',
          yref: 'paper',
          x0: 1,
          x1: 1,
          y0: 0,
          y1: 1,
          line: NO_EFFECT_LINE,
        },
      ],
      annotations: narrow
        ? []
        : [
            ...OUTCOMES.map((o) => ({
              xref: 'paper' as const,
              yref: 'y' as const,
              x: 1.02,
              y: o.label,
              xanchor: 'left' as const,
              text: fmtHr(o),
              font: { size: 11, color: LOOK.text },
              showarrow: false,
            })),
            {
              xref: 'paper',
              yref: 'paper',
              x: 0,
              y: -0.13,
              xanchor: 'left',
              yanchor: 'top',
              text: 'Squares are sized by the number randomised; bars are 95% confidence intervals. Not pooled: endpoints and comparators differ.',
              font: { size: 11, style: 'italic', color: LOOK.tick },
              showarrow: false,
            },
          ],
    },
  }));
}
