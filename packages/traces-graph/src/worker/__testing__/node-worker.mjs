/**
 * The layout worker for Node's `worker_threads`, for the test that sends a graph across a real
 * thread boundary (`../worker-threads.test.ts`): the same handler as `../layout-worker.ts`, on
 * `parentPort` instead of a browser's worker scope. Plain JavaScript, because the package is
 * type-checked without Node's types; Node runs the TypeScript it imports from source (type
 * stripping).
 */
import { parentPort } from 'node:worker_threads';
import { createLayoutHandler } from '../handler.ts';
import { LAYOUT_PROTOCOL } from '../protocol.ts';

if (!parentPort) throw new Error('node-worker.mjs runs in a worker thread');
const port = parentPort;
const handler = createLayoutHandler((response, transfer) => port.postMessage(response, transfer));
port.on('message', (message) => void handler.handle(message));
port.postMessage({ type: 'ready', protocol: LAYOUT_PROTOCOL });
