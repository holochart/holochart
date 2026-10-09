import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { FOOD } from './data.mts';
import { LOOK, mount } from './ui.mts';

/**
 * The effect of a meal on oral THC (Oh 2017, dronabinol 5 mg capsule): four measures, each in its
 * own subplot with its own y axis (`xaxis` to `xaxis4` domains), fasted against fed, with standard
 * deviations as `error_y` bars. Units differ between panels, so each panel's title is an
 * annotation in its axis domain (`xref: 'x2 domain'`).
 */
export const meta: ExampleMeta = {
  title: 'Oral THC: the effect of a high-fat meal',
  description:
    'Lag time, time to peak, peak concentration and exposure for a 5 mg dronabinol capsule fasted and fed, as four bar subplots.',
  tags: ['demo', 'bar', 'subplots', 'error-bars', 'annotations', 'medical'],
  size: { width: 960, height: 420 },
  testTolerance: 0.004,
};

const FASTED = '#80838f';
const FED = '#cc540a';

export function run(el: HTMLElement): ExampleHandle {
  const count = FOOD.measures.length;
  const gap = 0.06;
  const width = (1 - gap * (count - 1)) / count;
  const axis = (i: number): string => (i === 0 ? '' : String(i + 1));
  return mount(el, (narrow) => ({
    data: FOOD.measures.map((m, i) => ({
      type: 'bar' as const,
      x: ['Fasted', 'Fed'],
      y: [m.fasted[0], m.fed[0]],
      xaxis: `x${axis(i)}`,
      yaxis: `y${axis(i)}`,
      error_y: {
        type: 'data' as const,
        array: [m.fasted[1], m.fed[1]],
        arrayminus: [Math.min(m.fasted[1], m.fasted[0]), Math.min(m.fed[1], m.fed[0])],
        color: '#eceef4',
        thickness: 1.5,
        width: 5,
      },
      marker: { color: [FASTED, FED], line: { width: 0 } },
      hovertemplate: `%{x}: %{y} ${m.unit}<extra>${m.name}</extra>`,
      showlegend: false,
    })),
    layout: {
      title: {
        text: narrow ? '' : 'A meal delays the peak by hours and more than doubles exposure',
      },
      margin: { t: 84 },
      bargap: 0.35,
      ...Object.fromEntries(
        FOOD.measures.flatMap((m, i) => {
          const x0 = i * (width + gap);
          return [
            [
              `xaxis${axis(i)}`,
              {
                domain: [x0, x0 + width],
                anchor: `y${axis(i)}`,
                type: 'category',
                showgrid: false,
              },
            ],
            [`yaxis${axis(i)}`, { anchor: `x${axis(i)}`, rangemode: 'tozero', ticksuffix: '' }],
          ];
        }),
      ),
      annotations: FOOD.measures.map((m, i) => ({
        xref: `x${axis(i)} domain`,
        yref: `y${axis(i)} domain`,
        x: 0,
        y: 1.02,
        xanchor: 'left' as const,
        yanchor: 'bottom' as const,
        align: 'left' as const,
        text: `${m.name}<br>${m.unit}`,
        font: { size: 11, color: LOOK.text },
        showarrow: false,
      })),
    },
  }));
}
