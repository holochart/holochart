import { createChart, type Chart, type LayoutAnnotation, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { linspace, R_GAS, STATE_COLOR } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The phase diagram of water: which state (ice, liquid water or vapor) is stable at each
 * temperature (x, °C) and pressure (y, Pa on a log axis, `yaxis.type: 'log'`). The three regions
 * are closed `scatter` polygons (`fill: 'toself'`), the boundaries between them `scatter` lines:
 *
 * - liquid–gas (boiling): the Wagner–Pruss saturation-pressure equation of IAPWS-95, from the
 *   triple point to the critical point, where it gives 611.7 Pa at 0.01 °C and 1 atm at 100 °C;
 * - solid–gas (sublimation): Clausius–Clapeyron from the triple point with a constant heat of
 *   sublimation of 51.06 kJ/mol;
 * - solid–liquid (melting): the IAPWS melting-pressure equation of ordinary ice, nearly vertical
 *   and leaning slightly left (pressure melts ice), up to 208.6 MPa at −22 °C, where other kinds
 *   of ice take over (the top of the chart).
 *
 * Markers show the triple point (0.01 °C, 611.7 Pa: all three states at once) and the critical
 * point (374 °C, 22.06 MPa: beyond it liquid and gas are one fluid). A dotted line (`layout.shapes`)
 * at 1 atm crosses the boundaries at 0 °C and 100 °C: the melting and boiling points we know.
 */
export const meta: ExampleMeta = {
  title: 'Phase diagram: ice, water and steam',
  description:
    'The phase diagram of water on a log pressure axis, with the solid, liquid and gas regions, the triple and critical points and the 1 atm line.',
  tags: ['demo', 'scatter', 'fill', 'log', 'shapes', 'annotations', 'physics'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

const KELVIN = 273.15;
const T_TRIPLE = 273.16; // K
const P_TRIPLE = 611.657; // Pa
const T_CRIT = 647.096; // K
const P_CRIT = 22.064e6; // Pa
const ATM = 101_325; // Pa
const L_SUBLIMATION = 51_059; // J/mol
/** Where the melting line of ordinary ice ends (ice Ih–ice III–liquid). */
const T_ICE_END = 251.165; // K

const T_MIN = -60; // °C
const T_MAX = 400;
const P_MIN = 1; // Pa

/** Saturation vapor pressure over liquid water (Wagner and Pruss, IAPWS-95), Pa; `t` in K. */
function vaporPressure(t: number): number {
  const tau = 1 - t / T_CRIT;
  const a = [-7.85951783, 1.84408259, -11.7866497, 22.6807411, -15.9618719, 1.80122502] as const;
  const sum =
    a[0] * tau +
    a[1] * tau ** 1.5 +
    a[2] * tau ** 3 +
    a[3] * tau ** 3.5 +
    a[4] * tau ** 4 +
    a[5] * tau ** 7.5;
  return P_CRIT * Math.exp((T_CRIT / t) * sum);
}

/** Vapor pressure over ice, Clausius–Clapeyron from the triple point, Pa; `t` in K. */
function sublimationPressure(t: number): number {
  return P_TRIPLE * Math.exp((-L_SUBLIMATION / R_GAS) * (1 / t - 1 / T_TRIPLE));
}

/** Melting pressure of ordinary ice (IAPWS 2011), Pa; `t` in K, 251.165 to 273.16. */
function meltingPressure(t: number): number {
  const th = t / T_TRIPLE;
  return (
    P_TRIPLE *
    (1 +
      0.119539337e7 * (1 - th ** 3) +
      0.808183159e5 * (1 - th ** 25.75) +
      0.33382686e4 * (1 - th ** 103.75))
  );
}

type Point = readonly [number, number];

function pascal(p: number): string {
  if (p >= 1e6) return `${(p / 1e6).toPrecision(3)} MPa`;
  if (p >= 1e3) return `${(p / 1e3).toPrecision(3)} kPa`;
  return `${p.toPrecision(3)} Pa`;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  // Boundaries as [°C, Pa], each running away from the triple point.
  const sublimation: Point[] = linspace(T_TRIPLE, T_MIN + KELVIN, 80).map((t) => [
    t - KELVIN,
    sublimationPressure(t),
  ]);
  const boiling: Point[] = linspace(T_TRIPLE, T_CRIT, 240).map((t) => [
    t - KELVIN,
    vaporPressure(t),
  ]);
  const melting: Point[] = linspace(T_TRIPLE, T_ICE_END, 80).map((t) => [
    t - KELVIN,
    meltingPressure(t),
  ]);
  const pTop = meltingPressure(T_ICE_END);
  const tCrit = T_CRIT - KELVIN;
  const rev = (p: readonly Point[]): Point[] => [...p].reverse();

  const region = (name: string, color: string, pts: readonly Point[]): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name,
    x: pts.map((p) => p[0]),
    y: pts.map((p) => p[1]),
    fill: 'toself',
    fillcolor: color,
    line: { width: 0, color },
    hoverinfo: 'skip',
    showlegend: false,
  });
  const regions = [
    region('Solid', `${STATE_COLOR.Solid}59`, [
      ...rev(sublimation),
      ...melting,
      [T_MIN, pTop],
      sublimation[sublimation.length - 1]!,
    ]),
    region('Liquid', `${STATE_COLOR.Liquid}59`, [
      ...rev(melting),
      ...boiling,
      [tCrit, pTop],
      melting[melting.length - 1]!,
    ]),
    region('Gas', `${STATE_COLOR.Gas}4d`, [
      ...rev(sublimation),
      ...boiling,
      [T_MAX, P_CRIT],
      [T_MAX, P_MIN],
      [T_MIN, P_MIN],
      sublimation[sublimation.length - 1]!,
    ]),
    // Beyond the critical point there is no boundary between liquid and gas.
    region('Supercritical fluid', '#8a7f5a59', [
      [tCrit, P_CRIT],
      [T_MAX, P_CRIT],
      [T_MAX, pTop],
      [tCrit, pTop],
      [tCrit, P_CRIT],
    ]),
  ];

  const boundary = (name: string, pts: readonly Point[], what: string): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name,
    x: pts.map((p) => p[0]),
    y: pts.map((p) => p[1]),
    customdata: pts.map((p) => pascal(p[1])),
    line: { color: LOOK.title, width: 2 },
    showlegend: false,
    hovertemplate: `<b>${name}</b><br>${what} at %{x:.1f} °C and %{customdata}<extra></extra>`,
  });
  const lines = [
    boundary('Sublimation line', sublimation, 'ice and vapor in balance'),
    boundary('Melting line', melting, 'ice and water in balance'),
    boundary('Boiling line', boiling, 'water and vapor in balance'),
  ];

  const tMelt = 0;
  const tBoil = 100;
  const special: ScatterTrace = {
    type: 'scatter',
    mode: 'markers',
    name: 'Triple and critical points',
    x: [T_TRIPLE - KELVIN, tCrit],
    y: [P_TRIPLE, P_CRIT],
    text: [
      'Triple point<br>0.01 °C, 611.7 Pa<br>ice, water and vapor together',
      'Critical point<br>374 °C, 22.06 MPa<br>beyond it liquid and gas are one fluid',
    ],
    marker: { color: LOOK.title, size: 9, line: { color: LOOK.bg, width: 1.5 } },
    showlegend: false,
    hovertemplate: '<b>%{text}</b><extra></extra>',
  };
  const everyday: ScatterTrace = {
    type: 'scatter',
    mode: 'markers',
    name: 'At 1 atm',
    x: [tMelt, tBoil],
    y: [ATM, ATM],
    text: ['Ice melts at 0 °C', 'Water boils at 100 °C'],
    marker: {
      color: LOOK.bg,
      size: 8,
      symbol: 'circle',
      line: { color: LOOK.title, width: 1.5 },
    },
    showlegend: false,
    hovertemplate: '<b>%{text}</b><br>at 1 atm (101,325 Pa)<extra></extra>',
  };

  // On a log axis, annotation y positions are log10 of the value.
  const label = (
    x: number,
    p: number,
    text: string,
    extra: Partial<LayoutAnnotation> = {},
  ): LayoutAnnotation => ({
    x,
    y: Math.log10(p),
    text,
    showarrow: false,
    font: { size: 10, color: LOOK.text },
    ...extra,
  });
  const big = { size: narrow ? 11 : 14, color: LOOK.title };

  const chart: Chart = createChart(chartEl, {
    data: [...regions, ...lines, everyday, special],
    layout: {
      title: { text: narrow ? '' : 'Water: solid, liquid or gas, by temperature and pressure' },
      showlegend: false,
      hovermode: 'closest',
      margin: narrow ? { l: 62, r: 12, t: 28, b: 44 } : { l: 80 },
      xaxis: {
        title: { text: 'Temperature (°C)' },
        range: [T_MIN, T_MAX],
        dtick: narrow ? 100 : 50,
        zeroline: false,
        showgrid: false,
      },
      yaxis: {
        type: 'log',
        title: { text: 'Pressure (log scale)' },
        range: [0, Math.log10(pTop)],
        tickvals: [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8],
        ticktext: [
          '1 Pa',
          '10 Pa',
          '100 Pa',
          '1 kPa',
          '10 kPa',
          '100 kPa',
          '1 MPa',
          '10 MPa',
          '100 MPa',
        ],
        showgrid: false,
      },
      shapes: [
        {
          type: 'line',
          xref: 'paper',
          x0: 0,
          x1: 1,
          yref: 'y',
          y0: ATM,
          y1: ATM,
          line: { color: LOOK.title, width: 1, dash: 'dot' },
        },
      ],
      annotations: [
        label(-38, 3e5, '<b>Solid</b><br>ice', { font: big }),
        label(190, 3e7, '<b>Liquid</b><br>water', { font: big }),
        label(220, 300, '<b>Gas</b><br>water vapor', { font: big }),
        label(T_MAX - 4, ATM, '1 atm (101,325 Pa): melts at 0 °C, boils at 100 °C', {
          xanchor: 'right',
          yanchor: 'bottom',
          font: { size: 10, color: LOOK.title },
        }),
        label(T_TRIPLE - KELVIN, P_TRIPLE, '<b>Triple point</b><br>0.01 °C, 611.7 Pa', {
          xanchor: 'left',
          yanchor: 'top',
          xshift: 8,
          align: 'left',
          font: { size: 10, color: LOOK.title },
        }),
        label(tCrit, P_CRIT, '<b>Critical point</b><br>374 °C, 22.06 MPa', {
          xanchor: 'right',
          yanchor: 'bottom',
          xshift: -8,
          yshift: 4,
          align: 'right',
          font: { size: 10, color: LOOK.title },
        }),
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
