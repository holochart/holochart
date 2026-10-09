/**
 * TypeScript type generation from the attribute schema (plan E1.2).
 *
 * Turns a schema tree into named, documented input types (`Layout`, `LayoutMargin`,
 * `ScatterTrace`, `ScatterTraceMarker`, …). The inferred types from `InferInput` are exact but
 * anonymous, so editor hovers show a wall of structure; named types with JSDoc read much better in
 * autocompletion and API docs, which is why generated types are checked in alongside the schema.
 *
 * Root types (a layout, a trace, an attribute group) are type aliases of object types, not
 * interfaces, so they stay assignable to loose `{ [key: string]: unknown }` inputs (TypeScript
 * gives aliases an implicit index signature, interfaces none). Nested containers are interfaces.
 *
 * Several files can share types: a {@link TypeFile} reuses the types of schema nodes that other
 * files emitted (`known`, matched by node identity, and imported), and builds a root type on
 * attribute groups (`bases`: `CommonTraceAttributes & { … }`), so shared attributes are declared
 * once.
 *
 * Pure string building: no Node APIs. Part of the tooling, not of `@mk7s/holochart-core`, so its
 * code stays out of the bundles.
 */
import type {
  AttrSpec,
  Children,
  ItemsNode,
  ObjectNode,
  PrimitiveValue,
  SchemaNode,
} from '@mk7s/holochart-core';

/** A type declared in a generated file, found by the schema node it describes. */
export interface KnownType {
  /** Exported type name. */
  readonly name: string;
  /** Module specifier to import it from; `undefined` for the file being generated. */
  readonly from?: string;
  /**
   * Whether it was generated for a trace (per-point attributes accept style functions and dataset
   * columns). A node with neither `arrayOk` nor data-array attributes is the same in both.
   */
  readonly perPoint?: boolean;
}

/**
 * A type a root type builds on: an attribute group (`CommonTraceAttributes`) or a trace type to
 * extend. The root type intersects it (with `Omit` for attributes it declares differently) instead
 * of repeating the attributes it shares by identity.
 */
export interface TypeBase {
  readonly type: KnownType;
  /** The attributes the base type declares. */
  readonly children: Children;
  /** True when the base type already declares the trace `type` discriminant. */
  readonly discriminated?: boolean;
}

/** Options for {@link generateTypes}, {@link generateTraceTypes} and {@link createTypeFile}. */
export interface GenerateTypesOptions {
  /**
   * Module specifier the helper types (`TypedArray`, `DataArray`, `PerPoint`, …) are imported
   * from. Defaults to `'../schema/types.ts'`, the right path for files written to
   * `packages/core/src/generated/`.
   */
  readonly importFrom?: string;
  /** Header comment text (one `//` line per line). Defaults to a "generated, do not edit" note. */
  readonly header?: string;
  /** Types other files declare, by schema node: reused (imported) instead of declared again. */
  readonly known?: ReadonlyMap<SchemaNode, KnownType>;
  /**
   * Flaglists with up to this many flags list every combination (`'lines+markers'`, …) so editors
   * suggest them; longer ones accept `` `${flag}+${string}` `` to keep the union small. Default 3;
   * 0 types every flaglist the way the schema DSL infers it (`InferInput`).
   */
  readonly listedFlags?: number;
}

/** A trace type and its full (registry-merged) schema, as passed to {@link generateTraceTypes}. */
export interface TraceTypeSource {
  /** Trace type, e.g. `'scatter'`. */
  readonly type: string;
  /** Full trace schema, e.g. from `registry.getTraceSchema(type)`. */
  readonly schema: ObjectNode;
  /** Type name. Default `<PascalType>Trace`, e.g. `ScatterTrace`. */
  readonly name?: string;
  /** Prefix of nested container names. Default: the type name. */
  readonly prefix?: string;
  /** Types the trace type builds on (see {@link TypeBase}). */
  readonly bases?: readonly TypeBase[];
}

/** Options of {@link TypeFile.object}. */
export interface ObjectTypeOptions {
  /** Doc comment lines. Default: from the node's description. */
  readonly doc?: readonly string[];
  /** Per-point attributes accept style functions and dataset columns (trace attributes). */
  readonly perPoint?: boolean;
  /**
   * Declare a type alias (`export type Name = …`) rather than an interface: assignable to
   * index-signature types. Implied by `bases`.
   */
  readonly alias?: boolean;
  /** Types to build on. */
  readonly bases?: readonly TypeBase[];
  /** Keys left out. */
  readonly exclude?: readonly string[];
  /** Prefix of nested container names. Default: the type name. */
  readonly prefix?: string;
}

/** A generated file of types; see {@link createTypeFile}. */
export interface TypeFile {
  /** Declare `name` for `node` and named types for its nested containers. */
  object(node: ObjectNode, name: string, options?: ObjectTypeOptions): void;
  /**
   * Declare one trace type with a literal `type` discriminant (optional for `'scatter'`, the
   * default type). Returns its name.
   */
  trace(source: TraceTypeSource): string;
  /** Declare `export type <name> = A | B | …` (`never` when empty). */
  union(name: string, members: readonly (string | KnownType)[], doc?: readonly string[]): void;
  /**
   * Declare `export interface <name> { key: Type; … }` mapping keys to types, such as trace types
   * to trace types: an interface, so other code can add keys (declaration merging).
   */
  record(
    name: string,
    entries: readonly (readonly [string, string | KnownType])[],
    doc?: readonly string[],
  ): void;
  /** Declare `export type <name> = <type>`. */
  alias(name: string, type: string, doc?: readonly string[]): void;
  /** The types this file declares for schema nodes (pass on as other files' `known`). */
  readonly emitted: ReadonlyMap<SchemaNode, KnownType>;
  /** Names declared so far. */
  readonly names: ReadonlySet<string>;
  /** The file's source (not Prettier-formatted). */
  render(): string;
}

/** The default header written at the top of every generated file. */
export const DEFAULT_GENERATED_HEADER =
  'Generated by tools/schema-gen from the attribute schema (plan E1.2). Do not edit by hand.\n' +
  'Regenerate with `pnpm --filter @mk7s/holochart-schema-gen gen`.';

const DEFAULT_IMPORT_FROM = '../schema/types.ts';

/** Helper types from `schema/types.ts` that generated code may reference. */
type HelperType =
  | 'AnyFunction'
  | 'ColorScale'
  | 'DataArray'
  | 'DataColumn'
  | 'PerPoint'
  | 'PerPointColor'
  | 'PerPointNumber'
  | 'TypedArray';

/** The trace type used when `type` is omitted; its `type` discriminant is optional. */
const DEFAULT_TRACE_TYPE = 'scatter';

/** Default of {@link GenerateTypesOptions.listedFlags}. */
const MAX_LISTED_FLAGS = 3;

/** Replaces a property's generated type (used for the trace `type` discriminant). */
interface PropOverride {
  readonly type: string;
  readonly optional: boolean;
  readonly doc?: readonly string[];
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Default name of a trace type: `scatter` → `ScatterTrace`. */
export function traceTypeName(type: string): string {
  return `${pascal(type)}Trace`;
}

function pascal(key: string): string {
  return key
    .split(/[^A-Za-z0-9]+/)
    .filter((s) => s !== '')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

function quote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

/** Escapes text for use inside a template literal type. */
function templateText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function propName(key: string): string {
  return IDENTIFIER.test(key) ? key : quote(key);
}

function literal(v: PrimitiveValue): string {
  if (typeof v === 'string') return quote(v);
  // `Infinity`/`NaN` have no literal type; `number` is the closest sound widening.
  if (typeof v === 'number' && !Number.isFinite(v)) return 'number';
  return String(v);
}

function union(members: readonly string[]): string {
  return [...new Set(members)].join(' | ');
}

/** `readonly T[]`, parenthesizing `T` when it is not a single simple member. */
function readonlyArray(members: readonly string[]): string {
  const unique = [...new Set(members)];
  const only = unique.length === 1 ? unique[0] : undefined;
  const simple = only !== undefined && /^[\w$'"]+$/.test(only);
  return simple ? `readonly ${only}[]` : `readonly (${unique.join(' | ')})[]`;
}

/** Every ordered combination of distinct flags joined with `+` (`a`, `b`, `a+b`, `b+a`, …). */
function flagCombinations(flags: readonly string[]): string[] {
  const out: string[] = [];
  const visit = (prefix: readonly string[], rest: readonly string[]): void => {
    for (let i = 0; i < rest.length; i++) {
      const next = [...prefix, rest[i]!];
      out.push(next.join('+'));
      visit(next, [...rest.slice(0, i), ...rest.slice(i + 1)]);
    }
  };
  visit([], flags);
  return out.sort((a, b) => a.split('+').length - b.split('+').length);
}

function isSpecList(items: AttrSpec | readonly AttrSpec[]): items is readonly AttrSpec[] {
  return Array.isArray(items);
}

function escapeComment(s: string): string {
  return s.replace(/\*\//g, '*\\/');
}

function jsonText(v: unknown): string | undefined {
  try {
    return JSON.stringify(v);
  } catch {
    // Cyclic or otherwise unserializable defaults are simply left out of the docs.
    return undefined;
  }
}

/** JSDoc body lines for a node: description, range, default, deprecation, since. */
function docLines(node: SchemaNode): string[] {
  const paragraphs: string[][] = [];
  if (node.description !== undefined && node.description.trim() !== '') {
    paragraphs.push(
      node.description
        .trim()
        .split('\n')
        .map((l) => l.trimEnd()),
    );
  }
  if (node.kind === 'attr') {
    const { min, max } = node;
    if (min !== undefined && max !== undefined) paragraphs.push([`Range: ${min} – ${max}`]);
    else if (min !== undefined) paragraphs.push([`Minimum: ${min}`]);
    else if (max !== undefined) paragraphs.push([`Maximum: ${max}`]);
    if (node.dflt !== undefined) {
      const json = jsonText(node.dflt);
      if (json !== undefined) paragraphs.push([`@defaultValue \`${json}\``]);
    }
  }
  if (node.deprecated !== undefined) paragraphs.push([`@deprecated ${node.deprecated}`]);
  if (node.since !== undefined) paragraphs.push([`@since ${node.since}`]);
  return paragraphs.flatMap((p, i) => (i === 0 ? p : ['', ...p]));
}

function docComment(lines: readonly string[], indent: string): string {
  if (lines.length === 0) return '';
  const body = lines.map((l) => (l === '' ? `${indent} *` : `${indent} * ${escapeComment(l)}`));
  return `${indent}/**\n${body.join('\n')}\n${indent} */\n`;
}

function itemDoc(key: string, node: ItemsNode): string[] {
  const lines = [`One item of \`${key}\`.`];
  const templated = `Template defaults for every item go in \`${node.itemName}defaults\`.`;
  return [...lines, '', templated];
}

/**
 * Numbered containers of a subplot family typed one by one (`xaxis2` … `xaxis9`, like Plotly's
 * own types); further ones (`xaxis10`, …) are accepted untyped.
 */
const TYPED_SUBPLOTS = 9;

/**
 * Properties for the numbered containers of a subplot family (`xaxis2`, …, then an index
 * signature). The index signature is `unknown` rather than the container type: a loose layout
 * (`Record<string, unknown>`, as Express builds and `chart.layout` returns) has a `string` index
 * signature that TypeScript checks against every template-literal one, so a typed one would make
 * loose layouts unassignable to typed ones.
 */
function subplotProperties(key: string, subplot: string, typeName: string): string[] {
  const props: string[] = [];
  for (let n = 2; n <= TYPED_SUBPLOTS; n++) {
    const doc = docComment(
      [`Subplot \`${subplot}${n}\`: the same attributes as \`${key}\`.`],
      '  ',
    );
    props.push(`${doc}  ${propName(key + n)}?: ${typeName};`);
  }
  const doc = docComment(
    [
      `Further \`${key}\` containers (\`${key}${TYPED_SUBPLOTS + 1}\`, …): the same attributes as \`${key}\`, not type-checked.`,
    ],
    '  ',
  );
  props.push(`${doc}  [key: \`${templateText(key)}\${number}\`]: unknown;`);
  return props;
}

/** Type-name prefix for imports from `from` that clash with a local name (`CoreLayout`). */
function modulePrefix(from: string): string {
  const scoped = /^@[^/]+\/(.+)$/.exec(from);
  const base = scoped ? scoped[1]! : (from.split('/').pop() ?? from).replace(/\.[cm]?[jt]s$/, '');
  return pascal(base.replace(/^holochart-?/, '')) || 'Holochart';
}

/** True when a node has no attribute whose type depends on the per-point context. */
function contextFree(node: SchemaNode, memo: Map<SchemaNode, boolean>): boolean {
  const cached = memo.get(node);
  if (cached !== undefined) return cached;
  let free: boolean;
  if (node.kind === 'attr') free = node.arrayOk !== true && node.valType !== 'data_array';
  else {
    memo.set(node, true); // cycles (none expected) count as free
    const children = node.kind === 'items' ? node.item.children : node.children;
    free = Object.values(children).every((c) => contextFree(c, memo));
  }
  memo.set(node, free);
  return free;
}

/**
 * Create a file of generated types. Declare types with `object`, `trace` and `union`, then
 * `render()` the source. Nested containers are named `<Parent><PascalKey>` (`Layout` →
 * `LayoutMargin`), item arrays `readonly <Parent><Item>[]`, and subplot families (`xaxis`) also
 * accept numbered keys (`xaxis2`) via a template-literal index signature. Every property is
 * optional (these describe user input) and carries JSDoc built from the schema's description,
 * range, default, deprecation and `since` metadata. A container met again (by identity) reuses its
 * type; one in `options.known` is imported.
 *
 * @throws From the declaring methods, if two containers map to the same type name.
 */
export function createTypeFile(options: GenerateTypesOptions = {}): TypeFile {
  const helpers = new Set<HelperType>();
  /** Declarations in emission order (parents before children). */
  const decls: string[] = [];
  const names = new Set<string>();
  const emitted = new Map<SchemaNode, KnownType>();
  const known = options.known ?? new Map<SchemaNode, KnownType>();
  const freeMemo = new Map<SchemaNode, boolean>();
  /** Imported types: placeholder index → type. */
  const imports: KnownType[] = [];
  const importIds = new Map<string, number>();

  const reserve = (name: string): void => {
    // Two paths mapping to one name (e.g. `x_axis` and `xAxis` under one parent) would silently
    // merge types; failing loudly lets the schema author rename one of them.
    if (names.has(name)) throw new Error(`generateTypes: duplicate interface name '${name}'`);
    names.add(name);
  };

  /** A reference to a type: its name, or a placeholder resolved to the import's local name. */
  const ref = (type: KnownType): string => {
    if (type.from === undefined) return type.name;
    const key = `${type.from}\0${type.name}`;
    let id = importIds.get(key);
    if (id === undefined) {
      id = imports.push(type) - 1;
      importIds.set(key, id);
    }
    return `\u0000${id}\u0000`;
  };

  const usable = (node: SchemaNode, type: KnownType, perPoint: boolean): boolean =>
    contextFree(node, freeMemo) || (type.perPoint ?? false) === perPoint;

  /** Union members for a leaf attribute's input type. */
  const leafMembers = (spec: AttrSpec, perPoint: boolean): string[] => {
    const extras = (spec.extras ?? []).map(literal);
    const arrayOk = spec.arrayOk === true;
    /** Members of an `arrayOk` attribute with scalar members `scalar`. */
    const perPointOf = (scalar: readonly string[]): string[] => {
      if (!arrayOk) return [...scalar];
      if (perPoint) {
        helpers.add('PerPoint');
        return [`PerPoint<${union(scalar)}>`];
      }
      return [...scalar, readonlyArray(scalar)];
    };
    switch (spec.valType) {
      case 'number':
      case 'integer':
      case 'angle': {
        if (!arrayOk) return ['number', ...extras];
        if (perPoint && extras.length === 0) {
          helpers.add('PerPointNumber');
          return ['PerPointNumber'];
        }
        // Extras are per-point values too (`font.weight: ['bold', 400]`).
        helpers.add('TypedArray');
        return [...perPointOf(['number', ...extras]), 'TypedArray'];
      }
      case 'string':
        // Text arrays often hold numbers (`text: y`), which are shown as they are.
        return arrayOk && perPoint ? perPointOf(['string', 'number']) : perPointOf(['string']);
      case 'color':
        if (arrayOk && perPoint) {
          helpers.add('PerPointColor');
          return ['PerPointColor'];
        }
        return perPointOf(['string']);
      case 'boolean':
        return perPointOf(['boolean']);
      case 'enumerated': {
        const values = (spec.values ?? []).map(literal);
        // Values registered at runtime (custom marker symbols): any string, the listed ones
        // still suggested.
        if (spec.accepts !== undefined) values.push('(string & {})');
        if (values.length === 0) return ['never'];
        return perPointOf(values);
      }
      case 'flaglist': {
        const flags = spec.flags ?? [];
        const combos =
          flags.length === 0
            ? []
            : flags.length <= (options.listedFlags ?? MAX_LISTED_FLAGS)
              ? flagCombinations(flags).map(quote)
              : [...flags.map(quote), `\`\${${union(flags.map(quote))}}+\${string}\``];
        const members = [...combos, ...extras];
        if (members.length === 0) return ['string'];
        return perPointOf(members);
      }
      case 'colorlist':
        return ['readonly string[]', 'string'];
      case 'colorscale':
        helpers.add('ColorScale');
        // A list of colors is spread evenly from 0 to 1. Stops built in a variable widen from
        // `[number, string]` tuples to arrays.
        return ['ColorScale', 'readonly string[]', 'readonly (readonly (number | string)[])[]'];
      case 'subplotid': {
        if (typeof spec.dflt !== 'string') return ['string', ...extras];
        return [quote(spec.dflt), `\`${templateText(spec.dflt)}\${number}\``, ...extras];
      }
      case 'data_array':
        if (perPoint) {
          helpers.add('DataColumn');
          return ['DataColumn'];
        }
        helpers.add('DataArray');
        return ['DataArray'];
      case 'info_array': {
        const items = spec.items;
        if (items === undefined) return ['readonly unknown[]'];
        if (!isSpecList(items)) return [readonlyArray(leafMembers(items, false))];
        // Per-position specs give an array of their union rather than a tuple: a tuple would
        // reject the arrays of a figure built in a variable (`range: [0, 1]` widens to `number[]`),
        // and a free-length array can be shorter or longer than the specs anyway.
        const types = items.flatMap((item) => leafMembers(item, false));
        return [readonlyArray(types.length ? types : ['unknown'])];
      }
      case 'any':
        return ['unknown'];
      case 'function':
        helpers.add('AnyFunction');
        return ['AnyFunction'];
    }
  };

  /** The type of a nested container: reused when known, else declared now. */
  const container = (
    node: ObjectNode,
    name: string,
    doc: readonly string[],
    perPoint: boolean,
  ): string => {
    const local = emitted.get(node);
    if (local !== undefined && usable(node, local, perPoint)) return local.name;
    const other = known.get(node);
    if (other !== undefined && usable(node, other, perPoint)) return ref(other);
    declare(node.children, name, { doc, perPoint, alias: false }, node);
    return name;
  };

  /** Property lines for `children`. */
  const properties = (
    children: Iterable<readonly [string, SchemaNode]>,
    prefix: string,
    perPoint: boolean,
  ): string[] => {
    const props: string[] = [];
    for (const [key, child] of children) {
      const prop = propName(key);
      const jsdoc = docComment(docLines(child), '  ');
      if (child.kind === 'attr') {
        props.push(`${jsdoc}  ${prop}?: ${union(leafMembers(child, perPoint))};`);
      } else if (child.kind === 'object') {
        const type = container(child, prefix + pascal(key), docLines(child), perPoint);
        props.push(`${jsdoc}  ${prop}?: ${type};`);
        if (child.subplot !== undefined) props.push(...subplotProperties(key, child.subplot, type));
      } else {
        const type = container(
          child.item,
          prefix + pascal(child.itemName),
          itemDoc(key, child),
          perPoint,
        );
        props.push(`${jsdoc}  ${prop}?: readonly ${type}[];`);
      }
    }
    return props;
  };

  /**
   * Declare `name` with the attributes in `children` (and `overrides` first). With `bases`, the
   * type intersects every base that shares at least half of its attributes by identity, leaving
   * out (`Omit`) those it declares differently, and declares only the rest itself.
   */
  function declare(
    children: Children,
    name: string,
    opts: ObjectTypeOptions,
    node?: ObjectNode,
    overrides: Readonly<Record<string, PropOverride>> = {},
  ): void {
    reserve(name);
    if (node !== undefined) emitted.set(node, { name, perPoint: opts.perPoint ?? false });
    // Reserve the slot first so parents precede their nested types in the output.
    const slot = decls.push('') - 1;
    const perPoint = opts.perPoint ?? false;
    const exclude = new Set(opts.exclude ?? []);
    const remaining = new Map<string, SchemaNode>(
      Object.entries(children).filter(([k]) => !exclude.has(k) && !Object.hasOwn(overrides, k)),
    );
    const parts: string[] = [];
    let discriminated = false;
    const covered = new Map<string, SchemaNode>();
    for (const base of opts.bases ?? []) {
      const keys = Object.keys(base.children).filter((k) => k !== 'type');
      const shared = keys.filter((k) => remaining.get(k) === base.children[k]);
      if (shared.length === 0 || shared.length * 2 < keys.length) continue;
      const omit = keys.filter((k) => !shared.includes(k) && covered.get(k) !== base.children[k]);
      if (base.discriminated === true) discriminated = true;
      const type = ref(base.type);
      parts.push(omit.length > 0 ? `Omit<${type}, ${omit.map(quote).join(' | ')}>` : type);
      for (const k of shared) {
        covered.set(k, base.children[k]!);
        remaining.delete(k);
      }
    }
    const props: string[] = [];
    for (const [key, override] of Object.entries(overrides)) {
      if (key === 'type' && discriminated) continue;
      const jsdoc = docComment(override.doc ?? [], '  ');
      props.push(`${jsdoc}  ${propName(key)}${override.optional ? '?' : ''}: ${override.type};`);
    }
    props.push(...properties(remaining, opts.prefix ?? name, perPoint));
    const head = docComment(opts.doc ?? (node ? docLines(node) : []), '');
    const body = `{\n${props.join('\n')}\n}`;
    if (opts.alias === true || parts.length > 0) {
      const all = props.length > 0 || parts.length === 0 ? [...parts, body] : parts;
      // An empty object type is flagged by lint as `{}` (anything); an empty record is exact.
      const type = props.length === 0 && parts.length === 0 ? 'Record<string, never>' : undefined;
      decls[slot] = `${head}export type ${name} = ${type ?? all.join(' & ')};`;
    } else {
      decls[slot] =
        props.length === 0
          ? `${head}export type ${name} = Record<string, never>;`
          : `${head}export interface ${name} ${body}`;
    }
  }

  const file: TypeFile = {
    object(node, name, opts = {}) {
      declare(node.children, name, opts, node);
    },

    trace({ type, schema, name = traceTypeName(type), prefix, bases }) {
      const optional = type === DEFAULT_TRACE_TYPE;
      const discriminant: PropOverride = {
        type: quote(type),
        optional,
        doc: [
          `Trace type${optional ? ' (the default: a trace without `type` is a scatter trace)' : ''}.`,
        ],
      };
      const opts: ObjectTypeOptions = {
        alias: true,
        perPoint: true,
        ...(bases && { bases }),
        ...(prefix !== undefined && { prefix }),
      };
      declare(schema.children, name, opts, schema, { type: discriminant });
      return name;
    },

    union(name, members, doc = []) {
      reserve(name);
      const refs = members.map((m) => (typeof m === 'string' ? m : ref(m)));
      decls.push(
        `${docComment(doc, '')}export type ${name} = ${refs.length > 0 ? refs.join(' | ') : 'never'};`,
      );
    },

    record(name, entries, doc = []) {
      reserve(name);
      const props = entries.map(
        ([key, type]) => `  ${propName(key)}: ${typeof type === 'string' ? type : ref(type)};`,
      );
      decls.push(`${docComment(doc, '')}export interface ${name} {\n${props.join('\n')}\n}`);
    },

    alias(name, type, doc = []) {
      reserve(name);
      decls.push(`${docComment(doc, '')}export type ${name} = ${type};`);
    },

    emitted,
    names,

    render() {
      const header = (options.header ?? DEFAULT_GENERATED_HEADER)
        .split('\n')
        .map((l) => (l === '' ? '//' : `// ${l}`))
        .join('\n');
      const parts = [header];
      // Local names for imports: their own, unless a local type or another import has it.
      const taken = new Set(names);
      const locals = imports.map((type) => {
        const local = taken.has(type.name) ? modulePrefix(type.from!) + type.name : type.name;
        taken.add(local);
        return local;
      });
      const byModule = new Map<string, string[]>();
      if (helpers.size > 0) {
        byModule.set(options.importFrom ?? DEFAULT_IMPORT_FROM, [...helpers].sort());
      }
      imports.forEach((type, i) => {
        const list = byModule.get(type.from!) ?? [];
        list.push(locals[i] === type.name ? type.name : `${type.name} as ${locals[i]}`);
        byModule.set(type.from!, list);
      });
      for (const [from, list] of [...byModule].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        const sorted = [...new Set(list)].sort();
        parts.push(`import type { ${sorted.join(', ')} } from ${quote(from)};`);
      }
      parts.push(...decls);
      const source = `${parts.join('\n\n')}\n`;
      // eslint-disable-next-line no-control-regex
      return source.replace(/\u0000(\d+)\u0000/g, (_, id: string) => locals[Number(id)]!);
    },
  };
  return file;
}

/**
 * Generate TypeScript input types for a schema: `export type <name> = { … }` with one interface
 * per nested container (see {@link createTypeFile}).
 *
 * @param root - The schema to describe, e.g. `layoutSchema`.
 * @param name - Name of the root type, e.g. `'Layout'`.
 * @returns Deterministic TypeScript source (not Prettier-formatted).
 * @throws If two containers map to the same type name.
 *
 * @example
 * ```ts
 * const src = generateTypes(layoutSchema, 'Layout');
 * // export type Layout = { width?: number; margin?: LayoutMargin; ... }
 * ```
 */
export function generateTypes(
  root: ObjectNode,
  name: string,
  options?: GenerateTypesOptions,
): string {
  const file = createTypeFile(options);
  file.object(root, name, { alias: true });
  return file.render();
}

/**
 * Generate one `<PascalType>Trace` type per trace type plus the discriminated union
 * `export type Data = ScatterTrace | BarTrace | …` (in the order given).
 *
 * The schema's `type` string attribute is replaced by a literal discriminant: required for every
 * type except `'scatter'`, which is optional because a trace without `type` is a scatter trace.
 * With no traces, `Data` is `never`: no trace object is valid when no trace types are registered.
 *
 * @param traces - Trace types with their full schemas, e.g. from `registry.getTraceSchema(type)`.
 * @returns Deterministic TypeScript source (not Prettier-formatted).
 * @throws If two containers map to the same type name.
 */
export function generateTraceTypes(
  traces: ReadonlyArray<TraceTypeSource>,
  options?: GenerateTypesOptions,
): string {
  const file = createTypeFile(options);
  const names = traces.map((t) => file.trace(t));
  file.union('Data', names, [
    'Any trace, discriminated on `type` (a trace without `type` is a scatter trace).',
  ]);
  return file.render();
}
