/**
 * @mk7s/holochart-core — figure model, attribute schema system, validation, defaults, templates
 * and update planning. Pure and renderer-agnostic: nothing here imports three.js.
 */

// Schema DSL (E1.1)
export { attr } from './schema/attr.ts';
export type {
  AnyOptions,
  BooleanOptions,
  ColorOptions,
  ColorlistOptions,
  ColorscaleOptions,
  DataArrayOptions,
  EnumeratedOptions,
  FlaglistOptions,
  FunctionOptions,
  InfoArrayOptions,
  ItemsOptions,
  NumberOptions,
  StringOptions,
  SubplotIdOptions,
  TemplatedItemChildren,
} from './schema/attr.ts';
export { EDIT_FLAGS, VAL_TYPES } from './schema/types.ts';
export type {
  AnyFunction,
  AttrConstraints,
  AttrRole,
  AttrSpec,
  Children,
  ColorScale,
  DataArray,
  EditFlag,
  EditType,
  FullItemExtras,
  InferFull,
  InferInput,
  ItemsNode,
  NodeMeta,
  ObjectNode,
  Primitive,
  SchemaNode,
  TypedArray,
  ValType,
} from './schema/types.ts';
export {
  forEachAttr,
  getNodeAtPath,
  inheritedEditType,
  isAttr,
  isItemsNode,
  isObjectNode,
  keyForSubplotId,
  resolveChild,
  splitSubplotKey,
  subplotIdForKey,
  walkPath,
} from './schema/walk.ts';
export { plotSchema, schemaToJSON } from './schema/json.ts';
export type { JSONSchemaNode, PlotSchema } from './schema/json.ts';

// TS type generation (E1.2)
export {
  DEFAULT_GENERATED_HEADER,
  generateTraceTypes,
  generateTypes,
} from './codegen/generate-types.ts';
export type { GenerateTypesOptions, TraceTypeSource } from './codegen/generate-types.ts';
export type * from './generated/layout.ts';
export type * from './generated/config.ts';

// Attribute paths
export { getIn, parsePath, setIn, stringifyPath } from './path/path.ts';
export type { PathSegment } from './path/path.ts';

// Coercion & validation (E1.3)
export {
  canonicalDefault,
  coerceValue,
  describeExpected,
  isArrayLike,
  resolveAttr,
  toNumber,
} from './coerce/coerce.ts';
export type { CoerceResult } from './coerce/coerce.ts';
export { canonicalColor, isValidColor, toRGBA, toRGBAArray } from './coerce/color.ts';
export type { RGBA } from './coerce/color.ts';
export { validate } from './validate/validate.ts';
export type { ValidateOptions } from './validate/validate.ts';
export { formatIssue, ValidationError } from './validate/issues.ts';
export type { Issue, IssueCode } from './validate/issues.ts';
export { editDistance, suggest } from './validate/suggest.ts';

// Layout & config schemas (E1.4, E1.9)
export {
  DEFAULT_COLORWAY,
  DEFAULT_FONT_FAMILY,
  EASINGS,
  fontSchema,
  layoutSchema,
  xaxisSchema,
  yaxisSchema,
} from './layout/schema.ts';
export { configSchema } from './config/schema.ts';

// Registry & trace module contract
export { createRegistry } from './registry/registry.ts';
export {
  cartesianTraceAttributes,
  commonTraceAttributes,
  domainTraceAttributes,
} from './registry/trace-attributes.ts';
export type {
  ComponentModule,
  LayoutDefaultsContext,
  Registry,
  TraceCategory,
  TraceDefaultsContext,
  TraceModule,
  TraceModuleMeta,
} from './registry/types.ts';

// Supply defaults (E1.4)
export { supplyDefaults } from './defaults/supply-defaults.ts';
export type { SupplyDefaultsOptions, SupplyDefaultsResult } from './defaults/supply-defaults.ts';
export {
  coerceAtPath,
  coerceContainer,
  coerceItems,
  resolveWithTemplate,
} from './defaults/container.ts';
export type { CoerceContainerOptions } from './defaults/container.ts';
export { autoType } from './defaults/axes.ts';
export { contrastShade, isFullRange, RANGESELECTOR_Y_PAD } from './defaults/rangeslider.ts';
export {
  getSplomStash,
  stashSplomAxis,
  stashSplomGridSides,
  stashSplomSubplot,
} from './defaults/splom-axes.ts';
export type { GridFallback, SplomAxisStash, SplomStash } from './defaults/splom-axes.ts';
export type {
  FigureInput,
  FullAxis,
  FullConfig,
  FullGrid,
  FullLayout,
  FullTrace,
  Subplots,
} from './defaults/types.ts';

// Subplot grids (E4.4)
export {
  makeSubplots,
  SUBPLOT_TITLE_FONT_SCALE,
  SUBPLOT_TITLE_NAME,
} from './subplots/make-subplots.ts';
export type {
  Extent,
  MakeSubplotsOptions,
  MakeSubplotsResult,
  PlacedTrace,
  PlaceOptions,
  SharedAxes,
  SubplotCell,
  SubplotSpec,
  SubplotType,
  SupportedSubplotType,
} from './subplots/make-subplots.ts';

// Templates (E1.5)
export { composeTemplates, resolveTemplate, templateTraceFor } from './templates/templates.ts';
export type { ResolvedTemplate, Template, TemplateSource } from './templates/templates.ts';
// Built-in templates every bundle registers: the default look and Plotly's (ADR-021)
export {
  DEFAULT_TEMPLATE_NAME,
  HOLOCHART_COLORWAY,
  HOLOCHART_FONT_FAMILY,
  holochartTemplate,
  noneTemplate,
  plotlyClassicTemplate,
} from './templates/builtin.ts';

// Color system: named colorscales, colorways, palettes (E8.2)
export * from './colors/index.ts';

// Edit types & update planner (E1.7)
export {
  editFlagsForPath,
  expandStages,
  planRelayout,
  planRestyle,
  planUpdate,
  STAGE_ORDER,
} from './edit/plan.ts';
export type { Change, PlanOptions, Stage } from './edit/plan.ts';

// Data ingestion (E1.6)
export { formatDate, isDateString, isValidDate, parseDate } from './data/dates.ts';
export type { CalendarSystem } from './data/dates.ts';
export { dataArrayKind, isTypedArray, toFloat32Array, toFloat64Array } from './data/arrays.ts';
export type { DataArrayKind, ToFloat32Options, ToNumericOptions } from './data/arrays.ts';
export { isColumnRef, resolveDataRefs } from './data/datasets.ts';
export type { ResolvedTrace } from './data/datasets.ts';

// JSON serialization (E18.3)
export { decodeFigure, encodeFigure } from './serialize/serialize.ts';
export type {
  EncodedFigure,
  EncodeFigureOptions,
  JSONValue,
  SerializeWarning,
  SerializeWarningCode,
} from './serialize/serialize.ts';
export {
  decodeTypedArray,
  dtypeOf,
  encodeTypedArray,
  encodeTypedMatrix,
  isTypedArraySpec,
} from './serialize/typed-array.ts';
export type {
  DecodedArray,
  Dtype,
  EncodedTypedArray,
  TypedArrayConstructor,
  TypedArraySpec,
} from './serialize/typed-array.ts';

// Utilities
export { deepMerge, isPlainObject, stripInternal } from './util/objects.ts';

// Figure diffing & uirevision (E1.8)
export { diffFigures, matchTraces, planDiff } from './diff/diff.ts';
export type { FigureDiff, TraceMatch, TraceMatching } from './diff/diff.ts';
export { applyUirevision, createUiState, recordGuiEdit } from './diff/uirevision.ts';
export type { GuiEdit, GuiTarget, UiState } from './diff/uirevision.ts';

// Scales, autorange, ticks, formatting, categories, periods (E3) — contract in scales/types.ts
export * from './scales/index.ts';

// Rich text (E2.10) and uniform text sizing (E4.6)
export {
  decodeEntities,
  isStyledRichText,
  mayContainRichText,
  parseRichText,
  parseRichTextStyle,
  richTextLabel,
  richTextLines,
  richTextToPlain,
  sanitizeHref,
  SCRIPT_SIZE,
  SUB_SHIFT,
  SUP_SHIFT,
  uniformRichTextStyle,
} from './text/richtext.ts';
export type {
  RichTextBreak,
  RichTextDeclaration,
  RichTextElement,
  RichTextLabel,
  RichTextLine,
  RichTextLink,
  RichTextLinesOptions,
  RichTextNode,
  RichTextParseOptions,
  RichTextRun,
  RichTextRunFont,
  RichTextString,
  RichTextTag,
} from './text/richtext.ts';
export {
  isUniformTextHidden,
  uniformFontSize,
  uniformTextOf,
  uniformTextScale,
  uniformTextSize,
} from './text/uniform-text.ts';
export type { UniformText, UniformTextItem, UniformTextMode } from './text/uniform-text.ts';
