// Every published package's declarations, imported directly (not only through the full bundle)
// so each `index.d.ts` is type-checked with the fixture's options: strict,
// `exactOptionalPropertyTypes`, no skipLibCheck (backlog S2.13a).
import type * as holochart from '@mk7s/holochart';
import type * as components from '@mk7s/holochart-components';
import type * as core from '@mk7s/holochart-core';
import type * as express from '@mk7s/holochart-express';
import type * as locales from '@mk7s/holochart-locales';
import type * as render from '@mk7s/holochart-render';
import type * as runtime from '@mk7s/holochart-runtime';
import type * as themes from '@mk7s/holochart-themes';
import type * as traces3d from '@mk7s/holochart-traces-3d';
import type * as tracesBasic from '@mk7s/holochart-traces-basic';
import type * as tracesFinance from '@mk7s/holochart-traces-finance';
import type * as tracesHier from '@mk7s/holochart-traces-hier';
import type * as tracesSci from '@mk7s/holochart-traces-sci';
import type * as tracesStats from '@mk7s/holochart-traces-stats';

/** One export of each package, so none of the imports is unused. */
export interface EveryPackage {
  holochart: holochart.Figure;
  components: typeof components.builtinComponents;
  core: core.FigureInput;
  express: typeof express.scatter;
  locales: typeof locales.de;
  render: render.RenderRoot;
  runtime: runtime.Chart;
  themes: typeof themes.builtinThemes;
  traces3d: traces3d.Scatter3dTrace;
  tracesBasic: tracesBasic.ScatterTrace;
  tracesFinance: tracesFinance.CandlestickTrace;
  tracesHier: tracesHier.SankeyTrace;
  tracesSci: tracesSci.ContourTrace;
  tracesStats: tracesStats.BoxTrace;
}
