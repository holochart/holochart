import type { BufferGeometry, Material, Texture } from 'three';
import type { ResourceKind, ResourceManager, ResourceStat } from './types.ts';

type Disposable = Texture | BufferGeometry | Material;

interface Entry {
  value: Disposable;
  kind: ResourceKind;
  refs: number;
}

function kindOf(value: Disposable): ResourceKind {
  if ((value as Texture).isTexture) return 'texture';
  if ((value as BufferGeometry).isBufferGeometry) return 'geometry';
  return 'material';
}

/** Create a reference-counted GPU resource registry (plan E2.15). */
export function createResourceManager(): ResourceManager {
  const entries = new Map<string, Entry>();

  return {
    acquire<T extends Disposable>(key: string, create: () => T): T {
      let entry = entries.get(key);
      if (!entry) {
        const value = create();
        entry = { value, kind: kindOf(value), refs: 0 };
        entries.set(key, entry);
      }
      entry.refs++;
      return entry.value as T;
    },

    release(key: string): void {
      const entry = entries.get(key);
      if (!entry) return;
      entry.refs--;
      if (entry.refs <= 0) {
        entry.value.dispose();
        entries.delete(key);
      }
    },

    stats(): ResourceStat[] {
      return [...entries].map(([key, { kind, refs }]) => ({ key, kind, refs }));
    },

    disposeAll(): void {
      for (const { value } of entries.values()) value.dispose();
      entries.clear();
    },
  };
}
