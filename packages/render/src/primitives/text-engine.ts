// Ambient troika types must also reach programs that compile these sources indirectly (examples).
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./troika-three-text.d.ts" />
/**
 * Lazy loader for the SDF text engine (plan E21.5, ADR-005).
 *
 * troika-three-text and its dependencies (bidi-js, webgl-sdf-generator, troika-worker-utils) are
 * about a quarter of a scatter-only bundle, so they are fetched with a dynamic `import()` the first
 * time a label is actually typeset, instead of being part of every page's initial chunk. Bundlers
 * that split code (Vite, rolldown, webpack, esbuild with `splitting`) emit troika as its own chunk;
 * single-file builds (the IIFE) inline it, and the import then resolves on the next microtask.
 *
 * Only this module and `text.ts` touch troika at runtime, and both only through
 * {@link loadTextEngine}; everything else imports troika for types (`import type`), which is
 * erased. Layout never waits for the engine: the metrics oracle (`text-metrics.ts`) measures
 * synchronously with canvas and the CSS faces from `text-fonts.ts`, neither of which imports troika.
 */
import type * as Troika from 'troika-three-text';
import type { TroikaTextBuilderConfig } from 'troika-three-text';

/** The troika-three-text module, once loaded. */
export type TextEngine = typeof Troika;

let engine: TextEngine | null = null;
let loading: Promise<TextEngine> | null = null;
/** `configureText` calls made before the engine loaded, merged, applied on load. */
let queuedConfig: TroikaTextBuilderConfig | null = null;

/** The engine if it has already loaded, else `null` (callers then use {@link loadTextEngine}). */
export function loadedTextEngine(): TextEngine | null {
  return engine;
}

/**
 * Load the text engine (once; concurrent callers share the request). Configuration queued by
 * {@link configureTextEngine} is applied before the promise resolves, so it is in place before the
 * first `Text` is created. A failed load is not cached: the next call tries again.
 */
export function loadTextEngine(): Promise<TextEngine> {
  if (engine) return Promise.resolve(engine);
  loading ??= import('troika-three-text').then(
    (mod) => {
      if (queuedConfig) mod.configureTextBuilder(queuedConfig);
      queuedConfig = null;
      engine = mod;
      return mod;
    },
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

/**
 * Pass configuration to troika's `configureTextBuilder`, now if the engine is loaded, else when it
 * loads. troika merges successive calls field by field until the first font request, and so does
 * the queue, so the effect is the same either way.
 */
export function configureTextEngine(config: TroikaTextBuilderConfig): void {
  if (engine) engine.configureTextBuilder(config);
  else queuedConfig = { ...queuedConfig, ...config };
}

/**
 * Start fetching the SDF text engine without typesetting anything, e.g. in parallel with loading
 * data, so the first labels appear without the extra round trip. Text primitives load it on their
 * own when they first get labels; charts without any text never load it.
 */
export function preloadTextEngine(): Promise<void> {
  return loadTextEngine().then(() => undefined);
}
