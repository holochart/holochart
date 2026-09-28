import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { gapminder } from './datasets.mts';

/**
 * Express icicle from a path (plan E13.1, E23.6): `px.icicle(df, path=[px.Constant('World'),
 * 'continent', 'country'], values='pop')` on the synthetic Gapminder table's 2007 rows — a
 * constant column (here an array) puts one World root above the continents, and populations add
 * up level by level. Continents take the colorway; countries inherit their continent's color.
 */
export const meta: ExampleMeta = {
  title: 'Express: icicle from a path',
  description:
    'World population by continent and country as an icicle chart, built from a path of columns.',
  tags: ['express', 'icicle', 'hierarchical', 'path'],
  size: { width: 640, height: 480 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,- ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function run(el: HTMLElement): ExampleHandle {
  const rows = gapminder().filter((r) => r.year === 2007);
  const figure = hx.icicle(rows, {
    path: [rows.map(() => 'World'), 'continent', 'country'],
    values: 'pop',
    title: 'World population, 2007',
  });
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, figure);
    await componentsReady(chart);
  });
  return {
    ready,
    get renderer() {
      return chart?.three.renderer;
    },
    dispose: () => {
      disposed = true;
      chart?.destroy();
    },
  };
}
