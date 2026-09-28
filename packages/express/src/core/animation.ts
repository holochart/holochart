/**
 * Animation from data (plan E23.4): the Play / Pause update menu and the frame slider px adds to
 * an animated figure (`configure_animation_controls`), and axis ranges fixed across frames so the
 * axes hold still while the data move.
 */
import type { ExpressFigure } from '../options.ts';
import type { Args } from './args.ts';
import type { Config } from './config.ts';
import type { Grid } from './grid.ts';

/** `animate` options of px's buttons and slider steps: `duration` ms per frame, linear. */
function frameArgs(duration: number, redraw: boolean): Record<string, unknown> {
  return {
    frame: { duration, redraw },
    mode: 'immediate',
    fromcurrent: true,
    transition: { duration, easing: 'linear' },
  };
}

/**
 * px's animation controls: a ▶ / ◼ button pair (`updatemenus`) left of a slider with one step per
 * frame and the frame column as its `currentvalue.prefix` (`year=`), both below the plot.
 */
export function animationControls(args: Args, figure: ExpressFigure): void {
  const column = args.cols.animationFrame;
  frameControls(figure, `${column === undefined ? '' : args.label(column)}=`);
}

/**
 * The controls of {@link animationControls} for any figure with frames, with `prefix` as the
 * slider's `currentvalue.prefix` (`imshow` passes `animation_frame=`, naming a dimension rather
 * than a column).
 */
export function frameControls(figure: ExpressFigure, prefix: string): void {
  const frames = figure.frames ?? [];
  // Plotly redraws non-scatter traces after each frame; Holochart always updates incrementally,
  // but the flag is kept as px writes it.
  const redraw = figure.data.some((t) => t['type'] !== 'scatter');
  figure.layout['updatemenus'] = [
    {
      buttons: [
        { args: [null, frameArgs(500, redraw)], label: '&#9654;', method: 'animate' },
        { args: [[null], frameArgs(0, redraw)], label: '&#9724;', method: 'animate' },
      ],
      direction: 'left',
      pad: { r: 10, t: 70 },
      showactive: false,
      type: 'buttons',
      x: 0.1,
      xanchor: 'right',
      y: 0,
      yanchor: 'top',
    },
  ];
  figure.layout['sliders'] = [
    {
      active: 0,
      currentvalue: { prefix },
      len: 0.9,
      pad: { b: 10, t: 60 },
      steps: frames.map((f) => ({
        args: [[f.name], frameArgs(0, redraw)],
        label: f.name,
        method: 'animate',
      })),
      x: 0.1,
      xanchor: 'left',
      y: 0,
      yanchor: 'top',
    },
  ];
}

/**
 * How a trace counts toward an animated axis' range: the `[positions, subplot]` attributes of a
 * value bar (stacked per subplot and position), `true` for other points, `false` for none.
 */
export type RangeRole = readonly [string, string] | boolean;

/**
 * The range holding an animated axis still: the extent of `key` over every frame's traces plus
 * 5% on each side (10% with sized markers), in log units when `log`. Bars (whose values stack per
 * position when `stacked`) and `tozero` axes span zero, padded on the data side only. `undefined`
 * without a finite value.
 */
export function frameRange(
  frames: NonNullable<ExpressFigure['frames']>,
  key: string,
  role: (trace: Record<string, unknown>) => RangeRole,
  log: boolean,
  stacked: boolean,
  tozero = false,
): [number, number] | undefined {
  let lo = Infinity;
  let hi = -Infinity;
  let bars = false;
  let sized = false;
  const add = (v: unknown): void => {
    if (typeof v !== 'number') return;
    const u = log ? (v > 0 ? Math.log10(v) : NaN) : v;
    if (!Number.isFinite(u)) return;
    lo = Math.min(lo, u);
    hi = Math.max(hi, u);
  };
  for (const frame of frames) {
    const totals = new Map<string, [number, number]>();
    for (const trace of frame.data) {
      const kind = role(trace);
      const values = trace[key];
      if (kind && kind !== true) bars = true;
      if (!kind || !Array.isArray(values)) continue;
      if (kind !== true) {
        const positions = trace[kind[0]];
        values.forEach((v, i) => {
          if (typeof v !== 'number' || !Number.isFinite(v)) return;
          const at = `${String(trace[kind[1]])}|${String(Array.isArray(positions) ? positions[i] : i)}`;
          const t = totals.get(at) ?? [0, 0];
          if (stacked) t[v < 0 ? 0 : 1] += v;
          else {
            t[0] = Math.min(t[0], v);
            t[1] = Math.max(t[1], v);
          }
          totals.set(at, t);
        });
        continue;
      }
      if (trace['marker'] && (trace['marker'] as Record<string, unknown>)['size']) sized = true;
      values.forEach(add);
    }
    for (const t of totals.values()) t.forEach(add);
  }
  if (!(lo <= hi)) return undefined;
  if ((bars || tozero) && !log) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
    const pad = (hi - lo || 1) * (sized && !bars ? 0.1 : 0.05);
    return [lo < 0 ? lo - pad : 0, hi > 0 ? hi + pad : 0];
  }
  const pad = (hi - lo || Math.abs(hi) || 1) * (sized ? 0.1 : 0.05);
  return [lo - pad, hi + pad];
}

/**
 * Fix the axis ranges of an animated figure to the data of every frame, so the axes hold still
 * during playback (px leaves this to `range_x` / `range_y`; Holochart computes them when they are
 * not given). Numeric position axes get the data's extent plus 5% on each side (10% with sized
 * markers), in log units on log axes; the value axis of bars spans zero and every frame's stacked
 * totals. Category and date axes, histogram counts and marginal axes keep autorange.
 */
export function fixAnimationRanges(
  args: Args,
  config: Config,
  figure: ExpressFigure,
  grid: Grid,
): void {
  const barmode = figure.layout['barmode'];
  const stacked = barmode === 'relative' || barmode === 'stack' || barmode === undefined;
  for (const letter of ['x', 'y'] as const) {
    if (args.options[letter === 'x' ? 'rangeX' : 'rangeY'] !== undefined) continue;
    const log = args.options[letter === 'x' ? 'logX' : 'logY'] === true;
    let bars = false;
    const range = frameRange(
      figure.frames ?? [],
      letter,
      (trace) => {
        const type = trace['type'];
        const orientation = trace['orientation'] === 'h' ? 'h' : 'v';
        if (
          type === 'bar' &&
          (orientation === 'v') === (letter === 'y') &&
          trace['base'] === undefined
        ) {
          bars = true;
          return [orientation === 'v' ? 'x' : 'y', `${letter === 'y' ? 'x' : 'y'}axis`];
        }
        return type === 'scatter' || type === 'bar';
      },
      log,
      stacked,
    );
    if (range === undefined) continue;
    const column = args.cols[letter];
    if (!bars && (column === undefined || args.table.type(column) !== 'numeric')) continue;
    for (let row = 1; row <= grid.nrows; row++) {
      for (let col = 1; col <= grid.ncols; col++) {
        if (letter === 'x' && config.marginalY && col === grid.ncols) continue;
        if (letter === 'y' && config.marginalX && row === 1) continue;
        const cell = grid.cell(row, col);
        const id = letter === 'x' ? cell?.xaxis : cell?.yaxis;
        if (id === undefined) continue;
        const key = `${letter}axis${id.slice(1)}`;
        const axis = (figure.layout[key] ??= {}) as Record<string, unknown>;
        axis['range'] = [...range];
      }
    }
  }
}
