/**
 * The script-tag build's split (ADR-015): `holochart.iife.min.js` is `bundle-2d.ts`, and the
 * `holochart-3d.iife.min.js` add-on maps core, the runtime, traces-basic and components to
 * `window.Holochart`
 * and adds the 3D package's exports to it (`scripts/build/iife-split.ts`). These checks keep that
 * mapping exact; `tests/bundle/iife.spec.ts` loads the built scripts.
 */
import * as core from '@mk7s/holochart-core';
import type { MeshModule } from '@mk7s/holochart-render';
import * as runtime from '@mk7s/holochart-runtime';
import * as traces3d from '@mk7s/holochart-traces-3d';
import * as tracesBasic from '@mk7s/holochart-traces-basic';
import * as tracesStats from '@mk7s/holochart-traces-stats';
import * as tracesSci from '@mk7s/holochart-traces-sci';
import * as tracesFinance from '@mk7s/holochart-traces-finance';
import * as tracesHier from '@mk7s/holochart-traces-hier';
import * as components from '@mk7s/holochart-components';
import { describe, expect, it } from 'vitest';
import * as bundle2d from './bundle-2d.ts';
import * as full from './index.ts';
import { lazy3D, provideLazy3D } from './iife/host.ts';

type Namespace = Record<string, unknown>;

describe('script-tag build split', () => {
  it('re-exports core, the runtime, traces-basic and components whole and unchanged in the 2D bundle', () => {
    // The 3D add-on reads these packages' exports from `window.Holochart`: none may be missing,
    // shadowed by a local export, or made ambiguous by another package's `export *` of the same
    // name (which would drop it from the bundle).
    const shared: Record<string, Namespace> = { core, runtime, tracesBasic, components };
    const starred: Record<string, Namespace> = {
      ...shared,
      tracesStats,
      tracesSci,
      tracesFinance,
      tracesHier,
    };
    const problems: string[] = [];
    for (const [pkg, ns] of Object.entries(shared)) {
      for (const [name, value] of Object.entries(ns)) {
        if ((bundle2d as Namespace)[name] !== value)
          problems.push(`${pkg}.${name}: not re-exported`);
        for (const [other, otherNs] of Object.entries(starred)) {
          if (other !== pkg && name in otherNs && otherNs[name] !== value) {
            problems.push(`${pkg}.${name}: also exported by ${other}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('adds exactly the 3D exports of the full bundle', () => {
    // The add-on defines every traces-3d export the 2D bundle lacks on `window.Holochart`; the ESM
    // full bundle has the same names with the same values, and none is shadowed.
    for (const [name, value] of Object.entries(traces3d)) {
      expect(name in bundle2d, name).toBe(false);
      expect((full as Namespace)[name], name).toBe(value);
    }
    const extra = Object.keys(full).filter((name) => !(name in bundle2d) && !(name in traces3d));
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
