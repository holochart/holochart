import {
  createChart,
  type Chart,
  type LayoutAnnotation,
  type LayoutShape,
  type ScatterTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { DOWN, fmtDate, INDICATOR, WINDOW } from './analysis.mts';
import {
  chartConfig,
  frame,
  halfLabels,
  halfShapes,
  isNarrow,
  LOOK,
  rgba,
  settled,
} from './ui.mts';

/**
 * The two ends of the Treasury yield curve: the 10-year yield and the 13-week bill yield, with the
 * area between them filled in one color where the curve is inverted (the bill yields more than the
 * 10-year) and in another where it is not. Each fill is a pair of traces: an invisible base line
 * and the higher of the two yields over it with `fill: 'tonexty'`; where the base is already the
 * higher one the band has no height, so the red band only exists while inverted and the blue one
 * only while not. The lines are drawn over the fills. Annotations mark the first inverted close,
 * the widest inversion and the last inverted close, all found in the data; `customdata` puts the
 * gap between the two into the unified hover label. The halves are marked with `halfShapes`.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: Treasury yields and the inverted curve',
  description:
    'The 10-year Treasury yield and the 13-week bill yield from October 2022 to September 2026, with the gap filled by whether the curve is inverted.',
  tags: ['demo', 'line', 'area', 'fill', 'tonexty', 'date', 'annotations', 'shapes', 'financial'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

/** Line colors: the 10-year near white, the bill a dashed gray. */
const LONG = '#eceef4';
const SHORT = '#b0b3c2';
/** Fill colors: inverted in the template's red, not inverted in a sky blue. */
const INVERTED = DOWN;
const NORMAL = '#4b9fd8';

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const ten = INDICATOR.TNX;
  const bill = INDICATOR.IRX;
  const x = WINDOW;
  const higher = ten.map((v, i) => Math.max(v, bill[i] as number));
  const gap = ten.map((v, i) => v - (bill[i] as number));
  const inverted = gap.map((g) => g < 0);
  const invertedDays = inverted.filter(Boolean).length;
  const firstInverted = inverted.indexOf(true);
  const lastInverted = inverted.lastIndexOf(true);
  const widest = gap.indexOf(Math.min(...gap));
  const last = x.length - 1;

  const hidden = (y: readonly number[]): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    x,
    y,
    line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
    showlegend: false,
    hoverinfo: 'skip',
  });
  const band = (name: string, color: string): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name,
    x,
    y: higher,
    fill: 'tonexty',
    fillcolor: rgba(color, 0.32),
    line: { width: 0, color: rgba(color, 0.32) },
    hoverinfo: 'skip',
  });

  const traces: ScatterTrace[] = [
    hidden(ten),
    band('Inverted: bill above 10-year', INVERTED),
    hidden(bill),
    band('10-year above bill', NORMAL),
    {
      type: 'scatter',
      mode: 'lines',
      name: '10-year Treasury',
      x,
      y: ten,
      customdata: gap,
      line: { color: LONG, width: 1.5 },
      hovertemplate: '10-year  %{y:.2f}%  (%{customdata:+.2f} points to the bill)<extra></extra>',
    },
    {
      type: 'scatter',
      mode: 'lines',
      name: '13-week bill',
      x,
      y: bill,
      line: { color: SHORT, width: 1.5, dash: 'dash' },
      hovertemplate: '13-week bill  %{y:.2f}%<extra></extra>',
    },
  ];

  const note = (
    i: number,
    y: number,
    text: string,
    ax: number,
    ay: number,
    side: 'left' | 'right' | 'center',
  ): LayoutAnnotation => ({
    x: x[i] as string,
    y,
    xref: 'x',
    yref: 'y',
    text,
    showarrow: true,
    arrowhead: 0,
    arrowwidth: 1,
    arrowcolor: rgba(LOOK.title, 0.6),
    ax,
    ay,
    xanchor: side,
    align: side,
    font: { color: LOOK.title, size: 10 },
  });
  const notes: LayoutAnnotation[] = [];
  const marks: LayoutShape[] = [];
  if (firstInverted >= 0) {
    // The widest inversion: a rule across the gap, labelled beside it.
    marks.push({
      type: 'line',
      xref: 'x',
      yref: 'y',
      x0: x[widest] as string,
      x1: x[widest] as string,
      y0: ten[widest] as number,
      y1: bill[widest] as number,
      line: { color: LOOK.title, width: 1 },
    });
    // The label sits over the bill's line, right of the rule.
    notes.push(
      note(
        widest,
        bill[widest] as number,
        `Widest: bill ${(-(gap[widest] as number)).toFixed(2)} points above<br>the 10-year, ${fmtDate(x[widest] as string)}`,
        narrow ? 10 : 24,
        -52,
        'left',
      ),
    );
    if (!narrow) {
      notes.push(
        note(
          firstInverted,
          ten[firstInverted] as number,
          `First inverted close<br>${fmtDate(x[firstInverted] as string)}`,
          16,
          92,
          'left',
        ),
      );
    }
    // Un-inverted for good only if the last inverted close is well before the end.
    if (lastInverted < last - 21) {
      notes.push(
        note(
          lastInverted,
          bill[lastInverted] as number,
          `Last inverted close<br>${fmtDate(x[lastInverted] as string)}`,
          narrow ? -4 : 0,
          narrow ? 92 : 48,
          narrow ? 'right' : 'center',
        ),
      );
    }
  }
  // End labels in the right margin.
  const ends = (
    [
      ['10-year', ten, LONG],
      ['Bill', bill, SHORT],
    ] as const
  ).map(([name, v, color]): LayoutAnnotation => ({
    x: x[last] as string,
    y: v[last] as number,
    xref: 'x',
    yref: 'y',
    text: narrow
      ? `${(v[last] as number).toFixed(2)}%`
      : `${name} ${(v[last] as number).toFixed(2)}%`,
    showarrow: false,
    xanchor: 'left',
    xshift: 5,
    font: { color, size: 10 },
  }));

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow ? '' : `The yield curve was inverted on ${invertedDays} of ${x.length} closes`,
      },
      hovermode: 'x unified',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { r: narrow ? 48 : 96 },
      xaxis: { type: 'date' },
      yaxis: {
        title: { text: 'Yield' },
        // Room under the lines for the first label and over them for the widest gap's.
        range: [Math.min(...ten, ...bill) - 0.4, Math.max(...ten, ...bill) + 0.5],
        ticksuffix: '%',
        tickformat: '.1f',
        dtick: 0.5,
      },
      shapes: [...halfShapes(), ...marks],
      annotations: [...halfLabels(), ...notes, ...ends],
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
