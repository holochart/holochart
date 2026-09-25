import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Aggregated data with `counts` (plan E10.11): each entry of the dimensions is one combination of
 * categories, and `counts` says how many samples it stands for, so the 2,201 people aboard the
 * Titanic take 32 rows. Categories are ordered with `categoryarray`.
 */
export const meta: ExampleMeta = {
  title: 'Parallel categories: counts',
  description: 'Titanic passengers and crew by class, sex, age and survival, from counted rows.',
  tags: ['parcats', 'statistical', 'domain', 'categorical', 'aggregated'],
  testTolerance: 0.004,
};

/** Class, sex, age, survived, count (the classic Titanic contingency table). */
const TABLE: [string, string, string, string, number][] = [
  ['1st', 'Male', 'Child', 'No', 0],
  ['2nd', 'Male', 'Child', 'No', 0],
  ['3rd', 'Male', 'Child', 'No', 35],
  ['Crew', 'Male', 'Child', 'No', 0],
  ['1st', 'Female', 'Child', 'No', 0],
  ['2nd', 'Female', 'Child', 'No', 0],
  ['3rd', 'Female', 'Child', 'No', 17],
  ['Crew', 'Female', 'Child', 'No', 0],
  ['1st', 'Male', 'Adult', 'No', 118],
  ['2nd', 'Male', 'Adult', 'No', 154],
  ['3rd', 'Male', 'Adult', 'No', 387],
  ['Crew', 'Male', 'Adult', 'No', 670],
  ['1st', 'Female', 'Adult', 'No', 4],
  ['2nd', 'Female', 'Adult', 'No', 13],
  ['3rd', 'Female', 'Adult', 'No', 89],
  ['Crew', 'Female', 'Adult', 'No', 3],
  ['1st', 'Male', 'Child', 'Yes', 5],
  ['2nd', 'Male', 'Child', 'Yes', 11],
  ['3rd', 'Male', 'Child', 'Yes', 13],
  ['Crew', 'Male', 'Child', 'Yes', 0],
  ['1st', 'Female', 'Child', 'Yes', 1],
  ['2nd', 'Female', 'Child', 'Yes', 13],
  ['3rd', 'Female', 'Child', 'Yes', 14],
  ['Crew', 'Female', 'Child', 'Yes', 0],
  ['1st', 'Male', 'Adult', 'Yes', 57],
  ['2nd', 'Male', 'Adult', 'Yes', 14],
  ['3rd', 'Male', 'Adult', 'Yes', 75],
  ['Crew', 'Male', 'Adult', 'Yes', 192],
  ['1st', 'Female', 'Adult', 'Yes', 140],
  ['2nd', 'Female', 'Adult', 'Yes', 80],
  ['3rd', 'Female', 'Adult', 'Yes', 76],
  ['Crew', 'Female', 'Adult', 'Yes', 20],
];

export function run(el: HTMLElement): ExampleHandle {
  const col = (i: number): string[] => TABLE.map((r) => r[i] as string);
  const chart = createChart(el, {
    data: [
      {
        type: 'parcats',
        counts: TABLE.map((r) => r[4]),
        dimensions: [
          { label: 'Class', values: col(0), categoryarray: ['1st', '2nd', '3rd', 'Crew'] },
          { label: 'Sex', values: col(1) },
          { label: 'Age', values: col(2), categoryarray: ['Adult', 'Child'] },
          { label: 'Survived', values: col(3), categoryarray: ['Yes', 'No'] },
        ],
      },
    ],
    layout: {
      title: { text: 'Titanic: 2,201 people aboard' },
      margin: { t: 48, l: 48, r: 48, b: 24 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
