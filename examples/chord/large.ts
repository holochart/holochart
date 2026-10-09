import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A larger chord diagram (backlog G8): 36 airports in six regions and about 150 routes between
 * them (generated, deterministic). Most routes stay within a region, which the layout shows as
 * short ribbons next to the ring; the long ones cross the middle. `sort: 'value'` puts the
 * busiest region first and the busiest airport first within each region, and the ends of the
 * ribbons on an arc are ordered by where they go, so they cross as little as they can. Labels
 * of arcs too short for a line of text are left out.
 */
export const meta: ExampleMeta = {
  title: 'Chord: many nodes',
  description: '36 nodes in six groups and about 150 links, sorted by value.',
  tags: ['chord', 'network', 'groups', 'large', 'domain'],
  size: { width: 720, height: 680 },
  testTolerance: 0.004,
};

const REGIONS = ['Nordic', 'Atlantic', 'Alpine', 'Baltic', 'Iberian', 'Aegean'];
const PER_REGION = 6;

function routes(): { label: string[]; group: string[]; links: [number, number, number][] } {
  const random = rng(11);
  const label: string[] = [];
  const group: string[] = [];
  for (const region of REGIONS) {
    for (let k = 0; k < PER_REGION; k++) {
      label.push(`${region.slice(0, 3).toUpperCase()}${k + 1}`);
      group.push(region);
    }
  }
  const n = label.length;
  const links: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    // The first airport of a region is its hub: more routes, and longer ones.
    const hub = i % PER_REGION === 0;
    const count = hub ? 7 : 3 + Math.floor(random() * 2);
    for (let c = 0; c < count; c++) {
      const far = random() < (hub ? 0.6 : 0.25);
      const region = far ? Math.floor(random() * REGIONS.length) : Math.floor(i / PER_REGION);
      const j = region * PER_REGION + Math.floor(random() * PER_REGION);
      if (j === i) continue;
      links.push([i, j, Math.round((hub ? 30 : 8) + random() * (hub ? 60 : 30))]);
    }
  }
  return { label, group, links };
}

export function run(el: HTMLElement): ExampleHandle {
  const { label, group, links } = routes();
  const chart = createChart(el, {
    data: [
      {
        type: 'chord',
        directed: false,
        sort: 'value',
        padangle: 0.8,
        node: { label, group, thickness: 10 },
        link: {
          source: links.map((l) => l[0]),
          target: links.map((l) => l[1]),
          value: links.map((l) => l[2]),
          opacity: 0.5,
        },
        textfont: { size: 10 },
      },
    ],
    layout: {
      title: { text: 'Routes between 36 airports' },
      showlegend: false,
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
