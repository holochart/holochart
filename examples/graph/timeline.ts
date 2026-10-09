import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A timeline network (backlog G2): under `force`, when every node has an `x` and none has a `y`,
 * the x axis is a real axis. Every node stays at its date and the layout only moves it up or
 * down, to keep linked nodes close and the others apart. Here: programming languages by the year
 * they appeared, with a link from each language to the ones it drew on.
 */
export const meta: ExampleMeta = {
  title: 'Graph: timeline network',
  description: 'Nodes held at their date on a real x axis, the force layout free along y.',
  tags: ['graph', 'network', 'force', 'timeline', 'date', 'directed'],
  size: { width: 820, height: 460 },
  testTolerance: 0.004,
};

/** Name, year, and the languages it drew on. */
const LANGUAGES: readonly (readonly [string, number, readonly string[]])[] = [
  ['Fortran', 1957, []],
  ['Lisp', 1958, []],
  ['Algol', 1960, ['Fortran']],
  ['Simula', 1967, ['Algol']],
  ['C', 1972, ['Algol']],
  ['Smalltalk', 1972, ['Simula', 'Lisp']],
  ['ML', 1973, ['Lisp']],
  ['Scheme', 1975, ['Lisp', 'Algol']],
  ['C++', 1985, ['C', 'Simula']],
  ['Erlang', 1986, ['Lisp']],
  ['Perl', 1987, ['C']],
  ['Haskell', 1990, ['ML', 'Scheme']],
  ['Python', 1991, ['C', 'Lisp']],
  ['Java', 1995, ['C++', 'Smalltalk']],
  ['JavaScript', 1995, ['Scheme', 'Java']],
  ['Ruby', 1995, ['Perl', 'Smalltalk', 'Lisp']],
  ['OCaml', 1996, ['ML']],
  ['C#', 2000, ['Java', 'C++']],
  ['Scala', 2004, ['Java', 'ML']],
  ['Go', 2009, ['C']],
  ['Rust', 2010, ['C++', 'OCaml', 'Haskell']],
  ['Kotlin', 2011, ['Java', 'Scala']],
  ['Elixir', 2012, ['Erlang', 'Ruby']],
  ['TypeScript', 2012, ['JavaScript', 'C#']],
  ['Swift', 2014, ['Rust', 'Haskell', 'Ruby']],
];

export function run(el: HTMLElement): ExampleHandle {
  const index = new Map(LANGUAGES.map((l, i) => [l[0], i]));
  const source: number[] = [];
  const target: number[] = [];
  LANGUAGES.forEach(([, , from], i) => {
    for (const name of from) {
      source.push(index.get(name)!);
      target.push(i);
    }
  });
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'force',
        force: { linkdistance: 40, charge: -180, collidepadding: 14 },
        node: {
          label: LANGUAGES.map((l) => l[0]),
          // A date per node and no y: the x axis is real, the layout moves nodes along y only.
          x: LANGUAGES.map((l) => `${l[1]}-01-01`),
          size: 11,
          sizeby: 'outdegree',
          sizerange: [8, 20],
          hovertemplate: '%{label}<br>%{x|%Y}<br>influenced %{outdegree}<extra></extra>',
        },
        link: { source, target, arrow: { end: true, size: 6 } },
      },
    ],
    layout: {
      title: { text: 'Programming languages and what they drew on' },
      xaxis: { title: { text: 'First appeared' } },
      margin: { l: 30, r: 30, t: 60, b: 60 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
