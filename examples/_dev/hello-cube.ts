import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Smoke test for the sandbox and the visual regression pipeline: a raw three.js lit cube with a
 * fixed pose (no animation, no text, no randomness), rendered once.
 */
export const meta: ExampleMeta = {
  title: 'Hello cube',
  description: 'A lit three.js cube rendered once. Proves the sandbox and visual-test pipeline.',
  tags: ['dev', 'smoke'],
  size: { width: 640, height: 400 },
};

export function run(el: HTMLElement): ExampleHandle {
  const width = Math.max(1, el.clientWidth);
  const height = Math.max(1, el.clientHeight);

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.setClearColor(new Color('#f4f5f7'), 1);
  el.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, width / height, 0.1, 100);
  camera.position.set(3.2, 2.4, 4.2);
  camera.lookAt(0, 0, 0);

  const geometry = new BoxGeometry(1.6, 1.6, 1.6);
  const material = new MeshStandardMaterial({ color: '#3b82f6', roughness: 0.55, metalness: 0.1 });
  const cube = new Mesh(geometry, material);
  cube.rotation.set(0.35, 0.6, 0);
  scene.add(cube);

  scene.add(new AmbientLight('#ffffff', 0.6));
  const key = new DirectionalLight('#ffffff', 2.2);
  key.position.set(4, 6, 5);
  scene.add(key);
  const fill = new DirectionalLight('#ffe8cc', 0.6);
  fill.position.set(-5, -2, -3);
  scene.add(fill);

  renderer.render(scene, camera);

  return {
    renderer,
    ready: Promise.resolve(),
    dispose() {
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
