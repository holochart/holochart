/**
 * The built-in 2D trace modules (every trace package but `@mk7s/holochart-traces-3d`), shared by the
 * full bundle (`index.ts`) and the 2D bundle of the script-tag build (`bundle-2d.ts`). Not exported.
 */
import type { Registrable } from '@mk7s/holochart-runtime';
import { basicTraces } from '@mk7s/holochart-traces-basic';
import { statsTraces } from '@mk7s/holochart-traces-stats';
import { sciTraces } from '@mk7s/holochart-traces-sci';
import { financeTraces } from '@mk7s/holochart-traces-finance';
import { hierTraces } from '@mk7s/holochart-traces-hier';

export const traces2d: readonly Registrable[] = [
  ...basicTraces,
  ...statsTraces,
  ...sciTraces,
  ...financeTraces,
  ...hierTraces,
];
