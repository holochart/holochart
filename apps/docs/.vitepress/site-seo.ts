/** Stable public URLs: filter queries and preview hashes refer to the same document. */
export function canonicalUrl(relativePath: string, base: string, origin: string): string {
  const documentPath = relativePath
    .split(/[?#]/)[0]!
    .replace(/^\/+/, '')
    .replace(/\.md$/, '')
    .replace(/(^|\/)index$/, '$1');
  const prefix = `/${base.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
  return new URL(`${prefix}${documentPath}`, origin).href;
}
