import fc from 'fast-check';
import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  ShadowMaterial,
  Texture,
  type WebGLRenderer,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Vec3 } from '../precision.ts';
import {
  clipToView,
  computeViewLights,
  createLightRig,
  DEFAULT_LIGHTING,
  PLOTLY_LIGHTING,
  PLOTLY_LIGHTPOSITION,
  resolveMeshLighting,
  shininessFromRoughness,
} from './lighting.ts';
import { cookTorrance, plotlyLitColor } from './lighting-model.ts';

function camera(): PerspectiveCamera {
  const c = new PerspectiveCamera(45, 1.5, 0.1, 100);
  c.position.set(0, 0, 5);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
}

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};

describe('Plotly lighting parameters', () => {
  it('has Plotly defaults', () => {
    expect(PLOTLY_LIGHTING).toEqual({
      ambient: 0.8,
      diffuse: 0.8,
      specular: 0.05,
      roughness: 0.5,
      fresnel: 0.2,
      facenormalsepsilon: 1e-6,
      vertexnormalsepsilon: 1e-12,
    });
    expect(PLOTLY_LIGHTPOSITION).toEqual([1e5, 1e5, 0]);
  });

  it('fills missing and non-finite values and clamps to Plotly ranges', () => {
    const l = resolveMeshLighting({ ambient: 2, specular: 3, fresnel: -1, roughness: NaN });
    expect(l).toMatchObject({ ambient: 1, specular: 2, fresnel: 0, roughness: 0.5, diffuse: 0.8 });
    expect(resolveMeshLighting(null)).toEqual(PLOTLY_LIGHTING);
  });

  it('maps roughness to a Phong shininess (narrower highlight when smoother)', () => {
    expect(shininessFromRoughness(0.5)).toBe(6);
    expect(shininessFromRoughness(0.1)).toBeGreaterThan(shininessFromRoughness(0.5));
  });
});

describe('plotlyLitColor (CPU mirror of the shader)', () => {
  const rgb: Vec3 = [0.5, 0.25, 1];
  const N: Vec3 = [0, 0, 1];
  const V: Vec3 = [0, 0, 1];

  it('ambient only when the light is behind the surface; diffuse clamps at 1', () => {
    const back = plotlyLitColor(rgb, N, [0, 0, -1], V, { ...PLOTLY_LIGHTING, specular: 0 });
    expect(back).toEqual([0.4, 0.2, 0.8]);
    const front = plotlyLitColor(rgb, N, [0, 0, 1], V, { ...PLOTLY_LIGHTING, specular: 0 });
    // 0.8 + 0.8 · 1 clamps to 1: the color itself.
    expect(front).toEqual(rgb);
  });

  it('each parameter moves the result the right way', () => {
    const L = norm([1, 0, 1]);
    // Not head-on: Plotly's fresnel factor pow(1 - V·N, fresnel) is 0 when V = N.
    const V2 = norm([-0.5, 0, 1]);
    const base = plotlyLitColor(rgb, N, L, V2, PLOTLY_LIGHTING)[0];
    const lower = (key: keyof typeof PLOTLY_LIGHTING, value: number) =>
      plotlyLitColor(rgb, N, L, V2, { ...PLOTLY_LIGHTING, [key]: value })[0];
    expect(lower('ambient', 0)).toBeLessThan(base);
    expect(lower('diffuse', 0)).toBeLessThan(base);
    expect(lower('specular', 0)).toBeLessThan(base);
    expect(lower('specular', 2)).toBeGreaterThan(base);
  });

  it('specular peaks at the mirror direction and roughness widens it', () => {
    const L: Vec3 = norm([1, 0, 1]);
    const mirror: Vec3 = norm([-1, 0, 1]);
    const off: Vec3 = norm([-1, 0.6, 1]);
    const sharp = (v: Vec3) => cookTorrance(L, v, N, 0.2, 0.2);
    expect(sharp(mirror)).toBeGreaterThan(sharp(off));
    // Relative falloff away from the peak is smaller for a rougher surface.
    const rough = (v: Vec3) => cookTorrance(L, v, N, 0.8, 0.2);
    expect(rough(off) / rough(mirror)).toBeGreaterThan(sharp(off) / sharp(mirror));
  });

  it('fresnel strengthens grazing highlights less as it grows (pow(1 - V·N, fresnel))', () => {
    const L: Vec3 = norm([1, 0, 0.3]);
    const V2: Vec3 = norm([-1, 0, 0.3]);
    expect(cookTorrance(L, V2, N, 0.5, 0)).toBeGreaterThan(cookTorrance(L, V2, N, 0.5, 5));
  });

  it('property: the lit color stays in [0, 1 + specular]', () => {
    const unit = fc
      .tuple(
        fc.float({ min: -1, max: 1, noNaN: true }),
        fc.float({ min: -1, max: 1, noNaN: true }),
        fc.float({ min: -1, max: 1, noNaN: true }),
      )
      .filter((v) => Math.hypot(...v) > 0.1)
      .map((v) => norm(v as Vec3));
    fc.assert(
      fc.property(unit, unit, fc.float({ min: 0, max: 2, noNaN: true }), (L, n, specular) => {
        const out = plotlyLitColor([1, 1, 1], n, L, [0, 0, 1], { ...PLOTLY_LIGHTING, specular });
        for (const c of out) {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(1 + specular + 1e-9);
        }
      }),
    );
  });
});

describe('light positions', () => {
  it("un-projects Plotly's default lightposition to the upper right of the view", () => {
    const c = camera();
    const [x, y, z, w] = clipToView(PLOTLY_LIGHTPOSITION, c.projectionMatrixInverse.elements);
    expect(w).toBe(1);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
    // Far away sideways, in front of the camera plane: the direction is nearly lateral.
    expect(Math.abs(z) / Math.hypot(x, y)).toBeLessThan(1e-3);
    // Aspect 1.5: the screen corner is wider than tall.
    expect(x / y).toBeCloseTo(1.5, 3);
  });

  it('un-projects through orthographic cameras too', () => {
    const o = new OrthographicCamera(-2, 2, 1, -1, 0.1, 10);
    o.updateProjectionMatrix();
    const [x, y, , w] = clipToView([1, 1, 0], o.projectionMatrixInverse.elements);
    expect([x, y, w]).toEqual([2, 1, 1]);
  });

  it('computeViewLights: Plotly default = one white light at lightposition + white ambient', () => {
    const c = camera();
    const view = computeViewLights(null, PLOTLY_LIGHTPOSITION, PLOTLY_LIGHTING, c);
    expect(view.count).toBe(1);
    expect([...view.color]).toEqual([1, 1, 1]);
    expect(view.ambient).toEqual([0.8, 0.8, 0.8]);
    expect(view.position[3]).toBe(1);
  });

  it('computeViewLights: a rig scales ambient by the trace ambient and rotates scene lights', () => {
    const c = camera();
    // Camera on +z looking at the origin: scene +x is view +x.
    const view = computeViewLights(
      {
        ambient: { color: [1, 0.5, 0, 1], intensity: 0.5 },
        directional: [
          { position: [10, 0, 0], color: [0, 1, 0, 1], intensity: 2 },
          { position: [0, 1, 0], space: 'camera' },
        ],
        hemisphere: { skyColor: [0, 0, 1, 1], intensity: 1 },
      },
      PLOTLY_LIGHTPOSITION,
      { ...PLOTLY_LIGHTING, ambient: 0.5 },
      c,
    );
    expect(view.count).toBe(2);
    expect([...view.position]).toEqual([1, 0, 0, 0, 0, 1, 0, 0]);
    expect([...view.color]).toEqual([0, 2, 0, 1, 1, 1]);
    expect(view.ambient).toEqual([0.25, 0.125, 0]);
    expect(view.hemiSky).toEqual([0, 0, 0.5]);
    // Scene z-up seen from +z: view +z.
    expect(view.hemiUp.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0, 1]);
  });
});

describe('LightRig', () => {
  it('builds three.js lights with Plotly-unit intensities (× π)', () => {
    const rig = createLightRig({
      ambient: { intensity: 0.5 },
      directional: [{ position: [1, 2, 3], intensity: 1, castShadow: true }],
      hemisphere: { skyColor: [1, 1, 1, 1], intensity: 0.25 },
      shadows: { ground: true, extent: 3 },
    });
    const children = rig.object.children;
    const ambient = children.find((o) => o instanceof AmbientLight) as AmbientLight;
    const sun = children.find((o) => o instanceof DirectionalLight) as DirectionalLight;
    const hemi = children.find((o) => o instanceof HemisphereLight) as HemisphereLight;
    expect(ambient.intensity).toBeCloseTo(0.5 * Math.PI);
    expect(hemi.intensity).toBeCloseTo(0.25 * Math.PI);
    expect(sun.castShadow).toBe(true);
    expect(sun.shadow.camera.right).toBe(3);
    rig.object.updateMatrixWorld();
    const dir = sun.position.clone().normalize();
    expect(dir.x).toBeCloseTo(1 / Math.sqrt(14));
    // The ground plane catches shadows 3 units below the center (z-up).
    const ground = children.find(
      (o) => o instanceof Mesh && o.material instanceof ShadowMaterial,
    ) as Mesh;
    expect(ground.receiveShadow).toBe(true);
    expect(ground.position.z).toBe(-3);
    rig.update({ directional: [] });
    expect(rig.object.children.some((o) => o instanceof DirectionalLight)).toBe(false);
    expect(rig.object.children.some((o) => o instanceof AmbientLight)).toBe(false);
    rig.dispose();
  });

  it('moves clip- and camera-space lights with the camera before a frame', () => {
    const rig = createLightRig(DEFAULT_LIGHTING);
    const c = camera();
    rig.setCamera(c);
    const scene = new Scene();
    scene.add(rig.object);
    scene.updateMatrixWorld();
    const sun = rig.object.children.find((o) => o instanceof DirectionalLight)!;
    const before = sun.position.clone().normalize();
    // Upper right of the screen, seen from +z.
    expect(before.x).toBeGreaterThan(0.5);
    expect(before.y).toBeGreaterThan(0.3);
    c.position.set(0, 0, -5);
    c.lookAt(0, 0, 0);
    scene.updateMatrixWorld();
    // Seen from −z, screen right is scene −x.
    expect(sun.position.x).toBeLessThan(0);
    rig.dispose();
  });

  it('attach: enables shadow maps and sets texture environments', () => {
    const renderer = { shadowMap: { enabled: false } } as unknown as WebGLRenderer;
    const scene = new Scene();
    const env = new Texture();
    const rig = createLightRig({
      directional: [{ castShadow: true }],
      environment: env,
      environmentIntensity: 0.5,
    });
    rig.attach(renderer, scene);
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(scene.environment).toBe(env);
    expect(scene.environmentIntensity).toBe(0.5);
    rig.dispose();
  });

  it('restore: leaves environments that three.js uploads again by itself', () => {
    const renderer = { shadowMap: { enabled: false } } as unknown as WebGLRenderer;
    const scene = new Scene();
    const env = new Texture();
    const dispose = vi.spyOn(env, 'dispose');
    const rig = createLightRig({ environment: env });
    // Not attached: nothing to restore.
    rig.restore();
    rig.attach(renderer, scene);
    rig.restore();
    expect(scene.environment).toBe(env);
    expect(dispose).not.toHaveBeenCalled();
    rig.dispose();
  });
});
