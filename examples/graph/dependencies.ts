import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A dependency graph (backlog G3): forty modules of a made-up application and what each imports,
 * laid out in layers from the entry points at the top to the modules everything rests on. The
 * layers are chosen to keep the links short, long links are routed between the boxes, and nodes
 * are colored by the part of the application they belong to. Zoom in to read the routes.
 */
export const meta: ExampleMeta = {
  title: 'Graph: dependency graph',
  description: 'Forty modules and their imports as a layered diagram, colored by package.',
  tags: ['graph', 'layered', 'dag', 'dependencies', 'diagram', 'groups'],
  size: { width: 980, height: 700 },
  testTolerance: 0.004,
};

/** Module, its package, and the modules it imports. */
const MODULES: readonly (readonly [string, string, readonly string[]])[] = [
  ['cli', 'app', ['commands', 'config', 'logger']],
  ['server', 'app', ['routes', 'config', 'logger', 'metrics']],
  ['worker', 'app', ['jobs', 'config', 'logger', 'metrics']],
  ['commands', 'app', ['migrate', 'seed', 'users', 'reports']],
  ['routes', 'api', ['auth', 'users', 'orders', 'catalog', 'search', 'reports']],
  ['jobs', 'api', ['orders', 'mailer', 'reports', 'search']],
  ['auth', 'api', ['users', 'sessions', 'crypto']],
  ['users', 'domain', ['db', 'validation', 'events']],
  ['orders', 'domain', ['db', 'catalog', 'payments', 'validation', 'events']],
  ['catalog', 'domain', ['db', 'cache', 'validation']],
  ['payments', 'domain', ['http', 'crypto', 'events']],
  ['search', 'domain', ['index', 'catalog', 'cache']],
  ['reports', 'domain', ['db', 'templates', 'dates']],
  ['mailer', 'domain', ['templates', 'http', 'queue']],
  ['sessions', 'domain', ['cache', 'crypto']],
  ['migrate', 'data', ['db', 'schema']],
  ['seed', 'data', ['db', 'schema', 'random']],
  ['db', 'data', ['pool', 'schema', 'logger']],
  ['index', 'data', ['http', 'text']],
  ['cache', 'data', ['pool', 'serialize']],
  ['queue', 'data', ['pool', 'serialize', 'events']],
  ['schema', 'data', ['types']],
  ['pool', 'data', ['config', 'logger']],
  ['events', 'core', ['types', 'logger']],
  ['validation', 'core', ['types', 'text']],
  ['templates', 'core', ['text', 'dates']],
  ['http', 'core', ['config', 'logger', 'retry']],
  ['crypto', 'core', ['random']],
  ['metrics', 'core', ['config', 'dates']],
  ['retry', 'core', ['random', 'dates']],
  ['serialize', 'core', ['types']],
  ['config', 'core', ['env', 'types']],
  ['logger', 'core', ['env', 'dates']],
  ['text', 'util', []],
  ['dates', 'util', []],
  ['random', 'util', []],
  ['types', 'util', []],
  ['env', 'util', []],
  ['plugins', 'app', ['config', 'events', 'http']],
  ['admin', 'api', ['auth', 'users', 'reports', 'plugins']],
];

export function run(el: HTMLElement): ExampleHandle {
  const index = new Map(MODULES.map((m, i) => [m[0], i]));
  const source: number[] = [];
  const target: number[] = [];
  MODULES.forEach(([, , imports], i) => {
    for (const name of imports) {
      source.push(i);
      target.push(index.get(name)!);
    }
  });
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'layered',
        layered: { rankdir: 'LR', ranksep: 44, nodesep: 10 },
        node: {
          label: MODULES.map((m) => m[0]),
          group: MODULES.map((m) => m[1]),
          textfont: { size: 11 },
        },
        link: { source, target, arrow: { size: 6 } },
      },
    ],
    layout: {
      title: { text: 'Who imports whom' },
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
