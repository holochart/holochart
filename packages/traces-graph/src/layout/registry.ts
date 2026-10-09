/**
 * The names of the `graph` trace's arrangements and the layouts an app registered (ADR-029):
 * `arrangement: 'custom'` runs one that {@link registerGraphLayout} added. A custom layout that is
 * not registered is drawn with `circular`, with one warning.
 *
 * This file imports no layout but `circular`, its stand-in: a module that needs the names or the
 * app's layouts and none of the built-in ones (`graph3d`, which has layouts of its own) imports
 * it instead of `./index.ts`, the table of the built-in layouts.
 */
import { circularLayout } from './circular.ts';
import type { GraphLayout } from './types.ts';

/** Every value of the trace's `arrangement`. */
export const GRAPH_ARRANGEMENTS = [
  'preset',
  'force',
  'layered',
  'tree',
  'radial',
  'dendrogram',
  'circular',
  'grid',
  'arc',
  'hive',
  'custom',
] as const;

/** A value of `arrangement`. */
export type GraphArrangement = (typeof GRAPH_ARRANGEMENTS)[number];

/** A layout whose options are not known here: the trace hands it its options container. */
export type AnyGraphLayout = GraphLayout<never>;

/** Layouts registered by the app, by name. */
const registered = new Map<string, AnyGraphLayout>();

/**
 * Register a layout for `arrangement: 'custom'` with `custom: { name, options }`: the layout is
 * called with the graph and `custom.options`, in calc. Registering a name again replaces it.
 * Returns a function that removes the layout (only if it is still the one registered).
 *
 * A layout must be deterministic and return a finite position for every node (see
 * `GraphLayout`). Positions are layout units: the trace fits them to the plot area.
 */
export function registerGraphLayout<Options = unknown>(
  name: string,
  layout: GraphLayout<Options>,
): () => void {
  registered.set(name, layout as AnyGraphLayout);
  return () => {
    if (registered.get(name) === (layout as AnyGraphLayout)) registered.delete(name);
  };
}

/** What {@link resolveCustomLayout} and `resolveGraphLayout` found. */
export interface ResolvedGraphLayout {
  /** The layout to run. */
  readonly layout: GraphLayout<unknown>;
  /** The arrangement it is: the one asked for, or `'circular'` when that one is missing. */
  readonly arrangement: GraphArrangement;
  /** The layout asked for is not available and `circular` stands in. */
  readonly fallback: boolean;
}

const warned = new Set<string>();

/** One `console.warn` per message, as the other trace packages report what they cannot draw. */
function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[holochart] graph: ${message}`);
}

/** `circular` in place of a layout that is missing, with one warning per `message`. */
export function circularFallback(message: string): ResolvedGraphLayout {
  warnOnce(message);
  return {
    layout: circularLayout as GraphLayout<unknown>,
    arrangement: 'circular',
    fallback: true,
  };
}

/**
 * The layout registered as `name` for `arrangement: 'custom'`. A missing layout falls back to
 * `circular` and warns once per name; it never throws.
 */
export function resolveCustomLayout(name: string | undefined): ResolvedGraphLayout {
  const found = name !== undefined ? registered.get(name) : undefined;
  if (found) {
    return { layout: found as GraphLayout<unknown>, arrangement: 'custom', fallback: false };
  }
  return circularFallback(
    name === undefined || name === ''
      ? "arrangement 'custom' needs `custom.name`, the name of a layout registered with registerGraphLayout(); drawn with 'circular'."
      : `no layout is registered as '${name}' (registerGraphLayout); drawn with 'circular'.`,
  );
}
