/**
 * @mk7s/holochart-runtime — the chart runtime (ADR-019): `createChart` / `newPlot`, pipeline
 * orchestration (validate → defaults → calc → layout → plot → render), the update API, events, the
 * registry, and the contracts trace packages and components implement.
 *
 * Core stays renderer-free; trace packages and components depend on this package, never the
 * reverse. The `@mk7s/holochart` bundle registers the built-ins.
 */

// Contracts (E22.1, E22.3)
export type {
  AxisInfo,
  CalcContext,
  ComponentDrawContext,
  ComponentLayoutContext,
  ComponentModule,
  ComponentRenderer,
  ComponentUpdatePlan,
  ComponentView,
  MarginPush,
  Registrable,
  SubplotInfo,
  TemplateModule,
  TraceExtremes,
  TraceModule,
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from './contracts.ts';

// Registry (E22.2)
export { createChartRegistry, defineTemplate, register, registry } from './registry.ts';
export type { ChartRegistry, ChartRegistryOptions, RegistryListing } from './registry.ts';

// Chart (E7.1, E4.1, E4.3)
export { Chart, createChart, getChart } from './chart.ts';
export type { ChartOptions, ChartThree, FigurePatch } from './chart.ts';
export {
  addTraces,
  deleteTraces,
  moveTraces,
  newPlot,
  purge,
  react,
  relayout,
  restyle,
  update,
} from './api.ts';
export type {
  CanonicalEvent,
  ChartEventKey,
  ChartEventName,
  ChartEvents,
  ChartListener,
} from './events.ts';

// Helpers for trace and component authors
export { dataTransform, linearExtremes } from './axes.ts';
export { MIN_PLOT_SIZE } from './layout.ts';
export type { AttributeUpdate } from './plan.ts';
