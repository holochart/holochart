<script setup lang="ts">
/** Shared complete-source panel; metadata and source are fetched only when the panel mounts. */
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { withBase } from 'vitepress';
import {
  loadExampleArtifacts,
  pythonDownload,
  type ExampleArtifacts,
} from '../example-artifacts.ts';
const props = defineProps<{ id: string; entry?: ExampleArtifacts }>();
const record = shallowRef<ExampleArtifacts | undefined>(props.entry);
const language = ref('typescript');
const source = ref('');
const error = ref('');
const loading = ref(false);
const copied = ref(false);
const token = computed(() => props.id.replaceAll('/', '-'));
const variants = computed(() => [
  ...(record.value?.standalone
    ? [
        {
          language: 'typescript',
          label: 'TypeScript-compatible',
          file: `/${record.value.standalone.source}`,
        },
        {
          language: 'javascript',
          label: 'JavaScript',
          file: `/${record.value.standalone.javascript}`,
        },
      ]
    : []),
  ...(record.value?.variants
    .filter((v) => v.language === 'python')
    .map((v) => ({ language: 'python', label: 'Python', file: pythonDownload(v) })) ?? []),
]);
const active = computed(
  () => variants.value.find((v) => v.language === language.value) ?? variants.value[0],
);
const python = computed(() => record.value?.variants.find((v) => v.language === 'python'));
const dependencies = computed(() =>
  language.value === 'python' ? python.value?.dependencies : record.value?.standalone?.dependencies,
);
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
function choose(value: string): void {
  language.value = value;
  try {
    localStorage.setItem('holochart-example-language', value);
  } catch {
    /* Optional preference. */
  }
}
async function move(value: string): Promise<void> {
  choose(value);
  await nextTick();
  document.getElementById(`source-tab-${token.value}-${value}`)?.focus();
}
async function load(): Promise<void> {
  const current = ++generation;
  source.value = '';
  error.value = '';
  loading.value = true;
  try {
    const fresh = await loadExampleArtifacts(props.id);
    if (current !== generation) return;
    record.value = fresh;
    if (!variants.value.some((v) => v.language === language.value))
      language.value = variants.value[0]?.language ?? 'typescript';
    if (!active.value) throw new Error('A complete source export is not available yet.');
    const response = await fetch(withBase(active.value.file));
    if (!response.ok) throw new Error(`Source download failed (${response.status}).`);
    const text = await response.text();
    if (current === generation) source.value = text;
  } catch (cause) {
    if (current === generation)
      error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (current === generation) loading.value = false;
  }
}
async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(source.value);
    copied.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      copied.value = false;
    }, 1800);
  } catch {
    error.value = 'Clipboard unavailable. Select the source or use Download.';
  }
}
onMounted(() => {
  try {
    language.value = localStorage.getItem('holochart-example-language') ?? 'typescript';
  } catch {
    /* Optional preference. */
  }
  void load();
});
watch(language, () => void load());
watch(
  () => props.id,
  () => {
    record.value = props.entry;
    void load();
  },
);
onUnmounted(() => {
  generation++;
  clearTimeout(timer);
});
</script>

<template>
  <section class="hc-complete-source" :aria-label="`Complete source for ${id}`">
    <div
      v-if="variants.length"
      class="hc-source-language-tabs"
      role="tablist"
      :aria-label="`Source language for ${id}`"
    >
      <button
        v-for="(variant, index) in variants"
        :id="`source-tab-${token}-${variant.language}`"
        :key="variant.language"
        type="button"
        role="tab"
        :aria-selected="active?.language === variant.language"
        :aria-controls="`source-panel-${token}`"
        :tabindex="active?.language === variant.language ? 0 : -1"
        @click="choose(variant.language)"
        @keydown.right.prevent="move(variants[(index + 1) % variants.length]!.language)"
        @keydown.left.prevent="
          move(variants[(index + variants.length - 1) % variants.length]!.language)
        "
        @keydown.home.prevent="move(variants[0]!.language)"
        @keydown.end.prevent="move(variants[variants.length - 1]!.language)"
      >
        {{ variant.label }}
      </button>
    </div>
    <div class="hc-complete-source-actions">
      <button type="button" :disabled="!source" @click="copy">
        {{ copied ? 'Copied' : 'Copy complete source' }}
      </button>
      <a
        v-if="active"
        :href="withBase(active.file)"
        :download="`${token}.${language === 'python' ? 'py' : 'js'}`"
        >Download {{ language === 'python' ? '.py' : '.js' }}</a
      >
      <a
        v-if="language === 'python' && python?.notebook"
        :href="withBase(`/${python.notebook.replace(/^examples\//, '')}`)"
        download
        >Matching .ipynb</a
      >
      <a :href="withBase(`/gallery/example/${id}`)">Example details →</a>
    </div>
    <div
      :id="`source-panel-${token}`"
      tabindex="0"
      role="tabpanel"
      :aria-labelledby="active ? `source-tab-${token}-${active.language}` : undefined"
      :aria-label="active ? undefined : 'Complete source'"
      :aria-busy="loading"
    >
      <p v-if="loading" role="status">Loading complete source…</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <pre v-if="source" tabindex="0"><code>{{ source }}</code></pre>
    </div>
    <p v-if="language !== 'python' && record?.standalone" class="hc-source-note">
      Save this complete module as your browser entry in a
      <a :href="withBase('/getting-started/javascript')">Vite app</a>. It includes data, private
      helpers, a sized container and cleanup. The TypeScript-compatible tab uses the same valid
      JavaScript module, without type declarations.
      {{
        record.standalone.verification === 'rendered'
          ? 'This exact copied bundle passed browser rendering and cleanup.'
          : 'Compiled export; copied-bundle browser verification pending.'
      }}
    </p>
    <p v-if="language === 'python' && python" class="hc-source-note">
      Run this complete source in a
      <a :href="withBase('/getting-started/python-jupyter')">configured notebook kernel</a>.
      {{ python.verification.method }}
      <strong v-if="!python.verification.browserVerified"
        >Exact notebook-host rendering is not yet verified.</strong
      >
    </p>
    <p v-if="dependencies?.length" class="hc-source-note">
      Dependencies:
      <code v-for="dependency in dependencies" :key="dependency">{{ dependency }}</code>
    </p>
  </section>
</template>

<style>
.hc-source-language-tabs,
.hc-complete-source-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
}
.hc-source-language-tabs button,
.hc-complete-source-actions :is(a, button) {
  min-height: 36px;
  padding: 6px 10px;
  font-size: 13px;
  line-height: 22px;
  border-radius: 4px;
}
.hc-source-language-tabs button {
  border: 1px solid var(--vp-c-divider);
}
.hc-source-language-tabs button[aria-selected='true'] {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}
.hc-complete-source-actions {
  margin: 8px 0;
  color: var(--vp-c-brand-1);
}
.hc-complete-source [role='tabpanel'] {
  max-height: 540px;
  overflow: auto;
  margin: 10px 0;
  padding: 14px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  font-size: 12px;
  line-height: 19px;
}
.hc-complete-source pre {
  margin: 0;
}
.hc-complete-source [role='tabpanel']:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
}
.hc-source-note {
  margin: 10px 0;
  font-size: 12px;
  line-height: 19px;
  color: var(--vp-c-text-2);
}
.hc-source-note code + code {
  margin-left: 8px;
}
@media (pointer: coarse), (max-width: 640px) {
  .hc-source-language-tabs button,
  .hc-complete-source-actions :is(a, button) {
    min-height: 44px;
  }
}
</style>
