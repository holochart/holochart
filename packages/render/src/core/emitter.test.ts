import { afterEach, describe, expect, it, vi } from 'vitest';
import { Emitter } from './emitter.ts';
import { RenderLoop } from './loop.ts';
import { createFakeScheduler } from './test-utils.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Emitter (S1.7)', () => {
  it('a throwing listener does not stop the others; its error is reported', () => {
    const reported: unknown[] = [];
    vi.stubGlobal('reportError', (error: unknown) => void reported.push(error));
    const emitter = new Emitter<{ ping: number }>();
    const calls: string[] = [];
    const error = new Error('boom');
    emitter.on('ping', () => void calls.push('first'));
    emitter.on('ping', () => {
      throw error;
    });
    emitter.on('ping', (n) => void calls.push(`third ${n}`));
    expect(() => emitter.emit('ping', 1)).not.toThrow();
    expect(calls).toEqual(['first', 'third 1']);
    expect(reported).toEqual([error]);
  });

  it('a throwing frame listener does not break the render loop', () => {
    vi.stubGlobal('reportError', () => undefined);
    const scheduler = createFakeScheduler();
    const render = vi.fn();
    const loop = new RenderLoop(render, { scheduler });
    loop.on('beforerender', () => {
      throw new Error('before');
    });
    const after = vi.fn();
    loop.on('afterrender', after);
    loop.invalidate();
    scheduler.step();
    expect(render).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    loop.invalidate();
    scheduler.step();
    expect(render).toHaveBeenCalledTimes(2);
  });
});
