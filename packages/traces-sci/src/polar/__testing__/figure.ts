/**
 * Test helper: default a polar figure, calc its polar traces and run the polar
 * `crossTraceLayout` on a fixed plot area, as the runtime does before drawing.
 */
import {
  createRegistry,
  supplyDefaults,
  type FigureInput,
  type FullLayout,
  type FullTrace,
} from '@mk7s/holochart-core';
import type { DomainTraceEntry, TraceModule } from '@mk7s/holochart-runtime';
import { barpolar } from '../../barpolar/index.ts';
import { scatterpolar } from '../../scatterpolar/index.ts';
import { polarCrossTraceLayout, type PolarCalc } from '../cross-trace.ts';
import type { PolarSubplot } from '../subplot.ts';

export const PLOT_AREA = { x: 0, y: 0, width: 400, height: 400 } as const;

export interface LaidOutFigure {
  fullData: FullTrace[];
  fullLayout: FullLayout;
  calcs: (PolarCalc | undefined)[];
  subplot(id?: string): PolarSubplot;
}

export function layoutFigure(figure: FigureInput): LaidOutFigure {
  const registry = createRegistry().register(scatterpolar, barpolar);
  const { fullData, fullLayout } = supplyDefaults(figure, registry, { validate: false });
  const calcs: (PolarCalc | undefined)[] = [];
  const entries: DomainTraceEntry<PolarCalc>[] = [];
  fullData.forEach((trace, index) => {
    const module = trace._module as TraceModule<PolarCalc> | undefined;
    if (trace.visible !== true || !module?.calc) {
      calcs.push(undefined);
      return;
    }
    const calc = module.calc(trace, { fullLayout, index, xaxis: undefined, yaxis: undefined });
    calcs.push(calc);
    entries.push({ trace, index, calc, domain: { x: [0, 1], y: [0, 1], rect: PLOT_AREA } });
  });
  polarCrossTraceLayout(entries, {
    fullLayout,
    width: PLOT_AREA.width,
    height: PLOT_AREA.height,
    plotArea: PLOT_AREA,
  });
  return {
    fullData,
    fullLayout,
    calcs,
    subplot(id = 'polar') {
      const calc = calcs.find((c, i) => c && (fullData[i]?.['subplot'] ?? 'polar') === id);
      if (!calc?.subplot) throw new Error(`no laid out subplot ${id}`);
      return calc.subplot;
    },
  };
}
