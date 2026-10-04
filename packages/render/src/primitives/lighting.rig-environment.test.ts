import {
  DirectionalLight,
  EquirectangularReflectionMapping,
  Mesh,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  type PlaneGeometry,
  type WebGLRenderer,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLightRig, type LightingSpec, type LightRig } from './lighting.ts';

/**
 * The light rig of `scene.lighting` (plan E8.7): the shadow-catching ground plane, how an attached
 * renderer and scene follow later specs, and environments loaded from an image URL.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

function fakeRenderer(): WebGLRenderer {
  return { shadowMap: { enabled: false } } as unknown as WebGLRenderer;
}

function groundOf(rig: LightRig): Mesh<PlaneGeometry, ShadowMaterial> | undefined {
  return rig.object.children.find(
    (o) => o instanceof Mesh && o.material instanceof ShadowMaterial,
  ) as Mesh<PlaneGeometry, ShadowMaterial> | undefined;
}

function sunOf(rig: LightRig): DirectionalLight {
  return rig.object.children.find((o) => o instanceof DirectionalLight) as DirectionalLight;
}

/**
 * Stand in for image loading: every `TextureLoader.load` returns a texture and records its URL
 * and the callback that reports the image as loaded.
 */
function fakeImageLoading() {
  const requests: { url: string; texture: Texture; finish(): void }[] = [];
  vi.spyOn(TextureLoader.prototype, 'load').mockImplementation((url, onLoad) => {
    const texture = new Texture();
    requests.push({ url, texture, finish: () => onLoad?.(texture as never) });
    return texture as never;
  });
  return requests;
}

describe('LightRig ground plane', () => {
  it('sits at the given offset along `up`, faces up, and goes away when switched off', () => {
    const rig = createLightRig({
      directional: [{ castShadow: true }],
      shadows: { ground: -1.5, up: [0, 2, 0], extent: 3, opacity: 0.6, mapSize: 512 },
    });
    const ground = groundOf(rig)!;
    expect(ground.receiveShadow).toBe(true);
    expect(ground.material.opacity).toBe(0.6);
    // 1.5 below the center along the (normalized) up direction.
    expect(ground.position.x).toBeCloseTo(0, 12);
    expect(ground.position.y).toBeCloseTo(-1.5, 12);
    expect(ground.position.z).toBeCloseTo(0, 12);
    // The plane's normal (+z of a PlaneGeometry) points up.
    const normal = new Vector3(0, 0, 1).applyQuaternion(ground.quaternion);
    expect(normal.x).toBeCloseTo(0, 12);
    expect(normal.y).toBeCloseTo(1, 12);
    expect(normal.z).toBeCloseTo(0, 12);
    // The shadow map covers the shadowed region (half-size `extent`) at the requested size.
    const sun = sunOf(rig);
    expect(sun.shadow.mapSize.toArray()).toEqual([512, 512]);
    const frustum = sun.shadow.camera;
    expect([frustum.left, frustum.right, frustum.bottom, frustum.top]).toEqual([-3, 3, -3, 3]);

    rig.update({ directional: [{ castShadow: true }], shadows: { ground: false } });
    expect(groundOf(rig)).toBeUndefined();
    // Defaults: a 1024 px map over a region of half-size 2.
    expect(sunOf(rig).shadow.mapSize.toArray()).toEqual([1024, 1024]);
    expect(sunOf(rig).shadow.camera.right).toBe(2);

    rig.update({ shadows: { ground: true } });
    // The same plane again: 2 (the default extent) below the center of a z-up scene.
    expect(groundOf(rig)).toBe(ground);
    expect(ground.position.distanceTo(new Vector3(0, 0, -2))).toBe(0);
    expect(ground.material.opacity).toBe(0.3);
    rig.dispose();
  });

  it('dispose frees the plane and empties the rig', () => {
    const rig = createLightRig({ ambient: {}, directional: [{}], shadows: { ground: true } });
    const scene = new Scene();
    scene.add(rig.object);
    const ground = groundOf(rig)!;
    const geometry = vi.fn<() => void>();
    const material = vi.fn<() => void>();
    ground.geometry.addEventListener('dispose', geometry);
    ground.material.addEventListener('dispose', material);
    rig.dispose();
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    expect(rig.object.children).toHaveLength(0);
    expect(scene.children).toHaveLength(0);
  });
});

describe('LightRig light placement', () => {
  it('a light given at the center of the scene still shines from somewhere', () => {
    const rig = createLightRig({ directional: [{ position: [0, 0, 0] }] });
    rig.object.updateMatrixWorld();
    const p = sunOf(rig).position;
    expect(p.toArray().every(Number.isFinite)).toBe(true);
    // A directional light at its own target (the center) would have no direction.
    expect(p.length()).toBeGreaterThan(0);
    rig.dispose();
  });
});

describe('LightRig attached to a renderer', () => {
  it('a later spec updates shadow maps, the environment and its intensity', () => {
    const renderer = fakeRenderer();
    const scene = new Scene();
    const rig = createLightRig({ directional: [{}] });
    rig.attach(renderer, scene);
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(scene.environment).toBeNull();
    expect(scene.environmentIntensity).toBe(1);

    const env = new Texture();
    const spec: LightingSpec = {
      directional: [{ castShadow: true }],
      environment: env,
      environmentIntensity: 0.25,
    };
    rig.update(spec);
    expect(rig.spec).toBe(spec);
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(scene.environment).toBe(env);
    expect(scene.environmentIntensity).toBe(0.25);

    // Another texture replaces it; the caller's texture is not the rig's to dispose.
    const disposed = vi.fn<() => void>();
    env.addEventListener('dispose', disposed);
    const other = new Texture();
    rig.update({ environment: other });
    expect(scene.environment).toBe(other);
    expect(scene.environmentIntensity).toBe(1);
    expect(disposed).not.toHaveBeenCalled();
    rig.dispose();
  });

  it('loads an environment from an image URL and requests a frame once it has arrived', () => {
    const requests = fakeImageLoading();
    const renderer = fakeRenderer();
    const scene = new Scene();
    const invalidate = vi.fn<() => void>();
    const rig = createLightRig({ environment: 'room.jpg' });
    // Nothing is loaded before there is a scene to light.
    expect(requests).toHaveLength(0);
    expect(rig.environment).toBeNull();

    rig.attach(renderer, scene, invalidate);
    expect(requests.map((r) => r.url)).toEqual(['room.jpg']);
    const first = requests[0]!;
    expect(scene.environment).toBe(first.texture);
    expect(rig.environment).toBe(first.texture);
    // An equirectangular sRGB image.
    expect(first.texture.mapping).toBe(EquirectangularReflectionMapping);
    expect(first.texture.colorSpace).toBe(SRGBColorSpace);
    expect(invalidate).not.toHaveBeenCalled();
    first.finish();
    expect(invalidate).toHaveBeenCalledTimes(1);

    // After a context loss three.js uploads the image again by itself: nothing to reload.
    rig.restore();
    expect(requests).toHaveLength(1);
    expect(scene.environment).toBe(first.texture);

    // Another image: the first texture is the rig's own, and freed.
    const freed = vi.fn<() => void>();
    first.texture.addEventListener('dispose', freed);
    rig.update({ environment: 'city.jpg' });
    expect(requests.map((r) => r.url)).toEqual(['room.jpg', 'city.jpg']);
    expect(freed).toHaveBeenCalledTimes(1);
    expect(scene.environment).toBe(requests[1]!.texture);

    // No environment any more: the scene loses it and the texture is freed.
    const freedSecond = vi.fn<() => void>();
    requests[1]!.texture.addEventListener('dispose', freedSecond);
    rig.update({ environment: '' });
    expect(requests).toHaveLength(2);
    expect(scene.environment).toBeNull();
    expect(rig.environment).toBeNull();
    expect(freedSecond).toHaveBeenCalledTimes(1);
    rig.dispose();
  });

  it('dispose takes a loaded environment off the scene and frees it', () => {
    const requests = fakeImageLoading();
    const scene = new Scene();
    const rig = createLightRig({ environment: 'room.jpg' });
    // No `invalidate` callback: the image arriving is then nobody's business.
    rig.attach(fakeRenderer(), scene);
    const { texture, finish } = requests[0]!;
    finish();
    const freed = vi.fn<() => void>();
    texture.addEventListener('dispose', freed);
    rig.dispose();
    expect(scene.environment).toBeNull();
    expect(freed).toHaveBeenCalledTimes(1);
  });
});
