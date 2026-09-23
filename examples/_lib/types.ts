import type { WebGLRenderer } from 'three';

/**
 * Contract for every file under `examples/` (except `_lib/`). One example feeds the dev sandbox,
 * docs embeds, gallery thumbnails, and visual regression tests (plan E19.2, E20.3).
 */
export interface ExampleMeta {
  title: string;
  description: string;
  tags: string[];
  /** Max fraction of differing pixels tolerated by the visual test (default 0.001). */
  testTolerance?: number;
  /** Fixed render size for visual tests, in CSS pixels (default 640×400). */
  size?: { width: number; height: number };
}

export interface ExampleHandle {
  /** Resolves once the example has fully rendered (e.g. async text glyphs are ready). */
  ready?: Promise<void>;
  /** The renderer in use, so the sandbox can show `renderer.info` stats (draw calls, memory). */
  renderer?: WebGLRenderer;
  dispose(): void;
}

export interface ExampleModule {
  meta: ExampleMeta;
  run(el: HTMLElement): ExampleHandle;
}
