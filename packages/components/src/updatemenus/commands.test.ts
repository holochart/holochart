import { describe, expect, it, vi } from 'vitest';
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import {
  bindingValue,
  commandBindings,
  CommandObserver,
  executeCommand,
  simpleBinding,
  type CommandChart,
} from './commands.ts';

function fakeChart(withAnimate = false) {
  const chart = {
    restyle: vi.fn((..._a: unknown[]) => Promise.resolve()),
    relayout: vi.fn((..._a: unknown[]) => Promise.resolve()),
    updateAttributes: vi.fn((..._a: unknown[]) => Promise.resolve()),
    ...(withAnimate ? { animate: vi.fn((..._a: unknown[]) => Promise.resolve()) } : {}),
  };
  return chart as typeof chart & CommandChart & { animate?: ReturnType<typeof vi.fn> };
}

describe('executeCommand (Plotly executeAPICommand)', () => {
  it('restyle: string and object forms, with and without traces', async () => {
    const c = fakeChart();
    await executeCommand(c, 'restyle', ['visible', [true, false]]);
    expect(c.restyle).toHaveBeenLastCalledWith({ visible: [true, false] }, undefined);
    await executeCommand(c, 'restyle', ['marker.color', 'red', [1]]);
    expect(c.restyle).toHaveBeenLastCalledWith({ 'marker.color': 'red' }, [1]);
    await executeCommand(c, 'restyle', [{ type: 'bar' }, 0]);
    expect(c.restyle).toHaveBeenLastCalledWith({ type: 'bar' }, 0);
    await executeCommand(c, 'restyle', [{ type: 'bar' }]);
    expect(c.restyle).toHaveBeenLastCalledWith({ type: 'bar' }, undefined);
  });

  it('relayout and update', async () => {
    const c = fakeChart();
    await executeCommand(c, 'relayout', ['yaxis.type', 'log']);
    expect(c.relayout).toHaveBeenLastCalledWith({ 'yaxis.type': 'log' });
    await executeCommand(c, 'relayout', [{ 'xaxis.range': [0, 1] }]);
    expect(c.relayout).toHaveBeenLastCalledWith({ 'xaxis.range': [0, 1] });
    await executeCommand(c, 'update', [{ visible: [true] }, { 'title.text': 'A' }, [0]]);
    expect(c.updateAttributes).toHaveBeenLastCalledWith(
      { visible: [true] },
      { 'title.text': 'A' },
      [0],
    );
    await executeCommand(c, 'update', [undefined, { title: 'x' }]);
    expect(c.updateAttributes).toHaveBeenLastCalledWith({}, { title: 'x' }, undefined);
  });

  it('skip and malformed args do nothing', async () => {
    const c = fakeChart();
    await executeCommand(c, 'skip', ['visible', true]);
    await executeCommand(c, 'restyle', 'nope');
    expect(c.restyle).toHaveBeenCalledWith({}, undefined);
    expect(c.relayout).not.toHaveBeenCalled();
  });

  it('animate calls chart.animate when it exists, else warns', async () => {
    const warn = vi.fn();
    const without = fakeChart();
    await executeCommand(without, 'animate', [['f1'], { frame: { duration: 0 } }], warn);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("'animate'"));
    const withAnimate = fakeChart(true);
    await executeCommand(withAnimate, 'animate', [['f1'], { frame: { duration: 0 } }], warn);
    expect(withAnimate.animate).toHaveBeenCalledWith(['f1'], { frame: { duration: 0 } });
  });

  it('a rejected call warns and resolves', async () => {
    const warn = vi.fn();
    const c = fakeChart();
    c.relayout.mockImplementationOnce(() => Promise.reject(new Error('bad')));
    await expect(executeCommand(c, 'relayout', ['a', 1], warn)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('bad'));
  });

  it('an animation dropped by a later animate call (Pause) resolves quietly', async () => {
    const warn = vi.fn();
    const c = fakeChart(true);
    const error = Object.assign(new Error('interrupted'), { name: 'AnimationInterrupted' });
    c.animate!.mockImplementationOnce(() => Promise.reject(error));
    await expect(executeCommand(c, 'animate', [null, {}], warn)).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('commandBindings (Plotly computeAPICommandBindings)', () => {
  it('layout bindings from string and nested objects', () => {
    expect(commandBindings('relayout', ['yaxis.type', 'log'], 1)).toEqual([
      { type: 'layout', prop: 'yaxis.type', value: 'log' },
    ]);
    expect(commandBindings('relayout', [{ yaxis: { type: 'log', _x: 1 } }], 1)).toEqual([
      { type: 'layout', prop: 'yaxis.type', value: 'log' },
    ]);
  });

  it('data bindings: scalars to every trace, arrays per trace', () => {
    expect(commandBindings('restyle', ['marker.color', 'red'], 3)).toEqual([
      { type: 'data', prop: 'marker.color', traces: null, value: 'red' },
    ]);
    expect(commandBindings('restyle', ['visible', [true, false]], 3)).toEqual([
      { type: 'data', prop: 'visible', traces: [0, 1], value: [true, false] },
    ]);
    expect(commandBindings('restyle', [{ 'line.width': 2 }, [1]], 3)).toEqual([
      { type: 'data', prop: 'line.width', traces: [1], value: [2] },
    ]);
  });

  it('update combines both; animate binds a single frame', () => {
    expect(commandBindings('update', [{ a: 1 }, { b: 2 }], 1)).toHaveLength(2);
    expect(commandBindings('animate', [['f2']], 1)).toEqual([
      { type: 'layout', prop: '_currentFrame', value: 'f2' },
    ]);
    expect(commandBindings('animate', [['a', 'b']], 1)).toEqual([]);
    expect(commandBindings('skip', [], 1)).toEqual([]);
  });
});

describe('simpleBinding (Plotly hasSimpleAPICommandBindings)', () => {
  it('one shared attribute → value lookup', () => {
    const b = simpleBinding(
      [
        { method: 'relayout', args: ['yaxis.type', 'linear'] },
        { method: 'relayout', args: ['yaxis.type', 'log'] },
      ],
      1,
    );
    expect(b?.binding.prop).toBe('yaxis.type');
    expect(b?.lookup.get('log')).toBe(1);
  });

  it('different attributes, several values or several bindings are not simple', () => {
    expect(
      simpleBinding(
        [
          { method: 'relayout', args: ['a', 1] },
          { method: 'relayout', args: ['b', 1] },
        ],
        1,
      ),
    ).toBeUndefined();
    expect(simpleBinding([{ method: 'restyle', args: ['visible', [true, false]] }], 2)).toBe(
      undefined,
    );
    expect(simpleBinding([{ method: 'update', args: [{ a: 1 }, { b: 1 }] }], 1)).toBeUndefined();
    expect(simpleBinding([{ args: ['a', 1] }], 1)).toBeUndefined();
  });

  it('skips hidden items', () => {
    const b = simpleBinding([undefined, { method: 'restyle', args: ['mode', 'lines'] }], 1);
    expect(b?.lookup.get('lines')).toBe(1);
  });
});

describe('CommandObserver (Plotly manageCommandObserver)', () => {
  const layout = (type: string) => ({ yaxis: { type } }) as unknown as FullLayout;
  const commands = [
    { method: 'relayout', args: ['yaxis.type', 'linear'] },
    { method: 'relayout', args: ['yaxis.type', 'log'] },
  ];

  it('reports the matching index only when the bound value changed', () => {
    const o = new CommandObserver();
    o.setCommands(commands, 0);
    expect(o.check([], layout('linear'))).toBeUndefined(); // first check records
    expect(o.check([], layout('linear'))).toBeUndefined();
    expect(o.check([], layout('log'))).toBe(1);
    expect(o.check([], layout('date'))).toBeUndefined(); // no command sets it
    expect(o.check([], layout('linear'))).toBe(0);
  });

  it('reads trace values and accepts a given value (animation frames)', () => {
    const o = new CommandObserver();
    o.setCommands(
      [
        { method: 'restyle', args: ['mode', 'lines'] },
        { method: 'restyle', args: ['mode', 'markers'] },
      ],
      1,
    );
    const data = (mode: string) => [{ mode }] as unknown as FullTrace[];
    o.check(data('lines'), {} as FullLayout);
    expect(o.check(data('markers'), {} as FullLayout)).toBe(1);
    expect(bindingValue(o.binding!.binding, data('x'), {} as FullLayout)).toBe('x');

    const frames = new CommandObserver();
    frames.setCommands(
      [
        { method: 'animate', args: [['a']] },
        { method: 'animate', args: [['b']] },
      ],
      1,
    );
    frames.check([], {} as FullLayout);
    expect(frames.check([], {} as FullLayout, { value: 'b' })).toBe(1);
  });

  it('resets when the commands change', () => {
    const o = new CommandObserver();
    o.setCommands(commands, 0);
    o.check([], layout('linear'));
    o.setCommands([...commands, { method: 'relayout', args: ['yaxis.type', 'date'] }], 0);
    expect(o.check([], layout('date'))).toBeUndefined();
    expect(o.check([], layout('log'))).toBe(1);
  });
});
