import { createMarkers, createRenderRoot, type Colorscale } from '@mk7s/holochart-render';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Manual perf check for E2.4 (target: 1M markers ≥ 50 fps while panning). Panning only changes
 * transform uniforms; no buffer is re-uploaded. Toggle "Pan" to enter continuous rendering.
 */
export const meta: ExampleMeta = {
  title: '1M markers pan benchmark',
  description: 'One million instanced markers with a pan animation toggle and an FPS readout.',
  tags: ['perf', 'no-visual-test', 'dev', 'markers'],
};

const COUNT = 1_000_000;
const COLORSCALE: Colorscale = [
  [0, [0.05, 0.03, 0.53, 1]],
  [0.5, [0.8, 0.28, 0.47, 1]],
  [1, [0.94, 0.98, 0.13, 1]],
];

export function run(el: HTMLElement): ExampleHandle {
  el.style.position ||= 'relative';
  const root = createRenderRoot(el, { background: [1, 1, 1, 1] });
  const viewport = root.addViewport();

  const random = rng(7);
  const normal = gaussian(random);
  const x = new Float64Array(COUNT);
  const y = new Float64Array(COUNT);
  const value = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    x[i] = normal();
    y[i] = normal();
    value[i] = random();
  }
  const markers = createMarkers(root.context, {
    x,
    y,
    colorValues: value,
    colorscale: COLORSCALE,
    size: 2.5,
    opacity: 0.6,
  });
  viewport.add(markers);

  // Controls (DOM overlay).
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:absolute;top:8px;left:8px;padding:6px 8px;background:rgba(255,255,255,.85);' +
    'font:12px system-ui,sans-serif;border-radius:4px;display:flex;gap:8px;align-items:center';
  const button = document.createElement('button');
  button.textContent = 'Pan';
  const fps = document.createElement('span');
  fps.textContent = '– fps';
  panel.append(button, fps);
  el.appendChild(panel);

  let phase = 0;
  const transform = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
  const applyTransform = (): void => {
    const { width, height } = root.size;
    const s = Math.min(width, height) / 8;
    transform.scaleX = s;
    transform.scaleY = s;
    transform.offsetX = width / 2 + Math.sin(phase) * width * 0.2;
    transform.offsetY = height / 2 + Math.cos(phase * 0.7) * height * 0.1;
    markers.setTransform(transform);
  };
  const layout = (): void => {
    viewport.setRect({ x: 0, y: 0, width: root.size.width, height: root.size.height });
    applyTransform();
  };

  let release: (() => void) | null = null;
  const offBefore = root.on('beforerender', (info) => {
    if (!release) return;
    phase += info.delta / 1000;
    applyTransform();
  });
  let frames = 0;
  let windowStart = performance.now();
  const offAfter = root.on('afterrender', () => {
    frames++;
    const now = performance.now();
    if (now - windowStart >= 500) {
      fps.textContent = `${((frames * 1000) / (now - windowStart)).toFixed(0)} fps · ${root.renderer.info.render.calls} draw calls`;
      frames = 0;
      windowStart = now;
    }
  });
  const onClick = (): void => {
    if (release) {
      release();
      release = null;
      button.textContent = 'Pan';
    } else {
      frames = 0;
      windowStart = performance.now();
      release = root.requestAnimation();
      button.textContent = 'Stop';
    }
  };
  button.addEventListener('click', onClick);
  const offResize = root.on('resize', layout);
  layout();
  root.renderNow();

  return {
    renderer: root.renderer,
    ready: Promise.resolve(),
    dispose() {
      release?.();
      button.removeEventListener('click', onClick);
      offBefore();
      offAfter();
      offResize();
      panel.remove();
      root.destroy();
    },
  };
}
