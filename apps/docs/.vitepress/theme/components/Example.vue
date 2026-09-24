<script setup lang="ts">
/**
 * `<Example id="_dev/hello-cube" />`: a live embed of a canonical example (plan E19.2).
 *
 * - Client-only: the example registry and the example module are imported after mount, so SSR
 *   renders a static placeholder and never runs example code.
 * - Lazy: the example starts when it scrolls near the viewport (one WebGL context per live
 *   example, and browsers cap contexts at about 16).
 * - Disposes the example on unmount (page navigation).
 * - Tabs for the live preview and the TypeScript source (highlighted at build time), a copy
 *   button, and a link that opens the example in the dev sandbox.
 * - The figure's id is `example-<id>` (`exampleAnchor`), so the gallery can link to the embed.
 * - `bare`: only the live chart, without the tab bar and caption, for showcase pages (demos)
 *   that frame the chart with their own headings and text.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { exampleAnchor } from '../example-anchor.ts';

type Runtime = typeof import('../example-runtime.ts');
type Handle = import('../example-runtime.ts').ExampleHandle;
type Meta = Awaited<ReturnType<Runtime['loadExample']>>['meta'];

const props = defineProps<{
  /** Example id: path under `examples/` without `.ts`, e.g. `scatter/basic`. */
  id: string;
  /** Preview height in CSS pixels (default: the example's `meta.size.height`, else 400). */
  height?: number;
  /** Show only the live chart: no Preview/Source tabs, no caption. */
  bare?: boolean;
}>();

const DEFAULT_HEIGHT = 400;

const tab = ref<'preview' | 'source'>('preview');
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const errorMessage = ref('');
const meta = shallowRef<Meta | null>(null);
const height = ref(props.height ?? DEFAULT_HEIGHT);
const source = shallowRef<{ code: string; html: string } | null>(null);
const sourceError = ref('');
const copied = ref(false);
const root = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);

let handle: Handle | undefined;
let observer: IntersectionObserver | undefined;
let unmounted = false;
let runtime: Promise<Runtime> | undefined;
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

const sandboxHref = computed(() => {
  const baseUrl = __HOLOCHART_SANDBOX_URL__;
  if (!baseUrl) return '';
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}example=${encodeURIComponent(props.id).replace(/%2F/gi, '/')}`;
});

function loadRuntime(): Promise<Runtime> {
  if (!import.meta.env.SSR) runtime ??= import('../example-runtime.ts');
  return runtime ?? Promise.reject(new Error('Examples only run in the browser.'));
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function dispose(): void {
  const h = handle;
  handle = undefined;
  try {
    h?.dispose();
  } catch (err) {
    console.error(`[Example ${props.id}] dispose failed`, err);
  }
}

async function start(): Promise<void> {
  if (status.value !== 'idle') return;
  status.value = 'loading';
  try {
    const rt = await loadRuntime();
    const mod = await rt.loadExample(props.id);
    if (unmounted) return;
    meta.value = mod.meta;
    height.value = props.height ?? mod.meta.size?.height ?? DEFAULT_HEIGHT;
    // Examples read the container size when they start, so apply the height first.
    await nextTick();
    if (unmounted || !stage.value) return;
    handle = mod.run(stage.value);
    await handle.ready;
    if (!unmounted) status.value = 'ready';
  } catch (err) {
    if (unmounted) return;
    status.value = 'error';
    errorMessage.value = message(err);
    console.error(`[Example ${props.id}]`, err);
  }
}

async function loadSource(): Promise<{ code: string; html: string } | null> {
  if (source.value) return source.value;
  try {
    const rt = await loadRuntime();
    const load = rt.sources[props.id];
    if (!load) throw new Error(`Unknown example "${props.id}".`);
    const mod = await load();
    source.value = { code: mod.code, html: mod.html };
  } catch (err) {
    sourceError.value = message(err);
  }
  return source.value;
}

function showPreview(): void {
  tab.value = 'preview';
}

async function showSource(): Promise<void> {
  tab.value = 'source';
  await loadSource();
}

async function copy(): Promise<void> {
  const src = await loadSource();
  if (!src) return;
  try {
    await navigator.clipboard.writeText(src.code);
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied.value = false), 2000);
  } catch (err) {
    console.error(`[Example ${props.id}] copy failed`, err);
  }
}

onMounted(() => {
  const el = root.value;
  if (!el || typeof IntersectionObserver === 'undefined') {
    void start();
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer?.disconnect();
        observer = undefined;
        void start();
      }
    },
    { rootMargin: '200px 0px' },
  );
  observer.observe(el);
});

onBeforeUnmount(() => {
  unmounted = true;
  observer?.disconnect();
  clearTimeout(copiedTimer);
  dispose();
});
</script>

<template>
  <figure
    :id="exampleAnchor(id)"
    ref="root"
    class="hc-example"
    :class="{ 'hc-example--bare': bare }"
    :data-example-id="id"
  >
    <div v-if="!bare" class="hc-example-bar">
      <div class="hc-example-tabs" role="tablist" :aria-label="`Example ${id}`">
        <button
          type="button"
          role="tab"
          class="hc-example-tab"
          :aria-selected="tab === 'preview'"
          @click="showPreview"
        >
          Preview
        </button>
        <button
          type="button"
          role="tab"
          class="hc-example-tab"
          :aria-selected="tab === 'source'"
          @click="showSource"
        >
          Source (TS)
        </button>
      </div>
      <div class="hc-example-actions">
        <button type="button" class="hc-example-action" @click="copy">
          {{ copied ? 'Copied' : 'Copy' }}
        </button>
        <a
          v-if="sandboxHref"
          class="hc-example-action"
          :href="sandboxHref"
          target="_blank"
          rel="noopener"
        >
          Open in sandbox
        </a>
      </div>
    </div>

    <div
      v-show="tab === 'preview'"
      class="hc-example-preview"
      :role="bare ? undefined : 'tabpanel'"
    >
      <div
        ref="stage"
        class="hc-example-stage"
        role="group"
        :aria-label="meta?.title ?? id"
        :style="{ height: `${height}px` }"
      />
      <div v-if="status !== 'ready'" class="hc-example-status" :data-status="status">
        <span v-if="status === 'error'">Could not run example “{{ id }}”: {{ errorMessage }}</span>
        <span v-else>Loading example…</span>
      </div>
    </div>

    <div v-if="!bare" v-show="tab === 'source'" class="hc-example-source" role="tabpanel">
      <!-- Highlighted at build time by the example-sources Vite plugin from the repo's own file. -->
      <div v-if="source" v-html="source.html" />
      <p v-else-if="sourceError" class="hc-example-status" data-status="error">{{ sourceError }}</p>
      <p v-else class="hc-example-status">Loading source…</p>
    </div>

    <figcaption v-if="!bare" class="hc-example-caption">
      <template v-if="meta">
        <strong>{{ meta.title }}.</strong> {{ meta.description }}
      </template>
      <code v-else>{{ id }}</code>
    </figcaption>
  </figure>
</template>
