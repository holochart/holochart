import { createChart, type BarpolarTrace, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Light through two polarizing filters, like two pairs of polarized sunglasses held one behind the
 * other: the share of the light from the first filter that gets through the second depends on the
 * angle between them, `I / I0 = cos²θ` (Malus's law). One `barpolar` bar every 15° round the full
 * circle, its length and its color (`marker.color` on a colorscale) both giving the share: all of
 * the light at 0° and 180°, none at 90° and 270°, half at 45°.
 */
export const meta: ExampleMeta = {
  title: 'Light: two polarizing filters',
  description:
    'Polar bars of the share of light passing a second polarizing filter against the angle between the filters, cos² of the angle.',
  tags: ['demo', 'barpolar', 'polar', 'colorscale', 'physics'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

const STEP = 15;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const theta = Array.from({ length: 360 / STEP }, (_, i) => i * STEP);
  const share = theta.map((t) => Math.cos((t * Math.PI) / 180) ** 2 * 100);

  const bars: BarpolarTrace = {
    type: 'barpolar',
    theta,
    r: share,
    width: STEP * 0.86,
    marker: {
      color: share,
      cmin: 0,
      cmax: 100,
      showscale: true,
      colorscale: [
        [0, '#1c1c2a'],
        [0.5, '#8a6a2a'],
        [1, '#ffe08a'],
      ],
      line: { color: LOOK.zero, width: 1 },
      colorbar: {
        title: { text: 'Light getting through', side: 'right' },
        ticksuffix: '%',
        thickness: 12,
        len: 0.8,
      },
    },
    hovertemplate:
      'Filters %{theta}° apart<br><b>%{r:.0f}%</b> of the light gets through<extra></extra>',
  };

  const chart: Chart = createChart(chartEl, {
    data: [bars],
    layout: {
      title: {
        text: narrow ? '' : 'Two polarizing filters: crossed at 90°, no light gets through',
      },
      showlegend: false,
      margin: { t: 72, b: 40, l: 40, r: 40 },
      polar: {
        angularaxis: { dtick: 30, ticksuffix: '°', direction: 'counterclockwise', rotation: 0 },
        radialaxis: {
          range: [0, 100],
          tickvals: [25, 50, 75, 100],
          ticksuffix: '%',
          angle: 90,
          tickangle: 90,
          tickfont: { size: 9 },
        },
      },
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
