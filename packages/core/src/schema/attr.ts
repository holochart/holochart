/**
 * Builder functions for the attribute schema DSL (plan E1.1).
 *
 * Builders are thin: they tag an options object with its `valType` and carry inferred input/full
 * types as phantom parameters, so a declaration like
 *
 * ```ts
 * const marker = attr.object({
 *   size: attr.number({ dflt: 6, min: 0, arrayOk: true, editType: 'calc' }),
 *   symbol: attr.enumerated({ values: ['circle', 'square'], dflt: 'circle' }),
 * });
 * ```
 *
 * gives `InferInput<typeof marker>` = `{ size?: number | readonly number[] | TypedArray;
 * symbol?: 'circle' | 'square' }` without any hand-written types.
 */
import type {
  AnyFunction,
  AttrSpec,
  Children,
  ColorScale,
  DataArray,
  InferFull,
  InferInput,
  ItemsNode,
  NodeMeta,
  ObjectNode,
  Primitive,
  TypedArray,
} from './types.ts';

type HasDflt<O> = O extends { dflt: infer D } ? (undefined extends D ? false : true) : false;
type Full<T, O> = HasDflt<O> extends true ? T : T | undefined;
type Extras<O> = O extends { extras: readonly (infer E)[] } ? E : never;
type NumArrayOk<T, O> = O extends { arrayOk: true } ? T | readonly T[] | TypedArray : T;
type ArrayOk<T, O> = O extends { arrayOk: true } ? T | readonly T[] : T;

/** Shorthand for an attribute whose input and full types are derived from options `O`. */
type Attr<T, O> = AttrSpec<T, Full<T, O>>;

/** Options for `number`, `integer` and `angle`. */
export interface NumberOptions extends NodeMeta {
  readonly dflt?: Primitive;
  readonly min?: number;
  readonly max?: number;
  /** Clamp out-of-range values instead of falling back to `dflt`. */
  readonly clamp?: boolean;
  readonly arrayOk?: boolean;
  /** Non-numeric values accepted verbatim, e.g. `['auto']`. */
  readonly extras?: readonly Primitive[];
}

/** Options for `string`. */
export interface StringOptions extends NodeMeta {
  readonly dflt?: string;
  readonly arrayOk?: boolean;
  readonly noBlank?: boolean;
  /** Reject numbers instead of stringifying them. */
  readonly strict?: boolean;
  readonly values?: never;
}

/** Options for `boolean`. */
export interface BooleanOptions extends NodeMeta {
  readonly dflt?: boolean;
  readonly arrayOk?: boolean;
}

/** Options for `enumerated`. */
export interface EnumeratedOptions extends NodeMeta {
  readonly values: readonly Primitive[];
  readonly dflt?: Primitive;
  readonly arrayOk?: boolean;
}

/** Options for `flaglist`. */
export interface FlaglistOptions extends NodeMeta {
  readonly flags: readonly string[];
  /** Values that stand alone and cannot be combined, e.g. `'none'`, `true`, `false`. */
  readonly extras?: readonly Primitive[];
  readonly dflt?: Primitive;
  readonly arrayOk?: boolean;
}

/** Options for `color`. */
export interface ColorOptions extends NodeMeta {
  readonly dflt?: string;
  readonly arrayOk?: boolean;
}

/** Options for `colorlist`. */
export interface ColorlistOptions extends NodeMeta {
  readonly dflt?: readonly string[];
}

/** Options for `colorscale`. */
export interface ColorscaleOptions extends NodeMeta {
  readonly dflt?: ColorScale;
}

/** Options for `subplotId`. */
export interface SubplotIdOptions extends NodeMeta {
  /** Base id such as `'x'`, `'y'`, `'scene'`. Ids match `/^base([2-9]|[1-9]\d+)?$/`. */
  readonly dflt: string;
  /** Extra values accepted verbatim, e.g. `['free']` or `['paper']`. */
  readonly extras?: readonly Primitive[];
}

/** Options for `dataArray`. */
export type DataArrayOptions = NodeMeta;

/** Options for `infoArray`. */
export interface InfoArrayOptions extends NodeMeta {
  /** One spec applied to every item, or one spec per position. */
  readonly items: AttrSpec | readonly AttrSpec[];
  readonly dflt?: readonly unknown[];
  /** Allow a length different from `items` (a single `items` spec implies free length). */
  readonly freeLength?: boolean;
}

/** Options for `any`. */
export interface AnyOptions extends NodeMeta {
  readonly dflt?: unknown;
  readonly arrayOk?: boolean;
}

/** Options for `fn`. */
export type FunctionOptions = NodeMeta;

/** Options for `items`. */
export interface ItemsOptions extends NodeMeta {
  /** Singular item name; the template key `<itemName>defaults` applies to every item. */
  readonly itemName: string;
}

type EnumValue<O> = O extends { values: readonly (infer V)[] } ? V : never;
type FlagValue<O> = O extends { flags: readonly (infer F extends string)[] }
  ? F | `${F}+${string}`
  : string;
type SubplotValue<O> = O extends { dflt: infer D extends string } ? D | `${D}${number}` : string;
type InfoItems<O> = O extends { items: infer I }
  ? I extends readonly AttrSpec[]
    ? { -readonly [K in keyof I]: InferInput<I[K]> }
    : InferInput<I>[]
  : unknown[];
type InfoItemsFull<O> = O extends { items: infer I }
  ? I extends readonly AttrSpec[]
    ? { -readonly [K in keyof I]: Exclude<InferFull<I[K]>, undefined> }
    : Exclude<InferFull<I>, undefined>[]
  : unknown[];

/** Children added to every item of an `items` node so templates can target them. */
export interface TemplatedItemChildren extends Children {
  readonly name: AttrSpec<string, string | undefined>;
  readonly templateitemname: AttrSpec<string, string | undefined>;
}

function leaf<T>(valType: AttrSpec['valType'], opts: object | undefined): T {
  return { ...opts, kind: 'attr', valType } as T;
}

/**
 * A floating-point number.
 * Numeric strings are coerced to numbers. Out-of-range values fall back to `dflt` (or are clamped
 * with `clamp: true`).
 */
function number<const O extends NumberOptions = NumberOptions & { dflt?: undefined }>(
  opts?: O,
): Attr<NumArrayOk<number, O> | Extras<O>, O> {
  return leaf('number', opts);
}

/** An integer. Non-integral numbers are rejected. */
function integer<const O extends NumberOptions = NumberOptions & { dflt?: undefined }>(
  opts?: O,
): Attr<NumArrayOk<number, O> | Extras<O>, O> {
  return leaf('integer', opts);
}

/** A string. Numbers are stringified unless `strict: true`. */
function string<const O extends StringOptions = StringOptions & { dflt?: undefined }>(
  opts?: O,
): Attr<ArrayOk<string, O>, O> {
  return leaf('string', opts);
}

/** A boolean. Only `true` and `false` are accepted. */
function boolean<const O extends BooleanOptions = BooleanOptions & { dflt?: undefined }>(
  opts?: O,
): Attr<ArrayOk<boolean, O>, O> {
  return leaf('boolean', opts);
}

/** One of a fixed set of values. */
function enumerated<const O extends EnumeratedOptions>(opts: O): Attr<ArrayOk<EnumValue<O>, O>, O> {
  return leaf('enumerated', opts);
}

/** A `+`-joined combination of flags (`'lines+markers'`), or one of `extras` alone. */
function flaglist<const O extends FlaglistOptions>(
  opts: O,
): Attr<ArrayOk<FlagValue<O> | Extras<O>, O>, O> {
  return leaf('flaglist', opts);
}

/** Any CSS color. Stored in the full output as canonical `rgb()`/`rgba()`. */
function color<const O extends ColorOptions = ColorOptions & { dflt?: undefined }>(
  opts?: O,
): Attr<ArrayOk<string, O>, O> {
  return leaf('color', opts);
}

/** A list of CSS colors (e.g. `colorway`). */
function colorlist<const O extends ColorlistOptions = ColorlistOptions & { dflt?: undefined }>(
  opts?: O,
): AttrSpec<readonly string[], Full<string[], O>> {
  return leaf('colorlist', opts);
}

/** A named colorscale or a list of `[position, color]` stops. */
function colorscale<const O extends ColorscaleOptions = ColorscaleOptions & { dflt?: undefined }>(
  opts?: O,
): Attr<ColorScale, O> {
  return leaf('colorscale', opts);
}

/** An angle in degrees, normalized to [-180, 180). */
function angle<const O extends NumberOptions = NumberOptions & { dflt?: undefined }>(
  opts?: O,
): Attr<NumArrayOk<number, O> | Extras<O>, O> {
  return leaf('angle', opts);
}

/** A subplot reference such as `'x'`, `'x2'`, `'scene3'`. `'x1'` is normalized to `'x'`. */
function subplotId<const O extends SubplotIdOptions>(
  opts: O,
): Attr<SubplotValue<O> | Extras<O>, O> {
  return leaf('subplotid', opts);
}

/** A column of data (plain or typed array). Kept by reference, never copied. */
function dataArray<const O extends DataArrayOptions = DataArrayOptions>(
  opts?: O,
): AttrSpec<DataArray, DataArray | undefined> {
  return leaf('data_array', opts);
}

/** A fixed-shape array such as an axis `range` (`[min, max]`). */
function infoArray<const O extends InfoArrayOptions>(
  opts: O,
): AttrSpec<InfoItems<O>, Full<InfoItemsFull<O>, O>> {
  return leaf('info_array', opts);
}

/** Any value; only `undefined`/`null` mean unset. */
function any<const O extends AnyOptions = AnyOptions>(opts?: O): AttrSpec<unknown, unknown> {
  return leaf('any', opts);
}

/** A function (style accessor, callback). Non-serializable: dropped from `plot-schema.json` values. */
function fn<const O extends FunctionOptions = FunctionOptions>(
  opts?: O,
): AttrSpec<AnyFunction, AnyFunction | undefined> {
  return leaf('function', opts);
}

/** A nested container. */
function object<const C extends Children>(children: C, meta?: NodeMeta): ObjectNode<C> {
  return { ...meta, kind: 'object', children };
}

/**
 * A subplot container family: `xaxis` also matches `xaxis2`, `xaxis3`, … (plan E1.4).
 * @param subplot - Base subplot id for the family (`'x'` for `xaxis`).
 */
function subplotObject<const C extends Children>(
  subplot: string,
  children: C,
  meta?: NodeMeta,
): ObjectNode<C> {
  return { ...meta, kind: 'object', children, subplot };
}

/**
 * An array of objects (annotations, shapes, …). Every item automatically gets `name` and
 * `templateitemname` so it can be defined in, or linked to, a template (plan E1.5).
 */
function items<const C extends Children>(
  children: C,
  opts: ItemsOptions,
): ItemsNode<C & TemplatedItemChildren> {
  const { itemName, ...meta } = opts;
  const templated: TemplatedItemChildren = {
    name: string({
      editType: 'none',
      description: `Name of this ${itemName}, used to reference it from a template via \`templateitemname\`.`,
    }),
    templateitemname: string({
      editType: 'plot',
      description: `Name of a template ${itemName} to inherit from. If no template item matches, this ${itemName} is hidden (\`visible: false\`).`,
    }),
  };
  return {
    ...meta,
    kind: 'items',
    itemName,
    item: { kind: 'object', children: { ...children, ...templated } },
  };
}

/**
 * The schema DSL. Each builder returns a plain, JSON-like object, so schemas can be inspected,
 * merged and serialized to `plot-schema.json`.
 */
export const attr = {
  number,
  integer,
  string,
  boolean,
  enumerated,
  flaglist,
  color,
  colorlist,
  colorscale,
  angle,
  subplotId,
  dataArray,
  infoArray,
  any,
  fn,
  object,
  subplotObject,
  items,
} as const;
