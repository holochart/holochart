import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { CATEGORY_COLOR, element, ELEMENTS } from './data.mts';
import { fmtDensity } from './elements.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * The periodic table as a field of 3D bars (`bar3d`, a Holochart extension): groups 1 to 18
 * across, periods 1 to 7 in depth (the main table only; the lanthanides and actinides drawn below
 * the table are left out), each bar as tall as the element's density in g/cm³. Elements with no
 * measured density have no bar, and the gases are too light to rise above the floor.
 *
 * The "Color by" toggle (`chart.react`) colors the bars by height through a colorscale with a
 * colorbar (`marker.colorscale` with no color array), or by element category (one color per bar
 * in `marker.color`). A scene annotation (`scene.annotations`) names the tallest bar, osmium.
 * Hover reads each bar's `text`. Drag to orbit.
 */
export const meta: ExampleMeta = {
  title: 'Elements: density across the periodic table in 3D',
  description:
    'The periodic table as 3D bars, group by period, bar height by density in g/cm³, colored by density or category.',
  tags: ['demo', 'bar3d', '3d', 'bar', 'colorscale', 'colorbar', 'annotations', 'react'],
  size: { width: 960, height: 560 },
  testTolerance: 0.004,
};

type Mode = 'density' | 'category';

const SHOWN = ELEMENTS.filter((e) => e.group !== null && e.density !== null);

function figure(mode: Mode, narrow: boolean): Record<string, unknown> {
  const os = element('Os');
  return {
    data: [
      {
        type: 'bar3d',
        name: 'Density',
        x: SHOWN.map((e) => e.group),
        y: SHOWN.map((e) => e.period),
        z: SHOWN.map((e) => e.density),
        text: SHOWN.map(
          (e) =>
            `<b>${e.name}</b> (${e.symbol}), ${e.category.toLowerCase()}<br>` +
            `group ${e.group}, period ${e.period}<br>` +
            `density <b>${fmtDensity(e.density as number)} g/cm³</b>`,
        ),
        hovertemplate: '%{text}<extra></extra>',
        width: 0.72,
        depth: 0.72,
        marker:
          mode === 'density'
            ? {
                colorscale: 'Viridis',
                cmin: 0,
                cmax: 23,
                showscale: true,
                colorbar: { title: { text: 'Density,<br>g/cm³' }, thickness: 12, len: 0.6 },
                line: { width: 0.5 },
              }
            : { color: SHOWN.map((e) => CATEGORY_COLOR[e.category]), line: { width: 0.5 } },
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : 'Density across the periodic table: the heavy metals of period 6 tower over the rest',
      },
      margin: { t: narrow ? 8 : 36, l: 0, r: 0, b: 0 },
      scene: {
        camera: { eye: { x: 0.1, y: -1.5, z: 1.25 }, center: { x: 0, y: 0, z: -0.1 } },
        aspectmode: 'manual',
        aspectratio: { x: 1.9, y: 0.95, z: 0.7 },
        xaxis: { title: { text: 'Group' }, tickvals: [1, 2, 4, 6, 8, 10, 12, 14, 16, 18] },
        // Reversed, so period 1 is at the back, as on a table lying flat in front of you.
        yaxis: { title: { text: 'Period' }, dtick: 1, range: [7.6, 0.4] },
        zaxis: { title: { text: 'g/cm³' }, range: [0, 24], dtick: 5 },
        annotations: [
          {
            x: os.group,
            y: os.period,
            z: os.density,
            text: `Osmium, ${fmtDensity(os.density as number)} g/cm³:<br>the densest element`,
            ax: -70,
            ay: -36,
            arrowhead: 0,
            arrowwidth: 1,
            arrowcolor: LOOK.tick,
            font: { size: 11, color: LOOK.title },
          },
        ],
      },
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('density', narrow));

  segmented<Mode>(
    toolbar,
    'Color by',
    [
      { value: 'density', text: 'Density' },
      { value: 'category', text: 'Category' },
    ],
    (value) => void chart.react(figure(value, narrow)),
    'density',
  );

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
