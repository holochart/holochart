/**
 * Redraws for the shared SDF glyph atlas.
 *
 * troika keeps one atlas texture per glyph size for the whole page, shared by every text in every
 * chart. It registers a glyph in the atlas the moment some text asks for it, and generates the
 * glyph's distance field afterwards, over the following frames. A second text that needs the same
 * glyph in the meantime finds it registered, so troika reports that text as typeset straight away,
 * before the glyph is in the texture. Inside one render root this goes unnoticed: when the glyph
 * arrives the first text invalidates the root, and the redraw uploads the new texture for both.
 * Across roots it does not: the second text's chart has drawn (and uploaded the atlas without the
 * glyph), and nothing tells it to draw again. Charts created in the same tick whose labels share
 * new characters showed those characters as gaps until their next redraw.
 *
 * So the primitives watch the atlas together: whenever one finishes typesetting (or a font preload
 * finishes), {@link noteGlyphAtlas} checks whether an atlas texture changed since it was last
 * looked at (three bumps `texture.version` when troika sets `needsUpdate`), and if so asks every
 * text primitive to redraw. That is one extra frame per chart each time new glyphs are generated,
 * and nothing otherwise.
 */
import type { Texture } from 'three';

/** `invalidate` of every text primitive that has an engine attached. */
const redraws = new Set<() => void>();
/** The atlas textures seen so far (troika keeps them for the life of the page), with the version last looked at. */
const versions = new Map<Texture, number>();

/** Call `redraw` whenever the glyph atlas has gained glyphs. Returns the unsubscribe function. */
export function onGlyphAtlasChange(redraw: () => void): () => void {
  redraws.add(redraw);
  return () => {
    redraws.delete(redraw);
  };
}

/**
 * Typesetting or a font preload has finished, which is when troika marks the atlas as changed:
 * compare every known atlas (and `texture`, the one just used, if it is new) with the version last
 * seen, and redraw every text primitive if one moved on. A texture seen for the first time redraws
 * nothing: no primitive can have drawn an older version of it.
 */
export function noteGlyphAtlas(texture?: Texture | null): void {
  if (texture && !versions.has(texture)) versions.set(texture, texture.version);
  let changed = false;
  for (const [atlas, seen] of versions) {
    if (atlas.version === seen) continue;
    versions.set(atlas, atlas.version);
    changed = true;
  }
  if (!changed) return;
  for (const redraw of [...redraws]) redraw();
}
