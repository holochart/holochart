/**
 * Element id of an `<Example>` embed, so pages can deep-link to it (the gallery links each example
 * to the pages that embed it): `scatter/basic` → `example-scatter-basic`.
 */
export function exampleAnchor(id: string): string {
  return `example-${id.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`;
}
