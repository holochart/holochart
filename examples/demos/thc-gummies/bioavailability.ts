import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { BIOAVAILABILITY, ROUTE_COLOR } from './data.mts';
import { LOOK, mount } from './ui.mts';

/**
 * How much of a THC dose reaches the bloodstream, from the studies that compared each route with
 * an intravenous dose in the same people: a dot plot with the printed standard deviation as
 * `error_x` bars. One study reported only a range, drawn as a plain segment (a `lines` trace
 * broken by nulls) with no dot, since no mean was given.
 */
export const meta: ExampleMeta = {
  title: 'THC: bioavailability when smoked and when eaten',
  description:
    'Systemic bioavailability of smoked and eaten THC from four classic studies, as a dot plot with standard deviations and one reported range.',
  tags: ['demo', 'scatter', 'error-bars', 'dot-plot', 'category', 'medical'],
  size: { width: 960, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const rows = BIOAVAILABILITY.map((b) => `${b.label}<br>${b.ref.short}`);
  const means = BIOAVAILABILITY.map((b, i) => ({ b, row: rows[i] as string })).filter(
    ({ b }) => b.mean !== undefined,
  );
  const ranges = BIOAVAILABILITY.map((b, i) => ({ b, row: rows[i] as string })).filter(
    ({ b }) => b.range !== undefined,
  );
  return mount(el, (narrow) => ({
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        x: ranges.flatMap(({ b }) => [b.range![0], b.range![1], null]),
        y: ranges.flatMap(({ row }) => [row, row, null]),
        line: { color: ROUTE_COLOR.oral, width: 6 },
        hoverinfo: 'skip',
        showlegend: false,
      },
      {
        type: 'scatter',
        mode: 'markers',
        x: means.map(({ b }) => b.mean as number),
        y: means.map(({ row }) => row),
        error_x: {
          type: 'data',
          array: means.map(({ b }) => b.sd ?? 0),
          color: '#80838f',
          thickness: 1.5,
          width: 4,
        },
        marker: { size: 13, color: means.map(({ b }) => ROUTE_COLOR[b.route]) },
        hovertemplate: '%{x}%<extra>%{y}</extra>',
        showlegend: false,
      },
    ],
    layout: {
      title: {
        text: narrow ? '' : 'A third as much THC gets in from a cookie as from a cigarette',
      },
      margin: { l: narrow ? 150 : 190, t: 60 },
      xaxis: {
        title: { text: 'Share of the dose reaching the blood, %' },
        range: [0, 42],
        ticksuffix: '%',
        zeroline: false,
      },
      yaxis: { autorange: 'reversed', categoryorder: 'array', categoryarray: rows },
      annotations: narrow
        ? []
        : [
            {
              x: 15,
              y: rows[5] as string,
              yshift: 14,
              text: 'reported as a range, 10 to 20%',
              font: { size: 11, style: 'italic', color: LOOK.tick },
              showarrow: false,
            },
          ],
    },
  }));
}
