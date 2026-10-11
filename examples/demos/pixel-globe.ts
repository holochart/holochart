/// <reference types="@webgpu/types" />
import {
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { geoEquirectangular, geoGraticule10, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryObject, Topology } from 'topojson-specification';
import land from 'world-atlas/land-110m.json';
import { createEffect, type EffectField } from '@mk7s/hologpu';
import dither from '@mk7s/hologpu/effects/dither';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import '../_lib/pixel-globe.css';

export const meta: ExampleMeta = {
  title: 'Small World — an unfinished hologram',
  description:
    'Orbit a translucent monochrome Earth with an unfinished shell, exposed 3D structure and live HoloGPU dithering.',
  tags: ['demo', 'globe', '3d', 'hologpu', 'dither', 'no-visual-test'],
  size: { width: 1100, height: 740 },
};

/** Natural Earth land, rasterized locally; no remote images or network request needed. */
function earthTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const projection = geoEquirectangular()
    .scale(canvas.width / (2 * Math.PI))
    .translate([canvas.width / 2, canvas.height / 2]);
  const path = geoPath(projection, ctx);
  ctx.fillStyle = '#626262';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const topology = land as unknown as Topology<{ land: GeometryObject }>;
  ctx.beginPath();
  path(feature(topology, topology.objects.land));
  ctx.fillStyle = '#bcbcbc';
  ctx.fill();
  ctx.strokeStyle = '#dedede';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  path(geoGraticule10());
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Tiny hull panels and an equatorial seam give the translucent surface a constructed feel.
  let seed = 73;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let y = 100; y < 940; y += 8) {
    for (let x = 0; x < canvas.width; x += 12) {
      ctx.fillStyle = `rgba(255,255,255,${0.03 + random() * 0.14})`;
      ctx.fillRect(x + 1, y + 1, 3 + random() * 8, 1 + random() * 5);
    }
  }
  ctx.fillStyle = '#303030';
  ctx.fillRect(0, canvas.height / 2 - 4, canvas.width, 8);
  ctx.fillStyle = '#bebebe';
  ctx.fillRect(0, canvas.height / 2 - 6, canvas.width, 1);
  ctx.fillRect(0, canvas.height / 2 + 5, canvas.width, 1);
  // Missing shell tiles are real alpha cutouts, anchored on the sphere, not a screen overlay.
  for (let lat = -66; lat < 40; lat += 3) {
    for (let lon = 15; lon < 138; lon += 3) {
      const x = (lon - 76) / 63;
      const y = (lat + 17) / 49;
      const edge = x * x + y * y;
      if (edge < 0.8 || (edge < 1.2 && random() > (edge - 0.8) / 0.4)) {
        ctx.clearRect(
          ((lon + 180) / 360) * canvas.width,
          ((90 - lat - 3) / 180) * canvas.height,
          canvas.width / 120 + 0.5,
          canvas.height / 60 + 0.5,
        );
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function viewPosition(lon: number, lat: number, distance = 3.7): Vector3 {
  const phi = (lat * Math.PI) / 180;
  const theta = (lon * Math.PI) / 180;
  return new Vector3(
    Math.cos(phi) * Math.cos(theta),
    Math.sin(phi),
    -Math.cos(phi) * Math.sin(theta),
  ).multiplyScalar(distance);
}

/** A single outer cage remains visible through the missing hull. */
function skeletonGeometry(): BufferGeometry {
  const vertices: number[] = [];
  const segment = (a: Vector3, b: Vector3) => vertices.push(...a.toArray(), ...b.toArray());
  const radius = 0.98;
  for (let lon = -180; lon < 180; lon += 10) {
    for (let lat = -85; lat < 85; lat += 5) {
      segment(viewPosition(lon, lat, radius), viewPosition(lon, lat + 5, radius));
    }
  }
  for (let lat = -80; lat <= 80; lat += 10) {
    for (let lon = -180; lon < 180; lon += 5) {
      segment(viewPosition(lon, lat, radius), viewPosition(lon + 5, lat, radius));
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  return geometry;
}

export function run(el: HTMLElement): ExampleHandle {
  const host = document.createElement('div');
  host.className = 'pixel-globe';
  host.innerHTML = `
    <header class="pg-header">
      <a class="pg-brand" href="/globe.html" aria-label="Small World home"><span class="pg-mark">◎</span> SMALL WORLD</a>
      <span class="pg-edition">A HOLOGRAPHIC EARTH STUDY <span> / </span> 002</span>
      <span class="pg-live"><i></i> LIVE ORBIT</span>
    </header>
    <div class="pg-body">
      <section class="pg-view" aria-label="Interactive pixel globe">
        <div class="pg-caption"><span>TRANSMISSION / EARTH</span><span>SHELL INCOMPLETE</span></div>
        <div class="pg-viewport" tabindex="0" role="img" aria-label="Rotatable globe. Drag to orbit, scroll or pinch to zoom. Shift and arrow keys rotate.">
          <canvas class="pg-output"></canvas>
        </div>
        <div class="pg-cross pg-cross-top">+</div><div class="pg-cross pg-cross-bottom">+</div>
        <div class="pg-coordinates"><span>LOOKING AT</span><output class="pg-position">24.0° N · 20.0° E</output></div>
        <div class="pg-gesture"><span>↔</span> DRAG TO ORBIT <b>·</b> SCROLL TO ZOOM</div>
      </section>
      <aside class="pg-panel">
        <div class="pg-intro"><span class="pg-kicker">HOLOGRAPHIC RECONSTRUCTION</span><h1>A world<br> in progress<span>.</span></h1><p>A silver shell. An exposed skeleton.<br> Turn it to see what lies beneath.</p></div>
        <div class="pg-controls">
          <div class="pg-section-title"><span>TRANSMISSION SETTINGS</span><span>01—05</span></div>
          <label class="pg-field">Dither pattern<select name="pattern" aria-label="Dither pattern"><option value="bayer">Ordered / Bayer</option><option value="blue-noise">Blue noise</option><option value="palette">Four-color palette</option><option value="crt">CRT / scanlines</option></select></label>
          <label class="pg-field">Pixel size <output data-value="pixel">2 px</output><input name="pixel" aria-label="Pixel size" type="range" min="1" max="4" step="1" value="2"><span class="pg-range-labels"><span>FINE</span><span>CHUNKY</span></span></label>
          <label class="pg-field">Shell opacity <output data-value="opacity">48%</output><input name="opacity" aria-label="Shell opacity" type="range" min="0.15" max="0.9" step="0.01" value="0.48"></label>
          <label class="pg-field">Gray levels <output data-value="levels">8</output><input name="levels" aria-label="Gray levels" type="range" min="2" max="16" step="1" value="8"></label>
          <label class="pg-field">Dither strength <output data-value="amount">55%</output><input name="amount" aria-label="Dither strength" type="range" min="0" max="2" step="0.05" value="0.55"></label>
          <div class="pg-toggles"><label><input name="spin" type="checkbox"> Auto rotate</label><label><input name="effect" type="checkbox" checked> Dithering</label></div>
        </div>
        <div class="pg-views"><span class="pg-kicker">A CHANGE OF SCENERY</span><div><button data-view="atlantic">Atlantic</button><button data-view="pacific">Pacific</button><button data-view="pole">North pole</button></div></div>
        <button class="pg-reset">↺ <span>Reset view & settings</span></button>
      </aside>
    </div>
    <footer class="pg-footer"><span>PARTIAL SHELL / FULL ORBIT</span><span class="pg-status" role="status">Preparing HoloGPU…</span><span>EXPLORE AT YOUR OWN PACE <span class="pg-arrow">↗</span></span></footer>`;
  el.append(host);
  host.dataset.dither = 'false';
  const query = <T extends Element>(selector: string): T => host.querySelector<T>(selector)!;
  const viewport = query<HTMLDivElement>('.pg-viewport');
  const output = query<HTMLCanvasElement>('.pg-output');
  const status = query<HTMLElement>('.pg-status');
  const position = query<HTMLOutputElement>('.pg-position');
  const pattern = query<HTMLSelectElement>('[name=pattern]');
  const pixel = query<HTMLInputElement>('[name=pixel]');
  const levels = query<HTMLInputElement>('[name=levels]');
  const amount = query<HTMLInputElement>('[name=amount]');
  const opacity = query<HTMLInputElement>('[name=opacity]');
  const spin = query<HTMLInputElement>('[name=spin]');
  const effect = query<HTMLInputElement>('[name=effect]');
  const events = new AbortController();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false;
  let field: EffectField<typeof dither.params> | undefined;
  let removeBeforeFrame: (() => void) | undefined;
  let fallbackFrame = 0;
  let lastTime = performance.now();

  // Preserve the WebGL buffer for WebGPU's live canvas input, including asynchronous uploads.
  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.domElement.className = 'pg-source';
  viewport.append(renderer.domElement);
  const scene = new Scene();
  const camera = new PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.copy(viewPosition(20, 24));
  const controls = new OrbitControls(camera, viewport);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.65;
  controls.minDistance = 2.35;
  controls.maxDistance = 7;
  controls.autoRotateSpeed = 0.45;
  controls.listenToKeyEvents(viewport);
  spin.checked = !motion.matches;
  controls.autoRotate = spin.checked;

  const texture = earthTexture();
  const geometry = new SphereGeometry(1, 96, 64);
  const material = new MeshStandardMaterial({
    map: texture,
    roughness: 1,
    transparent: true,
    opacity: +opacity.value,
    side: DoubleSide,
    depthWrite: false,
    alphaTest: 0.08,
    emissive: '#ffffff',
    emissiveIntensity: 0.08,
  });
  scene.add(new Mesh(geometry, material));
  const skeleton = skeletonGeometry();
  const skeletonMaterial = new LineBasicMaterial({
    color: '#d6d6d6',
    transparent: true,
    opacity: 0.27,
    depthWrite: false,
  });
  const cage = new LineSegments(skeleton, skeletonMaterial);
  cage.renderOrder = -1;
  scene.add(cage);
  scene.add(new AmbientLight('#ffffff', 0.85));
  const light = new DirectionalLight('#ffffff', 1.8);
  light.position.set(-3, 5, 4);
  // Camera-relative lighting keeps the terminator visible from every continent.
  camera.add(light);
  scene.add(camera);

  const starsGeometry = new BufferGeometry();
  const stars: number[] = [];
  let seed = 37;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 260; i++) {
    const direction = new Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
    stars.push(...direction.multiplyScalar(20 + random() * 15).toArray());
  }
  starsGeometry.setAttribute('position', new Float32BufferAttribute(stars, 3));
  const starsMaterial = new PointsMaterial({
    color: '#777777',
    size: 0.045,
    sizeAttenuation: true,
  });
  scene.add(new Points(starsGeometry, starsMaterial));

  const resize = () => {
    const width = Math.max(1, viewport.clientWidth);
    const height = Math.max(1, viewport.clientHeight);
    renderer.setSize(
      Math.max(1, Math.round(width / +pixel.value)),
      Math.max(1, Math.round(height / +pixel.value)),
      false,
    );
    camera.aspect = width / height;
    // Preserve the full silhouette when the viewport is narrower than it is tall.
    const framing = Math.min(1, camera.aspect * 0.92);
    camera.fov = (2 * Math.atan(Math.tan((18 * Math.PI) / 180) / framing) * 180) / Math.PI;
    camera.updateProjectionMatrix();
    field?.invalidate();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  resize();

  const draw = () => {
    if (disposed) return;
    const now = performance.now();
    const delta = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    controls.update(delta);
    renderer.render(scene, camera);
    field?.invalidate();
    const direction = camera.position.clone().normalize();
    const lat = Math.round(((Math.asin(direction.y) * 180) / Math.PI) * 10) / 10;
    const lon = Math.round(((Math.atan2(-direction.z, direction.x) * 180) / Math.PI) * 10) / 10;
    position.value = `${Math.abs(lat).toFixed(1)}° ${lat < 0 ? 'S' : 'N'} · ${Math.abs(lon).toFixed(1)}° ${lon < 0 ? 'W' : 'E'}`;
  };
  const fallbackLoop = () => {
    draw();
    if (!disposed) fallbackFrame = requestAnimationFrame(fallbackLoop);
  };
  draw();

  const sync = () => {
    controls.autoRotate = spin.checked;
    material.opacity = +opacity.value;
    host.dataset.dither = String(effect.checked && !!field);
    query<HTMLOutputElement>('[data-value=pixel]').value = `${pixel.value} px`;
    query<HTMLOutputElement>('[data-value=levels]').value = levels.value;
    query<HTMLOutputElement>('[data-value=amount]').value = `${Math.round(+amount.value * 100)}%`;
    query<HTMLOutputElement>('[data-value=opacity]').value = `${Math.round(+opacity.value * 100)}%`;
    if (field) {
      field.params.mode = pattern.value;
      field.params.levels = +levels.value;
      field.params.amount = +amount.value;
      field.setResolutionScale(1 / +pixel.value);
      status.textContent = effect.checked
        ? 'HOLOGPU / WEBGPU DITHER'
        : 'DITHER OFF / TRANSLUCENT SHELL';
    }
    resize();
  };
  host.addEventListener('input', sync, { signal: events.signal });
  controls.addEventListener('start', () => {
    spin.checked = false;
    controls.autoRotate = false;
  });
  motion.addEventListener(
    'change',
    () => {
      if (motion.matches) {
        spin.checked = false;
        controls.autoRotate = false;
      }
    },
    { signal: events.signal },
  );
  const views: Record<string, [number, number]> = {
    atlantic: [-30, 20],
    pacific: [-155, 20],
    pole: [0, 85],
  };
  host.addEventListener(
    'click',
    (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button');
      if (!button) return;
      // Drain gesture inertia before jumping to an exact preset camera position.
      controls.autoRotate = false;
      controls.enableDamping = false;
      controls.update();
      controls.reset();
      if (button.dataset.view) {
        const view = views[button.dataset.view]!;
        camera.position.copy(viewPosition(...view));
        spin.checked = false;
      } else if (button.classList.contains('pg-reset')) {
        camera.position.copy(viewPosition(20, 24));
        pattern.value = 'bayer';
        pixel.value = '2';
        levels.value = '8';
        amount.value = '0.55';
        opacity.value = '0.48';
        spin.checked = !motion.matches;
        effect.checked = !!field;
      }
      controls.update();
      controls.enableDamping = true;
      sync();
    },
    { signal: events.signal },
  );

  const ready = (async () => {
    try {
      const created = await createEffect(output, dither, {
        playing: true,
        dprCap: 1,
        resolutionScale: 1 / +pixel.value,
        params: {
          mode: 'bayer',
          levels: 8,
          amount: 0.55,
          paletteGradient: [
            { offset: 0, color: '#080808' },
            { offset: 1 / 3, color: '#4a4a4a' },
            { offset: 2 / 3, color: '#969696' },
            { offset: 1, color: '#e8e8e8' },
          ],
        },
      });
      if (disposed) {
        created.destroy();
        return;
      }
      field = created;
      await field.bindInput('image', { kind: 'canvas', source: renderer.domElement });
      if (disposed) return;
      // One shared HoloGPU scheduler drives both renderers, source before filter upload.
      removeBeforeFrame = field.onBeforeFrame(draw);
      // Dither is stateless: keep canvas uploads running even with reduced motion.
      field.polling = true;
      sync();
      field.invalidate();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    } catch (error) {
      if (disposed) return;
      field?.destroy();
      field = undefined;
      console.warn('Pixel globe: HoloGPU unavailable', error);
      host.dataset.dither = 'false';
      status.textContent = 'WEBGPU UNAVAILABLE / PIXEL PREVIEW';
      effect.checked = false;
      effect.disabled = true;
      pattern.disabled = true;
      levels.disabled = true;
      amount.disabled = true;
      fallbackLoop();
    }
  })();

  return {
    renderer,
    ready,
    dispose() {
      disposed = true;
      events.abort();
      observer.disconnect();
      cancelAnimationFrame(fallbackFrame);
      removeBeforeFrame?.();
      field?.destroy();
      controls.dispose();
      texture.dispose();
      geometry.dispose();
      material.dispose();
      skeleton.dispose();
      skeletonMaterial.dispose();
      starsGeometry.dispose();
      starsMaterial.dispose();
      renderer.dispose();
      host.remove();
    },
  };
}
