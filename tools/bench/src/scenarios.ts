import type { Drive, PanSweep, ZoomSweep } from './types.ts';

/** A plan performance target checked against one measurement of a scenario. */
export interface Target {
  /** Plan story, e.g. `E11.1`. */
  story: string;
  /** What the plan asks for, as written in the report. */
  goal: string;
  metric: 'firstDraw' | 'panFps' | 'zoomFps';
  /** Upper bound in ms (`firstDraw`) or lower bound in fps (`panFps`, `zoomFps`). */
  value: number;
}

export interface Scenario {
  /** Example id (path under `examples/` without `.ts`). */
  example: string;
  label: string;
  drive: Drive;
  pan?: PanSweep;
  zoom?: ZoomSweep;
  /** `window` global where the example records `firstDrawMs` / `generateMs`. */
  perfGlobal?: string;
  targets: readonly Target[];
}

const DAY = 86_400_000;
const DECADE = 3653 * DAY;

/**
 * The real-GPU performance targets of the plan (§11.7): E12.1, E11.1, E12.3, E13.3, plus the M0
 * marker baseline (E2.4). The sweeps mirror the examples' own Pan / Zoom buttons, but move with
 * elapsed time so a slow frame does not slow the sweep.
 *
 * An fps target is met at 95 % of its value: headless Chromium paces animation frames at 60 Hz,
 * so a chart that keeps up measures 59–60 fps, never more.
 */
export const SCENARIOS: readonly Scenario[] = [
  {
    example: '_dev/timeseries-2m6',
    label: 'Time series, 2.6M points (line, date axis)',
    drive: { kind: 'ranges' },
    // A one-month window through the decade; the decade down to one day and back.
    pan: { axes: ['x'], window: (30 * DAY) / DECADE },
    zoom: { axes: ['x'], min: DAY / DECADE },
    targets: [{ story: 'E12.1', goal: 'pan at 60 fps', metric: 'panFps', value: 60 }],
  },
  {
    example: 'heatmap/large',
    label: 'Heatmap, 4096 × 4096',
    drive: { kind: 'ranges' },
    // A 512-cell square window across the grid; the grid down to 16 cells and back.
    pan: { axes: ['x', 'y'], window: 512 / 4096 },
    zoom: { axes: ['x', 'y'], min: 16 / 4096 },
    perfGlobal: '__heatmapPerf',
    targets: [
      { story: 'E11.1', goal: 'renders < 100 ms', metric: 'firstDraw', value: 100 },
      { story: 'E11.1', goal: 'pan at 60 fps', metric: 'panFps', value: 60 },
      { story: 'E11.1', goal: 'zoom at 60 fps', metric: 'zoomFps', value: 60 },
    ],
  },
  {
    example: 'candlestick/large',
    label: 'Candlestick, 100k candles (range breaks)',
    drive: { kind: 'ranges' },
    // A twentieth of the data across it; everything down to 1/500 and back.
    pan: { axes: ['x'], window: 1 / 20 },
    zoom: { axes: ['x'], min: 1 / 500 },
    perfGlobal: '__candlePerf',
    targets: [
      { story: 'E12.3', goal: 'pan at 60 fps (instanced)', metric: 'panFps', value: 60 },
      { story: 'E12.3', goal: 'zoom at 60 fps (instanced)', metric: 'zoomFps', value: 60 },
    ],
  },
  {
    example: 'treemap/large',
    label: 'Treemap, 100k nodes',
    drive: { kind: 'none' },
    perfGlobal: '__treemapPerf',
    targets: [{ story: 'E13.3', goal: 'renders < 500 ms', metric: 'firstDraw', value: 500 }],
  },
  {
    example: '_dev/markers-1m',
    label: '1M markers (render package)',
    drive: { kind: 'button', label: 'Pan' },
    targets: [{ story: 'E2.4', goal: 'pan ≥ 50 fps', metric: 'panFps', value: 50 }],
  },
  // E14.2 (M6 wave 0, render level): 1M 3D points orbiting; the camera moves every frame.
  ...(['sprites', 'spheres', 'lines'] as const).map((mode): Scenario => ({
    example: '_dev/scatter3d-1m',
    label: `1M 3D points, ${mode} (orbit)`,
    drive: { kind: 'button', label: `Orbit ${mode}` },
    targets: [
      {
        story: 'E14.2',
        goal: '1M points interactive orbit (≥ 30 fps)',
        metric: 'panFps',
        value: 30,
      },
    ],
  })),
];

/** Share of an fps target that counts as met (see {@link SCENARIOS}). */
export const FPS_TOLERANCE = 0.95;
