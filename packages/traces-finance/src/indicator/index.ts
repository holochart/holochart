/**
 * The `indicator` trace module (plan E12.7): one value as a big number, its delta to a reference
 * (absolute or relative, with direction symbols and colors) and / or a gauge, angular or bullet,
 * with colored steps, a threshold line and a ticked axis, placed by `domain` like Plotly (every
 * mode combination, the number sized to fit when no font size is set). Transitions count the
 * number up and sweep the gauge bar (`value` is animatable). Registered with `register(indicator)`
 * (ADR-019).
 *
 * Deferred: the 3D-native gauge `depth` / `material` (P2), the gauge axis `labelalias`.
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { indicatorAttributes } from './attributes.ts';
import { calcIndicator, type IndicatorCalc } from './calc.ts';
import { supplyIndicatorDefaults } from './defaults.ts';
import { describeIndicator } from './describe.ts';
import { indicatorRenderer } from './plot.ts';

export const indicator: TraceModule<IndicatorCalc, typeof indicatorAttributes.children> = {
  type: 'indicator',
  categories: ['domain', 'noOpacity', 'noHover'],
  schema: indicatorAttributes,
  meta: {
    description:
      'A single value as a big number, its delta to a reference and / or an angular or bullet gauge with steps and a threshold, placed by `domain`; the gauge is one instanced GPU arc or rect set and the text one SDF batch.',
    docsPage: 'indicator',
    plotlyEquivalent: 'indicator',
  },
  supplyDefaults: supplyIndicatorDefaults,
  calc: calcIndicator,
  plot: indicatorRenderer,
  describe: describeIndicator,
};

export { indicatorAttributes } from './attributes.ts';
export type { IndicatorCalc } from './calc.ts';
