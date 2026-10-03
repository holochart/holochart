import { describe, expect, it, vi } from 'vitest';
import { RenderLoop, type FrameInfo } from './loop.ts';
import { createFakeScheduler } from './test-utils.ts';

function setup() {
  const scheduler = createFakeScheduler();
  const frames: FrameInfo[] = [];
  const render = vi.fn((info: FrameInfo) => void frames.push({ ...info }));
  const loop = new RenderLoop(render, { scheduler });
  return { scheduler, loop, render, frames };
}

describe('RenderLoop pause', () => {
  it('schedules nothing on resume when nothing changed while paused', () => {
    const { scheduler, loop, render } = setup();
    expect(loop.paused).toBe(false);
    loop.setPaused(true);
    expect(loop.paused).toBe(true);
    loop.setPaused(false);
    expect(loop.paused).toBe(false);
    expect(loop.pending).toBe(false);
    expect(scheduler.queued).toBe(0);
    scheduler.step();
    expect(render).not.toHaveBeenCalled();
  });

  it('resumes a running animation', () => {
    const { scheduler, loop, render, frames } = setup();
    const release = loop.requestAnimation();
    scheduler.step(100);
    loop.setPaused(true);
    expect(scheduler.queued).toBe(0);
    scheduler.step(200);
    expect(render).toHaveBeenCalledTimes(1);

    loop.setPaused(false);
    expect(scheduler.queued).toBe(1);
    scheduler.step(300);
    expect(render).toHaveBeenCalledTimes(2);
    expect(frames[1]!.continuous).toBe(true);
    release();
  });

  it('pausing or resuming twice changes nothing', () => {
    const { scheduler, loop } = setup();
    loop.invalidate();
    loop.setPaused(true);
    loop.setPaused(true);
    expect(loop.paused).toBe(true);
    expect(scheduler.queued).toBe(0);
    loop.setPaused(false);
    loop.setPaused(false);
    // One frame for the remembered invalidation, not two.
    expect(scheduler.queued).toBe(1);
  });

  it('flush does not render while paused; the frame waits for the resume', () => {
    const { scheduler, loop, render } = setup();
    loop.setPaused(true);
    loop.invalidate();
    loop.flush();
    expect(render).not.toHaveBeenCalled();
    loop.setPaused(false);
    loop.flush();
    expect(render).toHaveBeenCalledTimes(1);
    expect(scheduler.queued).toBe(0);
  });
});

describe('RenderLoop flush', () => {
  it('does not start a nested frame when called while rendering', () => {
    const { scheduler, loop, render } = setup();
    let nested = 0;
    render.mockImplementation(() => {
      if (nested++ === 0) {
        loop.invalidate();
        loop.flush();
      }
    });
    loop.invalidate();
    scheduler.step();
    // The invalidation from inside the frame is drawn by the next frame, not recursively.
    expect(render).toHaveBeenCalledTimes(1);
    expect(scheduler.queued).toBe(1);
    scheduler.step();
    expect(render).toHaveBeenCalledTimes(2);
  });
});

describe('RenderLoop dispose', () => {
  it('schedules no further frame when disposed from a frame listener', () => {
    const { scheduler, loop, render } = setup();
    const release = loop.requestAnimation();
    loop.on('afterrender', () => loop.dispose());
    scheduler.step();
    expect(render).toHaveBeenCalledTimes(1);
    expect(scheduler.queued).toBe(0);
    expect(loop.animating).toBe(false);
    // A token taken before the dispose releases harmlessly.
    release();
    expect(scheduler.queued).toBe(0);
  });

  it('ignores pause, flush and a second dispose afterwards', () => {
    const { scheduler, loop, render } = setup();
    loop.invalidate();
    loop.dispose();
    loop.dispose();
    loop.setPaused(true);
    expect(loop.paused).toBe(false);
    loop.flush();
    expect(render).not.toHaveBeenCalled();
    expect(scheduler.queued).toBe(0);
  });

  it('renders nothing when an already requested frame fires after the dispose', () => {
    const { scheduler } = setup();
    const render = vi.fn();
    const before = vi.fn();
    // A scheduler whose `cancel` comes too late: the callback runs anyway.
    const loop = new RenderLoop(render, {
      scheduler: { request: (cb) => scheduler.request(cb), cancel: () => undefined },
    });
    loop.on('beforerender', before);
    loop.invalidate();
    loop.dispose();
    scheduler.step();
    expect(render).not.toHaveBeenCalled();
    expect(before).not.toHaveBeenCalled();
  });
});
