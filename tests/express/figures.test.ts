/**
 * Express figures against the full bundle's schemas (plan E23): every attribute Express writes
 * exists and takes the value given, so figures validate cleanly and supply defaults.
 */
import { describe, expect, it } from 'vitest';
import * as hx from '../../packages/express/src/index.ts';
import { registry, supplyDefaults, validate } from '../../packages/holochart/src/index.ts';

const rows = Array.from({ length: 60 }, (_, i) => ({
  continent: ['Asia', 'Europe', 'Africa'][i % 3] as string,
  country: `C${i % 12}`,
  year: 2000 + 5 * Math.floor(i / 12),
  gdp: 1000 + ((i * 937) % 5000),
  life: 50 + ((i * 13) % 30),
  pop: 1e6 * (1 + (i % 7)),
  smoker: i % 2 ? 'Yes' : 'No',
  day: ['Thu', 'Fri', 'Sat', 'Sun'][i % 4] as string,
  start: `2026-03-${String(1 + (i % 20)).padStart(2, '0')}`,
  end: `2026-04-${String(1 + (i % 20)).padStart(2, '0')}`,
}));

const figures: Record<string, () => hx.ExpressFigure> = {
  scatter: () =>
    hx.scatter(rows, {
      x: 'gdp',
      y: 'life',
      color: 'continent',
      symbol: 'smoker',
      size: 'pop',
      hoverName: 'country',
      hoverData: ['day'],
      facetCol: 'smoker',
      logX: true,
      marginalX: 'histogram',
    }),
  scatterContinuous: () =>
    hx.scatter(rows, { x: 'gdp', y: 'life', color: 'pop', facetRow: 'smoker' }),
  scatterMarginals: () =>
    hx.scatter(rows, { x: 'gdp', y: 'life', marginalX: 'rug', marginalY: 'violin' }),
  animated: () =>
    hx.scatter(rows, {
      x: 'gdp',
      y: 'life',
      color: 'continent',
      animationFrame: 'year',
      animationGroup: 'country',
    }),
  line: () =>
    hx.line(rows, {
      x: 'year',
      y: 'life',
      color: 'continent',
      lineDash: 'smoker',
      lineGroup: 'country',
      markers: true,
    }),
  area: () => hx.area(rows, { x: 'year', y: 'pop', color: 'continent', groupnorm: 'percent' }),
  bar: () =>
    hx.bar(rows, { x: 'day', y: 'pop', color: 'continent', text: 'country', barmode: 'group' }),
  barContinuous: () => hx.bar(rows, { x: 'day', y: 'pop', color: 'life', animationFrame: 'year' }),
  timeline: () =>
    hx.timeline(rows.slice(0, 8), {
      xStart: 'start',
      xEnd: 'end',
      y: 'country',
      color: 'continent',
    }),
  histogram: () =>
    hx.histogram(rows, {
      x: 'life',
      color: 'smoker',
      facetCol: 'day',
      facetColWrap: 3,
      histnorm: 'percent',
      cumulative: true,
      nbins: 10,
    }),
  histogramMarginal: () => hx.histogram(rows, { x: 'life', y: 'pop', marginal: 'violin' }),
  box: () => hx.box(rows, { x: 'day', y: 'life', color: 'smoker', points: 'all', notched: true }),
  violin: () =>
    hx.violin(rows, { x: 'day', y: 'life', color: 'smoker', box: true, points: 'outliers' }),
  strip: () => hx.strip(rows, { x: 'day', y: 'life', color: 'smoker', jitter: 0.5 }),
  ecdf: () =>
    hx.ecdf(rows, { x: 'life', color: 'continent', markers: true, marginal: 'histogram' }),
  densityHeatmap: () =>
    hx.densityHeatmap(rows, {
      x: 'gdp',
      y: 'life',
      z: 'pop',
      marginalX: 'box',
      marginalY: 'histogram',
    }),
  densityContour: () =>
    hx.densityContour(rows, { x: 'gdp', y: 'life', color: 'smoker', histnorm: 'probability' }),
  scatterMatrix: () =>
    hx.scatterMatrix(rows, { dimensions: ['gdp', 'life', 'pop'], color: 'continent' }),
  parallelCoordinates: () =>
    hx.parallelCoordinates(rows, { dimensions: ['gdp', 'life', 'pop'], color: 'life' }),
  parallelCategories: () =>
    hx.parallelCategories(rows, { dimensions: ['continent', 'smoker', 'day'], color: 'life' }),
  pie: () =>
    hx.pie(rows, { names: 'day', values: 'pop', color: 'day', hole: 0.3, facetCol: 'smoker' }),
  distplot: () =>
    hx.distplot([rows.map((r) => r.life), rows.map((r) => r.life + 5)], ['a', 'b'], { binSize: 2 }),
};

describe('Express figures validate against the full bundle', () => {
  for (const [name, make] of Object.entries(figures)) {
    it(name, () => {
      const figure = make();
      const issues = validate(figure.data, figure.layout, registry.core);
      expect(issues.map((i) => `${i.path}: ${i.message}`)).toEqual([]);
      for (const frame of figure.frames ?? []) {
        const frameIssues = validate(frame.data, undefined, registry.core);
        expect(frameIssues.map((i) => `${frame.name} ${i.path}: ${i.message}`)).toEqual([]);
      }
      expect(() => supplyDefaults(figure, registry.core)).not.toThrow();
    });
  }
});
