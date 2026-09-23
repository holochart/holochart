/** Test helpers shared by core tests (not exported from the package). */
import type { FrameScheduler } from './loop.ts';

export interface FakeScheduler extends FrameScheduler {
  /** Run every callback queued so far at `time`. */
  step(time?: number): void;
  readonly queued: number;
  time: number;
}

/** A deterministic stand-in for requestAnimationFrame. */
export function createFakeScheduler(): FakeScheduler {
  let nextHandle = 1;
  const queue = new Map<number, (time: number) => void>();
  const scheduler: FakeScheduler = {
    time: 0,
    request(callback) {
      const handle = nextHandle++;
      queue.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      queue.delete(handle);
    },
    now: () => scheduler.time,
    step(time) {
      scheduler.time = time ?? scheduler.time + 16;
      const callbacks = [...queue.values()];
      queue.clear();
      for (const cb of callbacks) cb(scheduler.time);
    },
    get queued() {
      return queue.size;
    },
  };
  return scheduler;
}
