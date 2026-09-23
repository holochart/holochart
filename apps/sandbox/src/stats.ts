import type { WebGLRenderer } from 'three';

export interface StatsOverlay {
  /** Point the overlay at a renderer (or `undefined` when the example exposes none). */
  setRenderer(renderer: WebGLRenderer | undefined): void;
  dispose(): void;
}

const SAMPLE_MS = 500;

/**
 * FPS + `renderer.info` overlay. "FPS" is the page's animation-frame rate; "renders/s" counts
 * actual `renderer.render()` calls, which is 0 while an on-demand chart is idle (ADR-007).
 * Draw calls / triangles are those of the most recent render (`info.autoReset`).
 */
export function createStatsOverlay(parent: HTMLElement): StatsOverlay {
  const el = document.createElement('pre');
  el.className = 'stats';
  parent.appendChild(el);

  let renderer: WebGLRenderer | undefined;
  let raf = 0;
  let frames = 0;
  let windowStart = performance.now();
  let lastRenderCount = 0;

  const tick = (now: number): void => {
    frames++;
    const elapsed = now - windowStart;
    if (elapsed >= SAMPLE_MS) {
      const fps = (frames * 1000) / elapsed;
      const lines = [`FPS         ${fps.toFixed(0)}`];
      if (renderer) {
        const { render, memory, programs } = renderer.info;
        const renders = ((render.frame - lastRenderCount) * 1000) / elapsed;
        lastRenderCount = render.frame;
        lines.push(
          `renders/s   ${renders.toFixed(0)}`,
          `draw calls  ${render.calls}`,
          `triangles   ${render.triangles}`,
          `points      ${render.points}`,
          `lines       ${render.lines}`,
          `geometries  ${memory.geometries}`,
          `textures    ${memory.textures}`,
          `programs    ${programs?.length ?? 0}`,
          `pixel ratio ${renderer.getPixelRatio()}`,
        );
      } else {
        lines.push('(example exposes no renderer)');
      }
      el.textContent = lines.join('\n');
      frames = 0;
      windowStart = now;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    setRenderer(next) {
      renderer = next;
      lastRenderCount = next?.info.render.frame ?? 0;
    },
    dispose() {
      cancelAnimationFrame(raf);
      el.remove();
    },
  };
}
