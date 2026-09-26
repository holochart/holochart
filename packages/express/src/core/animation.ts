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
  const frames = figure.frames ?? [];
  const column = args.cols.animationFrame;
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
      currentvalue: { prefix: `${column === undefined ? '' : args.label(column)}=` },
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

/** Finite numbers of an array (skipping everything else). */
function numbers(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
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
  const frames = figure.frames ?? [];
  const barmode = figure.layout['barmode'];
  const stacked = barmode === 'relative' || barmode === 'stack' || barmode === undefined;
  for (const letter of ['x', 'y'] as const) {
    if (args.options[letter === 'x' ? 'rangeX' : 'rangeY'] !== undefined) continue;
    const log = args.options[letter === 'x' ? 'logX' : 'logY'] === true;
    let lo = Infinity;
    let hi = -Infinity;
    let bars = false;
    let sized = false;
    for (const frame of frames) {
      const totals = new Map<string, [number, number]>();
      for (const trace of frame.data) {
        const type = trace['type'];
        const orientation = trace['orientation'] === 'h' ? 'h' : 'v';
        const valueLetter = orientation === 'v' ? 'y' : 'x';
        if (type === 'bar' && valueLetter === letter && trace['base'] === undefined) {
          bars = true;
          const positions = trace[orientation === 'v' ? 'x' : 'y'];
          const values = trace[letter];
          if (!Array.isArray(values)) continue;
          values.forEach((v, i) => {
            if (typeof v !== 'number' || !Number.isFinite(v)) return;
            const key = `${String(trace[`${letter === 'y' ? 'x' : 'y'}axis`])}|${String(Array.isArray(positions) ? positions[i] : i)}`;
            const t = totals.get(key) ?? [0, 0];
            if (stacked) t[v < 0 ? 0 : 1] += v;
            else {
              t[0] = Math.min(t[0], v);
              t[1] = Math.max(t[1], v);
            }
            totals.set(key, t);
          });
          continue;
        }
        if (type !== 'scatter' && type !== 'bar') continue;
        if (trace['marker'] && (trace['marker'] as Record<string, unknown>)['size']) sized = true;
        for (const v of numbers(trace[letter])) {
          const u = log ? (v > 0 ? Math.log10(v) : NaN) : v;
          if (!Number.isFinite(u)) continue;
          lo = Math.min(lo, u);
          hi = Math.max(hi, u);
        }
      }
      for (const [neg, pos] of totals.values()) {
        lo = Math.min(lo, neg);
        hi = Math.max(hi, pos);
      }
    }
    if (!(lo <= hi)) continue;
    let range: [number, number];
    if (bars && !log) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
      const pad = (hi - lo || 1) * 0.05;
      range = [lo < 0 ? lo - pad : 0, hi > 0 ? hi + pad : 0];
    } else {
      const pad = (hi - lo || Math.abs(hi) || 1) * (sized ? 0.1 : 0.05);
      range = [lo - pad, hi + pad];
    }
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
