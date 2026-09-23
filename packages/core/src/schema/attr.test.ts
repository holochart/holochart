import { describe, expect, expectTypeOf, it } from 'vitest';
import { attr } from './attr.ts';
import type { AttrSpec, InferFull, InferInput, TypedArray } from './types.ts';
import { forEachAttr, getNodeAtPath, resolveChild, walkPath } from './walk.ts';

const marker = attr.object(
  {
    size: attr.number({ dflt: 6, min: 0, arrayOk: true, editType: 'calc' }),
    symbol: attr.enumerated({ values: ['circle', 'square'], dflt: 'circle' }),
    opacity: attr.number({ min: 0, max: 1 }),
    line: attr.object({ color: attr.color({ arrayOk: true }), width: attr.number({ dflt: 0 }) }),
  },
  { editType: 'style' },
);

describe('attr builders', () => {
  it('produce plain, inspectable nodes', () => {
    const n = attr.number({ dflt: 6, min: 0, description: 'Size.', since: '0.1.0' });
    expect(n).toEqual({
      kind: 'attr',
      valType: 'number',
      dflt: 6,
      min: 0,
      description: 'Size.',
      since: '0.1.0',
    });
    expect(attr.integer()).toEqual({ kind: 'attr', valType: 'integer' });
    expect(attr.subplotId({ dflt: 'x' }).valType).toBe('subplotid');
    expect(attr.fn().valType).toBe('function');
    expect(marker.kind).toBe('object');
    expect(marker.editType).toBe('style');
  });

  it('items nodes get name and templateitemname', () => {
    const annotations = attr.items({ text: attr.string() }, { itemName: 'annotation' });
    expect(annotations.kind).toBe('items');
    expect(Object.keys(annotations.item.children)).toEqual(['text', 'name', 'templateitemname']);
  });

  it('infer input types from the declaration', () => {
    type In = InferInput<typeof marker>;
    expectTypeOf<In['size']>().toEqualTypeOf<number | readonly number[] | TypedArray | undefined>();
    expectTypeOf<In['symbol']>().toEqualTypeOf<'circle' | 'square' | undefined>();
    expectTypeOf<NonNullable<In['line']>['color']>().toEqualTypeOf<
      string | readonly string[] | undefined
    >();

    const _mode = attr.flaglist({ flags: ['lines', 'markers'], extras: ['none'] });
    expectTypeOf<InferInput<typeof _mode>>().toEqualTypeOf<
      'lines' | 'markers' | `lines+${string}` | `markers+${string}` | 'none'
    >();

    const _y = attr.number({ extras: ['auto'], dflt: 'auto' });
    expectTypeOf<InferInput<typeof _y>>().toEqualTypeOf<number | 'auto'>();

    const _axis = attr.subplotId({ dflt: 'x', extras: ['free'] });
    expectTypeOf<InferInput<typeof _axis>>().toEqualTypeOf<'x' | `x${number}` | 'free'>();

    const _range = attr.infoArray({ items: [attr.number(), attr.string()] });
    expectTypeOf<InferInput<typeof _range>>().toEqualTypeOf<[number, string]>();
  });

  it('infer full types: defaults make attributes required', () => {
    type Full = InferFull<typeof marker>;
    expectTypeOf<Full['size']>().toEqualTypeOf<number | readonly number[] | TypedArray>();
    expectTypeOf<Full['symbol']>().toEqualTypeOf<'circle' | 'square'>();
    expectTypeOf<Full['opacity']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Full['line']['width']>().toEqualTypeOf<number>();
  });
});

describe('schema walking', () => {
  const root = attr.object({
    marker,
    xaxis: attr.subplotObject('x', { range: attr.infoArray({ items: [attr.any(), attr.any()] }) }),
    annotations: attr.items({ text: attr.string() }, { itemName: 'annotation' }),
    x: attr.dataArray(),
  });

  it('resolves subplot families', () => {
    expect(resolveChild(root, 'xaxis')).toBe(root.children.xaxis);
    expect(resolveChild(root, 'xaxis2')).toBe(root.children.xaxis);
    expect(resolveChild(root, 'xaxis12')).toBe(root.children.xaxis);
    expect(resolveChild(root, 'xaxis1')).toBeUndefined();
    expect(resolveChild(root, 'marker2')).toBeUndefined();
  });

  it('finds nodes by path, through items, info arrays and per-point indices', () => {
    expect(getNodeAtPath(root, 'marker.line.color')).toBe(marker.children.line.children.color);
    expect(getNodeAtPath(root, 'annotations[3].text')).toBe(
      root.children.annotations.item.children.text,
    );
    expect((getNodeAtPath(root, 'xaxis2.range[1]') as AttrSpec | undefined)?.valType).toBe('any');
    expect(getNodeAtPath(root, 'marker.size[10]')).toBe(marker.children.size);
    expect(getNodeAtPath(root, 'x[4]')).toBe(root.children.x);
    expect(getNodeAtPath(root, 'marker.nope')).toBeUndefined();
    expect(getNodeAtPath(root, 'marker.symbol[0]')).toBeUndefined();
    expect(walkPath(root, 'marker.line.width')?.chain.length).toBe(3);
  });

  it('visits every leaf', () => {
    const paths: string[] = [];
    forEachAttr(root, (p) => paths.push(p.join('.')));
    expect(paths).toContain('marker.line.color');
    expect(paths).toContain('annotations.0.templateitemname');
    expect(paths).toContain('xaxis.range');
  });
});
