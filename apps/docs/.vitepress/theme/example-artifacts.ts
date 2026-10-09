/** Small lazy metadata records accompany independently runnable source downloads. */
import { withBase } from 'vitepress';
import type { LanguageVariant } from '../../../../examples/_lib/catalog.ts';
import type { StandaloneArtifact } from '../../../../tools/gallery-gen/src/standalone.ts';
export interface ExampleArtifacts {
  id: string;
  title: string;
  variants: LanguageVariant[];
  standalone?: Omit<StandaloneArtifact, 'inputs'>;
}
const pending = new Map<string, Promise<ExampleArtifacts>>();
export function loadExampleArtifacts(id: string): Promise<ExampleArtifacts> {
  let request = pending.get(id);
  if (!request) {
    request = fetch(withBase(`/gallery/artifacts/${id}.json`))
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Complete-source metadata unavailable (${response.status}).`);
        const record = (await response.json()) as ExampleArtifacts;
        if (record.id !== id) throw new Error('Source metadata belongs to another example.');
        return record;
      })
      .catch((error: unknown) => {
        pending.delete(id);
        throw error;
      });
    pending.set(id, request);
  }
  return request;
}
export function pythonDownload(variant: LanguageVariant): string {
  return variant.download ?? `/${variant.source.replace(/^examples\//, '')}`;
}
