/**
 * API commands of update-menu buttons and slider steps (plotly.js `plots/command.js`): running a
 * `{ method, args }` pair through the chart API, and the "simple binding" check that lets a menu or
 * slider follow the figure — when every command sets the same single attribute, the control's
 * `active` item tracks that attribute's value however it changes (another control, `relayout`,
 * `react`, an animation frame).
 */
import { getIn, isPlainObject, type FullLayout, type FullTrace } from '@mk7s/holochart-core';

/** Methods a button or step can call. */
export type CommandMethod = 'restyle' | 'relayout' | 'update' | 'animate' | 'skip';

/** The chart methods commands call (a `Chart` satisfies it). */
export interface CommandChart {
  restyle(update: Readonly<Record<string, unknown>>, traces?: number | readonly number[]): unknown;
  relayout(update: Readonly<Record<string, unknown>>): unknown;
  updateAttributes(
    traceUpdate: Readonly<Record<string, unknown>>,
    layoutUpdate: Readonly<Record<string, unknown>>,
    traces?: number | readonly number[],
  ): unknown;
  /** Plotly's `animate` (E7.4); a chart-like without it makes `animate` commands warn. */
  animate?(target: unknown, options?: unknown): unknown;
}

/** `restyle` / `relayout` arguments (`'attr', value` or `{ attr: value }`) → an update object. */
function updateOf(
  first: unknown,
  second: unknown,
): { update: Record<string, unknown>; rest: 'value' | 'next' } {
  if (typeof first === 'string') return { update: { [first]: second }, rest: 'next' };
  if (isPlainObject(first)) return { update: first, rest: 'value' };
  return { update: {}, rest: 'value' };
}

/** Plotly trace indices argument → indices, or `undefined` for "every trace". */
function tracesOf(value: unknown): number | readonly number[] | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (Array.isArray(value) && value.every((v) => typeof v === 'number')) return value as number[];
  return undefined;
}

/**
 * Run `method` with Plotly's `args` on `chart` (Plotly `executeAPICommand`):
 *
 * - `restyle`: `['attr', value, traces?]` or `[{ attr: value }, traces?]`
 * - `relayout`: `['attr', value]` or `[{ attr: value }]`
 * - `update`: `[traceUpdate, layoutUpdate, traces?]`
 * - `animate`: `[frameOrGroupOrNames, animationOptions]` (`chart.animate`, plan E7.4)
 * - `skip`: nothing
 *
 * Returns the chart call's promise (resolved `undefined` for `skip` and unsupported methods).
 */
export function executeCommand(
  chart: CommandChart,
  method: string,
  args: unknown,
  warn: (message: string) => void = (m) => console.warn(m),
): Promise<unknown> {
  const a = Array.isArray(args) ? (args as unknown[]) : [];
  let result: unknown;
  switch (method) {
    case 'restyle': {
      const { update, rest } = updateOf(a[0], a[1]);
      result = chart.restyle(update, tracesOf(rest === 'next' ? a[2] : a[1]));
      break;
    }
    case 'relayout':
      result = chart.relayout(updateOf(a[0], a[1]).update);
      break;
    case 'update':
      result = chart.updateAttributes(
        isPlainObject(a[0]) ? a[0] : {},
        isPlainObject(a[1]) ? a[1] : {},
        tracesOf(a[2]),
      );
      break;
    case 'animate':
      if (typeof chart.animate === 'function') result = chart.animate(a[0], a[1]);
      else
        warn("[holochart] method 'animate' needs chart.animate, which this chart lacks; ignored.");
      break;
    default:
      break;
  }
  return Promise.resolve(result).then(
    () => undefined,
    (error: unknown) => {
      // A Pause button drops the frames a Play button queued: expected, not worth a warning.
      if ((error as { name?: unknown } | null)?.name !== 'AnimationInterrupted') {
        warn(`[holochart] API call to ${method} rejected: ${String(error)}`);
      }
      return undefined;
    },
  );
}

// ---- Bindings -----------------------------------------------------------------------------------

/**
 * What a command sets: a layout attribute, or a trace attribute of some traces (`null`: every
 * trace), with the value it sets (per listed trace for data bindings).
 */
export type CommandBinding =
  | { readonly type: 'layout'; readonly prop: string; readonly value: unknown }
  | {
      readonly type: 'data';
      readonly prop: string;
      readonly traces: readonly number[] | null;
      readonly value: unknown;
    };

/** Leaves of a nested update object as `path → value` (keys starting with `_` are skipped). */
function crawl(
  obj: Readonly<Record<string, unknown>>,
  visit: (path: string, value: unknown) => void,
  prefix = '',
): void {
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('_')) continue;
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (isPlainObject(value)) crawl(value, visit, path);
    else visit(path, value);
  }
}

function layoutBindings(args: readonly unknown[]): CommandBinding[] {
  const out: CommandBinding[] = [];
  const first = args[0];
  const update = typeof first === 'string' ? { [first]: args[1] } : first;
  if (!isPlainObject(update)) return out;
  crawl(update, (prop, value) => out.push({ type: 'layout', prop, value }));
  return out;
}

function dataBindings(args: readonly unknown[], traceCount: number): CommandBinding[] {
  const out: CommandBinding[] = [];
  let traces: unknown = args[2];
  let update: Record<string, unknown>;
  if (typeof args[0] === 'string') update = { [args[0]]: args[1] };
  else if (isPlainObject(args[0])) {
    update = args[0];
    if (traces === undefined) traces = args[1];
  } else return out;
  const list = Array.isArray(traces) ? (traces as number[]) : null;
  crawl(update, (prop, attr) => {
    let value: unknown;
    let bound: number[] | null;
    if (Array.isArray(attr)) {
      value = attr.slice();
      let n = Math.min(attr.length, traceCount);
      if (list) n = Math.min(n, list.length);
      bound = [];
      for (let j = 0; j < n; j++) bound[j] = list ? (list[j] as number) : j;
    } else {
      value = attr;
      bound = list ? list.slice() : null;
    }
    if (bound === null) {
      if (Array.isArray(value)) value = value[0];
    } else {
      const values = Array.isArray(value) ? (value as unknown[]) : bound.map(() => value);
      value = values.slice(0, bound.length);
    }
    out.push({ type: 'data', prop, traces: bound, value });
  });
  return out;
}

/**
 * The attributes a command sets (Plotly `computeAPICommandBindings`). `animate` binds the current
 * frame (`_currentFrame`) when it names exactly one frame.
 */
export function commandBindings(
  method: string,
  args: unknown,
  traceCount: number,
): CommandBinding[] {
  const a = Array.isArray(args) ? (args as unknown[]) : [];
  switch (method) {
    case 'restyle':
      return dataBindings(a, traceCount);
    case 'relayout':
      return layoutBindings(a);
    case 'update':
      return [...dataBindings([a[0], a[2]], traceCount), ...layoutBindings([a[1]])];
    case 'animate': {
      const target = a[0];
      if (
        Array.isArray(target) &&
        target.length === 1 &&
        (typeof target[0] === 'string' || typeof target[0] === 'number')
      ) {
        return [{ type: 'layout', prop: '_currentFrame', value: String(target[0]) }];
      }
      return [];
    }
    default:
      return [];
  }
}

/** A command list's shared binding and which command sets which value. */
export interface SimpleBinding {
  readonly binding: CommandBinding;
  /** `String(value)` → index of the command setting it (the last one wins, like Plotly). */
  readonly lookup: ReadonlyMap<string, number>;
}

/** A command of a button or step; entries that are `undefined` (hidden items) are skipped. */
export interface CommandLike {
  readonly method?: unknown;
  readonly args?: unknown;
}

/**
 * Whether every command sets one and the same attribute (Plotly `hasSimpleAPICommandBindings`):
 * the same type, property and traces, and a single value each. Returns the binding and a value →
 * index table, or `undefined` when the commands are not that simple (no tracking then).
 */
export function simpleBinding(
  commands: readonly (CommandLike | undefined)[],
  traceCount: number,
): SimpleBinding | undefined {
  let ref: CommandBinding | undefined;
  const lookup = new Map<string, number>();
  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    if (!command) continue;
    if (typeof command.method !== 'string' || command.method === '') return undefined;
    const bindings = commandBindings(command.method, command.args, traceCount);
    if (bindings.length !== 1) return undefined;
    const b = bindings[0] as CommandBinding;
    if (!ref) ref = b;
    else if (b.type !== ref.type || b.prop !== ref.prop || !sameTraces(ref, b)) return undefined;
    let value = b.value;
    if (Array.isArray(value)) {
      if (value.length !== 1) return undefined;
      value = value[0];
    }
    lookup.set(String(value), i);
  }
  return ref ? { binding: ref, lookup } : undefined;
}

function sameTraces(a: CommandBinding, b: CommandBinding): boolean {
  if (a.type !== 'data' || b.type !== 'data') return true;
  if (a.traces === null) return true;
  if (b.traces === null) return false;
  const x = [...a.traces].sort((p, q) => p - q);
  const y = [...b.traces].sort((p, q) => p - q);
  return x.length <= y.length && x.every((v, k) => v === y[k]);
}

/** The current value of a binding in the defaulted figure. */
export function bindingValue(
  binding: CommandBinding,
  fullData: readonly FullTrace[],
  fullLayout: FullLayout,
): unknown {
  if (binding.type === 'layout') return getIn(fullLayout, binding.prop);
  const trace = fullData[binding.traces?.[0] ?? 0];
  return trace ? getIn(trace, binding.prop) : undefined;
}

/**
 * Follows a simple binding across updates (Plotly `manageCommandObserver`): {@link check} returns
 * the index of the command whose value the figure now holds, but only when that value changed
 * since the previous check (the first check only records it), so a control the user moved is not
 * snapped back by an unrelated update.
 */
export class CommandObserver {
  #simple: SimpleBinding | undefined;
  #key = '';
  #last: { value: unknown } | undefined;

  /** Re-read the command list (cheap when unchanged). */
  setCommands(commands: readonly (CommandLike | undefined)[], traceCount: number): void {
    const key = commandsKey(commands, traceCount);
    if (key === this.#key) return;
    this.#key = key;
    this.#simple = simpleBinding(commands, traceCount);
    this.#last = undefined;
  }

  /** The tracked binding, if the commands are simple. */
  get binding(): SimpleBinding | undefined {
    return this.#simple;
  }

  /**
   * Compare the binding's value (`value`, when the caller already has it, e.g. an animation frame
   * name) with the previous check; the matching command index when it changed, else `undefined`.
   */
  check(
    fullData: readonly FullTrace[],
    fullLayout: FullLayout,
    value?: { value: unknown },
  ): number | undefined {
    const simple = this.#simple;
    if (!simple) return undefined;
    const current = value ? value.value : bindingValue(simple.binding, fullData, fullLayout);
    const previous = this.#last;
    this.#last = { value: current };
    if (!previous || Object.is(previous.value, current)) return undefined;
    return simple.lookup.get(String(current));
  }
}

function commandsKey(commands: readonly (CommandLike | undefined)[], traceCount: number): string {
  try {
    return `${traceCount}|${JSON.stringify(commands.map((c) => (c ? [c.method, c.args] : null)))}`;
  } catch {
    // Circular or exotic args: never cached as equal.
    return `${Math.random()}`;
  }
}
