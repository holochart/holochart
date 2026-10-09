<script setup lang="ts">
import '../gallery.css';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { withBase } from 'vitepress';
import type { GalleryData } from '../data/gallery.data.ts';
import { familyById, subtypeById } from '../../../../../examples/_lib/families.ts';
import { familyRoute } from '../gallery-state.ts';
import { pythonDownload } from '../example-artifacts.ts';
import Example from './Example.vue';
import GalleryCard from './GalleryCard.vue';

type Entry = GalleryData['examples'][number];
const props = defineProps<{
  entry: Entry;
  related: { variations: Entry[]; alternatives: Entry[] };
}>();
const language = ref('typescript');
const source = ref('');
const sourceError = ref('');
const copied = ref(false);
const loading = ref(false);
const returnTo = ref(familyRoute(props.entry.primaryFamily));
const variants = computed(() => [
  ...(props.entry.standalone
    ? [
        {
          language: 'typescript',
          label: 'TypeScript-compatible bundle',
          file: props.entry.standalone.source,
          verification: props.entry.standalone.verification,
        },
        {
          language: 'javascript',
          label: 'JavaScript',
          file: props.entry.standalone.javascript,
          verification: props.entry.standalone.verification,
        },
      ]
    : []),
  ...props.entry.variants
    .filter((v) => v.language === 'python')
    .map((v) => ({
      language: 'python',
      label: 'Python',
      file: pythonDownload(v).replace(/^\//, ''),
      verification: v.verification.state,
    })),
]);
const active = computed(
  () => variants.value.find((v) => v.language === language.value) ?? variants.value[0],
);
const python = computed(() => props.entry.variants.find((v) => v.language === 'python'));
const dependencies = computed(() =>
  language.value === 'python'
    ? (python.value?.dependencies ?? [])
    : (props.entry.standalone?.dependencies ?? props.entry.variants[0]?.dependencies ?? []),
);
let generation = 0;
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
async function loadSource(): Promise<void> {
  const current = ++generation;
  source.value = '';
  sourceError.value = '';
  if (!active.value) return;
  loading.value = true;
  try {
    const response = await fetch(withBase(`/${active.value.file}`));
    if (!response.ok) throw new Error(`Source download returned ${response.status}.`);
    const text = await response.text();
    if (current === generation) source.value = text;
  } catch (error) {
    if (current === generation)
      sourceError.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (current === generation) loading.value = false;
  }
}
function selectLanguage(value: string): void {
  language.value = value;
  try {
    localStorage.setItem('holochart-example-language', value);
  } catch {
    /* Storage may be disabled. */
  }
}
async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(source.value);
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copied.value = false;
    }, 1800);
  } catch {
    sourceError.value =
      'Clipboard access failed. Select the source below or use its download link.';
  }
}
async function moveLanguage(value: string): Promise<void> {
  selectLanguage(value);
  await nextTick();
  document.getElementById(`tab-${value}`)?.focus();
}
function restore(): void {
  returnTo.value = familyRoute(props.entry.primaryFamily);
  try {
    const preference = localStorage.getItem('holochart-example-language');
    language.value = variants.value.some((v) => v.language === preference)
      ? preference!
      : (variants.value[0]?.language ?? 'typescript');
  } catch {
    /* Storage may be disabled. */
  }
  const query = new URLSearchParams(location.search);
  const from = query.get('from');
  if (
    from &&
    /^\/gallery\/(?!example\/)/.test(from) &&
    !from.includes('..') &&
    !from.includes('\\')
  )
    returnTo.value = from;
  void loadSource();
}
watch(language, () => void loadSource());
watch(
  () => props.entry.id,
  () => {
    generation++;
    if (!variants.value.some((v) => v.language === language.value))
      language.value = variants.value[0]?.language ?? 'typescript';
    restore();
  },
);
onMounted(restore);
onUnmounted(() => {
  generation++;
  clearTimeout(copiedTimer);
});
const sourceSetup = computed(() =>
  language.value === 'python' ? '/getting-started/python-jupyter' : '/getting-started/javascript',
);
const sandboxHref = computed(() => {
  const url = __HOLOCHART_SANDBOX_URL__;
  if (!url) return '';
  return `${url}${url.includes('?') ? '&' : '?'}example=${encodeURIComponent(props.entry.id)}`;
});
</script>

<template>
  <main class="hc-example-detail hc-gallery">
    <nav class="hc-breadcrumbs" aria-label="Breadcrumb">
      <ol>
        <li><a :href="withBase('/')">Home</a></li>
        <li><a :href="withBase('/gallery/')">Gallery</a></li>
        <li>
          <a :href="withBase(familyRoute(entry.primaryFamily))">{{
            familyById(entry.primaryFamily)?.label
          }}</a>
        </li>
        <li>
          <span aria-current="page">{{ entry.title }}</span>
        </li>
      </ol>
    </nav>
    <header class="hc-gallery-header">
      <p class="hc-gallery-eyebrow">
        {{ entry.chartTypes.map((t) => subtypeById(t)?.label ?? t).join(' · ') }}
      </p>
      <h1 class="hc-gallery-title">{{ entry.title }}</h1>
      <p class="hc-gallery-lede">{{ entry.description }}</p>
      <p class="hc-directory-actions">
        <a :href="withBase(returnTo)">← Return to results</a
        ><a :href="withBase(`${returnTo}#${entry.id}`)">Quick preview in the gallery</a
        ><a v-if="sandboxHref" :href="sandboxHref">Open deployed playground →</a>
      </p>
    </header>
    <div class="hc-example-detail-grid">
      <section class="hc-example-preview">
        <h2>Chart preview</h2>
        <div class="vp-doc"><Example :id="entry.id" :key="entry.id" bare /></div>
        <p class="hc-example-detail-note">
          The preview runs the canonical browser example. A Python variant has its own verification
          record below.
        </p>
      </section>
      <section class="hc-example-source">
        <h2>Complete source</h2>
        <div
          v-if="variants.length"
          class="hc-source-tabs"
          role="tablist"
          aria-label="Source language"
        >
          <button
            v-for="variant in variants"
            :id="`tab-${variant.language}`"
            :key="variant.language"
            type="button"
            role="tab"
            :aria-selected="active?.language === variant.language"
            aria-controls="hc-complete-source"
            :tabindex="active?.language === variant.language ? 0 : -1"
            @click="selectLanguage(variant.language)"
            @keydown.home.prevent="moveLanguage(variants[0]!.language)"
            @keydown.end.prevent="moveLanguage(variants[variants.length - 1]!.language)"
            @keydown.right.prevent="
              moveLanguage(variants[(variants.indexOf(variant) + 1) % variants.length]!.language)
            "
            @keydown.left.prevent="
              moveLanguage(
                variants[(variants.indexOf(variant) + variants.length - 1) % variants.length]!
                  .language,
              )
            "
          >
            {{ variant.label }}
          </button>
        </div>
        <div class="hc-source-actions">
          <button v-if="active" type="button" :disabled="!source" @click="copy">
            {{ copied ? 'Copied' : 'Copy complete source' }}</button
          ><a
            v-if="active"
            :href="withBase(`/${active.file}`)"
            :download="`${entry.id.replaceAll('/', '-')}.${active.language === 'python' ? 'py' : 'js'}`"
            >Download {{ active.language === 'python' ? '.py' : '.js' }}</a
          ><a
            v-if="language === 'python' && python?.notebook"
            :href="withBase(`/notebooks/${python.notebook.split('/').pop()}`)"
            download
            >Download .ipynb</a
          >
        </div>
        <div
          id="hc-complete-source"
          role="tabpanel"
          :aria-labelledby="active ? `tab-${active.language}` : undefined"
          :aria-label="active ? undefined : 'Complete source'"
          :aria-busy="loading"
          tabindex="0"
        >
          <p v-if="loading" role="status">Loading complete source…</p>
          <p v-if="sourceError" role="alert">{{ sourceError }}</p>
          <pre v-if="source" tabindex="0"><code>{{ source }}</code></pre>
        </div>
        <p v-if="!entry.standalone && !python">
          This example currently requires the repository harness.
          <a :href="withBase('/getting-started/installation#try-it-from-the-monorepo')"
            >Run it in the source sandbox</a
          >.
        </p>
        <p v-if="entry.standalone && language !== 'python'" class="hc-example-detail-note">
          This complete browser module includes private helpers, local data and assets. It keeps
          public package imports and mounts its own container; save it as your browser app's entry
          module. The TypeScript-compatible tab shows the same transpiled module, without TypeScript
          declarations.
        </p>
      </section>
    </div>
    <div class="hc-example-detail-facts">
      <section>
        <h2>Run this example</h2>
        <p>
          <a :href="withBase(sourceSetup)"
            >Follow the
            {{ language === 'python' ? 'Python / Jupyter' : 'browser application' }} setup →</a
          >
        </p>
        <p>
          Dependencies:
          <code v-for="dependency in dependencies" :key="dependency">{{ dependency }}</code>
        </p>
        <p v-if="language !== 'python'">
          Holochart packages currently use the source workspace. Browser output requires WebGL2 and
          a sized container. The downloaded module waits for rendering and exports
          <code>cleanup()</code> to release resources.
        </p>
        <p v-else>
          Run the Python source in a notebook cell after installing the bridge in the active kernel.
          Use the matching notebook download for separate setup, explanation and output cells.
        </p>
      </section>
      <section>
        <h2>Support and verification</h2>
        <dl>
          <dt>API</dt>
          <dd>{{ entry.api === 'express' ? 'Express' : 'Figure API' }}</dd>
          <dt>Dimension</dt>
          <dd>
            {{
              entry.renderingDimension === 'native-3d'
                ? 'Native 3D'
                : entry.renderingDimension === 'extruded'
                  ? '2D extrusion'
                  : '2D'
            }}
          </dd>
          <dt>Learning level</dt>
          <dd>{{ entry.difficulty === 'unassessed' ? 'Not yet assessed' : entry.difficulty }}</dd>
          <dt>Browser source</dt>
          <dd>
            {{
              entry.standalone?.verification === 'rendered'
                ? 'Copied bundle rendered and cleaned up in Chromium WebGL2.'
                : 'Source export compiled; copied bundle browser smoke pending.'
            }}
          </dd>
          <template v-if="python"
            ><dt>Python source</dt>
            <dd>
              {{ python.verification.method }}
              <strong v-if="!python.verification.browserVerified"
                >Notebook-host rendering is not yet verified for this exact variant.</strong
              >
            </dd></template
          >
        </dl>
        <p v-for="note in entry.standalone?.notes" :key="note">{{ note }}</p>
        <p v-if="entry.primaryFamily === 'maps' || entry.primaryFamily === 'networks'">
          Geo and graph traces require their public browser extension imports. Those extensions are
          absent from the current Python bridge; Sankey is part of the bundled 2D runtime.
        </p>
        <p><a :href="withBase('/reference/plotly-compat')">Review attribute compatibility →</a></p>
      </section>
      <section>
        <h2>Data and configuration</h2>
        <p>{{ entry.description }}</p>
        <p>
          The complete source includes its local data constants and fixtures. Inspect them alongside
          labels, units and trace configuration before substituting your data. Network requirements,
          when present, are stated beside source verification.
        </p>
        <p>
          Canonical example: <code>{{ entry.id }}</code
          >. Rendering size: {{ entry.size.width }} × {{ entry.size.height }} pixels.
        </p>
      </section>
      <section>
        <h2>Documentation and next steps</h2>
        <ul>
          <li v-for="doc in entry.docs" :key="doc">
            <a :href="withBase(doc)"
              >{{
                entry.chartTypes.find((type) => subtypeById(type)?.docs === doc)
                  ? subtypeById(entry.chartTypes.find((type) => subtypeById(type)?.docs === doc)!)
                      ?.label
                  : doc
              }}
              guide</a
            >
          </li>
          <li v-for="page in entry.pages" :key="page.link">
            <a :href="withBase(page.link)">{{ page.title }}</a>
          </li>
          <li>
            <a :href="withBase(familyRoute(entry.primaryFamily))"
              >Explore {{ familyById(entry.primaryFamily)?.label }}</a
            >
          </li>
          <li v-if="python">
            <a :href="withBase('/python/troubleshooting')">Notebook troubleshooting</a>
          </li>
        </ul>
      </section>
    </div>
    <section v-if="related.variations.length" class="hc-family-preview">
      <h2>More of this chart type</h2>
      <div class="hc-related-grid">
        <GalleryCard
          v-for="variation in related.variations"
          :key="variation.id"
          :entry="variation"
          :context="returnTo"
        />
      </div>
    </section>
    <section v-if="related.alternatives.length" class="hc-family-preview">
      <h2>Related chart alternatives</h2>
      <div class="hc-related-grid">
        <GalleryCard
          v-for="alternative in related.alternatives"
          :key="alternative.id"
          :entry="alternative"
          :context="returnTo"
        />
      </div>
    </section>
  </main>
</template>

<style>
.hc-example-detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 22px;
  margin-top: 24px;
}
.hc-example-detail-grid section {
  min-width: 0;
}
.hc-example-detail h2 {
  font-size: 20px;
  margin: 0 0 14px;
}
.hc-example-detail p,
.hc-example-detail dd,
.hc-example-detail li {
  font-size: 13px;
  line-height: 1.6;
}
.hc-example-detail-note {
  color: var(--vp-c-text-2);
  font-size: 12px !important;
}
.hc-source-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.hc-source-tabs button,
.hc-source-actions button,
.hc-source-actions a {
  padding: 5px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  font-size: 12px;
}
.hc-source-tabs [aria-selected='true'] {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}
.hc-source-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 10px 0;
}
.hc-source-actions button:disabled {
  opacity: 0.5;
}
.hc-example-source [role='tabpanel'] {
  max-height: 540px;
  overflow: auto;
  padding: 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-code-block-bg);
  font-size: 12px;
  line-height: 1.6;
}
.hc-example-source pre {
  margin: 0;
}
.hc-example-source pre code {
  white-space: pre;
}
.hc-example-detail-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 28px;
  margin: 32px 0;
}
.hc-example-detail-facts code {
  display: inline-block;
  margin: 0 5px 4px 0;
  overflow-wrap: anywhere;
}
.hc-example-detail-facts dt {
  font-size: 12px;
  font-weight: 600;
  margin-top: 8px;
}
.hc-example-detail-facts dd {
  margin-left: 0;
}
.hc-related-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 960px) {
  .hc-example-detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .hc-related-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .hc-example-detail-facts {
    grid-template-columns: minmax(0, 1fr);
  }
  .hc-example-detail {
    padding: 16px 12px 48px;
  }
}
@media (max-width: 420px) {
  .hc-related-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
