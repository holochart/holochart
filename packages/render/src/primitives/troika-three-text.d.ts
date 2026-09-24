/**
 * Minimal type declarations for troika-three-text 0.52 — only the surface the text primitive uses.
 * The package ships `.d.ts` files but does not point to them from `package.json`, so TypeScript
 * cannot find them under `moduleResolution: bundler`.
 *
 * Referenced from `text.ts` and `text-engine.ts` with a triple-slash directive so programs that
 * compile the render sources indirectly (e.g. the examples) see these declarations too. Render
 * source imports troika for types only (`import type`); the runtime module is loaded lazily by
 * `text-engine.ts` (plan E21.5).
 */
declare module 'troika-three-text' {
  import type { Color, Mesh, Texture } from 'three';

  export type TroikaColor = string | number | Color;

  export interface TroikaTextRenderInfo {
    sdfTexture: Texture;
    sdfGlyphSize: number;
    glyphBounds: Float32Array;
    glyphAtlasIndices: Float32Array;
    /** `[minX, minY, maxX, maxY]` of the text block including line boxes. */
    blockBounds: number[];
    /** `[minX, minY, maxX, maxY]` tightly around the visible glyphs. */
    visibleBounds: number[];
    ascender: number;
    descender: number;
    lineHeight: number;
    topBaseline: number;
  }

  /** A mesh rendering one string with SDF glyphs. Layout properties trigger an async `sync()`. */
  export class Text extends Mesh {
    text: string;
    font: string | null;
    fontSize: number;
    fontWeight: number | 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
    lang: string | null;
    letterSpacing: number;
    lineHeight: number | 'normal';
    maxWidth: number;
    overflowWrap: 'normal' | 'break-word';
    whiteSpace: 'normal' | 'nowrap';
    direction: 'auto' | 'ltr' | 'rtl';
    textAlign: 'left' | 'right' | 'center' | 'justify';
    textIndent: number;
    anchorX: number | string;
    anchorY: number | string;
    sdfGlyphSize: number | null;
    unicodeFontsURL: string | null;
    color: TroikaColor | null;
    fillOpacity: number;
    outlineWidth: number | string;
    outlineColor: TroikaColor;
    outlineOpacity: number;
    outlineBlur: number | string;
    outlineOffsetX: number | string;
    outlineOffsetY: number | string;
    depthOffset: number;
    clipRect: [number, number, number, number] | null;
    readonly textRenderInfo: TroikaTextRenderInfo | null;
    /** Typeset asynchronously if any layout property changed; `callback` runs when done. */
    sync(callback?: () => void): void;
    hasOutline(): boolean;
    /** Disposes this instance's geometry (not its material). */
    dispose(): void;
  }

  /**
   * @experimental Renders all added `Text` members in one draw call (plus one for outlines), using
   * a float data texture for per-member matrices and colors. Members are not scene children.
   */
  export class BatchedText extends Text {
    addText(text: Text): void;
    removeText(text: Text): void;
  }

  export interface TroikaTextBuilderConfig {
    defaultFontURL?: string | null;
    unicodeFontsURL?: string | null;
    sdfGlyphSize?: number;
    sdfExponent?: number;
    sdfMargin?: number;
    textureWidth?: number;
    useWorker?: boolean;
  }

  /** Must be called before the first font request; later calls are ignored with a warning. */
  export function configureTextBuilder(config: TroikaTextBuilderConfig): void;

  export function preloadFont(
    options: { font?: string | null; characters?: string | string[]; sdfGlyphSize?: number },
    callback: (info: TroikaTextRenderInfo) => void,
  ): void;
}
