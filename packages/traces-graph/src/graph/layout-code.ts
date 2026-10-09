/**
 * The code a `graph` trace loads when a calc first waits for something (backlog G7, `pending.ts`):
 * the client of the layout worker, with the handler it runs on the main thread when there is no
 * worker, and the bundling of links. One lazy chunk of the package, behind `loadLayoutCode`.
 */
export { bundleLinks } from '../layout/bundle/index.ts';
export { graphLayoutWorker, isLayoutAbort } from '../worker/client.ts';
