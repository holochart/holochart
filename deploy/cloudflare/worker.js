// @ts-check
/**
 * Option A: a Worker on the route `mk7s.dev/holochart*` (wrangler.toml) that proxies the docs to
 * the `holochart-docs` Pages project. Deploy with `npx wrangler deploy` from this directory; see
 * docs/release/docs-hosting.md.
 */
import { proxyDocs } from './proxy.js';

export default {
  /**
   * @param {Request} request
   * @param {{ DOCS_ORIGIN?: string }} env
   */
  fetch(request, env) {
    return proxyDocs(request, env.DOCS_ORIGIN || undefined);
  },
};
