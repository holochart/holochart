import { createChart, type Chart, type Scatter3dTrace, type SurfaceTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLOR,
  FUNDS,
  leveragedReturn,
  pct,
  RETURN_SCALE,
  UNDERLYING,
  yearStats,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The volatility-decay model as a landscape: a `surface` of a daily-rebalanced 3× fund's return
 * over a year, `(1 + R)³ · exp(−3σ²) − 1` (`leveragedReturn`), over the index's return `R` (x)
 * and annualized volatility `σ` (y), colored on the diverging return scale around 0 (`cmid`). In
 * calm years the surface curls up faster than 3× (compounding); along the volatility axis it sags,
 * and at 80% volatility even a doubling of the index barely breaks even. `scatter3d` markers put
 * the actual full years 2011–2025 of TQQQ (on QQQ) and SOXL (on SOXX) at the index's return and
 * volatility and the fund's actual return: they sit on the surface, a few points under it (fees and
 * financing). Contour lines on the surface every 100 points.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: the volatility-decay surface',
  description:
    'A 3D surface of a 3× fund’s yearly return by index return and volatility, with the actual years of TQQQ and SOXL as points.',
  tags: ['demo', 'surface', 'scatter3d', '3d', 'colorscale', 'contour', 'financial'],
  size: { width: 960, height: 600 },
  testTolerance: 0.004,
};

const R_MIN = -0.6;
const R_MAX = 1;
const V_MIN = 0.05;
const V_MAX = 0.8;
const Z_MIN = -1;
const Z_MAX = 7;

function range(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

/** Percent ticks without a sign on zero. */
function pctTicks(
  values: readonly number[],
  signed = true,
): { tickvals: number[]; ticktext: string[] } {
  const vals = values.map((v) => Math.round(v * 1000) / 1000);
  return { tickvals: vals, ticktext: vals.map((v) => (v === 0 ? '0%' : pct(v, 0, signed))) };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const xs = range(R_MIN, R_MAX, 65);
  const ys = range(V_MIN, V_MAX, 61);
  const z = ys.map((s) => xs.map((r) => leveragedReturn(r, s)));

  const surface: SurfaceTrace = {
    type: 'surface',
    name: 'model',
    x: xs,
    y: ys,
    z,
    // Symmetric around 0, so losing and gaining read alike; gains over +100% stay full green.
    cmin: -1,
    cmax: 1,
    colorscale: RETURN_SCALE,
    opacity: 0.8,
    contours: {
      z: { show: true, start: -1, end: 7, size: 1, color: LOOK.bg, width: 1 },
    },
    colorbar: {
      title: { text: '3× fund, model', side: 'right' },
      tickvals: [-1, -0.5, 0, 0.5, 1],
      ticktext: ['−100%', '−50%', '0%', '+50%', '+100% and up'],
      thickness: 12,
      len: 0.7,
    },
    hovertemplate:
      'Index %{x:+.0%} with %{y:.0%} volatility<br>3× fund (model) %{z:+.0%}<extra></extra>',
  };

  const points = FUNDS.map((fund): Scatter3dTrace => {
    const ref = UNDERLYING[fund];
    const idx = yearStats(ref).filter((s) => !s.partial);
    const own = new Map(yearStats(fund).map((s) => [s.year, s]));
    return {
      type: 'scatter3d',
      mode: 'markers',
      name: `${fund} years, actual (index: ${ref})`,
      x: idx.map((s) => s.ret),
      y: idx.map((s) => s.vol),
      z: idx.map((s) => own.get(s.year)?.ret ?? null),
      customdata: idx.map((s) => [s.year, pct(3 * s.ret), pct(leveragedReturn(s.ret, s.vol))]),
      marker: {
        color: COLOR[fund],
        size: 6,
        symbol: fund === 'TQQQ' ? 'circle' : 'diamond',
        line: { color: LOOK.title, width: 1 },
      },
      hovertemplate:
        `<b>${fund} %{customdata[0]}</b><br>` +
        `${ref} %{x:+.1%}, volatility %{y:.1%}<br>` +
        `${fund} actual %{z:+.1%}<br>` +
        `3× ${ref} %{customdata[1]}<br>model %{customdata[2]}<extra></extra>`,
    };
  });

  const axis = (
    title: string,
    ticks: readonly number[],
    signed = true,
  ): Record<string, unknown> => ({
    title: { text: title },
    ...pctTicks(ticks, signed),
  });

  const chart: Chart = createChart(chartEl, {
    data: [surface, ...points],
    layout: {
      title: { text: narrow ? '' : 'A 3× fund’s year, by its index’s return and volatility' },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { t: narrow ? 40 : 72, l: 0, r: 0, b: 0 },
      scene: {
        aspectmode: 'manual',
        aspectratio: { x: 1.3, y: 1, z: 0.8 },
        xaxis: { ...axis('Index return', range(-0.6, 1, 5)), range: [R_MIN, R_MAX] },
        yaxis: { ...axis('Index volatility', [0.2, 0.4, 0.6, 0.8], false), range: [0, V_MAX] },
        zaxis: { ...axis('3× fund return', [0, 2, 4, 6]), range: [Z_MIN, Z_MAX] },
        camera: { eye: { x: -1.1, y: -1.48, z: 0.5 }, center: { x: 0.05, y: 0, z: -0.3 } },
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
