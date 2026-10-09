/**
 * The layered (Sugiyama) layout of the `graph` trace, story G3: what the package exports of it.
 * The steps are in the files next to this one; `layered.ts` describes the pipeline.
 */
export { layeredLayout } from './layered.ts';
export {
  LAYERED_DEFAULTS,
  resolveLayeredOptions,
  type LayeredOptions,
  type LayeredRankdir,
  type LayeredRanker,
  type LayeredRouting,
  type ResolvedLayeredOptions,
} from './options.ts';
