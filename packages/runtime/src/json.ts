/**
 * Chart ⇄ JSON (plan E18.3): `chart.toJSON()` and `Holochart.fromJSON()`.
 *
 * The encoding itself lives in core (`encodeFigure` / `decodeFigure`: Plotly's typed-array
 * `{ dtype, bdata, shape }` encoding, Dates as ISO strings, style functions evaluated or dropped per
 * ADR-012). This module binds it to charts: it serializes the chart's current *input* figure
 * (`data`, `layout`, `config`, `frames`, `datasets` — what the user gave, after updates), never the
 * defaulted `fullData`/`fullLayout`, so a reloaded figure behaves like the original, including
 * later template or default changes.
 */
import {
  decodeFigure,
  encodeFigure,
  type EncodedFigure,
  type EncodeFigureOptions,
  type FigureInput,
  type Registry,
} from '@mk7s/holochart-core';
import { createChart, type Chart, type ChartOptions } from './chart.ts';
import { registry as defaultRegistry, type ChartRegistry } from './registry.ts';

/**
 * What {@link chartToJSON} reads from a chart. `Chart` provides `data`, `layout` and `config`;
 * `frames`, `datasets` and `registry` are read when the chart exposes them.
 */
export interface ChartFigureSource {
  readonly data: readonly unknown[];
  readonly layout: unknown;
  readonly config: unknown;
  readonly frames?: unknown;
  readonly datasets?: FigureInput['datasets'];
  /** The chart's registry, used to evaluate style functions on `arrayOk` attributes. */
  readonly registry?: ChartRegistry;
}

/** Options for {@link chartToJSON}. */
export interface ChartToJSONOptions extends Pick<EncodeFigureOptions, 'onWarning'> {
  /**
   * Registry whose trace schemas decide which style functions are evaluated into per-point arrays
   * (functions elsewhere are dropped). Default: the chart's registry when it exposes one, else the
   * shared `registry`.
   */
  readonly registry?: ChartRegistry | Registry;
}

function coreRegistry(r: ChartRegistry | Registry): Registry {
  return 'core' in r ? r.core : r;
}

/**
 * The chart's current input figure (`data`, `layout`, `config`, `frames`, `datasets`) encoded as
 * JSON-safe data: `JSON.stringify` the result to save it, and pass it (or the string) to
 * {@link figureFromJSON} or {@link fromJSON} to restore it. Keys the chart does not have are left
 * out. The chart is not modified.
 *
 * Style functions (ADR-012) warn once per path: on `arrayOk` attributes of registered traces they
 * are evaluated into per-point arrays, elsewhere (e.g. `config.renderHover`) they are dropped.
 *
 * @example
 * ```ts
 * localStorage.setItem('fig', JSON.stringify(chartToJSON(chart)));
 * const restored = fromJSON(el, localStorage.getItem('fig')!);
 * ```
 */
export function chartToJSON(
  chart: ChartFigureSource,
  options: ChartToJSONOptions = {},
): EncodedFigure {
  const figure: Record<string, unknown> = { data: chart.data, layout: chart.layout };
  if (chart.config !== undefined) figure['config'] = chart.config;
  if (chart.frames !== undefined) figure['frames'] = chart.frames;
  if (chart.datasets !== undefined) figure['datasets'] = chart.datasets;
  const registry = options.registry ?? chart.registry ?? defaultRegistry;
  const encodeOptions: EncodeFigureOptions = { registry: coreRegistry(registry) };
  return encodeFigure(
    figure as FigureInput,
    options.onWarning ? { ...encodeOptions, onWarning: options.onWarning } : encodeOptions,
  );
}

/**
 * Decode a figure saved with {@link chartToJSON} (or encoded by Plotly): typed-array specs become
 * typed arrays again, anywhere in the figure. Accepts the JSON text or the parsed value; throws on
 * a non-object or a malformed typed-array spec.
 */
export function figureFromJSON(json: unknown): FigureInput {
  return decodeFigure(json);
}

/**
 * Create a chart from a saved figure: {@link figureFromJSON} then `createChart`.
 *
 * @example
 * ```ts
 * const chart = fromJSON(el, await (await fetch('/figures/sales.json')).text());
 * await chart.ready;
 * ```
 */
export function fromJSON(el: HTMLElement, json: unknown, options?: ChartOptions): Chart {
  return createChart(el, figureFromJSON(json), options);
}
