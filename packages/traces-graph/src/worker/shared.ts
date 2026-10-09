/**
 * The layout worker every `graph` trace of the page shares, and where its file is (backlog G7),
 * apart from the client that makes it (`client.ts`).
 *
 * The package's build has the client twice: once in the entry, for an app that calls
 * `layoutInWorker` itself, and once in the chunk the `graph` trace loads when a layout first
 * runs off the main thread (`tsdown.config.ts` says why). This file is in the build once, so both
 * serve the same worker, and an address set through one of them holds for the other.
 */

/** The part of a `GraphLayoutWorker` this file needs. */
interface Disposable {
  dispose(): void;
}

let url: string | URL | undefined;
let shared: Disposable | undefined;

/**
 * Serve the worker file from a URL of your own: copy `dist/layout-worker.js` of
 * `@mk7s/holochart-traces-graph` (one file, no imports) to your site and give its address here,
 * before the first graph is laid out. For apps whose Content Security Policy or bundler keeps the
 * file from loading from where the package looks for it. `null` goes back to the default. A
 * worker that is already running is ended; the next layout starts one from the new address.
 *
 * The address has to be of the page's own origin: browsers do not start a worker from another.
 */
export function setGraphWorkerUrl(address: string | URL | null): void {
  url = address ?? undefined;
  shared?.dispose();
  shared = undefined;
}

/** The shared worker, made by `create` (with the address set, if one is) on first use. */
export function sharedWorker<Worker extends Disposable>(
  create: (url: string | URL | undefined) => Worker,
): Worker {
  shared ??= create(url);
  return shared as Worker;
}
