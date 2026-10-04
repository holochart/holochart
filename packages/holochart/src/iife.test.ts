/**
 * The script-tag build's split (ADR-015): `holochart.iife.min.js` is `bundle-2d.ts` plus the
 * `@internal` names the add-on needs (`iife/addon-shared.ts`), and the `holochart-3d.iife.min.js`
 * add-on maps core, the runtime, traces-basic and components to `window.Holochart` and adds the
 * 3D package's public exports to it (`scripts/build/iife-split.ts`, which checks at build time that
 * every name the add-on imports is there). These checks keep that mapping exact;
 * `tests/bundle/iife.spec.ts` loads the built scripts.
 */
import * as core from '@mk7s/holochart-core';
import type { MeshModule } from '@mk7s/holochart-render';
import * as runtime from '@mk7s/holochart-runtime';
import * as traces3d from '@mk7s/holochart-traces-3d';
import * as tracesBasic from '@mk7s/holochart-traces-basic';
import * as components from '@mk7s/holochart-components';
import { describe, expect, it } from 'vitest';
import * as bundle2d from './bundle-2d.ts';
import * as exports3d from './exports-3d.ts';
import * as full from './index.ts';
import * as addonShared from './iife/addon-shared.ts';
import { lazy3D, provideLazy3D } from './iife/host.ts';

type Namespace = Record<string, unknown>;

describe('script-tag build split', () => {
  it("has the shared packages' exports unchanged on the global: the public ones and the add-on's", () => {
    // The 3D add-on reads these packages' exports from `window.Holochart`, which is the 2D bundle
    // plus `addon-shared.ts` (`iife.ts`): a name of theirs on the global must be their value, and
    // the two lists must not overlap (an `export *` of both would drop a name they both have).
    const shared: Record<string, Namespace> = { core, runtime, tracesBasic, components };
    const global: Namespace = { ...bundle2d, ...addonShared };
    const problems: string[] = [];
    for (const [pkg, ns] of Object.entries(shared)) {
      for (const [name, value] of Object.entries(ns)) {
        if (name in global && global[name] !== value) problems.push(`${pkg}.${name}: shadowed`);
      }
    }
    for (const name of Object.keys(addonShared)) {
      if (name in bundle2d) problems.push(`${name}: in the public list and in addon-shared.ts`);
      if (!Object.values(shared).some((ns) => ns[name] === (addonShared as Namespace)[name])) {
        problems.push(`${name}: not an export of a shared package`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('adds exactly the 3D exports of the full bundle', () => {
    // The add-on defines the 3D package's public exports (`exports-3d.ts`) on `window.Holochart`;
    // the ESM full bundle has the same names with the same values, and the 2D bundle none of them.
    for (const [name, value] of Object.entries(exports3d)) {
      expect(name in bundle2d, name).toBe(false);
      expect(name in addonShared, name).toBe(false);
      expect((traces3d as Namespace)[name], name).toBe(value);
      expect((full as Namespace)[name], name).toBe(value);
    }
    const extra = Object.keys(full).filter((name) => !(name in bundle2d) && !(name in exports3d));
    expect(extra).toEqual([]);
  });

  it('leaves the 3D modules out of the 2D bundle', () => {
    expect(bundle2d.builtins).toEqual(full.builtins.filter((m) => !traces3d.traces3d.includes(m)));
    expect(full.builtins).toEqual(expect.arrayContaining([...traces3d.traces3d]));
  });

  it("serves render's 3D chunks once the add-on provides them", async () => {
    await expect(lazy3D('mesh')).rejects.toThrow(/holochart-3d\.iife\.min\.js/);
    const mesh = { createMeshPrimitive: () => undefined } as unknown as MeshModule;
    provideLazy3D('mesh', mesh);
    await expect(lazy3D('mesh')).resolves.toBe(mesh);
  });
});
