import { describe, expect, it } from 'vitest';
import { DEFAULT_FONT_FILES } from './default-font-files.ts';
import * as script from './default-font-files.script.ts';

/** A `Document` stand-in with a current script and script tags. */
function fakeDocument(current: string | null, tags: string[] = []): Document {
  return {
    currentScript: current === null ? null : { src: current },
    getElementsByTagName: () => tags.map((src) => ({ src })),
  } as unknown as Document;
}

describe('built-in default font files (E2.18)', () => {
  it('lists the same four faces for ESM and for the IIFE script', () => {
    const faces = (files: typeof DEFAULT_FONT_FILES) =>
      files.map((f) => `${f.file} ${f.weight} ${f.style}`);
    expect(faces(DEFAULT_FONT_FILES)).toEqual([
      'texgyreheros-regular.otf 400 normal',
      'texgyreheros-bold.otf 700 normal',
      'texgyreheros-italic.otf 400 italic',
      'texgyreheros-bolditalic.otf 700 italic',
    ]);
    expect(faces(script.DEFAULT_FONT_FILES)).toEqual(faces(DEFAULT_FONT_FILES));
  });

  it('ESM faces resolve to data: URLs of OpenType CFF files from their own chunks', async () => {
    const bold = await DEFAULT_FONT_FILES[1]!.load();
    // 'OTTO' (the OpenType CFF signature) in base64.
    expect(bold.startsWith('data:font/otf;base64,T1RUTw')).toBe(true);
  });

  it('the IIFE resolves the files next to its own script', () => {
    const src = 'https://cdn.example/holochart@1/dist/holochart.iife.min.js';
    expect(script.findScriptURL(fakeDocument(src))).toBe(src);
    expect(script.scriptFontURL('texgyreheros-bold.otf', src)).toBe(
      'https://cdn.example/holochart@1/dist/fonts/texgyreheros-bold.otf',
    );
  });

  it('finds the Holochart script tag when not evaluated as the current script', () => {
    const tags = ['https://a.example/app.js', 'https://cdn.example/x/holochart.iife.min.js?v=2'];
    expect(script.findScriptURL(fakeDocument(null, tags))).toBe(tags[1]);
    expect(script.findScriptURL(fakeDocument(null, ['https://a.example/app.js']))).toBeUndefined();
    expect(script.findScriptURL(undefined)).toBeUndefined();
    // Nothing to resolve against (no document in node): a relative URL.
    expect(script.scriptFontURL('f.otf', undefined)).toBe('fonts/f.otf');
  });
});
