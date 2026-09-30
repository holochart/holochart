/**
 * The modebar's 3D group (plan E14.1c; plotly.js `components/modebar/buttons.js`): drag modes
 * `zoom3d`, `pan3d`, `orbitRotation`, `tableRotation` (they set every scene's `dragmode`, and the
 * layout `dragmode` to `pan` or `zoom` for other subplots), and the camera resets
 * `resetCameraDefault3d` and `resetCameraLastSave3d` (the first drawn view). The scene defaults
 * list them in `fullLayout._modebarButtons`, which the modebar shows after its own groups.
 */
import type { FullLayout } from '@mk7s/holochart-core';
import type { Chart } from '@mk7s/holochart-runtime';
import { sceneCameraPayload } from './camera.ts';
import { sceneFor } from './scene.ts';

type Container = Record<string, unknown>;

const icon = (...paths: string[]) => ({ paths });

/** Original 24×24 glyphs, in the style of the built-in ones. */
const ICONS = {
  magnifier: icon(
    'M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
    'm14.6 16 1.4-1.4 5.6 5.6-1.4 1.4z',
  ),
  move: icon(
    'M12 2l3.5 3.5h-2.5V11h5.5V8.5L22 12l-3.5 3.5V13H13v5.5h2.5L12 22l-3.5-3.5H11V13H5.5v2.5L2 12l3.5-3.5V11H11V5.5H8.5z',
  ),
  orbit: icon(
    'M12 3a9 9 0 1 0 8.5 6h-2.2A7 7 0 1 1 12 5v2.8L16.2 4 12 .2z',
    'M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  ),
  turntable: icon(
    'M11 2h2v20h-2z',
    'M12 9c5 0 9 1.6 9 3.5S17 16 12 16s-9-1.6-9-3.5S7 9 12 9zm0 1.8c-3.9 0-7 .8-7 1.7s3.1 1.7 7 1.7 7-.8 7-1.7-3.1-1.7-7-1.7z',
  ),
  home: icon('M12 3l9 8h-3v9h-4.5v-6h-3v6H6v-9H3z'),
  history: icon(
    'M13 3a9 9 0 1 1-8.5 12h2.1A7 7 0 1 0 6 8.5L8.5 11H2V4.5l2.6 2.6A9 9 0 0 1 13 3z',
    'M12 7h2v5.4l3.3 2-1 1.7-4.3-2.6z',
  ),
};

function ids(chart: Chart): { fl: Container; ids: readonly string[] } {
  const fl = (chart.fullLayout ?? {}) as Container;
  const list = fl['_sceneIds'];
  return { fl, ids: Array.isArray(list) ? (list as string[]) : [] };
}

function relayout(chart: Chart, update: Container): void {
  chart.relayout(update, { gui: true }).catch(() => undefined);
}

function dragButton(name: string, title: string, mode: string, glyph: { paths: string[] }) {
  return {
    name,
    title,
    icon: glyph,
    aliases: mode === 'zoom' || mode === 'pan' ? [mode] : [],
    pressed: (fl: Readonly<Container>): boolean => {
      const first = (fl['_sceneIds'] as string[] | undefined)?.[0];
      return first !== undefined && (fl[first] as Container | undefined)?.['dragmode'] === mode;
    },
    click(chart: Chart): void {
      const update: Container = {};
      for (const id of ids(chart).ids) update[`${id}.dragmode`] = mode;
      // Other subplot kinds follow with the closest 2D mode (Plotly).
      update['dragmode'] = mode === 'pan' ? 'pan' : 'zoom';
      relayout(chart, update);
    },
  };
}

function resetButton(name: string, title: string, lastSave: boolean, glyph: { paths: string[] }) {
  return {
    name,
    title,
    icon: glyph,
    aliases: [lastSave ? 'resetcameralastsave' : 'resetcameradefault'],
    click(chart: Chart): void {
      const { fl, ids: list } = ids(chart);
      const update: Container = {};
      for (const id of list) {
        const scene = sceneFor(fl as FullLayout, { scene: id });
        if (!scene) continue;
        const { camera, aspect, aspectmode } = scene.initial;
        if (lastSave) {
          const p = sceneCameraPayload(camera, scene.projection);
          update[`${id}.camera.up`] = p['up'];
          update[`${id}.camera.eye`] = p['eye'];
          update[`${id}.camera.center`] = p['center'];
        } else {
          update[`${id}.camera.up`] = null;
          update[`${id}.camera.eye`] = null;
          update[`${id}.camera.center`] = null;
        }
        update[`${id}.aspectratio`] = { x: aspect[0], y: aspect[1], z: aspect[2] };
        update[`${id}.aspectmode`] = aspectmode;
      }
      relayout(chart, update);
    },
  };
}

/** The 3D groups, in Plotly's order (see the module comment). */
export const sceneModebarButtons = [
  [
    dragButton('zoom3d', 'Zoom', 'zoom', ICONS.magnifier),
    dragButton('pan3d', 'Pan', 'pan', ICONS.move),
    dragButton('orbitRotation', 'Orbital rotation', 'orbit', ICONS.orbit),
    dragButton('tableRotation', 'Turntable rotation', 'turntable', ICONS.turntable),
  ],
  [
    resetButton('resetCameraDefault3d', 'Reset camera to default', false, ICONS.home),
    resetButton('resetCameraLastSave3d', 'Reset camera to last save', true, ICONS.history),
  ],
];
