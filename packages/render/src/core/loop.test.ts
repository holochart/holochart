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

describe('RenderLoop', () => {
  it('does nothing until invalidated', () => {
    const { scheduler, render } = setup();
    expect(scheduler.queued).toBe(0);
    scheduler.step();
    expect(render).not.toHaveBeenCalled();
  });

  it('coalesces many invalidations into one frame', () => {
    const { scheduler, loop, render } = setup();
    loop.invalidate();
    loop.invalidate();
    loop.invalidate();
    expect(scheduler.queued).toBe(1);
    expect(loop.pending).toBe(true);
    scheduler.step();
    expect(render).toHaveBeenCalledTimes(1);
    expect(loop.pending).toBe(false);
    scheduler.step();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('emits beforerender and afterrender around each frame', () => {
    const { scheduler, loop, render } = setup();
    const order: string[] = [];
    loop.on('beforerender', () => order.push('before'));
    render.mockImplementation(() => void order.push('render'));
    loop.on('afterrender', () => order.push('after'));
    loop.invalidate();
    scheduler.step();
    expect(order).toEqual(['before', 'render', 'after']);
  });

  it('folds invalidations from beforerender into the current frame', () => {
    const { scheduler, loop, render } = setup();
    loop.on('beforerender', () => loop.invalidate());
    loop.invalidate();
    scheduler.step();
    expect(render).toHaveBeenCalledTimes(1);
    expect(scheduler.queued).toBe(0);
  });

  it('schedules another frame for invalidations during render or afterrender', () => {
    const { scheduler, loop, render } = setup();
    let once = true;
    loop.on('afterrender', () => {
      if (once) loop.invalidate();
      once = false;
    });
    loop.invalidate();
    scheduler.step();
    expect(scheduler.queued).toBe(1);
    scheduler.step();
    expect(render).toHaveBeenCalledTimes(2);
    expect(scheduler.queued).toBe(0);
  });

  it('runs continuously while an animation token is held, then renders a final frame', () => {
    const { scheduler, loop, render, frames } = setup();
    const release = loop.requestAnimation();
    expect(loop.animating).toBe(true);
    for (let t = 100; t <= 500; t += 100) scheduler.step(t);
    expect(render).toHaveBeenCalledTimes(5);
    expect(frames.every((f) => f.continuous)).toBe(true);
    expect(frames.map((f) => f.delta)).toEqual([0, 100, 100, 100, 100]);
    release();
    release(); // idempotent
    expect(loop.animating).toBe(false);
    scheduler.step(600);
    expect(render).toHaveBeenCalledTimes(6);
    expect(frames[5]!.continuous).toBe(false);
    scheduler.step(700);
    expect(render).toHaveBeenCalledTimes(6);
    expect(scheduler.queued).toBe(0);
  });

  it('ref-counts animation tokens', () => {
    const { scheduler, loop } = setup();
    const a = loop.requestAnimation();
    const b = loop.requestAnimation();
    a();
    expect(loop.animating).toBe(true);
    scheduler.step();
    expect(scheduler.queued).toBe(1);
    b();
    scheduler.step();
    expect(scheduler.queued).toBe(0);
  });

  it('resets delta after going idle', () => {
    const { scheduler, loop, frames } = setup();
    loop.invalidate();
    scheduler.step(100);
    loop.invalidate();
    scheduler.step(5000);
    expect(frames.map((f) => f.delta)).toEqual([0, 0]);
    expect(frames.map((f) => f.frame)).toEqual([1, 2]);
  });

  it('remembers invalidations while paused and renders on resume', () => {
    const { scheduler, loop, render } = setup();
    loop.invalidate();
    loop.setPaused(true);
    expect(scheduler.queued).toBe(0);
    loop.invalidate();
    scheduler.step();
    expect(render).not.toHaveBeenCalled();
    loop.setPaused(false);
    scheduler.step();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('flush renders a pending frame synchronously', () => {
    const { scheduler, loop, render } = setup();
    loop.flush();
    expect(render).not.toHaveBeenCalled();
    loop.invalidate();
    loop.flush();
    expect(render).toHaveBeenCalledTimes(1);
    expect(scheduler.queued).toBe(0);
  });

  it('stops scheduling after dispose', () => {
    const { scheduler, loop, render } = setup();
    loop.invalidate();
    loop.dispose();
    expect(scheduler.queued).toBe(0);
    loop.invalidate();
    loop.requestAnimation();
    scheduler.step();
    expect(render).not.toHaveBeenCalled();
  });

  it('allows listeners to unsubscribe during dispatch', () => {
    const { scheduler, loop } = setup();
    const calls: number[] = [];
    const off = loop.on('afterrender', () => {
      calls.push(1);
      off();
    });
    loop.on('afterrender', () => calls.push(2));
    loop.invalidate();
    scheduler.step();
    loop.invalidate();
    scheduler.step();
    expect(calls).toEqual([1, 2, 2]);
  });
});
