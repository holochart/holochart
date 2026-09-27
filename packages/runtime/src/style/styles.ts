/**
 * Conditional styling (plan E8.5, E8.6, ADR-012), loaded with a dynamic `import()` the first time a
 * figure has style rules or style functions (see `usesStyles`).
 *
 * Both resolve to plain per-point arrays before trace modules see the data, so every trace type
 * with per-point (`arrayOk`) attributes supports them without code of its own:
 *
 * - **Style functions** are evaluated on the *input* trace, before supply-defaults
 *   ({@link withStyleFunctions}): a trace module sees exactly the array the user could have given
 *   (numeric colors get a colorscale, and so on).
 * - **Style rules** apply to the *defaulted* trace, after supply-defaults ({@link applyStyleRules}):
 *   each rule's `set` merges over the trace's own value per point (a template or colorway color, a
 *   scalar or an array), later rules winning. `when` reads the defaulted trace too, so
 *   `'marker.size'` is the size in use even when it is a default.
 *
 * Results are cached per input trace (and base values), so updates that do not touch a styled
 * trace (zoom, hover, a relayout) reuse its arrays instead of evaluating 1M points again.
 */
import {
  coerceValue,
  describeExpected,
  getIn,
  getNodeAtPath,
  isArrayLike,
  isAttr,
  isObjectNode,
  isPlainObject,
  parsePath,
  pointSource,
  resolveChild,
  resolveDataRefs,
  setIn,
  suggest,
  ValidationError,
  type AttrSpec,
  type FigureInput,
  type FullTrace,
  type Issue,
  type ObjectNode,
  type PathSegment,
  type Registry,
  type StyleFunction,
  type SupplyDefaultsResult,
} from '@mk7s/holochart-core';

// ---- Planning ----------------------------------------------------------------------------------

/**
 * Edited paths with `styleRules…` replaced by the attributes the rules before and after the edit
 * set, so a rules edit plans those attributes' stages (`style` for colors) instead of `calc`.
 */
export function styleRulePaths(
  paths: readonly string[],
  before: unknown,
  after: unknown,
): string[] {
  const out = paths.filter((p) => !p.startsWith('styleRules'));
  if (out.length === paths.length) return out;
  for (const trace of [before, after]) {
    const rules = isPlainObject(trace) ? trace['styleRules'] : undefined;
    if (!Array.isArray(rules)) continue;
    for (const rule of rules) {
      if (isPlainObject(rule) && isPlainObject(rule['set'])) out.push(...Object.keys(rule['set']));
    }
  }
  return out;
}

// ---- Style functions (E8.6) ---------------------------------------------------------------------

const evaluated = new WeakMap<object, { datasets: unknown; out: unknown }>();

/**
 * The figure with every style function on a per-point (`arrayOk`) attribute of a registered trace
 * replaced by the array of its results: `fn(point, i, trace)` for each point (see core
 * `pointSource` for `point`). A function that throws is dropped (with a warning), so the
 * attribute takes its default. Functions elsewhere are left for validation to report.
 */
export function withStyleFunctions(figure: FigureInput, core: Registry): FigureInput {
  const data = figure.data;
  if (!Array.isArray(data)) return figure;
  let changed = false;
  const out = data.map((trace: unknown, i) => {
    if (!isPlainObject(trace)) return trace;
    const hit = evaluated.get(trace);
    const next =
      hit && hit.datasets === figure.datasets
        ? hit.out
        : evaluateTrace(trace, i, figure.datasets, core);
    evaluated.set(trace, { datasets: figure.datasets, out: next });
    if (next !== trace) changed = true;
    return next;
  });
  return changed ? { ...figure, data: out } : figure;
}

function evaluateTrace(
  trace: Readonly<Record<string, unknown>>,
  index: number,
  datasets: FigureInput['datasets'],
  core: Registry,
): Readonly<Record<string, unknown>> {
  const type = trace['type'];
  const schema = core.getTraceSchema(typeof type === 'string' && type !== '' ? type : 'scatter');
  if (!schema) return trace;
  const edits: Record<string, unknown> = {};
  let source: ReturnType<typeof pointSource> | undefined;
  const walk = (node: ObjectNode, obj: Readonly<Record<string, unknown>>, prefix: string) => {
    for (const key of Object.keys(obj)) {
      const child = resolveChild(node, key);
      const v = obj[key];
      const path = prefix + key;
      if (typeof v === 'function' && isAttr(child) && child.arrayOk === true) {
        source ??= pointSource(
          resolveDataRefs(trace, schema, datasets, `data[${index}]`).trace,
          schema,
        );
        edits[path] = source
          ? evaluate(v as StyleFunction, source, trace, index, path, core)
          : null;
      } else if (isObjectNode(child) && isPlainObject(v)) walk(child, v, `${path}.`);
    }
  };
  walk(schema, trace, '');
  let out = trace;
  for (const [path, value] of Object.entries(edits))
    out = withValue(out, path.split('.'), 0, value);
  return out;
}

/** Copy-on-write: `obj` with `keys` set to `value` (removed when `null`), sharing the rest. */
function withValue(
  obj: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  k: number,
  value: unknown,
): Record<string, unknown> {
  const copy = { ...obj };
  const key = keys[k] as string;
  if (k < keys.length - 1)
    copy[key] = withValue(copy[key] as Record<string, unknown>, keys, k + 1, value);
  else if (value === null) delete copy[key];
  else copy[key] = value;
  return copy;
}

function evaluate(
  fn: StyleFunction,
  source: NonNullable<ReturnType<typeof pointSource>>,
  trace: Readonly<Record<string, unknown>>,
  index: number,
  path: string,
  core: Registry,
): unknown[] | null {
  const values = new Array<unknown>(source.length);
  try {
    for (let i = 0; i < source.length; i++) values[i] = fn(source.point(i), i, trace);
  } catch (err) {
    core.warnOnce({
      path: `data[${index}].${path}`,
      message: `style function threw (${err instanceof Error ? err.message : String(err)}); using the default`,
      value: fn,
      code: 'invalid-value',
      severity: 'error',
    });
    return null;
  }
  return values;
}

// ---- Style rules (E8.5) -------------------------------------------------------------------------

/** A condition compiled against one trace: does point `i` match? */
type Test = (i: number) => boolean;
/** Reads a field of point `i`. */
type Field = (i: number) => unknown;

interface CompiledRule {
  /** Compile the rule's `when` against a trace's fields (`undefined`: every point). */
  readonly when: ((field: (path: string) => Field) => Test) | undefined;
  /** Target paths (indices into {@link CompiledRules.targets}) and coerced values. */
  readonly set: readonly (readonly [number, unknown])[];
}

interface CompiledRules {
  readonly type: string;
  readonly rules: readonly CompiledRule[];
  readonly targets: readonly string[];
  readonly specs: readonly AttrSpec[];
}

const OPERATORS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'between', 'regex'];
const RULE_KEYS = ['when', 'set'];

function preview(v: unknown): string {
  if (typeof v === 'string') return `'${v}'`;
  if (Array.isArray(v)) return 'an array';
  if (typeof v === 'object' && v !== null) return 'an object';
  return String(v);
}

/** A comparable form: numbers (Dates as ms, numeric strings) or strings. */
function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

/** `v` compared with `arg`: negative, 0, positive, or NaN when they are not comparable. */
function compare(v: unknown, arg: number | string): number {
  if (typeof arg === 'number') return num(v) - arg;
  if (v instanceof Date) return v.getTime() - Date.parse(arg);
  if (typeof v === 'number') return v - num(arg);
  if (typeof v !== 'string') return NaN;
  return v < arg ? -1 : v > arg ? 1 : 0;
}

function same(v: unknown, arg: unknown): boolean {
  if (arg === null) return v === null || v === undefined;
  return (
    v === arg || (v instanceof Date && typeof arg === 'string' && v.getTime() === Date.parse(arg))
  );
}

const isOrderable = (a: unknown): a is number | string =>
  (typeof a === 'number' && !Number.isNaN(a)) || typeof a === 'string';

/**
 * Compile the operators on one field, or report why they are invalid. Returns a test of a value.
 */
function compileOperators(
  ops: Readonly<Record<string, unknown>>,
  path: string,
  report: (issue: Issue) => void,
): ((v: unknown) => boolean) | undefined {
  const tests: ((v: unknown) => boolean)[] = [];
  const bad = (key: string, expected: string): undefined => {
    report({
      path: `${path}.${key}`,
      message: `invalid operand ${preview(ops[key])}; expected ${expected} (the rule is ignored)`,
      value: ops[key],
      expected,
      code: 'invalid-value',
      severity: 'error',
    });
    return undefined;
  };
  for (const key of Object.keys(ops)) {
    const arg = ops[key];
    switch (key) {
      case 'eq':
      case 'ne': {
        if (arg !== null && typeof arg === 'object')
          return bad(key, 'a number, string, boolean or null');
        tests.push(key === 'eq' ? (v) => same(v, arg) : (v) => !same(v, arg));
        break;
      }
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        if (!isOrderable(arg)) return bad(key, 'a number or string');
        tests.push(
          key === 'gt'
            ? (v) => compare(v, arg) > 0
            : key === 'gte'
              ? (v) => compare(v, arg) >= 0
              : key === 'lt'
                ? (v) => compare(v, arg) < 0
                : (v) => compare(v, arg) <= 0,
        );
        break;
      }
      case 'in':
      case 'nin': {
        if (!Array.isArray(arg)) return bad(key, 'an array of values');
        const list = arg as unknown[];
        const has = (v: unknown) => list.some((a) => same(v, a));
        tests.push(key === 'in' ? has : (v) => !has(v));
        break;
      }
      case 'between': {
        const [lo, hi] = Array.isArray(arg) ? (arg as unknown[]) : [];
        if (!Array.isArray(arg) || arg.length !== 2 || !isOrderable(lo) || !isOrderable(hi)) {
          return bad(key, 'a [low, high] pair of numbers or strings');
        }
        tests.push((v) => compare(v, lo) >= 0 && compare(v, hi) <= 0);
        break;
      }
      case 'regex': {
        const spec = isPlainObject(arg) ? arg : { pattern: arg };
        let re: RegExp;
        try {
          if (typeof spec['pattern'] !== 'string') throw new Error();
          // Without `g` / `y`: their `lastIndex` would make a point's result depend on the last.
          const flags = String(spec['flags'] ?? '').replace(/[gy]/g, '');
          re = new RegExp(spec['pattern'], flags);
        } catch {
          return bad(key, "a valid pattern: '^A' or { pattern: '^a', flags: 'i' }");
        }
        tests.push((v) => (typeof v === 'string' || typeof v === 'number') && re.test(String(v)));
        break;
      }
      default: {
        const suggestion = suggest(key, OPERATORS);
        report({
          path: `${path}.${key}`,
          message: `unknown operator '${key}'${suggestion ? `; did you mean '${suggestion}'?` : ''} (the rule is ignored); operators: ${OPERATORS.join(', ')}`,
          value: arg,
          code: 'invalid-value',
          severity: 'error',
          ...(suggestion ? { suggestion } : {}),
        });
        return undefined;
      }
    }
  }
  return tests.length === 1 ? tests[0] : (v) => tests.every((t) => t(v));
}

type CompiledCondition = (field: (path: string) => Field) => Test;

/** Compile a `when` condition, or report why it is invalid. */
function compileCondition(
  cond: unknown,
  path: string,
  schema: ObjectNode,
  report: (issue: Issue) => void,
): CompiledCondition | undefined {
  if (!isPlainObject(cond)) {
    report({
      path,
      message: `expected a condition object such as { y: { gt: 10 } }, got ${preview(cond)} (the rule is ignored)`,
      value: cond,
      code: 'invalid-container',
      severity: 'error',
    });
    return undefined;
  }
  const parts: CompiledCondition[] = [];
  for (const key of Object.keys(cond)) {
    const v = cond[key];
    const p = `${path}.${key}`;
    if (key === 'and' || key === 'or') {
      if (!Array.isArray(v)) {
        report({
          path: p,
          message: `expected an array of conditions, got ${preview(v)} (the rule is ignored)`,
          value: v,
          code: 'invalid-container',
          severity: 'error',
        });
        return undefined;
      }
      const subs: CompiledCondition[] = [];
      for (let k = 0; k < v.length; k++) {
        const c = compileCondition(v[k], `${p}[${k}]`, schema, report);
        if (!c) return undefined;
        subs.push(c);
      }
      parts.push(
        key === 'and'
          ? (field) => {
              const ts = subs.map((s) => s(field));
              return (i) => ts.every((t) => t(i));
            }
          : (field) => {
              const ts = subs.map((s) => s(field));
              return (i) => ts.some((t) => t(i));
            },
      );
      continue;
    }
    if (key === 'not') {
      const c = compileCondition(v, p, schema, report);
      if (!c) return undefined;
      parts.push((field) => {
        const t = c(field);
        return (i) => !t(i);
      });
      continue;
    }
    // A field: known attribute paths only (a typo would silently never match).
    let segs: readonly PathSegment[] | undefined;
    try {
      segs = parsePath(key);
    } catch {
      segs = undefined;
    }
    const root = segs?.[0];
    if (key !== 'pointNumber' && (typeof root !== 'string' || !resolveChild(schema, root))) {
      const suggestion = suggest(key, [
        'pointNumber',
        'and',
        'or',
        'not',
        ...Object.keys(schema.children),
      ]);
      report({
        path: p,
        message: `unknown field '${key}'${suggestion ? `; did you mean '${suggestion}'?` : ''} (the rule is ignored); conditions test trace attributes such as 'y', 'customdata[1]' or 'marker.size', or 'pointNumber'`,
        value: v,
        code: 'unknown-attribute',
        severity: 'error',
        ...(suggestion ? { suggestion } : {}),
      });
      return undefined;
    }
    let test: ((value: unknown) => boolean) | undefined;
    if (isPlainObject(v)) test = compileOperators(v, p, report);
    else if (v === null || typeof v !== 'object') test = (x) => same(x, v);
    else {
      report({
        path: p,
        message: `invalid condition ${preview(v)}; expected a value or operators such as { in: [...] } (the rule is ignored)`,
        value: v,
        code: 'invalid-value',
        severity: 'error',
      });
      return undefined;
    }
    if (!test) return undefined;
    const t = test;
    parts.push((field) => {
      const get = field(key);
      return (i) => t(get(i));
    });
  }
  if (parts.length === 1) return parts[0];
  return (field) => {
    const ts = parts.map((c) => c(field));
    return (i) => ts.every((t) => t(i));
  };
}

/**
 * Compile a trace's `styleRules`, reporting every problem through `report`. Invalid rules are
 * left out (the others still apply).
 */
export function compileStyleRules(
  rules: unknown,
  schema: ObjectNode,
  path: string,
  report: (issue: Issue) => void,
  type = '',
): CompiledRules {
  const out: CompiledRule[] = [];
  const targets: string[] = [];
  const specs: AttrSpec[] = [];
  if (!Array.isArray(rules)) {
    report({
      path,
      message: `expected an array of { when, set } rules, got ${preview(rules)}`,
      value: rules,
      code: 'invalid-container',
      severity: 'error',
    });
    return { type, rules: out, targets, specs };
  }
  rules.forEach((rule: unknown, k) => {
    const p = `${path}[${k}]`;
    if (!isPlainObject(rule) || !isPlainObject(rule['set'])) {
      report({
        path: isPlainObject(rule) ? `${p}.set` : p,
        message: `expected a rule { when, set } whose set maps per-point attributes to values, e.g. { set: { 'marker.size': 12 } } (the rule is ignored)`,
        value: rule,
        code: 'invalid-container',
        severity: 'error',
      });
      return;
    }
    for (const key of Object.keys(rule)) {
      if (RULE_KEYS.includes(key)) continue;
      const suggestion = suggest(key, RULE_KEYS);
      report({
        path: `${p}.${key}`,
        message: `unknown rule key '${key}'${suggestion ? `; did you mean '${suggestion}'?` : ''}`,
        value: rule[key],
        code: 'unknown-attribute',
        severity: 'warning',
        ...(suggestion ? { suggestion } : {}),
      });
    }
    const when =
      rule['when'] === undefined
        ? undefined
        : compileCondition(rule['when'], `${p}.when`, schema, report);
    if (rule['when'] !== undefined && !when) return;
    const set: (readonly [number, unknown])[] = [];
    const values = rule['set'];
    for (const target of Object.keys(values)) {
      const tp = `${p}.set.${target}`;
      let node;
      try {
        node = getNodeAtPath(schema, target);
      } catch {
        node = undefined;
      }
      if (!isAttr(node) || node.arrayOk !== true) {
        report({
          path: tp,
          message: node
            ? `'${target}' is not a per-point (arrayOk) attribute; style rules can only set those (ignored)`
            : `unknown attribute '${target}' (ignored)`,
          value: values[target],
          code: node ? 'invalid-value' : 'unknown-attribute',
          severity: 'error',
        });
        continue;
      }
      const r = coerceValue(node, values[target]);
      if (!r.ok || isArrayLike(r.value)) {
        const expected = describeExpected({ ...node, arrayOk: false });
        report({
          path: tp,
          message: `invalid value ${preview(values[target])}; expected ${expected} (ignored)`,
          value: values[target],
          expected,
          code: 'invalid-value',
          severity: 'error',
        });
        continue;
      }
      let t = targets.indexOf(target);
      if (t < 0) {
        t = targets.push(target) - 1;
        specs.push(node);
      }
      set.push([t, r.value]);
    }
    out.push({ when, set });
  });
  return { type, rules: out, targets, specs };
}

/** Reads field `path` of each point of `trace` (see {@link StyleCondition} in core). */
function fieldOf(trace: Readonly<Record<string, unknown>>, path: string): Field {
  if (path === 'pointNumber') return (i) => i;
  const segs = parsePath(path);
  let base: unknown = trace;
  let k = 0;
  while (k < segs.length && isPlainObject(base)) base = base[segs[k++] as string];
  if (isArrayLike(base) && typeof base !== 'string') {
    const arr = base as ArrayLike<unknown>;
    const rest = segs.slice(k);
    if (rest.length === 0) return (i) => arr[i];
    return (i) => {
      let v: unknown = arr[i];
      for (const s of rest)
        v =
          v === null || typeof v !== 'object' ? undefined : (v as Record<PathSegment, unknown>)[s];
      return v;
    };
  }
  const scalar = k === segs.length ? base : undefined;
  return () => scalar;
}

const NUMERIC = new Set(['number', 'integer', 'angle']);

/** A fresh per-point array for a target: the base value (scalar or array) at every point. */
function baseArray(
  base: unknown,
  spec: AttrSpec,
  numeric: boolean,
  n: number,
): unknown[] | Float64Array {
  if (isArrayLike(base) && typeof base !== 'string') {
    const arr = base as ArrayLike<unknown>;
    if (numeric && ArrayBuffer.isView(arr)) {
      const out = new Float64Array(n).fill(NaN);
      out.set((arr as Float64Array).subarray(0, n));
      return out;
    }
    const out = new Array<unknown>(n);
    for (let i = 0; i < n; i++) out[i] = arr[i];
    return out;
  }
  if (numeric && NUMERIC.has(spec.valType) && (typeof base === 'number' || base === undefined)) {
    return new Float64Array(n).fill(typeof base === 'number' ? base : NaN);
  }
  return new Array<unknown>(n).fill(base);
}

interface Applied {
  readonly compiled: CompiledRules;
  readonly n: number;
  readonly bases: readonly unknown[];
  readonly outs: readonly (unknown[] | Float64Array | undefined)[];
}

const compiledCache = new WeakMap<object, CompiledRules>();
const appliedCache = new WeakMap<object, Applied>();

/** Options for {@link applyStyleRules}. */
export interface ApplyStyleRulesOptions {
  /** Report validation issues (only the first time a rules array is seen). */
  readonly onIssue?: (issue: Issue) => void;
  /** Paths left alone on a trace (a transition is animating them). */
  readonly skip?: (traceIndex: number, path: string) => boolean;
}

/**
 * Apply the `styleRules` of every visible trace to its defaulted attributes, in place: each target
 * becomes a per-point array (a typed array for numbers, when every value is a number). Targets
 * whose container the trace does not use (`marker` of a lines-only scatter) are left alone.
 *
 * @throws {ValidationError} In `config.strict` mode, on the first invalid rule.
 */
export function applyStyleRules(
  full: SupplyDefaultsResult,
  core: Registry,
  options: ApplyStyleRulesOptions = {},
): void {
  full.fullData.forEach((trace, index) => {
    const input = trace._input;
    const rules = input['styleRules'];
    if (rules === undefined || rules === null || trace.visible === false || !trace._module) return;
    const schema = core.getTraceSchema(trace.type);
    if (!schema) return;
    const key = isPlainObject(rules) || Array.isArray(rules) ? (rules as object) : input;
    let compiled = compiledCache.get(key);
    if (!compiled || compiled.type !== trace.type) {
      const report = (issue: Issue): void => {
        if (full.fullConfig.strict && issue.severity === 'error') throw new ValidationError(issue);
        (options.onIssue ?? ((i: Issue) => core.warnOnce(i)))(issue);
      };
      compiled = compileStyleRules(rules, schema, `data[${index}].styleRules`, report, trace.type);
      compiledCache.set(key, compiled);
    }
    if (compiled.rules.length === 0) return;
    applyTrace(trace, index, compiled, schema, options.skip);
  });
}

function applyTrace(
  trace: FullTrace,
  index: number,
  compiled: CompiledRules,
  schema: ObjectNode,
  skip: ApplyStyleRulesOptions['skip'],
): void {
  const n =
    typeof trace['_length'] === 'number'
      ? trace['_length']
      : (pointSource(trace, schema)?.length ?? 0);
  if (n === 0) return;
  const { targets } = compiled;
  const bases = targets.map((t) => getIn(trace, t));
  const hit = appliedCache.get(trace._input);
  let outs: readonly (unknown[] | Float64Array | undefined)[];
  if (
    hit &&
    hit.compiled === compiled &&
    hit.n === n &&
    hit.bases.every((b, k) => Object.is(b, bases[k]))
  ) {
    outs = hit.outs;
  } else {
    outs = targets.map((t, k) => {
      const parent = t.includes('.') ? getIn(trace, t.slice(0, t.lastIndexOf('.'))) : trace;
      if (!isPlainObject(parent)) return undefined;
      const numeric = compiled.rules.every((r) =>
        r.set.every(([target, v]) => target !== k || typeof v === 'number'),
      );
      return baseArray(bases[k], compiled.specs[k] as AttrSpec, numeric, n);
    });
    const field = (path: string) => fieldOf(trace, path);
    for (const rule of compiled.rules) {
      const sets = rule.set.filter(([t]) => outs[t] !== undefined);
      if (sets.length === 0) continue;
      const test = rule.when?.(field);
      if (!test) {
        for (const [t, value] of sets) (outs[t] as unknown[]).fill(value);
        continue;
      }
      // One pass per rule: the test runs once per point, whatever the number of targets.
      if (sets.length === 1) {
        const [t, value] = sets[0] as readonly [number, unknown];
        const out = outs[t] as unknown[];
        for (let i = 0; i < n; i++) if (test(i)) out[i] = value;
      } else {
        for (let i = 0; i < n; i++) {
          if (!test(i)) continue;
          for (const [t, value] of sets) (outs[t] as unknown[])[i] = value;
        }
      }
    }
    appliedCache.set(trace._input, { compiled, n, bases, outs });
  }
  targets.forEach((t, k) => {
    const out = outs[k];
    if (out !== undefined && !skip?.(index, t)) setIn(trace, t, out);
  });
}
