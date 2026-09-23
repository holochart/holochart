/**
 * Client-only runtime for `<Example>`: the example registry and the highlighted sources. Imported
 * dynamically from the component after mount, so neither three.js nor any example module is
 * bundled into (or executed during) server-side rendering.
 */
export { loadExample } from '@mk7s/holochart-examples/index.ts';
export type { ExampleHandle, ExampleModule } from '@mk7s/holochart-examples/_lib/types.ts';
export { sources } from 'virtual:holochart-example-sources';
