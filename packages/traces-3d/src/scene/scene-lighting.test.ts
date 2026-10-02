import { loadMeshModule, type LightRig } from '@mk7s/holochart-render';
import { PerspectiveCamera, Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SceneLighting } from './scene-lighting.ts';

function setup() {
  const viewport = { scene: new Scene(), camera: new PerspectiveCamera() };
  const lighting = new SceneLighting({ viewport });
  const given: (LightRig | null)[] = [];
  const mesh = { setLightRig: (rig: LightRig | null) => void given.push(rig) };
  return { viewport, lighting, given, mesh };
}

const flush = async (): Promise<void> => {
  await loadMeshModule();
  for (let i = 0; i < 3; i++) await Promise.resolve();
};

describe('SceneLighting', () => {
  it("lights three.js material types with the default rig, Plotly's model with its own light", async () => {
    const { viewport, lighting, given, mesh } = setup();
    lighting.use(mesh);
    await flush();
    const rig = lighting.rig!;
    expect(rig).not.toBeNull();
    expect(rig.object.parent).toBe(viewport.scene);
    expect(rig.spec).toBe((await loadMeshModule()).DEFAULT_LIGHTING);
    // No `scene.lighting`: Plotly's model keeps each trace's own light.
    expect(given).toEqual([null]);
  });

  it('shares a set `scene.lighting` with every mesh, and takes it back when unset', async () => {
    const { lighting, given, mesh } = setup();
    lighting.sync({ lighting: { ambient: { intensity: 0.3 }, directional: [] } }, [1, 1, 1], null);
    await flush();
    lighting.use(mesh);
    const rig = lighting.rig!;
    expect(given).toEqual([rig]);
    expect(rig.spec.ambient?.intensity).toBe(0.3);
    lighting.sync({}, [1, 1, 1], null);
    expect(given).toEqual([rig, null]);
    expect(lighting.rig).toBe(rig);
    expect(rig.spec).toBe((await loadMeshModule()).DEFAULT_LIGHTING);
  });

  it('creates nothing for scenes without meshes or lights; dispose frees the rig', async () => {
    const { viewport, lighting, given, mesh } = setup();
    lighting.sync({}, [1, 1, 1], null);
    await flush();
    expect(lighting.rig).toBeNull();
    lighting.use(mesh);
    await flush();
    const rig = lighting.rig!;
    lighting.dispose();
    expect(lighting.rig).toBeNull();
    expect(rig.object.parent).toBeNull();
    expect(viewport.scene.children).toHaveLength(0);
    expect(given.at(-1)).toBeNull();
  });

  it('restore: has the rig draw its environment again', async () => {
    const { lighting, mesh } = setup();
    // No rig yet: nothing to do.
    lighting.restore();
    lighting.use(mesh);
    await flush();
    const restore = vi.spyOn(lighting.rig!, 'restore');
    lighting.restore();
    expect(restore).toHaveBeenCalledTimes(1);
  });
});
