/**
 * Accessibility of the 3D traces that loads on first use (backlog S2.14, `TraceModule.a11y`,
 * `a11y-loader.ts`):
 *
 * - View keys of every 3D trace's scene: Shift + arrows orbit the camera in steps of 15° (← / →
 *   around the scene, ↑ / ↓ over it; free orbit with `dragmode: 'orbit'`, else a turntable), `+` /
 *   `-` move it in and out, `0` resets it to the first drawn view, each committed like a drag (a
 *   GUI relayout of `scene.camera`).
 * - Keyboard stops of `scatter3d`: its points in data order, each labelled like its hover.
 * - Descriptions of every 3D trace (`scatter3d`, `surface`, `bar3d`, `cone`, `streamtube`,
 *   `isosurface`, `volume`, `mesh3d`): what is drawn and the box it spans, formatted like the
 *   scene's axes (the traces show the generic line until this code is there).
 *
 * This file imports types only: the loaders hand over the functions it needs, so the chunk shares
 * no module with the package (an app's bundler adds no shared chunk for it).
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type {
  accessibleText,
  countText,
  DescribeContext,
  formatPlainNumber,
  HoverContext,
  KeyboardStops,
  TraceA11y,
  TraceA11yParts,
  TraceDescription,
  traceNameText,
} from '@mk7s/holochart-runtime';
import type { Bar3dCalc } from './bar3d/calc.ts';
import type { ConeCalc } from './cone/calc.ts';
import type { IsoCalc } from './isosurface/calc.ts';
import type { Mesh3dCalc } from './mesh3d/calc.ts';
import type { Scatter3dCalc } from './scatter3d/calc.ts';
import type { scatter3dHoverPoint } from './scatter3d/index.ts';
import type { sceneCameraPayload } from './scene/camera.ts';
import type { applyMotion, Motion } from './scene/controls.ts';
import type { sceneAxisHoverText } from './scene/hover.ts';
import type { SceneCalc } from './scene/layout.ts';
import type { sceneFor } from './scene/scene.ts';
import type { StreamtubeCalc } from './streamtube/calc.ts';
import type { SurfaceCalc } from './surface/calc.ts';

/** The orbit step of Shift + arrow, radians. */
export const ORBIT_STEP = Math.PI / 12;
/** The dolly step of `+` / `-`: the log of the eye distance factor. */
export const ZOOM_STEP = 0.25;

const STILL: Motion = { rx: 0, ry: 0, px: 0, py: 0, zoom: 0 };
const MOVES: Readonly<Record<string, Partial<Motion>>> = {
  zoomIn: { zoom: -ZOOM_STEP },
  zoomOut: { zoom: ZOOM_STEP },
  // The camera goes where the arrow points: the scene turns the other way.
  panLeft: { rx: ORBIT_STEP },
  panRight: { rx: -ORBIT_STEP },
  panUp: { ry: ORBIT_STEP },
  panDown: { ry: -ORBIT_STEP },
};

/** What the scene parts need of the package and the runtime (see `a11y-loader.ts`). */
export type SceneKit = readonly [
  scene: typeof sceneFor,
  axisText: typeof sceneAxisHoverText,
  payload: typeof sceneCameraPayload,
  move: typeof applyMotion,
  plain: typeof accessibleText,
  count: typeof countText,
  number: typeof formatPlainNumber,
  nameOf: typeof traceNameText,
];

/**
 * The parts of every 3D trace: the view keys of its scene, and its description.
 */
export const scene = (...kit: SceneKit): TraceA11yParts => {
  const [sceneOf, axisText, payload, move, plain, count, number, nameOf] = kit;
  const view: TraceA11y = {
    keyboardView(trace, ctx, action) {
      const s = sceneOf(ctx.fullLayout, trace);
      if (!s) return undefined;
      const id = s.id;
      const ratio = (a: readonly number[], k: number): Record<string, unknown> => ({
        [`${id}.aspectratio`]: { x: a[0]! * k, y: a[1]! * k, z: a[2]! * k },
      });
      if (action === 'reset') {
        const { camera, aspect, aspectmode } = s.initial;
        return {
          [`${id}.camera`]: payload(camera, s.projection),
          ...ratio(aspect, 1),
          [`${id}.aspectmode`]: aspectmode,
        };
      }
      const step = MOVES[action];
      if (!step) return undefined;
      const full = ctx.fullLayout[id] as Record<string, unknown> | undefined;
      const next = move(
        s,
        { ...STILL, ...step },
        full?.['dragmode'] === 'orbit' ? 'orbit' : 'turntable',
        s.projection,
        s.viewport.rect.height,
      );
      // An orthographic view zooms by its aspect ratio (as its drags do).
      const zoom = next.orthoZoom / s.orthoZoom;
      return {
        [`${id}.camera`]: payload(next.camera, s.projection),
        ...(zoom === 1 ? {} : { ...ratio(s.layout.aspect, zoom), [`${id}.aspectmode`]: 'manual' }),
      };
    },
  };
  const range = (lo: number, hi: number): string => `${number(lo)}–${number(hi)}`;
  /**
   * `describe()` of a 3D trace: "Cone plot 'Wind': 120 cones; x 0–5; y 0–5; z 0–2; vector lengths
   * 0.1–3.2." — `parts` gives what is drawn first, then what follows the axis spans.
   */
  const describe = <C extends SceneCalc>(
    kind: string,
    title: string,
    parts: (calc: C, text: (axis: number, l: number) => string) => string[],
    /** The box the trace spans; default: what it gives the scene's autorange. */
    box: (calc: C) => SceneCalc['sceneExtremes'] = (calc) => calc.sceneExtremes,
  ): TraceA11y => ({
    ...view,
    describe({ trace, calc, index, fullLayout }: DescribeContext<C>): TraceDescription {
      const axes = sceneOf(fullLayout, trace)?.layout.axes;
      const text = (a: number, l: number): string => (axes?.[a] ? axisText(axes[a], l) : number(l));
      const [head, ...rest] = parts(calc, text);
      const spans = (['x', 'y', 'z'] as const).flatMap((letter, a) => {
        const e = box(calc)[letter];
        return e ? `${letter} ${text(a, e[0])}–${text(a, e[1])}` : [];
      });
      const summary = [`${title} '${nameOf(trace['name'], index)}': ${head}`, ...spans, ...rest];
      return { kind, summary: `${plain(summary.join('; '))}.` };
    },
  });
  /** An isosurface's or a volume's grid and values. */
  const iso = ({ grid, isomin, isomax }: IsoCalc): string[] =>
    grid.len > 0
      ? [
          `${grid.xs.length} × ${grid.ys.length} × ${grid.zs.length} grid`,
          `values ${range(grid.valueMin, grid.valueMax)}, drawn from ${range(isomin, isomax)}`,
        ]
      : ['no data'];
  /** `[min, max]` of the finite values, or `undefined`. */
  const extent = (values: ArrayLike<number>): [number, number] | undefined => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < values.length; i++) {
      const v = values[i]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return lo <= hi && hi - lo < Infinity ? [lo, hi] : undefined;
  };
  return {
    // Trace modules of other packages built on the scene: its view keys.
    '*': view,
    // The points themselves, without their error bars.
    scatter3d: describe<Scatter3dCalc>(
      '3D scatter',
      '3D scatter',
      (calc) => [count(calc.length, 'point')],
      (calc) => {
        const [x, y, z] = [extent(calc.x), extent(calc.y), extent(calc.z)];
        return { ...(x && { x }), ...(y && { y }), ...(z && { z }) };
      },
    ),
    surface: describe<SurfaceCalc>('3D surface', 'Surface', ({ grid: g }, text) => {
      if (!g) return ['no data'];
      let best = -1;
      for (let k = 0; k < g.z.length; k++) {
        if (Number.isFinite(g.z[k]) && (best < 0 || g.z[k]! > g.z[best]!)) best = k;
      }
      const i = best % g.nx;
      return [
        `${g.nx} × ${g.ny} grid`,
        ...(best < 0
          ? []
          : [
              `highest at x ${text(0, g.x[g.xMatrix ? best : i]!)}, y ${text(1, g.y[g.yMatrix ? best : (best - i) / g.nx]!)}`,
            ]),
      ];
    }),
    bar3d: describe<Bar3dCalc>('3D bar', '3D bars', (calc, text) => {
      let n = 0;
      let top = -1;
      for (let i = 0; i < calc.count; i++) {
        if (!Number.isFinite(calc.x[i]! + calc.y[i]! + calc.value[i]!)) continue;
        n++;
        if (top < 0 || calc.value[i]! > calc.value[top]!) top = i;
      }
      return [
        count(n, 'bar'),
        ...(top < 0
          ? []
          : [
              `tallest ${number(calc.value[top]!)} at x ${text(0, calc.x[top]!)}, y ${text(1, calc.y[top]!)}`,
            ]),
      ];
    }),
    cone: describe<ConeCalc>('cone', 'Cone plot', (calc) => [
      count(calc.count, 'cone'),
      `vector lengths ${range(calc.normMin, calc.normMax)}`,
    ]),
    streamtube: describe<StreamtubeCalc>('streamtube', 'Streamtubes', (calc) => [
      count(Math.max(0, calc.streams.offsets.length - 1), 'tube'),
      `speeds ${range(calc.normMin, calc.normMax)}`,
    ]),
    isosurface: describe<IsoCalc>('isosurface', 'Isosurface', iso),
    volume: describe<IsoCalc>('volume', 'Volume', iso),
    mesh3d: describe<Mesh3dCalc>('3D mesh', '3D mesh', (calc) => [
      `${count(calc.count, 'vertex', 'vertices')}, ${count(calc.triangles.length / 3, 'triangle')}`,
    ]),
  };
};

/** The parts of `scatter3d`: the scene's, and its points in data order as keyboard stops. */
export const scatter3d = (point: typeof scatter3dHoverPoint, ...kit: SceneKit): TraceA11yParts => {
  const parts = scene(...kit);
  return {
    ...parts,
    scatter3d: {
      ...parts['scatter3d'],
      keyboardPoints(
        calc: Scatter3dCalc,
        trace: FullTrace,
        ctx: HoverContext,
      ): KeyboardStops | undefined {
        const s = kit[0](ctx.fullLayout, trace);
        if (!s) return undefined;
        const order: number[] = [];
        for (let i = 0; i < calc.length; i++) {
          if (Number.isFinite(calc.x[i]! + calc.y[i]! + calc.z[i]!)) order.push(i);
        }
        // Overlay px from container px: the anchor is where the point is drawn now.
        const py = ctx.height ?? 0;
        const query = {
          px: 0,
          py,
          xl: 0,
          yl: py,
          cx: 0,
          cy: 0,
          mode: 'closest',
          distance: 0,
        } as const;
        return {
          length: order.length,
          at: (k) =>
            order[k] === undefined
              ? undefined
              : point({ scene: s, hits: [], query }, calc, trace, order[k], ctx.fullLayout, 0),
        };
      },
    },
  };
};
