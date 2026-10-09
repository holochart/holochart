<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { withBase } from 'vitepress';
import { data } from '../data/demos.data.ts';
const ready = ref(false);
onMounted(() => {
  ready.value = true;
});
const sections = computed(() => [
  {
    id: 'bundled-reports',
    title: 'Reports with bundled data',
    description:
      'Saved snapshots and seeded formulas make these reports deterministic. They do not call live data APIs while you read them.',
    entries: data.entries.filter((entry) => entry.dataMode === 'bundled'),
  },
  {
    id: 'live-applications',
    title: 'Live application',
    description:
      'The weather app starts empty. A request sends a ZIP code to Zippopotam.us and coordinates to Open-Meteo; the returned forecast changes over time.',
    entries: data.entries.filter((entry) => entry.dataMode === 'live'),
  },
]);
</script>

<template>
  <section class="hc-demo-directory" :data-ready="ready" :data-demo-ready="ready">
    <nav class="hc-demo-jumps" aria-label="Demo collections">
      <a :href="withBase('/demos/#bundled-reports')">Bundled reports</a>
      <a :href="withBase('/demos/#live-applications')">Live application</a>
      <a :href="withBase('/gallery/all/?category=demos')">All demo chart examples</a>
    </nav>
    <section v-for="section in sections" :key="section.id" :aria-labelledby="section.id">
      <h2 :id="section.id">{{ section.title }}</h2>
      <p class="hc-demo-collection-note">{{ section.description }}</p>
      <div class="hc-card-grid">
        <article
          v-for="entry in section.entries"
          :key="entry.slug"
          class="hc-demo-card"
          :data-demo-id="entry.slug"
        >
          <a class="hc-demo-heading" :href="withBase(entry.route)">
            <img
              :src="withBase('/' + entry.thumbnail)"
              :width="entry.thumbnailSize.width"
              :height="entry.thumbnailSize.height"
              alt=""
              loading="lazy"
              decoding="async"
            />
            <div>
              <span class="hc-demo-domain">{{ entry.domain }}</span>
              <h3>{{ entry.title }}</h3>
            </div>
          </a>
          <p class="hc-demo-mode">{{ entry.dataLabel }}</p>
          <p v-if="entry.previewKind === 'technique'" class="hc-demo-preview-note">
            Preview: a reusable line chart, not a fetched forecast.
          </p>
          <p class="hc-demo-families">
            <span class="hc-demo-visually-hidden">Chart families: </span
            ><template v-for="(family, index) in entry.familyLinks" :key="family.id"
              ><span v-if="index"> · </span
              ><a :href="withBase(family.route)">{{ family.label }}</a></template
            >
          </p>
          <p class="hc-demo-provenance">{{ entry.provenance }}</p>
          <p class="hc-demo-techniques">
            <strong>Techniques:</strong> {{ entry.techniques.join(' · ') }}
          </p>
          <div class="hc-demo-actions">
            <a :href="withBase(entry.notesRoute)">Data notes</a>
            <a :href="withBase('/gallery/example/' + entry.reuse.id)">{{ entry.reuse.label }}</a>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>

<style scoped>
.hc-demo-jumps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0 24px;
}
.hc-demo-jumps a,
.hc-demo-actions a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 6px 10px;
  border: 1px solid var(--hc-grid);
  border-radius: 4px;
  line-height: 1.3;
}
.hc-demo-jumps a:focus-visible,
.hc-demo-card a:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}
.hc-demo-collection-note {
  max-width: 85ch;
}
.hc-demo-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--hc-grid);
  border-radius: 4px;
  background: var(--hc-surface-1);
}
.hc-demo-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  min-height: 64px;
}
.hc-demo-heading img {
  width: 96px;
  height: 64px;
  object-fit: contain;
  flex: 0 0 96px;
  border-radius: 3px;
  background: var(--hc-bg);
}
.hc-demo-heading div {
  min-width: 0;
}
.hc-demo-heading h3 {
  margin: 3px 0 0;
  font-size: 15px;
  line-height: 1.3;
}
.hc-demo-domain,
.hc-demo-mode {
  color: var(--hc-tick);
  font-size: 12px;
  line-height: 1.4;
}
.hc-demo-card p {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
}
.hc-demo-card .hc-demo-mode {
  color: var(--hc-text);
  font-size: 12px;
}
.hc-demo-families {
  color: var(--hc-text);
}
.hc-demo-provenance,
.hc-demo-techniques {
  overflow-wrap: anywhere;
}
.hc-demo-preview-note {
  color: var(--hc-text);
}
.hc-demo-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: auto;
  font-size: 12px;
}
.hc-demo-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (max-width: 399px) {
  .hc-demo-heading img {
    width: 80px;
    height: 60px;
    flex-basis: 80px;
  }
}
</style>
