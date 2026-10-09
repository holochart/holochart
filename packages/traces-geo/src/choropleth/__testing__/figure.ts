/**
 * Test helpers for `choropleth`: default a geo figure of choropleth and scattergeo traces, calc
 * each with its own module and run the geo `crossTraceLayout` on scattergeo's fixed plot area, as
 * the runtime does before drawing. The plot context, the hover query and the other fakes are
 * scattergeo's (`scattergeo/__testing__/figure.ts`).
 */
import {
  createRegistry,
  supplyDefaults,
  type FigureInput,
  type FullLayout,
  type FullTrace,
} from '@mk7s/holochart-core';
import type { DomainTraceEntry, TraceModule, TracePlotContext } from '@mk7s/holochart-runtime';
import { geoCrossTraceLayout, type GeoCalc } from '../../geo/cross-trace.ts';
import { geoOf } from '../../geo/layout-defaults.ts';
import type { GeoSubplot } from '../../geo/subplot.ts';
import {
  FIGURE,
  PLOT_AREA,
  plotContext as scattergeoPlotContext,
  type LaidOutFigure as ScattergeoFigure,
  type PlotContextOptions,
  type PlotHarness as ScattergeoHarness,
} from '../../scattergeo/__testing__/figure.ts';
import { scattergeo } from '../../scattergeo/index.ts';
import type { ChoroplethCalc } from '../calc.ts';
import { choropleth } from '../index.ts';

export const registry = createRegistry().register(choropleth).register(scattergeo);

export interface LaidOutFigure {
  fullData: FullTrace[];
  fullLayout: FullLayout;
  /** The calc of each trace; a choropleth's is a {@link ChoroplethCalc}. */
  calcs: (ChoroplethCalc | undefined)[];
  /** Run the layout pass again (a relayout), with the calcs kept. */
  layout(): void;
  subplot(id?: string): GeoSubplot;
}

/**
 * `chart` stands for the chart whose subplots keep their views from one pass to the next (the
 * layout step asks it to `resize` when data it waits for arrives).
 */
export function layoutFigure(
  figure: FigureInput,
  chart: object = { resize: () => {} },
): LaidOutFigure {
  const { fullData, fullLayout } = supplyDefaults(figure, registry, { validate: false });
  const calcs: (ChoroplethCalc | undefined)[] = [];
  const entries: DomainTraceEntry<GeoCalc>[] = [];
  fullData.forEach((trace, index) => {
    const module = trace._module as TraceModule<GeoCalc> | undefined;
    if (trace.visible !== true || !module?.calc) {
      calcs.push(undefined);
      return;
    }
    const calc = module.calc(trace, { fullLayout, index, xaxis: undefined, yaxis: undefined });
    calcs.push(calc as ChoroplethCalc);
    entries.push({ trace, index, calc, domain: { x: [0, 1], y: [0, 1], rect: PLOT_AREA } });
  });
  const layout = (): void =>
    geoCrossTraceLayout(entries, {
      fullLayout,
      width: FIGURE.width,
      height: FIGURE.height,
      plotArea: PLOT_AREA,
      chart: chart as never,
    });
  layout();
  return {
    fullData,
    fullLayout,
    calcs,
    layout,
    subplot(id = 'geo') {
      const calc = calcs.find((c, i) => c && geoOf(fullData[i]!) === id);
      if (!calc?.subplot) throw new Error(`no laid out subplot ${id}`);
      return calc.subplot;
    },
  };
}

export interface PlotHarness extends Omit<ScattergeoHarness, 'ctx'> {
  ctx: TracePlotContext<ChoroplethCalc>;
}

/** The plot context of trace `index` of a laid out figure (scattergeo's, for a choropleth calc). */
export function plotContext(
  f: LaidOutFigure,
  index = 0,
  options: PlotContextOptions = {},
): PlotHarness {
  return scattergeoPlotContext(
    f as unknown as ScattergeoFigure,
    index,
    options,
  ) as unknown as PlotHarness;
}
