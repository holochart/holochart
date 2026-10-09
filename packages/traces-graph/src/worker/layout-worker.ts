/**
 * The layout worker (backlog G7): a module worker that hands every message to the handler
 * (`handler.ts`) and posts the answers back. The package build writes it as `dist/layout-worker.js`,
 * one file with no imports, so an app can also copy it and serve it from where its Content
 * Security Policy allows (`setGraphWorkerUrl`). The page starts it from `client.ts`.
 */
import { createLayoutHandler } from './handler.ts';
import { LAYOUT_PROTOCOL, type LayoutResponse } from './protocol.ts';

/** What this file uses of the worker's global scope (the project's `lib` has the page's only). */
interface WorkerScope {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  postMessage(message: LayoutResponse, transfer: ArrayBuffer[]): void;
}

const scope = globalThis as unknown as WorkerScope;
const handler = createLayoutHandler((response, transfer) => scope.postMessage(response, transfer));
scope.onmessage = (event) => void handler.handle(event.data);
scope.postMessage({ type: 'ready', protocol: LAYOUT_PROTOCOL }, []);
