import { createChart, type Chart, type ContourTrace, type ScatterTrace } from '@mk7s/holochart';
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
 * Volatility decay as a map: for an index that returns `R` over a year with annualized volatility
 * `σ`, how far a daily-rebalanced 3× fund lands from "3× the index" — the model's
 * `(1 + R)³ · exp(−3σ²) − 1 − 3R` (`leveragedReturn`, no fees or financing). A filled `contour`
 * with labelled levels every 50 points on the diverging return scale (`zmid: 0`): green where
 * compounding in a calm trend beats 3×, red where chop eats it. A second `contour` with
 * `coloring: 'none'` and a single level draws the break-even line. Over it, scatter markers for
 * every full calendar year 2011–2025 of TQQQ (on QQQ) and SOXL (on SOXX), at the index's actual
 * return and volatility; hover compares the fund's actual year with 3× the index and the model.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: volatility decay, model and actual years',
  description:
    'Contour map of how far a 3× fund lands from 3× its index for a year, by index return and volatility, with the actual years of TQQQ and SOXL.',
  tags: ['demo', 'contour', 'scatter', 'labels', 'colorscale', 'financial'],
  size: { width: 960, height: 540 },
  testTolerance: 0.004,
};

const R_MIN = -0.6;
const R_MAX = 1;
const V_MIN = 0.05;
const V_MAX = 0.8;

function range(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

/** Percent ticks without a sign on zero. */
function pctTicks(values: readonly number[]): { tickvals: number[]; ticktext: string[] } {
  const vals = values.map((v) => Math.round(v * 1000) / 1000);
  return { tickvals: vals, ticktext: vals.map((v) => (v === 0 ? '0%' : pct(v, 0))) };
}

interface Point {
  x: number;
  y: number;
  weight: number;
  label: string;
}

/**
 * Year labels over the markers, dropped where they would overlap one already placed (in data
 * units of this chart's ranges: about 22 × 14 px at the default size); the years furthest from 3×
 * the index are placed first.
 */
function placeLabels(points: readonly Point[]): Map<Point, string> {
  const placed: Point[] = [];
  const out = new Map<Point, string>();
  for (const p of [...points].sort((a, b) => b.weight - a.weight)) {
    if (placed.some((q) => Math.abs(q.x - p.x) < 0.045 && Math.abs(q.y - p.y) < 0.026)) continue;
    placed.push(p);
    out.set(p, p.label);
  }
  return out;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const xs = range(R_MIN, R_MAX, 81);
  const ys = range(V_MIN, V_MAX, 76);
  const z = ys.map((s) => xs.map((r) => leveragedReturn(r, s) - 3 * r));

  const model: ContourTrace = {
    type: 'contour',
    name: 'model',
    x: xs,
    y: ys,
    z,
    zmid: 0,
    colorscale: RETURN_SCALE,
    autocontour: false,
    contours: {
      coloring: 'fill',
      start: -2.5,
      end: 3.5,
      size: 0.5,
      showlabels: true,
      labelformat: '+.0%',
      labelfont: { size: 9, color: LOOK.title },
    },
    line: { width: 0.75, color: 'rgba(10,10,15,0.5)' },
    colorbar: {
      title: { text: '3× fund − 3× index', side: 'right' },
      ...pctTicks([-2, -1, 0, 1, 2, 3]),
      thickness: 12,
    },
    hovertemplate:
      'Index %{x:+.0%} with %{y:.0%} volatility<br>' +
      '3× fund ends %{z:+.0%} from 3× the index<extra>model</extra>',
  };
  const breakEven: ContourTrace = {
    type: 'contour',
    name: 'break-even: exactly 3×',
    x: xs,
    y: ys,
    z,
    autocontour: false,
    contours: { coloring: 'none', start: 0, end: 0, size: 1 },
    line: { color: LOOK.title, width: 2, dash: 'dash' },
    showscale: false,
    showlegend: true,
    hoverinfo: 'skip',
  };

  const sets = FUNDS.map((fund) => {
    const ref = UNDERLYING[fund];
    const idx = yearStats(ref).filter((s) => !s.partial);
    const own = new Map(yearStats(fund).map((s) => [s.year, s]));
    const points = idx.map((s) => ({
      x: s.ret,
      y: s.vol,
      weight: Math.abs((own.get(s.year)?.ret ?? 0) - 3 * s.ret),
      label: `’${String(s.year).slice(2)}`,
    }));
    return { fund, ref, idx, own, points };
  });
  const labels = placeLabels(sets.flatMap((s) => s.points));

  const years = sets.map(({ fund, ref, idx, own, points }): ScatterTrace => {
    const custom = idx.map((s) => {
      const f = own.get(s.year);
      const actual = f?.ret ?? NaN;
      return [
        s.year,
        pct(actual),
        pct(3 * s.ret),
        pct(leveragedReturn(s.ret, s.vol)),
        pct(actual - 3 * s.ret),
      ];
    });
    return {
      type: 'scatter',
      mode: 'markers+text',
      name: `${fund} years (on ${ref})`,
      x: idx.map((s) => s.ret),
      y: idx.map((s) => s.vol),
      text: points.map((p) => labels.get(p) ?? ''),
      textposition: 'top center',
      textfont: { size: 8, color: LOOK.title },
      customdata: custom,
      marker: {
        color: COLOR[fund],
        size: 9,
        symbol: fund === 'TQQQ' ? 'circle' : 'diamond',
        line: { color: LOOK.title, width: 1 },
      },
      hovertemplate:
        `<b>${fund} %{customdata[0]}</b><br>` +
        `${ref} %{x:+.1%}, volatility %{y:.1%}<br>` +
        `${fund} actual %{customdata[1]}<br>` +
        `3× ${ref} %{customdata[2]}<br>` +
        `model %{customdata[3]}<br>` +
        `actual − 3× index %{customdata[4]}<extra></extra>`,
    };
  });

  const chart: Chart = createChart(chartEl, {
    data: [model, breakEven, ...years],
    layout: {
      title: {
        text: narrow
          ? ''
          : 'Volatility decay: where a 3× fund lands against 3× its index over a year',
      },
      hovermode: 'closest',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { t: narrow ? 48 : 76 },
      xaxis: {
        title: { text: 'Index return over the year' },
        range: [R_MIN, R_MAX],
        ...pctTicks(range(R_MIN, R_MAX, 9)),
      },
      yaxis: {
        title: { text: 'Index volatility (annualized)' },
        tickformat: '.0%',
        range: [V_MIN, V_MAX],
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
