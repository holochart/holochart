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
  ColorbarSpec,
  ComponentDrawContext,
  ComponentExtremesContext,
  DescribeContext,
  ComponentLayoutContext,
  ComponentModule,
  ComponentPointerEvent,
  DrawGesture,
  ComponentRenderer,
  ComponentUpdatePlan,
  ComponentView,
  CrossTraceContext,
  CrossTraceEntry,
  DomainInfo,
  DomainLayoutContext,
  DomainTraceEntry,
  HoverContext,
  HoverPoint,
  HoverQuery,
  LegendGlyph,
  LegendIconContext,
  LegendItem,
  TraceDescription,
  MarginPush,
  Registrable,
  SelectionQuery,
  SubplotInfo,
  SubplotMirror,
  SubplotMirrorOptions,
  TemplateModule,
  TraceAppend,
  TraceCellRef,
  TraceExtremes,
  TraceModule,
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from './contracts.ts';

// Registry (E22.2)
export {
  createChartRegistry,
  defineTemplate,
  register,
  registry,
  setDefaultTemplate,
} from './registry.ts';
export type { ChartRegistry, ChartRegistryOptions, RegistryListing } from './registry.ts';

// Chart (E7.1, E4.1, E4.3)
export { Chart, createChart, getChart, STACK_GROUPS } from './chart.ts';
export type { ChartOptions, ChartThree, FigurePatch } from './chart.ts';
export {
  addFrames,
  addTraces,
  animate,
  deleteFrames,
  deleteTraces,
  downloadImage,
  extendTraces,
  Fx,
  hover,
  moveTraces,
  newPlot,
  prependTraces,
  purge,
  react,
  relayout,
  restyle,
  toImage,
  unhover,
  update,
} from './api.ts';
export type {
  CanonicalEvent,
  ChartEventKey,
  ChartEventName,
  ChartEvents,
  ChartListener,
  ChartPoint,
  AnnotationEventData,
  LegendEventData,
  PointerEventData,
  SelectionEventData,
} from './events.ts';

// Transitions and animation (E7.3, E7.4)
export type {
  AnimateTarget,
  AnimatingFrameEvent,
  AnimationOptions,
  ComputedFrame,
  EasingName,
  Frame,
  FrameOptions,
  TransitionOptions,
} from './anim/types.ts';

// Raster export (E18.1)
export type { DownloadImageOptions, ImageFormat, ToImageOptions } from './export/types.ts';

// Accessibility (E17.1)
export {
  countText,
  formatAxisValue,
  formatPlainNumber,
  listText,
  accessibleText,
  traceNameText,
} from './a11y/text.ts';
export { MAX_TABLE_ROWS } from './a11y/describe.ts';
export type { ChartDescription, DescribedTable } from './a11y/describe.ts';

// JSON (E18.3)
export { chartToJSON, figureFromJSON, fromJSON } from './json.ts';
export type { ChartFigureSource, ChartToJSONOptions } from './json.ts';

// Interaction (E5.7, E6.1–E6.4, E2.17)
export { formatTemplate, splitExtra } from './fx/template.ts';
export type { TemplateContext, TemplateOptions } from './fx/template.ts';
export { pointInPolygon, selectionContains } from './fx/geometry.ts';
// Selections as layout objects (E5.12)
export {
  linearToPosition,
  parseSelectionPath,
  positionToLinear,
  selectionFromQuery,
  selectionQuery,
  selectionsOf,
} from './fx/selections.ts';
export type { FullSelection } from './fx/selections.ts';
export { createLatestQueue } from './fx/queue.ts';
export type { LatestQueue } from './fx/queue.ts';
export { DRAW_DRAGMODES, fxComponent, fxLayoutAttributes, isDrawDragmode } from './fx/settings.ts';
export type {
  DoubleClickAction,
  Dragmode,
  DrawDragmode,
  FxSettings,
  Hovermode,
} from './fx/settings.ts';

// Helpers for trace and component authors
export { dataTransform, linearExtremes } from './axes.ts';
export { domainRect, fitAspect, inscribedCircle, MIN_PLOT_SIZE } from './layout.ts';
export type { AttributeUpdate, MaxPoints, StreamUpdate } from './plan.ts';
