import { describe, expect, it, vi } from 'vitest';
import { Emitter } from './emitter.ts';

interface Events {
  ping: number;
  pong: string;
}

describe('Emitter subscriptions', () => {
  it('reports whether a type has listeners', () => {
    const emitter = new Emitter<Events>();
    expect(emitter.has('ping')).toBe(false);
    const offA = emitter.on('ping', () => undefined);
    const offB = emitter.on('ping', () => undefined);
    expect(emitter.has('ping')).toBe(true);
    expect(emitter.has('pong')).toBe(false);
    offA();
    expect(emitter.has('ping')).toBe(true);
    offB();
    expect(emitter.has('ping')).toBe(false);
  });

  it('unsubscribes once: a second call leaves a later subscription of the same listener alone', () => {
    const emitter = new Emitter<Events>();
    const listener = vi.fn();
    const off = emitter.on('ping', listener);
    off();
    emitter.on('ping', listener);
    off();
    emitter.emit('ping', 7);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(7);
  });

  it('removes only the unsubscribed listener, keeping the order of the others', () => {
    const emitter = new Emitter<Events>();
    const calls: string[] = [];
    emitter.on('ping', () => void calls.push('a'));
    const off = emitter.on('ping', () => void calls.push('b'));
    emitter.on('ping', () => void calls.push('c'));
    off();
    emitter.emit('ping', 1);
    expect(calls).toEqual(['a', 'c']);
  });

  it('clear drops every listener; unsubscribing afterwards is harmless', () => {
    const emitter = new Emitter<Events>();
    const ping = vi.fn();
    const pong = vi.fn();
    const off = emitter.on('ping', ping);
    emitter.on('pong', pong);
    emitter.clear();
    expect(emitter.has('ping')).toBe(false);
    expect(emitter.has('pong')).toBe(false);
    off();
    emitter.emit('ping', 1);
    emitter.emit('pong', 'x');
    expect(ping).not.toHaveBeenCalled();
    expect(pong).not.toHaveBeenCalled();
    expect(emitter.has('ping')).toBe(false);
  });
});
