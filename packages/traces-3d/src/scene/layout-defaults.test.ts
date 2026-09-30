import { describe, expect, it } from 'vitest';
import { defaults } from './__testing__/points.ts';
import { sceneModebarButtons } from './modebar.ts';

type Container = Record<string, unknown>;
const scene = (fl: Container, id = 'scene'): Container => fl[id] as Container;
const axis = (fl: Container, letter: string, id = 'scene'): Container =>
  scene(fl, id)[`${letter}axis`] as Container;

describe('scene layout defaults (plotly.js gl3d)', () => {
  it('lists the scenes of visible 3D traces, in order, with their modebar group', () => {
    const { fullLayout } = defaults([
      { scene: 'scene3', x: [1], y: [1], z: [1] },
      { x: [1], y: [1], z: [1] },
      { scene: 'scene2', visible: false },
    ]);
    expect(fullLayout['_sceneIds']).toEqual(['scene', 'scene3']);
    expect(fullLayout['_modebarButtons']).toBe(sceneModebarButtons);
    expect(fullLayout['scene2']).toBeUndefined();
    // Side by side without domains.
    expect(scene(fullLayout)['domain']).toMatchObject({ x: [0, 0.5], y: [0, 1] });
    expect(scene(fullLayout, 'scene3')['domain']).toMatchObject({ x: [0.5, 1], y: [0, 1] });
    expect(defaults([]).fullLayout['_sceneIds']).toEqual([]);
    expect(defaults([]).fullLayout['_modebarButtons']).toBeUndefined();
  });

  it('places scenes in layout.grid cells', () => {
    const { fullLayout } = defaults([{ x: [1], y: [1], z: [1] }], {
      grid: { rows: 2, columns: 2, xgap: 0, ygap: 0 },
      scene: { domain: { row: 1, column: 1 } },
    });
    expect(scene(fullLayout)['domain']).toMatchObject({ x: [0.5, 1], y: [0, 0.5] });
  });

  it('defaults the camera, background and aspect like Plotly', () => {
    const { fullLayout } = defaults([{ x: [1], y: [1], z: [1] }]);
    const s = scene(fullLayout);
    expect(s['camera']).toEqual({
      eye: { x: 1.25, y: 1.25, z: 1.25 },
      center: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 0, z: 1 },
      projection: { type: 'perspective' },
    });
    expect(s['bgcolor']).toBe('rgba(0, 0, 0, 0)');
    expect(s['aspectmode']).toBe('auto');
    expect(s['aspectratio']).toEqual({ x: 1, y: 1, z: 1 });
    expect(s['dragmode']).toBe('turntable');
    expect(s['hovermode']).toBe('closest');
  });

  it('aspectratio implies manual; manual without a full ratio falls back to auto', () => {
    const d = (s: Container) =>
      scene(defaults([{ x: [1], y: [1], z: [1] }], { scene: s }).fullLayout);
    expect(d({ aspectratio: { x: 2, y: 1, z: 1 } })['aspectmode']).toBe('manual');
    const partial = d({ aspectmode: 'manual', aspectratio: { x: 2, y: 0 } });
    expect(partial['aspectmode']).toBe('auto');
    expect(partial['aspectratio']).toEqual({ x: 1, y: 1, z: 1 });
    expect(d({ aspectmode: 'cube', aspectratio: { x: 2, y: 1, z: 1 } })['aspectmode']).toBe('cube');
  });

  it('dragmode: orbit for a tilted camera, the layout’s on 3D-only figures', () => {
    const d = (layout: Container, data: unknown[] = [{ x: [1], y: [1], z: [1] }]) =>
      scene(defaults(data, layout).fullLayout)['dragmode'];
    expect(d({ scene: { camera: { up: { x: 1, y: 1, z: 1 } } } })).toBe('orbit');
    expect(d({ scene: { camera: { up: { x: 0, y: 0.001, z: 1 } } } })).toBe('turntable');
    expect(d({ dragmode: 'pan' })).toBe('pan');
    expect(d({ dragmode: false })).toBe(false);
    // With a 2D trace too, the layout dragmode is not taken.
    expect(
      d({ dragmode: 'pan' }, [
        { x: [1], y: [1], z: [1] },
        { type: 'scatter', x: [1], y: [1] },
      ]),
    ).toBe('turntable');
  });

  it('3D axes: Plotly’s grid mix, titles, spikes, walls and zero lines', () => {
    const { fullLayout } = defaults([
      { x: [1, 2], y: ['a', 'b'], z: ['2024-01-01', '2024-02-01'] },
    ]);
    const x = axis(fullLayout, 'x');
    expect(x['type']).toBe('linear');
    expect(x['gridcolor']).toBe('rgb(204, 204, 204)');
    expect(x['title']).toMatchObject({ text: 'x', font: { size: 14 } });
    expect(x['showspikes']).toBe(true);
    expect(x['spikesides']).toBe(true);
    expect(x['spikethickness']).toBe(2);
    expect(x['spikecolor']).toBe('rgb(68, 68, 68)');
    expect(x['showbackground']).toBe(false);
    expect(x['backgroundcolor']).toBe('rgba(204, 204, 204, 0.5)');
    expect(x['showaxeslabels']).toBe(true);
    expect(x['zeroline']).toBe(true);
    expect(x['autorange']).toBe(true);
    expect(axis(fullLayout, 'y')['type']).toBe('category');
    expect(axis(fullLayout, 'y')['_categories']).toEqual(['a', 'b']);
    expect(axis(fullLayout, 'z')['type']).toBe('date');
    expect(axis(fullLayout, 'z')['title']).toMatchObject({ text: 'z' });
  });

  it('takes the template’s scene (the default look’s walls)', () => {
    const { fullLayout } = defaults([{ x: [1], y: [1], z: [1] }], { template: undefined });
    const x = axis(fullLayout, 'x');
    // Registered without the default template in this registry: only template layouts apply.
    expect(x['showbackground']).toBe(false);
    const templated = defaults([{ x: [1], y: [1], z: [1] }], {
      template: { layout: { scene: { xaxis: { showbackground: true, gridcolor: '#123456' } } } },
    });
    expect(axis(templated.fullLayout, 'x')['showbackground']).toBe(true);
    expect(axis(templated.fullLayout, 'x')['gridcolor']).toBe('rgb(18, 52, 86)');
  });
});
