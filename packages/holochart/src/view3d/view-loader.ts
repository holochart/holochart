/**
 * Loads the 2.5D view (`view.ts`). In the script-tag build this import is rewritten to the module
 * the 3D add-on provides (`scripts/build/iife-split.ts`), so the 2D script doesn't carry the view.
 */
export function loadView3DView(): Promise<typeof import('./view.ts')> {
  return import('./view.ts');
}
