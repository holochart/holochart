import { createChart, type Chart, type HeatmapTrace, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { linspace } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { DIVERGING } from './waves-fields-planets.mts';

/**
 * Interference of ripples from two sources, as in a ripple tank with two dippers: the height of
 * the water is `sin(k·r1) + sin(k·r2)`, where r1 and r2 are the distances to the two sources and
 * the wavelength is 2 cm (`k = 2π / wavelength`), on a 240 × 160 `heatmap` with a diverging
 * colorscale centered on zero (`zmid: 0`). The sources are 5 cm (two and a half wavelengths) apart. Along
 * the dark bands the two ripples always arrive out of step and cancel. The axes share one scale
 * (`yaxis.scaleanchor`), so circles stay circles; the sources are `scatter` markers.
 *
 * The ripples are drawn with a constant height: real ripples also get lower as they spread.
 */
export const meta: ExampleMeta = {
  title: 'Waves: ripples from two sources',
  description:
    'Heatmap of the summed ripples from two point sources two and a half wavelengths apart, with the bands where they cancel.',
  tags: ['demo', 'heatmap', 'scatter', 'colorscale', 'scaleanchor', 'physics'],
  size: { width: 960, height: 560 },
  testTolerance: 0.004,
};

const WAVELENGTH = 2; // cm
const SOURCES = [-2.5, 2.5]; // x of the two sources, cm (y = 0)

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const x = linspace(-12, 12, 240);
  const y = linspace(-8, 8, 160);
  const k = (2 * Math.PI) / WAVELENGTH;
  const z = y.map((yy) =>
    x.map((xx) => SOURCES.reduce((sum, sx) => sum + Math.sin(k * Math.hypot(xx - sx, yy)), 0)),
  );

  const ripples: HeatmapTrace = {
    type: 'heatmap',
    x,
    y,
    z,
    zmin: -2,
    zmax: 2,
    zmid: 0,
    zsmooth: 'best',
    colorscale: DIVERGING,
    colorbar: {
      title: { text: 'Water height', side: 'right' },
      tickvals: [-2, -1, 0, 1, 2],
      ticktext: ['−2 (deep trough)', '−1', '0 (flat)', '+1', '+2 (high crest)'],
      thickness: 12,
    },
    hovertemplate: 'x %{x:.1f} cm, y %{y:.1f} cm<br>height <b>%{z:+.2f}</b><extra></extra>',
  };
  const sources: ScatterTrace = {
    type: 'scatter',
    mode: 'markers+text',
    name: 'Sources',
    x: SOURCES,
    y: [0, 0],
    text: ['Source 1', 'Source 2'],
    textposition: 'bottom center',
    textfont: { color: LOOK.title, size: 10 },
    marker: { color: LOOK.title, size: 9, line: { color: LOOK.bg, width: 1.5 } },
    hovertemplate: '%{text}<extra></extra>',
    showlegend: false,
  };

  const chart: Chart = createChart(chartEl, {
    data: [ripples, sources],
    layout: {
      title: {
        text: narrow
          ? ''
          : 'Ripples from two sources: bright where they add, dark where they cancel',
      },
      xaxis: { title: { text: 'x (cm)' }, range: [-12, 12], constrain: 'domain', showgrid: false },
      yaxis: {
        title: { text: 'y (cm)' },
        range: [-8, 8],
        scaleanchor: 'x',
        constrain: 'domain',
        showgrid: false,
        zeroline: false,
      },
      annotations: [
        {
          x: 0,
          y: 7.2,
          showarrow: false,
          text: 'Wavelength 2 cm, sources 5 cm apart',
          font: { size: 11, color: LOOK.title },
          bgcolor: 'rgba(10, 10, 15, 0.7)',
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
