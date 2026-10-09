/**
 * `@mk7s/holochart/geo`: geographic charts for the full bundle (ADR-026). Maps are not part of
 * `@mk7s/holochart` itself, so that an app without a map does not pay for them; this entry
 * registers `@mk7s/holochart-traces-geo` (the `geo` subplot and its traces) into the shared
 * registry (ADR-019) and re-exports the package:
 *
 * ```ts
 * import * as Holochart from '@mk7s/holochart';
 * import '@mk7s/holochart/geo';
 * ```
 *
 * A partial bundle registers the package itself: `register(...tracesGeo)`.
 */
import { register } from '@mk7s/holochart-runtime';
import { tracesGeo } from '@mk7s/holochart-traces-geo';

register(...tracesGeo);

export * from '@mk7s/holochart-traces-geo';
