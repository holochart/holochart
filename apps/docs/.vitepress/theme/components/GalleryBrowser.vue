<script setup lang="ts">
import '../gallery.css';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { withBase } from 'vitepress';
import { data } from '../data/gallery.data.ts';
import { chartFamilies, familyById, subtypeById } from '../../../../../examples/_lib/families.ts';
import { familyStarters } from '../../../../../examples/_lib/curation.ts';
import {
  emptyFilters,
  exampleRoute,
  familyRoute,
  filterExamples,
  hasVerifiedLanguage,
  filtersFromSearch,
  filtersSearch,
  type GalleryFilters,
} from '../gallery-state.ts';
import Example from './Example.vue';
import GalleryCard from './GalleryCard.vue';

const props = defineProps<{ family?: string; all?: boolean }>();
type Entry = (typeof data.examples)[number];
const examples = data.examples;
const f = reactive<GalleryFilters>(emptyFilters(props.family));
const ready = ref(false);
const activeFamily = computed(() => familyById(f.family));
const total = computed(
  () =>
    examples.filter(
      (e) =>
        !props.family ||
        e.primaryFamily === props.family ||
        e.secondaryFamilies.includes(props.family),
    ).length,
);
const filtered = computed(() => filterExamples(examples, f));
const visibleLimit = ref(48);
const displayed = computed(() => filtered.value.slice(0, visibleLimit.value));
function loadMore(): void {
  visibleLimit.value += 48;
}
const reviewedStarters = computed(() =>
  activeFamily.value ? familyStarters[activeFamily.value.id] : [],
);
const starter = computed(() =>
  reviewedStarters.value.flatMap((task) => {
    const entry = examples.find((entry) => entry.id === task.id);
    return entry ? [{ entry, task: task.task }] : [];
  }),
);
const isFiltered = computed(
  () =>
    Object.entries(f).some(
      ([key, value]) => key !== 'family' && key !== 'sort' && Boolean(value),
    ) ||
    (!props.family && Boolean(f.family)),
);
const context = computed(
  () =>
    `${props.family ? familyRoute(props.family) : props.all ? '/gallery/all/' : '/gallery/'}${filtersSearch(f, props.family) ? `?${filtersSearch(f, props.family)}` : ''}`,
);
const features = computed(() =>
  [
    ...new Set(
      examples
        .filter(
          (e) =>
            !f.family || e.primaryFamily === f.family || e.secondaryFamilies.includes(f.family),
        )
        .flatMap((e) => e.features),
    ),
  ].sort(),
);
const categories = [...new Set(examples.map((e) => e.category))].sort();
const traces = [...new Set(examples.flatMap((e) => e.traceTypes))].sort();
const tags = [...new Set(examples.flatMap((e) => e.tags))].sort();
const displayedSubtypes = computed(
  () => activeFamily.value?.chartTypes ?? chartFamilies.flatMap((family) => family.chartTypes),
);
// Reuse one filtered pass per facet instead of searching the inventory per option.
const facetCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const key of ['subtype', 'language', 'level', 'api', 'dimension'] as const) {
    // An unset facet already has the complete candidate pool; reuse the main search/sort.
    const candidates = f[key] ? filterExamples(examples, { ...f, [key]: '' }) : filtered.value;
    for (const entry of candidates) {
      const values =
        key === 'subtype'
          ? entry.chartTypes
          : key === 'language'
            ? ['typescript', 'javascript', 'python'].filter((language) =>
                hasVerifiedLanguage(entry, language),
              )
            : [
                key === 'level'
                  ? entry.difficulty
                  : key === 'dimension'
                    ? entry.renderingDimension
                    : entry.api,
              ];
      for (const value of values) {
        const id = `${key}:${value}`;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
  }
  return counts;
});
function countFacet(key: keyof GalleryFilters, value: string): number {
  return facetCounts.value.get(`${key}:${value}`) ?? 0;
}
function reset(): void {
  Object.assign(f, emptyFilters(props.family));
  if (mounted) history.pushState(history.state, '', filtersUrl());
}
function selectFamily(value: string): void {
  f.family = value;
  f.subtype = '';
  if (mounted) history.pushState(history.state, '', filtersUrl());
}
function chooseSubtype(value: string, event: MouseEvent): void {
  if (modified(event)) return;
  event.preventDefault();
  f.subtype = value;
  if (mounted) history.pushState(history.state, '', filtersUrl());
}
function modified(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}
function filtersUrl(): string {
  const search = filtersSearch(f, props.family);
  return `${location.pathname}${search ? `?${search}` : ''}${location.hash}`;
}
function readFilters(): void {
  Object.assign(f, filtersFromSearch(location.search, examples, props.family));
}

const byId = new Map(examples.map((e) => [e.id, e]));
const selected = ref<Entry | null>(null);
const dialog = ref<HTMLDialogElement | null>(null);
let returnFocus: HTMLElement | null = null;
let pendingProgrammaticCloses = 0;
function idFromHash(): string {
  try {
    return decodeURIComponent(location.hash.slice(1));
  } catch {
    return '';
  }
}
async function show(entry: Entry | undefined): Promise<void> {
  selected.value = entry ?? null;
  await nextTick();
  if (selected.value?.id !== entry?.id) return;
  const el = dialog.value;
  if (!el) return;
  if (entry && !el.open) {
    const link = [...document.querySelectorAll<HTMLAnchorElement>('[data-example-id]')].find(
      (candidate) => candidate.dataset.exampleId === entry.id,
    );
    returnFocus ??=
      link
        ?.closest('.hc-gallery-card')
        ?.querySelector<HTMLButtonElement>('.hc-gallery-preview-button') ??
      link ??
      null;
    el.showModal();
    document.documentElement.classList.add('hc-gallery-locked');
  } else if (!entry && el.open) {
    pendingProgrammaticCloses++;
    el.close();
  }
}
function open(entry: Entry, event: MouseEvent): void {
  if (modified(event)) return;
  event.preventDefault();
  returnFocus = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  if (idFromHash() !== entry.id) history.pushState(history.state, '', `#${entry.id}`);
  void show(entry);
}
function close(): void {
  if (!selected.value) return;
  history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  void show(undefined);
}
function onDialogClose(): void {
  if (pendingProgrammaticCloses > 0) {
    pendingProgrammaticCloses--;
    if (selected.value) return;
  }
  document.documentElement.classList.remove('hc-gallery-locked');
  if (selected.value) close();
  returnFocus?.focus();
  returnFocus = null;
}
function syncFromUrl(): void {
  readFilters();
  void show(byId.get(idFromHash()));
}
let mounted = false;
watch(f, () => {
  visibleLimit.value = 48;
  if (mounted) history.replaceState(history.state, '', filtersUrl());
});
onMounted(() => {
  readFilters();
  mounted = true;
  syncFromUrl();
  ready.value = true;
  window.addEventListener('popstate', syncFromUrl);
  window.addEventListener('hashchange', syncFromUrl);
  window.addEventListener('hc:gallery-route', syncFromUrl);
});
onBeforeUnmount(() => {
  mounted = false;
  window.removeEventListener('popstate', syncFromUrl);
  window.removeEventListener('hashchange', syncFromUrl);
  window.removeEventListener('hc:gallery-route', syncFromUrl);
  document.documentElement.classList.remove('hc-gallery-locked');
});
// Keep no-JavaScript markup opaque: browsers parse noscript children as raw text when scripting is enabled.
const noScriptHelp =
  '<p class="hc-state">JavaScript is disabled. You can browse chart families and open example details or download source files. Enable JavaScript to filter results and run live previews.</p>';
</script>

<template>
  <main class="hc-gallery" :data-ready="ready" :data-gallery-ready="ready">
    <noscript v-html="noScriptHelp" />
    <nav class="hc-breadcrumbs" aria-label="Breadcrumb">
      <ol>
        <li><a :href="withBase('/')">Home</a></li>
        <li><a :href="withBase('/gallery/')">Gallery</a></li>
        <li>
          <span aria-current="page">{{ activeFamily?.label ?? 'All examples' }}</span>
        </li>
      </ol>
    </nav>
    <header class="hc-gallery-header">
      <p class="hc-gallery-eyebrow">{{ activeFamily ? 'Chart family' : 'All examples' }}</p>
      <h1 class="hc-gallery-title">
        {{ activeFamily?.label ?? 'Search the complete example collection' }}
      </h1>
      <p class="hc-gallery-lede">
        {{
          activeFamily?.description ??
          'Combine language, chart type, feature and environment filters. Recommended examples appear first.'
        }}
        {{ total }} unique examples.
      </p>
    </header>
    <section v-if="props.family && !isFiltered" class="hc-gallery-starters">
      <h2>Start here</h2>
      <p v-if="starter.length < 3" class="hc-starter-note">
        Two introductory tasks are available; more advanced examples follow below.
      </p>
      <div class="hc-family-preview-grid">
        <div v-for="item in starter" :key="item.entry.id">
          <p class="hc-starter-task">{{ item.task }}</p>
          <GalleryCard :entry="item.entry" :context="context" />
        </div>
      </div>
    </section>
    <div class="hc-gallery-shell">
      <aside class="hc-gallery-sidebar" aria-label="Chart families">
        <a :href="withBase('/gallery/')">Family directory</a
        ><a :href="withBase('/gallery/all/')"
          >All examples <span>{{ examples.length }}</span></a
        ><a
          v-for="family in chartFamilies"
          :key="family.id"
          :href="withBase(familyRoute(family.id))"
          :aria-current="f.family === family.id ? 'page' : undefined"
          >{{ family.label }}</a
        ><a :href="withBase('/python/')">Python & Jupyter →</a
        ><a :href="withBase('/charts/')">Compare chart guides →</a>
      </aside>
      <div class="hc-gallery-results">
        <nav v-if="activeFamily" class="hc-gallery-subtypes vp-raw" aria-label="Chart subtypes">
          <a
            :href="withBase(familyRoute(activeFamily.id))"
            :aria-current="!f.subtype ? 'page' : undefined"
            @click="chooseSubtype('', $event)"
            >All types</a
          ><a
            v-for="type in activeFamily.chartTypes"
            :key="type.id"
            :href="withBase(`${familyRoute(activeFamily.id)}?subtype=${type.id}`)"
            :aria-current="f.subtype === type.id ? 'page' : undefined"
            @click="chooseSubtype(type.id, $event)"
            >{{ type.label }}</a
          >
        </nav>
        <section class="hc-gallery-filters" aria-label="Filters">
          <div class="hc-gallery-search">
            <label class="hc-gallery-visually-hidden" for="hc-gallery-search">Search examples</label
            ><input
              id="hc-gallery-search"
              v-model="f.q"
              type="search"
              placeholder="Try radar, candles, error band or Jupyter"
              autocomplete="off"
              spellcheck="false"
            />
            <select
              v-if="!props.family"
              :value="f.family"
              aria-label="Chart family"
              @change="selectFamily(($event.target as HTMLSelectElement).value)"
            >
              <option value="">All chart families</option>
              <option v-for="family in chartFamilies" :key="family.id" :value="family.id">
                {{ family.label }}
              </option>
            </select>
            <select v-model="f.sort" aria-label="Sort examples">
              <option value="recommended">Recommended</option>
              <option value="alphabetical">Alphabetical</option>
            </select>
          </div>
          <div class="hc-gallery-facet-grid hc-gallery-primary-facets">
            <label
              >Subtype<select v-model="f.subtype" aria-label="Chart subtype">
                <option value="">All subtypes</option>
                <option v-for="type in displayedSubtypes" :key="type.id" :value="type.id">
                  {{ type.label }} ({{ countFacet('subtype', type.id) }})
                </option>
              </select></label
            >
            <label
              >Verified language<select v-model="f.language" aria-label="Verified language">
                <option value="">All languages</option>
                <option value="typescript">
                  TypeScript ({{ countFacet('language', 'typescript') }})
                </option>
                <option value="javascript">
                  JavaScript ({{ countFacet('language', 'javascript') }})
                </option>
                <option value="python">
                  Python / Jupyter ({{ countFacet('language', 'python') }})
                </option>
              </select></label
            >
          </div>
          <div class="hc-gallery-filter-panels">
            <details
              class="hc-gallery-more-filters"
              :open="Boolean(f.level || f.feature || f.api || f.dimension || f.kind)"
            >
              <summary>More filters: level, feature, API, dimension and collection</summary>
              <div class="hc-gallery-facet-grid">
                <label
                  >Learning level<select v-model="f.level" aria-label="Learning level">
                    <option value="">All levels</option>
                    <option value="beginner">
                      Beginner ({{ countFacet('level', 'beginner') }})
                    </option>
                    <option value="intermediate">
                      Intermediate ({{ countFacet('level', 'intermediate') }})
                    </option>
                    <option value="advanced">
                      Advanced ({{ countFacet('level', 'advanced') }})
                    </option>
                    <option value="unassessed">
                      Not assessed ({{ countFacet('level', 'unassessed') }})
                    </option>
                  </select></label
                >
                <label
                  >Feature<select v-model="f.feature" aria-label="Feature">
                    <option value="">All features</option>
                    <option v-for="feature in features" :key="feature" :value="feature">
                      {{ feature }}
                    </option>
                  </select></label
                >
                <label
                  >API<select v-model="f.api" aria-label="API">
                    <option value="">All APIs</option>
                    <option value="figure">Figure API ({{ countFacet('api', 'figure') }})</option>
                    <option value="express">Express ({{ countFacet('api', 'express') }})</option>
                  </select></label
                >
                <label
                  >Dimension<select v-model="f.dimension" aria-label="Rendering dimension">
                    <option value="">All dimensions</option>
                    <option value="2d">2D ({{ countFacet('dimension', '2d') }})</option>
                    <option value="native-3d">
                      Native 3D ({{ countFacet('dimension', 'native-3d') }})
                    </option>
                    <option value="extruded">
                      2D extrusion ({{ countFacet('dimension', 'extruded') }})
                    </option>
                  </select></label
                >
                <label
                  >Collection<select v-model="f.kind" aria-label="Collection">
                    <option value="">All collections</option>
                    <option value="chart">Chart examples</option>
                    <option value="recipe">Recipes</option>
                    <option value="theme">Themes & styling</option>
                    <option value="interaction">Interaction & animation</option>
                    <option value="layout">Layout & axes</option>
                    <option value="accessibility">Accessibility</option>
                    <option value="demo">Complete demos</option>
                  </select></label
                >
              </div>
            </details>
            <details
              class="hc-gallery-more-filters hc-gallery-legacy-filters"
              :open="Boolean(f.category || f.trace || f.tag || f.threeD)"
            >
              <summary>Legacy category, trace and tag filters</summary>
              <div class="hc-gallery-facet-grid">
                <label
                  >Legacy category<select v-model="f.category" aria-label="Legacy category">
                    <option value="">All legacy categories</option>
                    <option v-for="category in categories" :key="category" :value="category">
                      {{ category }}
                    </option>
                  </select></label
                ><label
                  >Trace<select v-model="f.trace" aria-label="Trace type">
                    <option value="">Any trace</option>
                    <option v-for="trace in traces" :key="trace" :value="trace">{{ trace }}</option>
                  </select></label
                ><label
                  >Tag<select v-model="f.tag" aria-label="Tag">
                    <option value="">Any tag</option>
                    <option v-for="tag in tags" :key="tag" :value="tag">{{ tag }}</option>
                  </select></label
                ><label><input v-model="f.threeD" type="checkbox" />Legacy 3D-tagged</label>
              </div>
            </details>
          </div>
          <div class="hc-gallery-status">
            <span aria-live="polite" aria-atomic="true"
              >{{ filtered.length }} of {{ total }} examples<span
                v-if="displayed.length < filtered.length"
              >
                · Showing {{ displayed.length }}</span
              ></span
            ><button v-if="isFiltered" class="hc-gallery-link" type="button" @click="reset">
              Reset filters
            </button>
          </div>
          <p v-if="isFiltered" class="hc-gallery-selected">
            Selected:
            {{
              Object.entries(f)
                .filter(
                  ([key, value]) => value && key !== 'sort' && !(props.family && key === 'family'),
                )
                .map(([key, value]) => `${key}: ${value}`)
                .join(' · ')
            }}
          </p>
        </section>
        <ul v-if="filtered.length" class="hc-gallery-grid hc-card-grid">
          <li v-for="entry in displayed" :key="entry.id">
            <GalleryCard :entry="entry" :context="context" preview @preview="open" />
          </li>
        </ul>
        <p v-if="displayed.length < filtered.length" class="hc-gallery-load-more">
          <button type="button" :disabled="!ready" @click="loadMore">
            Show {{ Math.min(48, filtered.length - displayed.length) }} more examples
          </button>
        </p>
        <div v-if="!filtered.length" class="hc-gallery-empty">
          <h2>No examples match this combination</h2>
          <p>
            Try one fewer filter, a broader chart subtype, or an alias such as “radar” or “candles”.
          </p>
          <p v-if="f.language === 'python'">
            Python results require an actual verified Python artifact.
            <a :href="withBase('/python/')">Follow the notebook learning path</a>.
          </p>
          <button type="button" class="hc-gallery-link" @click="reset">Reset filters</button>
        </div>
        <section v-if="activeFamily" class="hc-gallery-guide-links">
          <h2>Chart guides</h2>
          <p>
            <a v-for="type in activeFamily.chartTypes" :key="type.id" :href="withBase(type.docs)"
              >{{ type.label }} →</a
            >
          </p>
        </section>
      </div>
    </div>
    <dialog
      ref="dialog"
      class="hc-gallery-dialog"
      :aria-labelledby="selected ? 'hc-gallery-dialog-title' : undefined"
      @close="onDialogClose"
      @click="$event.target === dialog && close()"
    >
      <div v-if="selected" class="hc-gallery-panel">
        <header class="hc-gallery-panel-header">
          <div>
            <p class="hc-gallery-card-eyebrow">
              {{ familyById(selected.primaryFamily)?.label }} · {{ selected.id }}
            </p>
            <h2 id="hc-gallery-dialog-title" class="hc-gallery-panel-title">
              {{ selected.title }}
            </h2>
          </div>
          <button type="button" class="hc-gallery-close" aria-label="Close" @click="close">
            ×
          </button>
        </header>
        <p>{{ selected.description }}</p>
        <p>
          <a :href="withBase(`${exampleRoute(selected.id)}?from=${encodeURIComponent(context)}`)"
            >Open full example, source and support details →</a
          >
        </p>
        <div class="vp-doc hc-gallery-live">
          <Example :id="selected.id" :key="selected.id" bare />
        </div>
        <p>
          <a v-for="doc in selected.docs" :key="doc" :href="withBase(doc)"
            >{{ doc.split('/').pop() }} guide →</a
          >
        </p>
      </div>
    </dialog>
  </main>
</template>

<style>
.hc-gallery-facet-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.hc-gallery-primary-facets {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.hc-gallery-facet-grid label {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  line-height: 16px;
  color: var(--vp-c-text-2);
}
.hc-gallery-facet-grid select {
  width: 100%;
  min-width: 0;
  min-height: 34px;
  padding: 6px 8px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
}
.hc-gallery-filter-panels {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
}
.hc-gallery-filter-panels details[open] {
  flex-basis: 100%;
}
.hc-gallery-subtypes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.hc-gallery-subtypes a {
  padding: 5px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  font-size: 12px;
}
.hc-gallery-subtypes [aria-current] {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}
.hc-gallery-selected {
  font-size: 11px;
  color: var(--vp-c-text-2);
  overflow-wrap: anywhere;
}
.hc-gallery-guide-links {
  margin-top: 32px;
}
.hc-gallery-guide-links p {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  font-size: 13px;
}
.hc-gallery-starters {
  margin: 20px 0 32px;
}
.hc-gallery-starters h2 {
  margin: 0 0 12px;
  font-size: 20px;
}
@media (pointer: coarse), (max-width: 640px) {
  .hc-gallery-filters select,
  .hc-gallery-filters input,
  .hc-gallery-more-filters summary {
    min-height: 44px;
  }
}
@media (max-width: 860px) {
  .hc-gallery-facet-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 420px) {
  .hc-gallery-facet-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

<style>
.hc-starter-task {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--vp-c-text-1);
}
.hc-starter-note {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--vp-c-text-2);
}
.hc-gallery-load-more {
  margin: 20px 0;
  text-align: center;
}
.hc-gallery-load-more button {
  min-height: 44px;
  padding: 8px 16px;
  border: 1px solid var(--hc-axis);
  border-radius: 4px;
  color: var(--vp-c-text-1);
  background: var(--hc-surface-1);
}
</style>
