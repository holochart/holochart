/**
 * Loads the pickers on demand (GEO8; see `picker-lazy.ts`): for code that lives in a lazy chunk
 * of its own and should not bring the pickers into an app's initial chunk by importing
 * `createPicker`.
 */
import type { createPicker } from './picker.ts';

/** The lazily loaded picker module (`picker-lazy.ts`). */
type PickerModule = typeof import('./picker-lazy.ts');

let pickerModule: PickerModule | null = null;
let loading: Promise<PickerModule> | null = null;

/**
 * `createPicker`, from the picker chunk. Concurrent callers share the request. Rejects when the
 * chunk cannot be loaded; the next call tries again.
 * @experimental
 */
export function loadPicker(): Promise<typeof createPicker> {
  if (pickerModule) return Promise.resolve(pickerModule.createPicker);
  loading ??= import('./picker-lazy.ts').then(
    (mod) => (pickerModule = mod),
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading.then((mod) => mod.createPicker);
}
