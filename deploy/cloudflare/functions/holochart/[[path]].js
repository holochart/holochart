// @ts-check
/**
 * Option B: a Pages Function for the mk7s.dev Pages project. Copy this file to
 * `functions/holochart/[[path]].js` and `../../proxy.js` to the project root (next to `functions/`)
 * in the mk7s.dev project; it then answers `/holochart` and `/holochart/*`. See
 * docs/release/docs-hosting.md.
 */
import { proxyDocs } from '../../proxy.js';

/** @param {{ request: Request, env: { DOCS_ORIGIN?: string } }} context */
export function onRequest({ request, env }) {
  return proxyDocs(request, env.DOCS_ORIGIN || undefined);
}
