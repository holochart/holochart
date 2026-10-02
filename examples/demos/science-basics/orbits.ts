import { createChart, type Chart, type ScatterpolarTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { PLANETS } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The orbits of the four inner planets seen from above, as `scatterpolar` lines with the Sun at
 * the center. An orbit is an ellipse with the Sun at one focus: `r = a(1 − e²) / (1 + e·cos θ)`,
 * from the mean distance a and the eccentricity e (0 is a circle), with θ measured from the
 * planet's closest point to the Sun. Each ellipse is turned to where that closest point really
 * lies (the longitude of perihelion: Mercury 77°, Venus 132°, Earth 103°, Mars 336°). The orbits of
 * Venus and the Earth are almost perfect circles; those of Mercury (e = 0.206) and Mars
 * (e = 0.094) are visibly off-center. Each planet is a marker at a fixed, arbitrary place on its
 * orbit, not its position on any date. The radial axis is in astronomical units.
 */
export const meta: ExampleMeta = {
  title: 'Planets: orbits of the inner planets',
  description:
    'Polar line chart of the elliptical orbits of Mercury, Venus, Earth and Mars from their distance and eccentricity, with the Sun at the center.',
  tags: ['demo', 'scatterpolar', 'polar', 'lines', 'markers', 'astronomy'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

/** Direction of each planet's closest point to the Sun (longitude of perihelion), degrees. */
const PERIHELION: Record<string, number> = { Mercury: 77, Venus: 132, Earth: 103, Mars: 336 };
/** Where each planet's marker sits on its orbit, degrees (arbitrary). */
const MARKER_AT: Record<string, number> = { Mercury: 200, Venus: 20, Earth: 250, Mars: 300 };

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const inner = PLANETS.slice(0, 4);
  const radius = (name: string, a: number, e: number, theta: number): number =>
    (a * (1 - e * e)) /
    (1 + e * Math.cos(((theta - (PERIHELION[name] as number)) * Math.PI) / 180));
  const theta = Array.from({ length: 361 }, (_, i) => i);

  const orbits = inner.map((p): ScatterpolarTrace => {
    const nearest = p.distance * (1 - p.eccentricity);
    const farthest = p.distance * (1 + p.eccentricity);
    return {
      type: 'scatterpolar',
      mode: 'lines',
      name: p.name,
      legendgroup: p.name,
      theta,
      r: theta.map((t) => radius(p.name, p.distance, p.eccentricity, t)),
      thetaunit: 'degrees',
      line: { color: p.color, width: 2 },
      hovertemplate:
        `<b>${p.name}</b>: %{r:.3f} AU from the Sun here<br>` +
        `nearest ${nearest.toFixed(3)} AU, farthest ${farthest.toFixed(3)} AU<extra></extra>`,
    };
  });
  const markers = inner.map((p): ScatterpolarTrace => ({
    type: 'scatterpolar',
    mode: 'markers',
    name: p.name,
    legendgroup: p.name,
    showlegend: false,
    theta: [MARKER_AT[p.name] as number],
    r: [radius(p.name, p.distance, p.eccentricity, MARKER_AT[p.name] as number)],
    thetaunit: 'degrees',
    marker: { color: p.color, size: 10, line: { color: LOOK.bg, width: 1.5 } },
    hoverinfo: 'skip',
  }));
  const sun: ScatterpolarTrace = {
    type: 'scatterpolar',
    mode: 'markers',
    name: 'Sun',
    theta: [0],
    r: [0],
    marker: { color: '#ffd84a', size: 14, line: { color: LOOK.bg, width: 1 } },
    hovertemplate: 'Sun<extra></extra>',
  };

  const chart: Chart = createChart(chartEl, {
    data: [...orbits, ...markers, sun],
    layout: {
      title: {
        text: narrow ? '' : 'Orbits of the inner planets: ellipses with the Sun off-center',
      },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { t: 76, b: 32, l: 32, r: 32 },
      polar: {
        angularaxis: { dtick: 45, ticksuffix: '°', showgrid: false },
        radialaxis: {
          range: [0, 1.75],
          tickvals: [0.5, 1, 1.5],
          ticksuffix: ' AU',
          angle: 0,
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
