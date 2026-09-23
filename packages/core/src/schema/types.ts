/**
 * Types for the attribute schema DSL (plan E1.1, ADR-002).
 *
 * A schema is a tree of {@link SchemaNode}s:
 *
 * - {@link AttrSpec} — a leaf attribute with a value type (`valType`), default, constraints and
 *   metadata. Leaves carry two phantom type parameters (the accepted input type and the type found
 *   in `fullData`/`fullLayout`) so TypeScript can infer figure types straight from a declaration.
 * - {@link ObjectNode} — a nested container such as `marker` or `marker.line`.
 * - {@link ItemsNode} — an array of objects such as `annotations` or `shapes`, whose items can be
 *   pulled from a template by `templateitemname`.
 *
 * The same tree drives coercion, defaults, validation, the update planner (via `editType`), code
 * generation of named TS types, and `plot-schema.json`.
 */

/** Every value type understood by coercion and validation. */
export const VAL_TYPES = [
  'number',
  'integer',
  'string',
  'boolean',
  'enumerated',
  'flaglist',
  'color',
  'colorlist',
  'colorscale',
  'angle',
  'subplotid',
  'data_array',
  'info_array',
  'any',
  'function',
] as const;

/** A value type understood by coercion and validation. */
export type ValType = (typeof VAL_TYPES)[number];

/**
 * Edit-type flags (plan E1.7). Each attribute declares which pipeline stages a change to it
 * invalidates, so updates re-run only what is needed.
 *
 * - `calc` — recompute calcdata (and everything downstream).
 * - `calcIfAutorange` — `calc` only when an affected axis autoranges; otherwise `plot`.
 * - `crossTraceCalc` — re-run stacking/grouping across traces.
 * - `layout` — recompute subplot domains, margins and autorange.
 * - `ticks` — regenerate axis ticks and labels.
 * - `plot` — rebuild or update scene objects.
 * - `style` — update colors, sizes and other uniforms/attributes in place.
 * - `colorbars`, `legend`, `modebar`, `camera` — redraw that component only.
 * - `none` — no visual effect (e.g. `meta`, `uirevision`).
 */
export const EDIT_FLAGS = [
  'calc',
  'calcIfAutorange',
  'crossTraceCalc',
  'layout',
  'ticks',
  'plot',
  'style',
  'colorbars',
  'legend',
  'modebar',
  'camera',
  'none',
] as const;

/** One edit-type flag. See {@link EDIT_FLAGS}. */
export type EditFlag = (typeof EDIT_FLAGS)[number];

/** An attribute's edit type: a single flag or a combination of flags. */
export type EditType = EditFlag | readonly EditFlag[];

/** Docs grouping tag for an attribute. */
export type AttrRole = 'data' | 'style' | 'info' | 'layout';

/** Values allowed in `enumerated.values` and `flaglist.extras`. */
export type Primitive = string | number | boolean;

/** Any JS typed array except `BigInt64Array`/`BigUint64Array` (charts deal in doubles). */
export type TypedArray =
  | Float32Array
  | Float64Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Uint32Array;

/** A column of data: a plain array (numbers, strings, `Date`s, …) or a typed array. */
export type DataArray = readonly unknown[] | TypedArray;

/** A colorscale: a named scale (`'Viridis'`) or `[position, color]` stops from 0 to 1. */
export type ColorScale = string | ReadonlyArray<readonly [number, string]>;

/** A function-valued attribute (non-serializable, ADR-012). */
// Parameters are `any` on purpose: accessors are called with trace-specific arguments.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFunction = (...args: any[]) => unknown;

/** Metadata shared by every schema node (leaves and containers). */
export interface NodeMeta {
  /**
   * Pipeline stages invalidated by a change. Inherited from the nearest ancestor that declares
   * one; the planner treats an undeclared root as `calc`.
   */
  readonly editType?: EditType;
  /** Markdown description used for generated docs, JSDoc and editor hovers. */
  readonly description?: string;
  /** Example values for docs. */
  readonly examples?: readonly unknown[];
  /** Version in which the attribute first appeared. */
  readonly since?: string;
  /** Deprecation message. Using a deprecated attribute produces a `deprecated` issue. */
  readonly deprecated?: string;
  /** Equivalent Plotly attribute path, when it differs from ours (compat-plotly, docs). */
  readonly plotlyPath?: string;
  /** Whether transitions can interpolate this attribute (E7.3). */
  readonly animatable?: boolean;
  /** Docs grouping. */
  readonly role?: AttrRole;
}

/**
 * Constraint fields for leaf attributes. Which fields apply depends on `valType`; builders in
 * `attr.ts` only expose the relevant ones.
 */
export interface AttrConstraints {
  /** Default value (`undefined` means the attribute is absent from the full output when unset). */
  readonly dflt?: unknown;
  /** Inclusive bounds for `number`, `integer` and `info_array` items. */
  readonly min?: number;
  readonly max?: number;
  /** Clamp out-of-range numbers instead of falling back to `dflt`. */
  readonly clamp?: boolean;
  /** Allowed values for `enumerated`. */
  readonly values?: readonly Primitive[];
  /** Flags for `flaglist`, joined with `+` (e.g. `lines+markers`). */
  readonly flags?: readonly string[];
  /**
   * Special values accepted verbatim: flaglist extras (`'none'`), numeric extras (`'auto'`),
   * subplot-id extras (`'paper'`, `'free'`).
   */
  readonly extras?: readonly Primitive[];
  /** Accept per-point arrays in addition to a scalar value. */
  readonly arrayOk?: boolean;
  /** Reject empty strings (`string`). */
  readonly noBlank?: boolean;
  /** Reject non-string values instead of stringifying numbers (`string`). */
  readonly strict?: boolean;
  /** Item specs for `info_array`: one spec for every item, or one per position. */
  readonly items?: AttrSpec | readonly AttrSpec[];
  /** Allow `info_array` to be shorter/longer than `items`. */
  readonly freeLength?: boolean;
}

/**
 * A leaf attribute.
 *
 * @typeParam TIn - Accepted input type (what users write).
 * @typeParam TFull - Type after defaults (what later stages read).
 */
export interface AttrSpec<TIn = unknown, TFull = unknown> extends NodeMeta, AttrConstraints {
  readonly kind: 'attr';
  readonly valType: ValType;
  /** Phantom: input type. Never set at runtime. */
  readonly '~in'?: [TIn];
  /** Phantom: full type. Never set at runtime. */
  readonly '~full'?: [TFull];
}

/** Child map of a container node. */
export interface Children {
  readonly [key: string]: SchemaNode;
}

/** A nested container (e.g. `marker`, `layout.margin`). */
export interface ObjectNode<C extends Children = Children> extends NodeMeta {
  readonly kind: 'object';
  readonly children: C;
  /**
   * Marks a subplot container family: with `subplot: 'x'` the key `xaxis` also matches `xaxis2`,
   * `xaxis3`, … (the numeric suffix maps to subplot id `x2`, `x3`, …).
   */
  readonly subplot?: string;
}

/** An array of objects (annotations, shapes, …) that supports `templateitemname`. */
export interface ItemsNode<C extends Children = Children> extends NodeMeta {
  readonly kind: 'items';
  /** Schema of one item. `name` and `templateitemname` are added automatically. */
  readonly item: ObjectNode<C>;
  /**
   * Singular item name. The template key `<itemName>defaults` (e.g. `annotationdefaults`) holds
   * defaults applied to every item.
   */
  readonly itemName: string;
}

/** Any schema node. */
// The phantom parameters are erased for structural walking code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaNode = AttrSpec<any, any> | ObjectNode | ItemsNode;

/** Makes every property optional, recursively producing input types. */
type InputObject<C> = { -readonly [K in keyof C]?: InferInput<C[K]> };
type FullObject<C> = { -readonly [K in keyof C]: InferFull<C[K]> };

/** Fields added to every item of an {@link ItemsNode} in the full output. */
export interface FullItemExtras {
  /** Index of the item in the user's input array, or -1 for items that only exist in the template. */
  _index: number;
}

/**
 * The input type accepted by a schema node.
 *
 * @example
 * ```ts
 * const marker = attr.object({ size: attr.number({ dflt: 6, arrayOk: true }) });
 * type MarkerInput = InferInput<typeof marker>; // { size?: number | readonly number[] | TypedArray }
 * ```
 */
export type InferInput<N> = N extends { readonly kind: 'attr'; readonly '~in'?: [infer I] }
  ? I
  : N extends ObjectNode<infer C>
    ? InputObject<C>
    : N extends ItemsNode<infer C>
      ? Array<InputObject<C> & { name?: string; templateitemname?: string }>
      : never;

/**
 * The type of a schema node after defaults. Attributes with a `dflt` are always present;
 * attributes without one may be `undefined`. Containers are always present. Trace modules with
 * conditional defaults (e.g. `marker` only when `mode` includes `markers`) document where that
 * guarantee is weaker.
 */
export type InferFull<N> = N extends { readonly kind: 'attr'; readonly '~full'?: [infer F] }
  ? F
  : N extends ObjectNode<infer C>
    ? FullObject<C>
    : N extends ItemsNode<infer C>
      ? Array<FullObject<C> & { name?: string; templateitemname?: string } & FullItemExtras>
      : never;
