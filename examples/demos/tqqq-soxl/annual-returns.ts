import { createChart, type Chart, type FigureInput } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, COMMON_START, LAST_DATE, periodReturns, TICKERS } from './analysis.mts';
import { chartConfig, frame, isNarrow, segmented, settled } from './ui.mts';

/**
 * Calendar-year total returns of TQQQ, QQQ, SOXL and SOXX since SOXL's first day, as grouped bars
 * (`barmode: 'group'`), each fund next to its unleveraged reference in the same hue (references
 * lighter). The first and last years are partial, and their tick labels say so (`ticktext`). A
 * toolbar toggle redraws the same bars extruded (`depth`) in Holochart's tilted 2.5D view
 * (`layout.view3d`) with `chart.react`.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: calendar-year returns',
  description:
    'Calendar-year total returns of TQQQ, QQQ, SOXL and SOXX as grouped bars, with a 2D / 2.5D toggle.',
  tags: ['demo', 'bar', 'grouped', 'ticktext', 'depth', 'view3d', '2.5d', 'react', 'financial'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

type View = '2d' | '3d';

const YEARS = periodReturns('TQQQ', 'year', COMMON_START).map((p) => p.year);
const [, START_MONTH, START_DAY] = COMMON_START.split('-').map(Number) as [number, number, number];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LAST_YEAR = Number(LAST_DATE.slice(0, 4));

/** Tick label of a year: the first is from SOXL's inception, the last is year to date. */
function yearLabel(year: number, i: number): string {
  if (i === 0) return `${year}<br>from ${MONTHS[START_MONTH - 1]} ${START_DAY}`;
  if (year === LAST_YEAR) return `${year}<br>YTD`;
  return String(year);
}

function figure(view: View, narrow: boolean): FigureInput {
  const deep = view === '3d';
  return {
    data: TICKERS.map((t) => {
      const fund = t === 'TQQQ' || t === 'SOXL';
      const rows = periodReturns(t, 'year', COMMON_START);
      return {
        type: 'bar',
        name: t,
        x: rows.map((p) => p.year),
        y: rows.map((p) => p.ret),
        customdata: rows.map((p, i) =>
          p.partial ? (i === 0 ? ' (from inception)' : ' (YTD)') : '',
        ),
        marker: { color: COLOR[t], line: { width: 0 }, opacity: fund ? 1 : 0.9 },
        hovertemplate: `${t}  %{y:+.1%}<extra>%{x}%{customdata}</extra>`,
        ...(deep ? { depth: '100%' } : {}),
      };
    }),
    layout: {
      title: {
        text: narrow
          ? ''
          : 'Calendar-year total returns, 3× funds and their unleveraged references',
      },
      barmode: 'group',
      bargap: 0.18,
      bargroupgap: 0.04,
      hovermode: 'x unified',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: {
        type: 'category',
        showgrid: false,
        tickvals: YEARS,
        ticktext: YEARS.map(yearLabel),
      },
      yaxis: { tickformat: '.0%', title: { text: 'Total return' }, zeroline: true },
      view3d: deep
        ? { enabled: true, tilt: 28, rotation: 0, perspective: 0.3 }
        : { enabled: false },
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('2d', narrow));

  segmented<View>(
    toolbar,
    'View',
    [
      { value: '2d', text: '2D' },
      { value: '3d', text: '2.5D' },
    ],
    (view) => void chart.react(figure(view, narrow)),
    '2d',
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
