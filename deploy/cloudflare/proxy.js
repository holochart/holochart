// @ts-check
/**
 * Path-preserving reverse proxy: serves `https://mk7s.dev/holochart/*` from the docs Pages project
 * (`https://holochart-docs.pages.dev/holochart/*`, deployed by .github/workflows/docs.yml).
 * Shared by the Worker (worker.js) and the Pages Function (functions/holochart/[[path]].js); see
 * docs/release/docs-hosting.md.
 */

/** Default upstream: the docs Pages project. Override with the `DOCS_ORIGIN` variable. */
export const DEFAULT_DOCS_ORIGIN = 'https://holochart-docs.pages.dev';

/** Path prefix served by the docs site (VitePress `base: '/holochart/'`). */
export const PREFIX = '/holochart';

/** Upstream headers that must not reach mk7s.dev visitors. */
const DROP_RESPONSE_HEADERS = [
  // The pages.dev mirror is marked noindex (docs.yml `_headers`); the canonical site is mk7s.dev.
  'x-robots-tag',
];

/**
 * @param {Request} request incoming request on mk7s.dev
 * @param {string} [docsOrigin] upstream origin, e.g. `https://holochart-docs.pages.dev`
 * @param {typeof fetch} [fetchImpl] for tests
 * @returns {Promise<Response>}
 */
export async function proxyDocs(request, docsOrigin = DEFAULT_DOCS_ORIGIN, fetchImpl = fetch) {
  const url = new URL(request.url);
  if (url.pathname === PREFIX) {
    return Response.redirect(`${url.origin}${PREFIX}/${url.search}`, 301);
  }
  if (!url.pathname.startsWith(`${PREFIX}/`)) {
    return new Response('Not found', { status: 404 });
  }

  const upstream = new URL(docsOrigin);
  const target = new URL(url.pathname + url.search, upstream);
  const response = await fetchImpl(new Request(target, request), { redirect: 'manual' });

  const headers = new Headers(response.headers);
  for (const name of DROP_RESPONSE_HEADERS) headers.delete(name);
  // Keep redirects on mk7s.dev (Pages redirects e.g. `/page.html` to `/page`).
  const location = headers.get('location');
  if (location) {
    const resolved = new URL(location, target);
    if (resolved.host === upstream.host) {
      headers.set(
        'location',
        `${url.origin}${resolved.pathname}${resolved.search}${resolved.hash}`,
      );
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
