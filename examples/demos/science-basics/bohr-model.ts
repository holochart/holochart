import { createChart, type Chart, type Figure, type ScatterpolarTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { CATEGORY_COLOR, element } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * The shell picture of an atom drawn with `scatterpolar`: the nucleus is one marker at the center
 * (labelled with its charge, the number of protons), each electron shell is a thin circle (a
 * `lines` trace with a constant `r`), and the electrons are markers spaced evenly around their
 * shell. The polar axes are hidden (`angularaxis.visible` and `radialaxis.visible` false) and the
 * radial range is fixed, so the shells stay put when the toolbar toggle swaps the element with
 * `chart.react(…)`. Hover names the shell and how many electrons it holds.
 *
 * This is the school model (Bohr's shells), a way to count electrons: 2 fit in the first shell and
 * 8 in the next two for these elements. It is not where electrons really are. The orbital and
 * electron cloud examples show that.
 */
export const meta: ExampleMeta = {
  title: 'Atoms: electron shells',
  description:
    'The shell model of six atoms as a polar chart: the nucleus, a circle per shell and the electrons on each shell, with an element toggle.',
  tags: ['demo', 'scatterpolar', 'polar', 'markers', 'react'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

type Sym = 'H' | 'C' | 'O' | 'Na' | 'Cl' | 'Ca';

/** Electrons per shell, counted from the nucleus outward. */
const SHELLS: Record<Sym, number[]> = {
  H: [1],
  C: [2, 4],
  O: [2, 6],
  Na: [2, 8, 1],
  Cl: [2, 8, 7],
  Ca: [2, 8, 8, 2],
};
const SYMBOLS = Object.keys(SHELLS) as Sym[];
/** How many electrons each shell takes in these elements. */
const CAPACITY = [2, 8, 8, 2];
const ELECTRON = '#5e9bd5';
const CIRCLE = Array.from({ length: 181 }, (_, i) => i * 2);

function list(counts: readonly number[]): string {
  if (counts.length === 1) return String(counts[0]);
  return `${counts.slice(0, -1).join(', ')} and ${counts[counts.length - 1]}`;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);

  const figure = (symbol: Sym): Figure => {
    const e = element(symbol);
    const shells = SHELLS[symbol];
    const circles = shells.map((_, k): ScatterpolarTrace => ({
      type: 'scatterpolar',
      mode: 'lines',
      r: CIRCLE.map(() => k + 1),
      theta: CIRCLE,
      thetaunit: 'degrees',
      line: { color: LOOK.zero, width: 1 },
      hoverinfo: 'skip',
      showlegend: false,
    }));
    const electrons = shells.map((n, k): ScatterpolarTrace => ({
      type: 'scatterpolar',
      mode: 'markers',
      name: 'Electron',
      legendgroup: 'electron',
      showlegend: k === 0,
      r: Array.from({ length: n }, () => k + 1),
      // Start at the top; evenly spaced around the shell.
      theta: Array.from({ length: n }, (_, i) => 90 + (360 * i) / n),
      thetaunit: 'degrees',
      marker: { color: ELECTRON, size: 11, line: { color: LOOK.bg, width: 1.5 } },
      hovertemplate:
        `Shell ${k + 1}: <b>${n}</b> electron${n === 1 ? '' : 's'}` +
        ` (room for ${CAPACITY[k]})<extra></extra>`,
    }));
    const nucleus: ScatterpolarTrace = {
      type: 'scatterpolar',
      mode: 'markers+text',
      name: 'Nucleus',
      r: [0],
      theta: [0],
      text: [`${e.z}+`],
      textposition: 'middle center',
      textfont: { color: '#ffffff', size: 11 },
      marker: { color: CATEGORY_COLOR[e.category], size: 34 },
      hovertemplate: `Nucleus of ${e.name.toLowerCase()}: <b>${e.z}</b> protons<extra></extra>`,
    };
    return {
      data: [...circles, ...electrons, nucleus],
      layout: {
        title: {
          text: narrow
            ? ''
            : `${e.name} (${e.symbol}): ${e.z} electron${e.z === 1 ? '' : 's'} in ` +
              `${shells.length === 1 ? 'one shell' : `shells of ${list(shells)}`}`,
        },
        legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
        margin: { t: 72, b: 24, l: 24, r: 24 },
        polar: {
          bgcolor: 'rgba(0, 0, 0, 0)',
          angularaxis: { visible: false },
          radialaxis: { visible: false, range: [0, 4.4] },
        },
      },
      config: chartConfig(narrow),
    };
  };

  const chart: Chart = createChart(chartEl, figure('Na'));

  segmented<Sym>(
    toolbar,
    'Element',
    SYMBOLS.map((s) => ({ value: s, text: `${s} ${element(s).z}` })),
    (value) => void chart.react(figure(value)),
    'Na',
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
