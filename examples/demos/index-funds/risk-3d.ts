import { createChart, type Chart, type Scatter3dTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  cagr,
  ETFS,
  HALVES,
  type Half,
  maxDrawdown,
  pct,
  PERIODS,
  share,
  tag,
  volatility,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Risk and reward of every ETF of the demo in each half, in three dimensions (`scatter3d`): the
 * annualized volatility (x), the deepest drawdown from a high made inside the half (y) and the
 * annualized return (z). Each fund is there twice: a teal circle for 2022–24 and an amber diamond
 * for 2024–26, joined by a thin gray line (one `lines` trace, with gaps between the funds), and
 * the ticker is written above or below the second-half point (`mode: 'markers+text'`,
 * camera-facing labels, a per-point `textposition` that keeps close pairs apart). The length and
 * direction of a line is how much the fund's risk and return changed from one half to the next.
 * Drag to turn the scene.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: volatility, drawdown and return of every ETF, half by half',
  description:
    '3D scatter of 27 ETFs at their annualized volatility, deepest drawdown and annualized return in each half, the two points of a fund joined by a line.',
  tags: ['demo', 'scatter3d', '3d', 'text', 'lines', 'markers', 'financial'],
  size: { width: 720, height: 600 },
  testTolerance: 0.004,
};

const ticks = (
  values: readonly number[],
  format: (v: number) => string,
): { tickvals: number[]; ticktext: string[] } => ({
  tickvals: [...values],
  ticktext: values.map((v) => (v === 0 ? '0%' : format(v))),
});

interface Point {
  x: number;
  y: number;
  z: number;
}

/**
 * Where a point's label goes: under it when its nearest neighbor (in axis units, which are all
 * fractions of similar size) is higher, above it otherwise, so close pairs label away from each
 * other.
 */
function labelSide(points: readonly Point[], i: number): 'top center' | 'bottom center' {
  const p = points[i] as Point;
  let nearest: Point | undefined;
  let best = Infinity;
  points.forEach((q, k) => {
    if (k === i) return;
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2;
    if (d < best) {
      best = d;
      nearest = q;
    }
  });
  return nearest !== undefined && nearest.z > p.z ? 'bottom center' : 'top center';
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const at = (half: Half): Point[] =>
    ETFS.map((t) => ({
      x: volatility(t, half),
      y: maxDrawdown(t, half).depth,
      z: cagr(t, half),
    }));
  const points: Record<Half, Point[]> = {
    first: at('first'),
    second: at('second'),
  };

  // One line per fund, from its first-half point to its second-half point; nulls break the trace.
  const joined = <K extends 'x' | 'y' | 'z'>(key: K): (number | null)[] =>
    ETFS.flatMap((_, i) => [points.first[i]?.[key] ?? null, points.second[i]?.[key] ?? null, null]);
  const links: Scatter3dTrace = {
    type: 'scatter3d',
    mode: 'lines',
    name: 'Same fund',
    x: joined('x'),
    y: joined('y'),
    z: joined('z'),
    line: { color: '#6b6f80', width: 1.5 },
    connectgaps: false,
    hoverinfo: 'skip',
    showlegend: false,
  };

  const markers = HALVES.map((half): Scatter3dTrace => {
    const p = points[half];
    const { color, short, label } = PERIODS[half];
    return {
      type: 'scatter3d',
      mode: half === 'second' ? 'markers+text' : 'markers',
      name: short,
      x: p.map((v) => v.x),
      y: p.map((v) => v.y),
      z: p.map((v) => v.z),
      text: ETFS.map((t) => t),
      textposition: p.map((_, i) => labelSide(p, i)),
      textfont: { size: narrow ? 8 : 9, color: LOOK.title },
      customdata: ETFS.map((t, i) => [
        tag(t),
        share(p[i]?.x ?? 0, 1),
        pct(p[i]?.y ?? 0, 1),
        pct(p[i]?.z ?? 0, 1),
      ]),
      marker: {
        color,
        size: 9,
        symbol: half === 'first' ? 'circle' : 'diamond',
        line: { color: LOOK.bg, width: 1 },
      },
      hovertemplate:
        `<b>%{customdata[0]}</b><br>${label}<br>volatility %{customdata[1]} a year<br>` +
        'deepest drawdown %{customdata[2]}<br>return %{customdata[3]} a year<extra></extra>',
    };
  });

  const chart: Chart = createChart(chartEl, {
    data: [links, ...markers],
    layout: {
      title: { text: narrow ? '' : 'Volatility, drawdown and return of 27 ETFs, half by half' },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { t: narrow ? 40 : 72, l: 0, r: 0, b: 0 },
      scene: {
        aspectmode: 'manual',
        aspectratio: { x: 1.5, y: 1.1, z: 1 },
        xaxis: {
          title: { text: 'Volatility' },
          range: [0, 0.28],
          ...ticks([0, 0.1, 0.2], (v) => share(v)),
        },
        yaxis: {
          title: { text: 'Deepest drawdown' },
          range: [-0.3, 0],
          ...ticks([-0.3, -0.2, -0.1, 0], (v) => pct(v)),
        },
        zaxis: {
          title: { text: 'Return a year' },
          range: [-0.1, 0.4],
          ...ticks([-0.1, 0, 0.1, 0.2, 0.3, 0.4], (v) => pct(v)),
        },
        // Further back on a phone, where the scene is taller than wide.
        camera: narrow
          ? { eye: { x: -2.3, y: -2.8, z: 1.2 }, center: { x: -0.06, y: 0.05, z: -0.1 } }
          : { eye: { x: -1.4, y: -1.7, z: 0.75 }, center: { x: -0.1, y: 0.08, z: -0.16 } },
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
