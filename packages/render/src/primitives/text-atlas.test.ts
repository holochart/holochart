import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Texture } from 'three';

/** A stand-in for troika's atlas texture: only `version` matters here. */
const atlas = (version = 0) => ({ version }) as Texture;

let mod: typeof import('./text-atlas.ts');

beforeEach(async () => {
  // The module keeps the watchers and the atlas versions for the page: start each test clean.
  vi.resetModules();
  mod = await import('./text-atlas.ts');
});

describe('shared glyph atlas', () => {
  it('redraws every watcher when a known atlas has changed, and only then', () => {
    const texture = atlas(3);
    const a = vi.fn();
    const b = vi.fn();
    mod.onGlyphAtlasChange(a);
    mod.onGlyphAtlasChange(b);

    // First sight of the atlas: nothing can have drawn an older version of it.
    mod.noteGlyphAtlas(texture);
    expect(a).not.toHaveBeenCalled();
    // Typesetting that generated no glyphs.
    mod.noteGlyphAtlas(texture);
    expect(a).not.toHaveBeenCalled();

    texture.version++;
    mod.noteGlyphAtlas(texture);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    mod.noteGlyphAtlas(texture);
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('checks the atlases it knows when it is not told which one was used', () => {
    const texture = atlas();
    const redraw = vi.fn();
    mod.onGlyphAtlasChange(redraw);
    mod.noteGlyphAtlas(texture);
    texture.version++;
    mod.noteGlyphAtlas();
    mod.noteGlyphAtlas(null);
    expect(redraw).toHaveBeenCalledTimes(1);
  });

  it('follows each glyph size’s atlas on its own', () => {
    const small = atlas();
    const large = atlas(7);
    const redraw = vi.fn();
    mod.onGlyphAtlasChange(redraw);
    mod.noteGlyphAtlas(small);
    mod.noteGlyphAtlas(large);
    small.version++;
    // Told about the other atlas, it still notices the one that changed.
    mod.noteGlyphAtlas(large);
    expect(redraw).toHaveBeenCalledTimes(1);
  });

  it('stops redrawing a watcher that unsubscribed, even from inside a redraw', () => {
    const texture = atlas();
    const kept = vi.fn();
    let off = (): void => {};
    const gone = vi.fn(() => off());
    off = mod.onGlyphAtlasChange(gone);
    mod.onGlyphAtlasChange(kept);
    mod.noteGlyphAtlas(texture);
    texture.version++;
    mod.noteGlyphAtlas(texture);
    texture.version++;
    mod.noteGlyphAtlas(texture);
    expect(gone).toHaveBeenCalledTimes(1);
    expect(kept).toHaveBeenCalledTimes(2);
  });
});
