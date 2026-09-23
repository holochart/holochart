/**
 * Schema-derived fast-check arbitraries (plan E20.2). Test-only: this module is NOT exported from
 * the package index and must only be imported from `*.test.ts` files.
 *
 * {@link schemaArbitrary} turns any node declared with the core `attr.*` DSL into an arbitrary:
 *
 * - `mode: 'valid'` produces inputs that validate with zero issues. Objects are sparse (every key
 *   is optional), subplot container families also produce numbered siblings (`xaxis2`, `xaxis11`),
 *   `arrayOk` attributes sometimes get per-point arrays, and deprecated attributes are left out
 *   (using them is legal but reports a `deprecated` warning).
 * - `mode: 'invalid'` produces near-valid trees: each attribute is valid, strictly invalid (see
 *   {@link invalidValueArbitrary}) or wild (NaN, BigInt, Maps, typed arrays, deep nesting, …);
 *   containers sometimes get unknown keys (including `__proto__`/`constructor`) or are replaced by
 *   a wrong shape.
 *
 * Registry-level helpers ({@link layoutArbitrary}, {@link traceArbitrary},
 * {@link figureArbitrary}, …) add the few constraints that live outside the schema: trace `type`
 * must be registered, `layout.template` must be a template, and `dataset` must name a dataset.
 *
 * Sizes are kept small on purpose (depth ≤ 4, arrays ≤ 3 items by default) so property suites
 * stay fast.
 */
import fc from 'fast-check';
import { coerceValue } from '../coerce/coerce.ts';
import { configSchema } from '../config/schema.ts';
import type { Registry } from '../registry/types.ts';
import { attr } from '../schema/attr.ts';
import type {
  AttrSpec,
  ItemsNode,
  ObjectNode,
  Primitive,
  SchemaNode,
  ValType,
} from '../schema/types.ts';

/** Whether generated values should be valid, or near-valid/invalid. */
export type ArbitraryMode = 'valid' | 'invalid';

/**
 * Replaces the generator at a path. Return an arbitrary to use instead, `null` to never generate
 * the key, or `undefined` to keep the schema-derived generator. Paths are dotted keys relative to
 * the root; item arrays contribute `[]` (e.g. `annotations[].font.size`).
 */
export type SchemaOverride = (
  path: string,
  node: SchemaNode,
) => fc.Arbitrary<unknown> | null | undefined;

/** Options for {@link schemaArbitrary} and the registry-level helpers. */
export interface SchemaArbitraryOptions {
  /** `'valid'` (default) or `'invalid'` (near-valid trees with bad values mixed in). */
  readonly mode?: ArbitraryMode;
  /** Containers nested deeper than this are generated empty. Default 4. */
  readonly maxDepth?: number;
  /** Maximum length of item arrays, per-point arrays and info arrays. Default 3. */
  readonly maxArrayLength?: number;
  /** Maximum length of `data_array` values. Default 24 (crosses scatter's 20-point mode switch). */
  readonly maxDataLength?: number;
  /** Generate deprecated attributes. Default: `false` in valid mode, `true` in invalid mode. */
  readonly includeDeprecated?: boolean;
  /**
   * In invalid mode, sometimes put an unresolvable `'@column'` reference on array-taking
   * attributes. Default `true`; {@link templateArbitrary} turns it off (see the KNOWN ISSUE on
   * `plainString`: template values are copied into the full output verbatim).
   */
  readonly columnRefs?: boolean;
  /** Per-path generator overrides. */
  readonly override?: SchemaOverride;
}

interface Resolved {
  readonly mode: ArbitraryMode;
  readonly maxDepth: number;
  readonly maxArrayLength: number;
  readonly maxDataLength: number;
  readonly includeDeprecated: boolean;
  readonly columnRefs: boolean;
  readonly override: SchemaOverride | undefined;
}

function resolveOptions(opts: SchemaArbitraryOptions = {}): Resolved {
  const mode = opts.mode ?? 'valid';
  return {
    mode,
    maxDepth: opts.maxDepth ?? 4,
    maxArrayLength: opts.maxArrayLength ?? 3,
    maxDataLength: opts.maxDataLength ?? 24,
    includeDeprecated: opts.includeDeprecated ?? mode === 'invalid',
    columnRefs: opts.columnRefs ?? true,
    override: opts.override,
  };
}

// ---------------------------------------------------------------------------------------------
// Shared value generators
// ---------------------------------------------------------------------------------------------

const noop = (): undefined => undefined;

/**
 * Strings that never start with `@`: on array-taking attributes `'@name'` is a dataset column
 * reference (plan E1.6), which validation reports when the trace has no `dataset`.
 *
 * KNOWN ISSUE (E20.2): a full trace can hold a literal string starting with `@` on an
 * array-taking attribute — from an escaped input literal (`'@@name'` is unescaped to `'@name'`)
 * or from a template value (templates are not dataset-resolved). Fed back in, that string is a
 * column reference, so the full output is neither valid input nor a fixed point. Such strings are
 * therefore excluded here even though `'@@name'` is valid input; the `it.fails` tests "KNOWN
 * ISSUE: …" in `schema-properties.test.ts` pin the minimal counterexamples.
 */
const plainString = fc.string({ maxLength: 8 }).filter((s) => !s.startsWith('@'));

const finite = fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true });

const byte = fc.integer({ min: 0, max: 255 });

/** Valid CSS colors in a variety of spellings. */
const colorArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    'red',
    'steelblue',
    'transparent',
    '#123',
    '#a1b2c3',
    'rgba(10, 20, 30, 0.5)',
    'hsl(120, 50%, 50%)',
    ' blue ',
  ),
  fc.tuple(byte, byte, byte).map(([r, g, b]) => `rgb(${r}, ${g}, ${b})`),
  fc
    .tuple(byte, byte, byte)
    .map(([r, g, b]) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`),
);

/** Values accepted by `any` attributes. Never `null`/`undefined` (those mean "unset"). */
function anyValue(o: Resolved): fc.Arbitrary<unknown> {
  return fc.oneof(
    fc.integer({ min: -1000, max: 1000 }),
    finite,
    plainString,
    fc.boolean(),
    fc.array(fc.integer({ min: -9, max: 9 }), { maxLength: o.maxArrayLength }),
    fc.dictionary(fc.constantFrom('a', 'b', 'c'), fc.integer({ min: 0, max: 9 }), { maxKeys: 2 }),
  );
}

function dataArrayArb(o: Resolved): fc.Arbitrary<unknown> {
  const len = { maxLength: o.maxDataLength };
  return fc.oneof(
    fc.array(finite, len),
    fc.array(fc.integer({ min: -100, max: 100 }), len),
    fc.array(fc.oneof(plainString, fc.constantFrom('2024-01-01', '2024-02-29 12:00')), len),
    fc.array(fc.date({ noInvalidDate: true }), len),
    fc.array(finite, len).map((a) => new Float64Array(a)),
    fc.array(fc.integer({ min: -100, max: 100 }), len).map((a) => new Int32Array(a)),
  );
}

/** Wrap a scalar generator so `arrayOk` attributes sometimes get per-point arrays. */
function withArrayOk(
  spec: AttrSpec,
  scalar: fc.Arbitrary<unknown>,
  o: Resolved,
  element: fc.Arbitrary<unknown> = scalar,
  numeric = false,
): fc.Arbitrary<unknown> {
  if (spec.arrayOk !== true) return scalar;
  const arrays: fc.Arbitrary<unknown>[] = [fc.array(element, { maxLength: o.maxArrayLength })];
  if (numeric) {
    arrays.push(
      fc.array(fc.double({ noNaN: true }), { maxLength: o.maxArrayLength }).map((a) => {
        return new Float64Array(a);
      }),
    );
  }
  return fc.oneof({ arbitrary: scalar, weight: 3 }, ...arrays);
}

function withExtras(spec: AttrSpec, arb: fc.Arbitrary<unknown> | undefined): fc.Arbitrary<unknown> {
  const extras = spec.extras ?? [];
  if (extras.length === 0) {
    if (arb === undefined)
      throw new Error(`schemaArbitrary: no valid value for ${describeSpec(spec)}`);
    return arb;
  }
  const ex = fc.constantFrom(...extras);
  return arb === undefined ? ex : fc.oneof({ arbitrary: arb, weight: 4 }, ex);
}

function describeSpec(spec: AttrSpec): string {
  return `${spec.valType} ${JSON.stringify({ ...spec, kind: undefined })}`;
}

/** Numbers within `[min, max]` (or ±1e6), or `undefined` if the range holds none. */
function numberInRange(spec: AttrSpec, integer: boolean): fc.Arbitrary<number> | undefined {
  const lo = spec.min ?? Math.min(-1e6, (spec.max ?? 0) - 1e6);
  const hi = spec.max ?? Math.max(1e6, lo + 1e6);
  if (integer) {
    const min = Math.max(Math.ceil(lo), Number.MIN_SAFE_INTEGER);
    const max = Math.min(Math.floor(hi), Number.MAX_SAFE_INTEGER);
    return min <= max ? fc.integer({ min, max }) : undefined;
  }
  return lo <= hi
    ? fc.double({ min: lo, max: hi, noNaN: true, noDefaultInfinity: true })
    : undefined;
}

/** A number, sometimes spelled as a numeric string (`'12'`), which coercion accepts. */
function numberOrNumericString(n: fc.Arbitrary<number>): fc.Arbitrary<unknown> {
  return fc.oneof({ arbitrary: n, weight: 4 }, n.map(String));
}

function colorscaleArb(o: Resolved): fc.Arbitrary<unknown> {
  const pos = fc.double({ min: 0, max: 1, noNaN: true });
  return fc.oneof(
    fc.constantFrom('Viridis', 'Greys', ' RdBu '),
    fc.array(colorArb, { minLength: 2, maxLength: Math.max(2, o.maxArrayLength) }),
    fc
      .tuple(
        colorArb,
        colorArb,
        fc.array(fc.tuple(pos, colorArb), { maxLength: Math.max(0, o.maxArrayLength - 2) }),
      )
      .map(([first, last, mid]) => [
        [0, first],
        ...[...mid].sort((a, b) => a[0] - b[0]),
        [1, last],
      ]),
  );
}

function infoArrayArb(spec: AttrSpec, o: Resolved): fc.Arbitrary<unknown[]> {
  const items = spec.items;
  if (items === undefined) return fc.array(anyValue(o), { maxLength: o.maxArrayLength });
  if (!Array.isArray(items)) {
    return fc.array(validAttr(items as AttrSpec, o), { maxLength: o.maxArrayLength });
  }
  const perPosition = (items as readonly AttrSpec[]).map((s) => validAttr(s, o));
  if (spec.freeLength !== true) return fc.tuple(...perPosition);
  // Free length with per-position specs: any prefix is valid (positions past `items` are not).
  return fc
    .integer({ min: 0, max: perPosition.length })
    .chain((n) => fc.tuple(...perPosition.slice(0, n)));
}

/**
 * Valid values for one attribute. Exhaustive over {@link ValType}: adding a value type without a
 * generator fails type-checking here.
 */
function validAttr(spec: AttrSpec, o: Resolved): fc.Arbitrary<unknown> {
  const valType: ValType = spec.valType;
  switch (valType) {
    case 'number':
    case 'integer': {
      const n = numberInRange(spec, valType === 'integer');
      const scalar = withExtras(spec, n && numberOrNumericString(n));
      return withArrayOk(spec, scalar, o, n ?? scalar, true);
    }
    case 'angle': {
      const n = fc.double({ min: -720, max: 720, noNaN: true });
      return withArrayOk(spec, withExtras(spec, numberOrNumericString(n)), o, n, true);
    }
    case 'string': {
      const s = spec.noBlank === true ? plainString.filter((v) => v.trim() !== '') : plainString;
      const scalar =
        spec.strict === true
          ? s
          : fc.oneof({ arbitrary: s, weight: 4 }, fc.integer({ min: -99, max: 99 }));
      return withArrayOk(spec, scalar, o, s);
    }
    case 'boolean':
      return withArrayOk(spec, fc.boolean(), o);
    case 'enumerated': {
      const values = spec.values ?? [];
      if (values.length === 0)
        throw new Error(`schemaArbitrary: empty enumerated ${describeSpec(spec)}`);
      const numeric = values.filter((v): v is number => typeof v === 'number');
      const scalar =
        numeric.length > 0
          ? fc.oneof(
              { arbitrary: fc.constantFrom(...values), weight: 4 },
              fc.constantFrom(...numeric).map(String),
            )
          : fc.constantFrom(...values);
      return withArrayOk(spec, scalar, o, fc.constantFrom(...values));
    }
    case 'flaglist': {
      const flags = spec.flags ?? [];
      const combos =
        flags.length > 0
          ? fc.shuffledSubarray([...flags], { minLength: 1 }).map((f) => f.join('+'))
          : undefined;
      return withArrayOk(spec, withExtras(spec, combos), o);
    }
    case 'color':
      return withArrayOk(spec, colorArb, o);
    case 'colorlist':
      return fc.array(colorArb, { minLength: 1, maxLength: o.maxArrayLength });
    case 'colorscale':
      return colorscaleArb(o);
    case 'subplotid': {
      const base = typeof spec.dflt === 'string' ? spec.dflt : undefined;
      const ids =
        base === undefined
          ? undefined
          : fc.oneof(
              { arbitrary: fc.constant(base), weight: 3 },
              fc.constant(`${base}1`),
              fc.integer({ min: 2, max: 30 }).map((n) => `${base}${n}`),
            );
      return withExtras(spec, ids);
    }
    case 'data_array':
      return dataArrayArb(o);
    case 'info_array':
      return infoArrayArb(spec, o);
    case 'any':
      return withArrayOk(spec, anyValue(o), o);
    case 'function':
      return fc.constant(noop);
    default: {
      const unreachable: never = valType;
      throw new Error(`schemaArbitrary: unknown valType ${String(unreachable)}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Invalid values
// ---------------------------------------------------------------------------------------------

/** Build fresh junk objects per draw so no generated value is shared between runs. */
function fresh(...makers: (() => unknown)[]): fc.Arbitrary<unknown> {
  return fc.constantFrom(...makers).map((make) => make());
}

function deepNest(depth: number): unknown {
  let v: unknown = 1;
  for (let i = 0; i < depth; i++) v = i % 2 === 0 ? { a: v } : [v];
  return v;
}

/** Values that are wrong for almost every attribute. */
const junk: fc.Arbitrary<unknown> = fresh(
  () => NaN,
  () => Infinity,
  () => -Infinity,
  () => '',
  () => '  ',
  () => 'garbage',
  () => true,
  () => -1,
  () => 1e308,
  () => ({}),
  () => [],
  () => [[]],
  () => ({ a: { b: { c: {} } } }),
  () => new Date(NaN),
  () => Symbol.for('holochart-test'),
  () => 10n,
  () => new Map([['a', 1]]),
  () => (): number => 1,
  () => Object.create(null) as unknown,
  () => deepNest(100),
);

/** Wild values: junk plus fast-check's `anything` with every exotic shape switched on. */
const wild: fc.Arbitrary<unknown> = fc.oneof(
  junk,
  fc.anything({
    maxDepth: 2,
    maxKeys: 3,
    withBigInt: true,
    withBoxedValues: true,
    withDate: true,
    withMap: true,
    withSet: true,
    withNullPrototype: true,
    withSparseArray: true,
    withTypedArray: true,
  }),
);

function isInvalid(spec: AttrSpec, v: unknown): boolean {
  return v !== undefined && v !== null && !coerceValue(spec, v).ok;
}

/** Type-specific near misses: values that look right but are not. */
function nearMisses(spec: AttrSpec, o: Resolved): fc.Arbitrary<unknown>[] {
  const out: fc.Arbitrary<unknown>[] = [];
  const consts = (...vs: unknown[]): void => {
    if (vs.length > 0) out.push(fc.constantFrom(...vs));
  };
  const valType: ValType = spec.valType;
  switch (valType) {
    case 'number':
    case 'integer':
    case 'angle': {
      const { min, max } = spec;
      if (min !== undefined) consts(min - 1, min - 1e-9, String(min - 1), min - 1e6);
      if (max !== undefined) consts(max + 1, max + 1e-9, String(max + 1), max + 1e6);
      if (valType === 'integer') consts(0.5, 1.5, (min ?? 0) + 0.5, '2.5');
      const ex = (spec.extras ?? []).filter((e): e is string => typeof e === 'string');
      consts(
        '12px',
        '1e',
        '--1',
        'Infinity',
        ...ex.map((e) => e.toUpperCase()),
        ...ex.map((e) => ` ${e}x`),
      );
      break;
    }
    case 'string':
      if (spec.strict === true) consts(5, 0, -1.5);
      if (spec.noBlank === true) consts('', ' ', '\t\n');
      consts(true, NaN);
      break;
    case 'boolean':
      consts('true', 'false', 0, 1, 'yes');
      break;
    case 'enumerated':
      consts(
        'none-of-these',
        ...(spec.values ?? []).map((v) =>
          typeof v === 'string' ? `${v.toUpperCase()}?` : `${String(v)}x`,
        ),
      );
      break;
    case 'flaglist': {
      const flags = spec.flags ?? [];
      consts('nope', flags.join(','), flags.join(' + '));
      for (const f of flags.slice(0, 3)) consts(`${f}+${f}`, `${f}+`, `+${f}`, f.toUpperCase());
      break;
    }
    case 'color':
      consts('notacolor', '#12', '#1234567', 'rgb(1, 2)', 'rgb(a,b,c)', 123, 'red blue');
      break;
    case 'colorlist':
      consts([], ['red', 'nope'], 'red', [1, 2]);
      break;
    case 'colorscale':
      consts(
        [],
        ['red'],
        [[0, 'red']],
        [
          [0, 'red'],
          [0.5, 'blue'],
        ],
        [
          [0, 'red'],
          [1, 'nope'],
        ],
        [
          [1, 'red'],
          [0, 'blue'],
        ],
        [
          [0, 'red', 1],
          [1, 'blue'],
        ],
        [
          ['a', 'red'],
          [1, 'blue'],
        ],
        ['red', 5],
      );
      break;
    case 'subplotid': {
      const base = typeof spec.dflt === 'string' ? spec.dflt : 'x';
      consts(
        `${base}0`,
        `${base}01`,
        `${base}1.5`,
        `${base}-2`,
        `${base} 2`,
        base.toUpperCase(),
        'q',
        'free',
        'paper',
      );
      break;
    }
    case 'data_array':
      consts('abc', 5, '@missingColumn');
      break;
    case 'info_array': {
      consts('0,1', 5);
      const items = spec.items;
      if (Array.isArray(items)) {
        const specs = items as readonly AttrSpec[];
        const full = fc.tuple(...specs.map((s) => validAttr(s, o)));
        if (spec.freeLength !== true) out.push(full.map((a) => [...a, 0]));
        specs.forEach((s, i) => {
          const bad = invalidValueArbitrary(s, o);
          if (bad) {
            out.push(
              fc.tuple(full, bad).map(([a, b]) => {
                const c: unknown[] = [...a];
                c[i] = b;
                return c;
              }),
            );
          }
        });
      } else if (items !== undefined) {
        const s = items as AttrSpec;
        const bad = invalidValueArbitrary(s, o);
        if (bad) {
          out.push(
            fc.tuple(fc.array(validAttr(s, o), { maxLength: 2 }), bad).map(([a, b]) => [...a, b]),
          );
        }
      }
      break;
    }
    case 'any':
      break;
    case 'function':
      consts('fn', 'function () {}');
      break;
    default: {
      const unreachable: never = valType;
      throw new Error(`invalidValueArbitrary: unknown valType ${String(unreachable)}`);
    }
  }
  return out;
}

/**
 * Values that coercion rejects for `spec` (`coerceValue(spec, v).ok === false`, never
 * `null`/`undefined`): wrong types, out-of-range numbers, bad enum values, malformed flag lists,
 * colors, colorscales and subplot ids, NaN/Infinity, and so on. Returns `undefined` for specs that
 * accept every value (`any`).
 *
 * The guarantee is enforced by filtering, so it holds for any spec the DSL can express.
 */
export function invalidValueArbitrary(
  spec: AttrSpec,
  opts: SchemaArbitraryOptions = {},
): fc.Arbitrary<unknown> | undefined {
  if (spec.valType === 'any') return undefined;
  const o = resolveOptions(opts);
  return fc
    .oneof(
      { arbitrary: junk, weight: 1 },
      ...nearMisses(spec, o).map((arbitrary) => ({ arbitrary, weight: 2 })),
    )
    .filter((v) => isInvalid(spec, v));
}

/**
 * Valid values for a single attribute: `coerceValue(spec, v).ok` holds for every value, and no
 * value is `null`/`undefined`.
 */
export function validValueArbitrary(
  spec: AttrSpec,
  opts: SchemaArbitraryOptions = {},
): fc.Arbitrary<unknown> {
  return validAttr(spec, resolveOptions(opts));
}

// ---------------------------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------------------------

/** Numbered siblings generated for subplot container families (`xaxis` → `xaxis2`, `xaxis11`). */
const SUBPLOT_SUFFIXES = ['2', '11'] as const;

const unknownKey: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    'colr',
    'foo',
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
    '_internal',
    'xaxis1',
    'xaxis0',
    'yaxis01',
  ),
  fc.string({ maxLength: 6 }),
);

/** Add own properties with `defineProperty`, so keys such as `__proto__` stay plain data. */
function withExtraKeys(
  obj: Record<string, unknown>,
  extra: readonly (readonly [string, unknown])[],
): Record<string, unknown> {
  const out = { ...obj };
  for (const [k, v] of extra) {
    if (Object.hasOwn(out, k)) continue;
    Object.defineProperty(out, k, {
      value: v,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out;
}

function attrArb(spec: AttrSpec, o: Resolved): fc.Arbitrary<unknown> {
  const valid = validAttr(spec, o);
  if (o.mode === 'valid') return valid;
  const takesArrays = spec.valType === 'data_array' || spec.arrayOk === true;
  const bad = invalidValueArbitrary(spec, o);
  const wildish =
    takesArrays && o.columnRefs
      ? // No '@@escaped' literals: see the KNOWN ISSUE on `plainString`.
        fc.oneof(wild, fc.constant('@missingColumn'))
      : wild;
  return bad
    ? fc.oneof({ arbitrary: valid, weight: 3 }, { arbitrary: bad, weight: 2 }, wildish)
    : fc.oneof({ arbitrary: valid, weight: 3 }, wildish);
}

function objectArb(
  node: ObjectNode,
  path: string,
  depth: number,
  o: Resolved,
): fc.Arbitrary<unknown> {
  if (depth > o.maxDepth) return fc.constant({});
  const model: Record<string, fc.Arbitrary<unknown>> = {};
  const add = (key: string, child: SchemaNode, p: string): void => {
    const ov = o.override?.(p, child);
    if (ov === null) return;
    model[key] = ov ?? nodeArb(child, p, depth + 1, o);
  };
  for (const [key, child] of Object.entries(node.children)) {
    if (child.kind === 'attr' && child.deprecated !== undefined && !o.includeDeprecated) continue;
    const p = path === '' ? key : `${path}.${key}`;
    add(key, child, p);
    if (child.kind === 'object' && child.subplot !== undefined) {
      for (const n of SUBPLOT_SUFFIXES) add(`${key}${n}`, child, `${p}${n}`);
    }
  }
  const record = fc.record(model, { requiredKeys: [] }) as fc.Arbitrary<Record<string, unknown>>;
  if (o.mode === 'valid') return record;
  const withUnknown = fc
    .tuple(record, fc.array(fc.tuple(unknownKey, wild), { maxLength: 2 }))
    .map(([obj, extra]) => withExtraKeys(obj, extra));
  return fc.oneof(
    { arbitrary: record, weight: 5 },
    { arbitrary: withUnknown, weight: 2 },
    { arbitrary: wild, weight: 1 },
  );
}

function itemsArb(
  node: ItemsNode,
  path: string,
  depth: number,
  o: Resolved,
): fc.Arbitrary<unknown> {
  if (depth > o.maxDepth) return fc.constant([]);
  const item = objectArb(node.item, `${path}[]`, depth + 1, o);
  const list = fc.array(item, { maxLength: o.maxArrayLength });
  return o.mode === 'valid' ? list : fc.oneof({ arbitrary: list, weight: 5 }, wild);
}

function nodeArb(
  node: SchemaNode,
  path: string,
  depth: number,
  o: Resolved,
): fc.Arbitrary<unknown> {
  const kind = node.kind;
  switch (kind) {
    case 'attr':
      return attrArb(node, o);
    case 'object':
      return objectArb(node, path, depth, o);
    case 'items':
      return itemsArb(node, path, depth, o);
    default: {
      const unreachable: never = kind;
      throw new Error(`schemaArbitrary: unknown node kind ${String(unreachable)}`);
    }
  }
}

/**
 * An arbitrary for any schema node declared with the `attr.*` DSL.
 *
 * @example
 * ```ts
 * fc.assert(fc.property(schemaArbitrary(configSchema), (config) => {
 *   expect(validate(undefined, undefined, registry, { config })).toEqual([]);
 * }));
 * ```
 */
export function schemaArbitrary(
  node: SchemaNode,
  opts: SchemaArbitraryOptions = {},
): fc.Arbitrary<unknown> {
  return nodeArb(node, '', 0, resolveOptions(opts));
}

// ---------------------------------------------------------------------------------------------
// Registry-level helpers
// ---------------------------------------------------------------------------------------------

function chain(first: SchemaOverride | undefined, second: SchemaOverride): SchemaOverride {
  return (path, node) => {
    const a = first?.(path, node);
    return a !== undefined ? a : second(path, node);
  };
}

/**
 * Trace objects of one registered type. The `type` key is always present. In valid mode
 * `dataset` is never generated: a dataset name is only valid together with a matching
 * `figure.datasets` entry, which this generator does not produce.
 */
export function traceArbitrary(
  registry: Registry,
  type: string,
  opts: SchemaArbitraryOptions = {},
): fc.Arbitrary<Record<string, unknown>> {
  const schema = registry.getTraceSchema(type);
  if (!schema) throw new Error(`traceArbitrary: unknown trace type '${type}'`);
  const mode = opts.mode ?? 'valid';
  const override = chain(opts.override, (path) => {
    if (path === 'type') return null;
    if (path === 'dataset' && mode === 'valid') return null;
    return undefined;
  });
  const body = schemaArbitrary(schema, { ...opts, override });
  if (mode === 'valid') {
    return body.map((t) => ({ type, ...(t as Record<string, unknown>) }));
  }
  // Invalid mode: a wild body stands in for a trace that is not an object at all.
  return body.map((t) =>
    typeof t === 'object' && t !== null && !Array.isArray(t)
      ? { type, ...(t as Record<string, unknown>) }
      : { type, junk: t },
  );
}

/**
 * The `data` array: 0–`maxArrayLength` traces of registered types. In invalid mode it also
 * produces non-object traces, unknown/blank/non-string `type`s and non-array `data`.
 */
export function dataArbitrary(
  registry: Registry,
  opts: SchemaArbitraryOptions = {},
): fc.Arbitrary<unknown> {
  const types = registry.traceTypes();
  const maxLength = opts.maxArrayLength ?? 3;
  const traces = types.map((t) => traceArbitrary(registry, t, opts));
  if (opts.mode !== 'invalid') {
    return traces.length === 0 ? fc.constant([]) : fc.array(fc.oneof(...traces), { maxLength });
  }
  const scatterLike = traces[0] ?? fc.constant({});
  const badType = fc
    .tuple(scatterLike, fc.oneof(fc.constantFrom('scater', 'nope', '', ' '), wild))
    .map(([t, type]) => ({ ...t, type }));
  const trace = fc.oneof(
    { arbitrary: fc.oneof(...traces), weight: 6 },
    { arbitrary: badType, weight: 1 },
    { arbitrary: wild, weight: 1 },
  );
  return fc.oneof({ arbitrary: fc.array(trace, { maxLength }), weight: 8 }, wild);
}

/**
 * Template objects `{ layout?, data? }` built from the registry's layout and trace schemas (a
 * template's layout never nests another `template`). Template traces never hold `'@column'`
 * strings: templates are not dataset-resolved, so such a string is copied verbatim into the full
 * output and read as a column reference when that output is fed back in (KNOWN ISSUE, see
 * `plainString`).
 */
export function templateArbitrary(
  registry: Registry,
  opts: SchemaArbitraryOptions = {},
): fc.Arbitrary<Record<string, unknown>> {
  const inner: SchemaArbitraryOptions = {
    ...opts,
    columnRefs: false,
    maxDepth: Math.max(1, (opts.maxDepth ?? 4) - 1),
    maxArrayLength: Math.min(2, opts.maxArrayLength ?? 3),
  };
  const layout = schemaArbitrary(registry.getLayoutSchema(), {
    ...inner,
    override: chain(inner.override, (path) => (path === 'template' ? null : undefined)),
  });
  const data: Record<string, fc.Arbitrary<unknown>> = {};
  for (const type of registry.traceTypes()) {
    const traceDefaults = traceArbitrary(registry, type, inner).map((t) => {
      const { type: _type, ...rest } = t;
      return rest;
    });
    data[type] = fc.array(traceDefaults, { maxLength: 2 });
  }
  return fc.record(
    { layout, data: fc.record(data, { requiredKeys: [] }) },
    { requiredKeys: [] },
  ) as fc.Arbitrary<Record<string, unknown>>;
}

/**
 * Layout objects for the registry's merged layout schema (base layout plus trace-module and
 * component attributes). `template` is `null`, `false`, a registered name or a generated template
 * object in valid mode; anything at all in invalid mode.
 */
export function layoutArbitrary(
  registry: Registry,
  opts: SchemaArbitraryOptions = {},
): fc.Arbitrary<unknown> {
  const mode = opts.mode ?? 'valid';
  const names = registry.templateNames();
  const tmpl = templateArbitrary(registry, opts);
  const template = fc.oneof(
    fc.constantFrom<unknown>(null, false),
    ...(names.length > 0 ? [fc.constantFrom(...names)] : []),
    tmpl,
    ...(mode === 'invalid' ? [wild, fc.constantFrom('nope', 'a+b')] : []),
  );
  return schemaArbitrary(registry.getLayoutSchema(), {
    ...opts,
    override: chain(opts.override, (path) => (path === 'template' ? template : undefined)),
  });
}

/** Options for {@link configArbitrary} and {@link figureArbitrary}. */
export interface FigureArbitraryOptions extends SchemaArbitraryOptions {
  /** Allow `config.strict: true` (which makes supply-defaults throw on invalid input). Default false. */
  readonly allowStrict?: boolean;
}

/** Config objects. `strict` is never `true` unless `allowStrict` is set. */
export function configArbitrary(opts: FigureArbitraryOptions = {}): fc.Arbitrary<unknown> {
  const allowStrict = opts.allowStrict === true;
  return schemaArbitrary(configSchema, {
    ...opts,
    override: chain(opts.override, (path) =>
      path === 'strict' && !allowStrict ? fc.constant(false) : undefined,
    ),
  });
}

/** A generated figure. Fields are `unknown` because invalid mode may produce any shape. */
export interface GeneratedFigure {
  data: unknown;
  layout: unknown;
  config: unknown;
}

/** Whole figures `{ data, layout, config }` for a registry. */
export function figureArbitrary(
  registry: Registry,
  opts: FigureArbitraryOptions = {},
): fc.Arbitrary<GeneratedFigure> {
  return fc.record({
    data: dataArbitrary(registry, opts),
    layout: layoutArbitrary(registry, opts),
    config: configArbitrary(opts),
  });
}

// ---------------------------------------------------------------------------------------------
// Random schemas (for testing schema-generic code, including this module)
// ---------------------------------------------------------------------------------------------

const metaArb = fc.record(
  {
    editType: fc.constantFrom('calc', 'style', 'plot', 'none'),
    description: fc.string({ maxLength: 12 }),
    role: fc.constantFrom('data', 'style', 'info', 'layout'),
  },
  { requiredKeys: [] },
);

const boundsArb = (integer: boolean): fc.Arbitrary<{ min?: number; max?: number }> => {
  // `+ 0` turns -0 into 0: JSON cannot represent -0, and it is not an interesting bound.
  const n = (
    integer ? fc.integer({ min: -50, max: 50 }) : fc.double({ min: -50, max: 50, noNaN: true })
  ).map((v) => v + 0);
  return fc
    .tuple(fc.option(n, { nil: undefined }), fc.option(n, { nil: undefined }))
    .map(([a, b]) => {
      const out: { min?: number; max?: number } = {};
      if (a !== undefined && b !== undefined) {
        out.min = Math.min(a, b);
        out.max = Math.max(a, b);
      } else if (a !== undefined) out.min = a;
      else if (b !== undefined) out.max = b;
      return out;
    });
};

function scalarSpecArb(): fc.Arbitrary<AttrSpec> {
  const arrayOk = fc.boolean();
  const numeric = (integer: boolean) =>
    fc
      .tuple(metaArb, boundsArb(integer), arrayOk, fc.boolean(), fc.boolean())
      .map(([meta, bounds, a, clamp, extras]) => ({
        ...meta,
        ...bounds,
        arrayOk: a,
        clamp,
        ...(extras ? { extras: ['auto'] as Primitive[] } : {}),
      }));
  const byType: { [K in ValType]: fc.Arbitrary<AttrSpec> } = {
    number: numeric(false).map((o) => attr.number(o)),
    integer: numeric(true).map((o) => attr.integer(o)),
    angle: numeric(false).map(({ min: _min, max: _max, clamp: _c, ...o }) => attr.angle(o)),
    string: fc
      .tuple(metaArb, arrayOk, fc.boolean(), fc.boolean())
      .map(([meta, a, noBlank, strict]) => attr.string({ ...meta, arrayOk: a, noBlank, strict })),
    boolean: fc.tuple(metaArb, arrayOk).map(([meta, a]) => attr.boolean({ ...meta, arrayOk: a })),
    enumerated: fc
      .tuple(
        metaArb,
        fc.subarray<Primitive>(['a', 'b', 1, 2, true, false], { minLength: 1 }),
        arrayOk,
      )
      .map(([meta, values, a]) => attr.enumerated({ ...meta, values, arrayOk: a })),
    flaglist: fc
      .tuple(
        metaArb,
        fc.subarray(['p', 'q', 'r'], { minLength: 1 }),
        fc.subarray<Primitive>(['none', true, false]),
        arrayOk,
      )
      .map(([meta, flags, extras, a]) => attr.flaglist({ ...meta, flags, extras, arrayOk: a })),
    color: fc.tuple(metaArb, arrayOk).map(([meta, a]) => attr.color({ ...meta, arrayOk: a })),
    colorlist: metaArb.map((meta) => attr.colorlist(meta)),
    colorscale: metaArb.map((meta) => attr.colorscale(meta)),
    subplotid: fc
      .tuple(
        metaArb,
        fc.constantFrom('x', 'scene', 'polar'),
        fc.subarray<Primitive>(['free', 'paper']),
      )
      .map(([meta, dflt, extras]) => attr.subplotId({ ...meta, dflt, extras })),
    data_array: metaArb.map((meta) => attr.dataArray(meta)),
    info_array: fc
      .tuple(metaArb, fc.boolean(), fc.boolean())
      .map(([meta, perPosition, freeLength]) =>
        attr.infoArray({
          ...meta,
          items: perPosition
            ? [attr.number({ min: 0, max: 1, dflt: 0 }), attr.string({ strict: true, dflt: 'a' })]
            : attr.integer({ min: 0 }),
          freeLength,
        }),
      ),
    any: fc.tuple(metaArb, arrayOk).map(([meta, a]) => attr.any({ ...meta, arrayOk: a })),
    function: metaArb.map((meta) => attr.fn(meta)),
  };
  return fc.oneof(...Object.values(byType));
}

/**
 * Random attribute specs covering every {@link ValType} with random constraints (bounds, extras,
 * `arrayOk`, `noBlank`, `strict`, per-position or free-length info arrays, …).
 */
export const attrSpecArbitrary: fc.Arbitrary<AttrSpec> = scalarSpecArb();

/**
 * Random schema trees (objects, subplot families, item arrays and every leaf kind), built with
 * the `attr.*` builders so they are exactly what the DSL can declare.
 */
export const schemaNodeArbitrary: fc.Arbitrary<ObjectNode> = fc.letrec<{
  object: ObjectNode;
  node: SchemaNode;
}>((tie) => ({
  object: fc
    .tuple(
      fc.dictionary(fc.constantFrom('a', 'b', 'c', 'marker', 'line'), tie('node'), { maxKeys: 3 }),
      metaArb,
    )
    .map(([children, meta]) => attr.object(children, meta)),
  node: fc.oneof(
    { depthSize: 'small', maxDepth: 3, withCrossShrink: true },
    { arbitrary: attrSpecArbitrary, weight: 4 },
    tie('object'),
    fc
      .tuple(tie('object'), fc.constantFrom('x', 'scene'))
      .map(([obj, base]) => attr.subplotObject(base, obj.children)),
    tie('object').map((obj) => attr.items(obj.children, { itemName: 'thing' })),
  ),
})).object;
