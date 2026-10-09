import { createChart, type Chart, type LayoutAnnotation, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  BASE_DATE,
  CALENDAR,
  fmtDate,
  type Half,
  LABEL,
  LAST_DATE,
  pct,
  QUARTER_SPANS,
  returnBetween,
  SECTOR_COLOR,
  SECTORS,
} from './analysis.mts';
import { chartConfig, frame, halfLabels, halfShapes, isNarrow, LOOK, settled } from './ui.mts';

/**
 * A bump chart of sector leadership: the rank (1 = best) of each of the eleven sector funds'
 * total return in each of eight half-years, as `lines+markers+text` traces in the sector colors on
 * a reversed y axis, with the rank written in every marker and each line named at both ends
 * (annotations).
 *
 * The periods are half-years (October–March and April–September, two quarters of
 * `QUARTER_SPANS` each, returns from `returnBetween`) rather than the five calendar years of
 * `YEAR_SPANS`: the four years split at the close of Sep 30, 2024, which is inside calendar 2024,
 * so a split drawn between the 2024 and 2025 columns of a yearly chart would be three months off.
 * Four half-years fit each half exactly. Each column sits at the middle of its half-year on a date
 * axis (`tickvals` / `ticktext` name the columns), so the demo's tinted bands and dotted split
 * line (`halfShapes`) fall where they belong.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: sector ranks by half-year',
  description:
    'Bump chart of the eleven S&P 500 sector funds ranked by total return in each of eight half-years, October 2022 to September 2026.',
  tags: ['demo', 'line', 'markers', 'text', 'bump', 'reversed', 'annotations', 'financial'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

interface HalfYear {
  from: number;
  to: number;
  /** The session in the middle: where the column is drawn. */
  x: string;
  /** `'Oct 2022 –<br>Mar 2023'`. */
  label: string;
  half: Half;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** `'2022-10-03'` → `'Oct 2022'`. */
const monthOf = (d: string): string => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/** The eight half-years: consecutive pairs of the sixteen quarters. */
function halfYears(): HalfYear[] {
  const out: HalfYear[] = [];
  for (let k = 0; k + 1 < QUARTER_SPANS.length; k += 2) {
    const a = QUARTER_SPANS[k];
    const b = QUARTER_SPANS[k + 1];
    if (!a || !b) continue;
    out.push({
      from: a.from,
      to: b.to,
      x: CALENDAR[Math.round((a.from + b.to) / 2)] as string,
      label: `${monthOf(CALENDAR[a.from + 1] as string)} –<br>${monthOf(CALENDAR[b.to] as string)}`,
      half: b.half,
    });
  }
  return out;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const spans = halfYears();
  // returns[span][sector] and the rank of each (1 = the best return of the half-year).
  const returns = spans.map((s) => SECTORS.map((t) => returnBetween(t, s.from, s.to)));
  const ranks = returns.map((row) => row.map((r) => 1 + row.filter((other) => other > r).length));

  const traces = SECTORS.map((t, k): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines+markers+text',
    name: LABEL[t],
    x: spans.map((s) => s.x),
    y: ranks.map((row) => row[k] as number),
    text: ranks.map((row) => String(row[k])),
    textposition: 'middle center',
    textfont: { color: '#ffffff', size: 9 },
    customdata: spans.map((s, i) => [
      s.label.replace('<br>', ' '),
      pct(returns[i]?.[k] ?? 0, 1),
      fmtDate(CALENDAR[s.to] as string),
    ]),
    line: { color: SECTOR_COLOR[t], width: 2 },
    marker: { color: SECTOR_COLOR[t], size: narrow ? 13 : 17, line: { color: LOOK.bg, width: 1 } },
    hovertemplate:
      `<b>${t} · ${LABEL[t]}</b><br>%{customdata[0]}: rank %{y} of ${SECTORS.length}<br>` +
      'total return %{customdata[1]}<extra></extra>',
  }));

  // Each line's name at both ends, at the height of its first and last rank.
  const first = spans[0] as HalfYear;
  const last = spans.at(-1) as HalfYear;
  const ends = SECTORS.flatMap((t, k): LayoutAnnotation[] => {
    const end = (x: string, y: number, left: boolean): LayoutAnnotation => ({
      xref: 'x',
      yref: 'y',
      x,
      y,
      text: narrow ? t : LABEL[t],
      showarrow: false,
      xanchor: left ? 'right' : 'left',
      xshift: left ? -13 : 13,
      font: { color: SECTOR_COLOR[t], size: narrow ? 9 : 10 },
    });
    return [end(first.x, ranks[0]?.[k] ?? 0, true), end(last.x, ranks.at(-1)?.[k] ?? 0, false)];
  });

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: { text: narrow ? '' : 'Sector funds ranked by total return, half-year by half-year' },
      showlegend: false,
      hovermode: 'closest',
      margin: { t: narrow ? 24 : 64, l: narrow ? 44 : 140, r: narrow ? 44 : 140, b: 56 },
      xaxis: {
        type: 'date',
        range: [BASE_DATE, LAST_DATE],
        tickvals: spans.map((s) => s.x),
        ticktext: spans.map((s) => (narrow ? s.label.replace(/ 20/g, ' ’') : s.label)),
        tickfont: { size: narrow ? 8 : 10 },
        showgrid: false,
        zeroline: false,
      },
      yaxis: {
        range: [SECTORS.length + 0.7, -0.1],
        showticklabels: false,
        showgrid: false,
        zeroline: false,
        fixedrange: true,
      },
      shapes: halfShapes(),
      annotations: [...halfLabels(), ...ends],
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
