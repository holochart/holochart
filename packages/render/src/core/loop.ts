/**
 * On-demand render loop (plan E2.2, ADR-007).
 *
 * - {@link RenderLoop.invalidate} schedules one frame; any number of invalidations before that
 *   frame runs are coalesced.
 * - Continuous mode runs only while at least one {@link RenderLoop.requestAnimation} token is held
 *   (transitions, camera damping, drags). Tokens are ref-counted; when the last one is released the
 *   loop renders one final frame and goes idle.
 * - `beforerender` / `afterrender` are emitted around every frame. Invalidating from a
 *   `beforerender` listener is folded into the current frame; invalidating during or after the
 *   render schedules the next frame.
 *
 * The frame scheduler is injectable so the loop can be unit-tested with a fake rAF.
 */
import { Emitter } from './emitter.ts';

/** Abstraction over `requestAnimationFrame` / `cancelAnimationFrame`. */
export interface FrameScheduler {
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
  /** Current time in ms, used by synchronous {@link RenderLoop.flush}. Defaults to `performance.now()`. */
  now?(): number;
}

/** The browser's rAF. Resolved lazily so importing this module is safe outside the browser. */
export const browserFrameScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
};

/**
 * Per-frame information. The same object is reused for every frame (no per-frame allocation), so
 * listeners must copy fields they want to keep.
 */
export interface FrameInfo {
  /** Timestamp of the frame in ms (rAF time). */
  time: number;
  /** ms since the previous rendered frame of the same continuous run; 0 for the first frame. */
  delta: number;
  /** Number of frames rendered so far (1 for the first frame). */
  frame: number;
  /** Whether the loop is in continuous mode (an animation token is held). */
  continuous: boolean;
}

export interface RenderLoopEvents {
  beforerender: FrameInfo;
  afterrender: FrameInfo;
}

export interface RenderLoopOptions {
  scheduler?: FrameScheduler;
}

export class RenderLoop {
  readonly #render: (info: FrameInfo) => void;
  readonly #scheduler: FrameScheduler;
  readonly #events = new Emitter<RenderLoopEvents>();
  readonly #info: FrameInfo = { time: 0, delta: 0, frame: 0, continuous: false };

  #handle = 0;
  #scheduled = false;
  #dirty = false;
  #inFrame = false;
  #animating = 0;
  #paused = false;
  #disposed = false;
  #lastTime = -1;

  constructor(render: (info: FrameInfo) => void, options: RenderLoopOptions = {}) {
    this.#render = render;
    this.#scheduler = options.scheduler ?? browserFrameScheduler;
  }

  /** Mark the scene dirty; a frame renders on the next animation frame. */
  invalidate(): void {
    if (this.#disposed) return;
    this.#dirty = true;
    if (!this.#inFrame) this.#schedule();
  }

  /**
   * Enter continuous mode until the returned release function is called. Tokens are ref-counted;
   * calling the release function more than once is a no-op.
   */
  requestAnimation(): () => void {
    if (this.#disposed) return () => {};
    this.#animating++;
    this.#schedule();
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      this.#animating--;
      // Render the final state of whatever was animating.
      this.invalidate();
    };
  }

  /** Whether any animation token is held. */
  get animating(): boolean {
    return this.#animating > 0;
  }

  /** Whether a frame is scheduled. */
  get pending(): boolean {
    return this.#scheduled;
  }

  /** Number of frames rendered so far. */
  get frameCount(): number {
    return this.#info.frame;
  }

  get paused(): boolean {
    return this.#paused;
  }

  /**
   * Pause/resume scheduling (used while the WebGL context is lost). Invalidations while paused are
   * remembered and rendered on resume.
   */
  setPaused(paused: boolean): void {
    if (this.#disposed || paused === this.#paused) return;
    this.#paused = paused;
    if (paused) {
      this.#cancel();
    } else if (this.#dirty || this.#animating > 0) {
      this.#schedule();
    }
  }

  on<K extends keyof RenderLoopEvents>(
    type: K,
    listener: (payload: RenderLoopEvents[K]) => void,
  ): () => void {
    return this.#events.on(type, listener);
  }

  /** Render synchronously now if a frame is pending (e.g. right after a resize, or for export). */
  flush(): void {
    if (this.#disposed || this.#paused || this.#inFrame) return;
    if (!this.#scheduled && !this.#dirty) return;
    this.#cancel();
    this.#tick(this.#scheduler.now?.() ?? performance.now());
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#cancel();
    this.#disposed = true;
    this.#animating = 0;
    this.#events.clear();
  }

  #schedule(): void {
    if (this.#scheduled || this.#paused || this.#disposed) return;
    this.#scheduled = true;
    this.#handle = this.#scheduler.request(this.#tick);
  }

  #cancel(): void {
    if (!this.#scheduled) return;
    this.#scheduled = false;
    this.#scheduler.cancel(this.#handle);
    this.#handle = 0;
  }

  readonly #tick = (time: number): void => {
    this.#scheduled = false;
    this.#handle = 0;
    if (this.#paused || this.#disposed) return;

    const info = this.#info;
    info.delta = this.#lastTime < 0 ? 0 : Math.max(0, time - this.#lastTime);
    info.time = time;
    info.frame++;
    info.continuous = this.#animating > 0;

    this.#inFrame = true;
    try {
      this.#events.emit('beforerender', info);
      // Changes made by beforerender listeners are drawn by this very frame.
      this.#dirty = false;
      this.#render(info);
      this.#events.emit('afterrender', info);
    } finally {
      this.#inFrame = false;
    }
    if (this.#disposed) return;

    if (this.#dirty || this.#animating > 0) {
      this.#lastTime = this.#animating > 0 ? time : -1;
      this.#schedule();
    } else {
      this.#lastTime = -1;
    }
  };
}
