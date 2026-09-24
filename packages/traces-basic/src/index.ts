/**
 * @mk7s/holochart-traces-basic — basic trace types (plan E9). Each export is one trace module
 * object; register it with the runtime: `register(scatter, bar)`, or everything via `basicTraces`.
 */
import type { Registrable } from '@mk7s/holochart-runtime';
import { bar } from './bar/index.ts';
import { pie } from './pie/index.ts';
import { scatter } from './scatter/index.ts';

export * from './scatter/index.ts';
export * from './bar/index.ts';
export * from './pie/index.ts';

/** Every trace module in this package, in registration order (the full bundle registers these). */
export const basicTraces: readonly Registrable[] = [scatter, bar, pie];
