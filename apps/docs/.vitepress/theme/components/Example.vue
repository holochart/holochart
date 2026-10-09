<script setup lang="ts">
/**
 * `<Example id="scatter/basic" />`: a live embed of a canonical example (plan E19.2).
 *
 * - Client-only: the example registry and the example module are imported after mount, so SSR
 *   renders a static placeholder and never runs example code.
 * - Lazy: the example starts when it scrolls near the viewport (one WebGL context per live
 *   example, and browsers cap contexts at about 16). Long pages stay under that cap: at most
 *   `MAX_LIVE` examples run at once (`live-examples.ts`), the farthest from view is disposed when
 *   another starts, and it starts again when it scrolls back.
 * - Disposes the example on unmount (page navigation).
 * - Tabs for preview and independently runnable source; shared language tabs lazily fetch
 *   complete browser/Python downloads with real artifact verification.
 * - The figure's id is `example-<id>` (`exampleAnchor`), so the gallery can link to the embed.
 * - `bare`: only the live chart, without the tab bar and caption, for showcase pages (demos)
 *   that frame the chart with their own headings and text.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { exampleAnchor } from '../example-anchor.ts';
import { claimLiveSlot, rebalance } from '../live-examples.ts';
import { withBase } from 'vitepress';
import ExampleSource from './ExampleSource.vue';

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
  /** Show preview and source together when the viewport is wide enough. */
  split?: boolean;
}>();

const DEFAULT_HEIGHT = 400;

const tab = ref<'preview' | 'source'>('preview');
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const errorMessage = ref('');
const meta = shallowRef<Meta | null>(null);
const height = ref(props.height ?? DEFAULT_HEIGHT);
const root = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const wide = ref(false);
const sideBySide = computed(() => Boolean(props.split && wide.value && !props.bare));
let splitQuery: MediaQueryList | undefined;
function syncSplit(): void {
  wide.value = splitQuery?.matches ?? false;
}

let handle: Handle | undefined;
let observer: IntersectionObserver | undefined;
/** In or near the viewport, as the observer last reported (examples in view are never evicted). */
let inView = false;
/** Releases this example's slot in the page's live-example budget. */
let releaseSlot: (() => void) | undefined;
/** Bumped by each eviction, so a start still loading when evicted gives up. */
let generation = 0;
let unmounted = false;
let runtime: Promise<Runtime> | undefined;

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
  releaseSlot?.();
  releaseSlot = undefined;
  const h = handle;
  handle = undefined;
  try {
    h?.dispose();
  } catch (err) {
    console.error(`[Example ${props.id}] dispose failed`, err);
  }
}

/** Disposes the example to free its WebGL context; it starts again when back in view. */
function evict(): void {
  generation++;
  dispose();
  status.value = 'idle';
}

async function start(): Promise<void> {
  if (status.value !== 'idle' || !root.value) return;
  status.value = 'loading';
  const gen = generation;
  const stale = (): boolean => unmounted || gen !== generation;
  releaseSlot = claimLiveSlot({ el: root.value, inView: () => inView, evict });
  try {
    const rt = await loadRuntime();
    const mod = await rt.loadExample(props.id);
    if (stale()) return;
    meta.value = mod.meta;
    height.value = props.height ?? mod.meta.size?.height ?? DEFAULT_HEIGHT;
    // Examples read the container size when they start, so apply the height first.
    await nextTick();
    if (stale() || !stage.value) return;
    handle = mod.run(stage.value);
    await handle.ready;
    if (!stale()) status.value = 'ready';
  } catch (err) {
    if (stale()) return;
    releaseSlot?.();
    releaseSlot = undefined;
    status.value = 'error';
    errorMessage.value = message(err);
    stage.value?.replaceChildren();
    console.error(`[Example ${props.id}]`, err);
  }
}

function showPreview(): void {
  tab.value = 'preview';
}
function showSource(): void {
  tab.value = 'source';
}
async function moveTab(value: 'preview' | 'source'): Promise<void> {
  tab.value = value;
  await nextTick();
  document.getElementById(`${exampleAnchor(props.id)}-tab-${value}`)?.focus();
}

onMounted(() => {
  if (props.split) {
    splitQuery = window.matchMedia('(min-width: 1100px)');
    syncSplit();
    splitQuery.addEventListener('change', syncSplit);
  }
  const el = root.value;
  if (!el || typeof IntersectionObserver === 'undefined') {
    inView = true;
    void start();
    return;
  }
  // Kept connected: an example evicted from the live budget starts again when back in view.
  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      // Back in view: start (again). Out of view: the page may be over its live budget.
      if (inView) void start();
      else rebalance();
    },
    { rootMargin: '200px 0px' },
  );
  observer.observe(el);
});

onBeforeUnmount(() => {
  splitQuery?.removeEventListener('change', syncSplit);
  unmounted = true;
  observer?.disconnect();
  dispose();
});
</script>

<template>
  <figure
    :id="exampleAnchor(id)"
    ref="root"
    class="hc-example"
    :class="{ 'hc-example--bare': bare, 'hc-example--split': sideBySide }"
    :data-example-id="id"
  >
    <div v-if="!bare" class="hc-example-bar">
      <div v-if="!sideBySide" class="hc-example-tabs" role="tablist" :aria-label="`Example ${id}`">
        <button
          type="button"
          role="tab"
          class="hc-example-tab"
          :id="`${exampleAnchor(id)}-tab-preview`"
          :aria-controls="`${exampleAnchor(id)}-panel-preview`"
          :tabindex="tab === 'preview' ? 0 : -1"
          @keydown.right.prevent="moveTab('source')"
          @keydown.left.prevent="moveTab('source')"
          :aria-selected="tab === 'preview'"
          @click="showPreview"
        >
          Preview
        </button>
        <button
          type="button"
          role="tab"
          class="hc-example-tab"
          :id="`${exampleAnchor(id)}-tab-source`"
          :aria-controls="`${exampleAnchor(id)}-panel-source`"
          :tabindex="tab === 'source' ? 0 : -1"
          @keydown.right.prevent="moveTab('preview')"
          @keydown.left.prevent="moveTab('preview')"
          :aria-selected="tab === 'source'"
          @click="showSource"
        >
          Complete source
        </button>
      </div>
      <span v-else class="hc-example-view-label">Live preview · Complete source</span>
      <div class="hc-example-actions">
        <a class="hc-example-action" :href="withBase(`/gallery/example/${id}`)"
          >Details & downloads</a
        >
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
      v-show="sideBySide || tab === 'preview'"
      class="hc-example-preview"
      :id="`${exampleAnchor(id)}-panel-preview`"
      :aria-labelledby="bare || sideBySide ? undefined : `${exampleAnchor(id)}-tab-preview`"
      :role="bare ? undefined : sideBySide ? 'region' : 'tabpanel'"
      :aria-label="sideBySide ? 'Live preview' : undefined"
    >
      <div
        ref="stage"
        class="hc-example-stage"
        role="group"
        :aria-label="meta?.title ?? id"
        :style="{ height: `${height}px` }"
      />
      <img
        v-if="status !== 'ready'"
        class="hc-example-static-preview"
        :src="withBase(`/gallery/thumbs/${id}.webp`)"
        :alt="`Static preview of ${meta?.title ?? id}`"
        @error="($event.target as HTMLImageElement).hidden = true"
      />
      <div
        v-if="status !== 'ready'"
        class="hc-example-status"
        :data-status="status"
        :role="status === 'error' ? 'alert' : 'status'"
      >
        <template v-if="status === 'error'">
          <strong>Live chart unavailable.</strong> {{ errorMessage }}
          <p>
            The static preview and complete source remain available. This chart needs WebGL2; check
            browser graphics support or try another browser.
          </p>
          <p>
            <a :href="withBase('/guides/troubleshooting#no-webgl2')">WebGL troubleshooting</a> ·
            <button v-if="!bare" type="button" @click="showSource">Open complete source</button
            ><a v-else :href="withBase(`/gallery/example/${id}#hc-complete-source`)"
              >Source and downloads</a
            >
          </p>
        </template>
        <span v-else>Loading example…</span>
      </div>
    </div>

    <div
      v-if="!bare"
      v-show="sideBySide || tab === 'source'"
      class="hc-example-source"
      :id="`${exampleAnchor(id)}-panel-source`"
      :aria-labelledby="sideBySide ? undefined : `${exampleAnchor(id)}-tab-source`"
      :role="sideBySide ? 'region' : 'tabpanel'"
      :aria-label="sideBySide ? 'Complete source' : undefined"
    >
      <ExampleSource v-if="sideBySide || tab === 'source'" :id="id" />
    </div>

    <figcaption v-if="!bare" class="hc-example-caption">
      <template v-if="meta">
        <strong>{{ meta.title }}.</strong> {{ meta.description }}
      </template>
      <code v-else>{{ id }}</code>
    </figcaption>
  </figure>
</template>

<style>
.hc-example-static-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.hc-example-preview .hc-example-status[data-status='idle'],
.hc-example-preview .hc-example-status[data-status='loading'] {
  background: transparent;
}
.hc-example-preview .hc-example-status[data-status='error'] {
  position: relative;
  inset: auto;
  display: block;
  pointer-events: auto;
  text-align: left;
  background: var(--vp-c-bg-soft);
}
.hc-example-status[data-status='error'] p {
  margin: 8px 0 0;
  font-family: var(--vp-font-family-base);
  font-size: 13px;
}
.hc-example-status[data-status='error'] :is(a, button) {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--vp-c-brand-1);
}
.hc-example-preview:has(.hc-example-status[data-status='error']) .hc-example-static-preview {
  height: auto;
  max-height: 400px;
}
</style>
