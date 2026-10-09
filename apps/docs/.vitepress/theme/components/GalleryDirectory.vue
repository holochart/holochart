<script setup lang="ts">
import '../gallery.css';
import { withBase } from 'vitepress';
import { onMounted, ref } from 'vue';
import { chartFamilies } from '../../../../../examples/_lib/families.ts';
import { data } from '../data/gallery.data.ts';
import { curatedExamples, familyRoute } from '../gallery-state.ts';
import GalleryCard from './GalleryCard.vue';
import cookbookRecipes from '../../../cookbook/catalog.json';

const ready = ref(false);
onMounted(() => {
  ready.value = true;
});
const collections = [
  {
    kind: 'recipe',
    label: 'Recipes',
    description: 'Task-oriented patterns: bands, rankings, comparisons and updates.',
    link: '/cookbook/',
  },
  { kind: 'theme', label: 'Themes & styling', description: 'Colors, materials and chart looks.' },
  {
    kind: 'interaction',
    label: 'Interaction & animation',
    description: 'Controls, selections, transitions and live updates.',
  },
  {
    kind: 'layout',
    label: 'Layout & axes',
    description: 'Subplots, scene arrangements, legends and annotations.',
  },
  {
    kind: 'accessibility',
    label: 'Accessibility',
    description: 'Readable output, keyboard access and alternate descriptions.',
  },
];
const demos = data.examples.filter((e) => e.contentKind === 'demo');
const selectedDemos = [...new Map(demos.map((e) => [e.id.split('/')[1], e])).values()].slice(0, 4);
function count(id: string): number {
  return data.examples.filter((e) => e.primaryFamily === id || e.secondaryFamilies.includes(id))
    .length;
}
// Keep no-JavaScript markup opaque: browsers parse noscript children as raw text when scripting is enabled.
const noScriptHelp =
  '<p class="hc-state">JavaScript is disabled. You can browse chart families and open example details or download source files. Enable JavaScript to filter results and run live previews.</p>';
</script>

<template>
  <main class="hc-gallery-directory hc-gallery" :data-ready="ready" :data-gallery-ready="ready">
    <noscript v-html="noScriptHelp" />
    <nav class="hc-breadcrumbs" aria-label="Breadcrumb">
      <ol>
        <li><a :href="withBase('/')">Home</a></li>
        <li><span aria-current="page">Gallery</span></li>
      </ol>
    </nav>
    <header class="hc-gallery-header">
      <p class="hc-gallery-eyebrow">Gallery</p>
      <h1 class="hc-gallery-title">Find a chart by what it shows</h1>
      <p class="hc-gallery-lede">
        Explore eleven chart families, from a first bar chart to spatial fields. Each family has a
        short starter set and its full collection.
      </p>
      <p class="hc-directory-actions">
        <a :href="withBase('/gallery/all/')">Search all {{ data.examples.length }} examples →</a
        ><a :href="withBase('/python/')">Python & Jupyter starts →</a>
      </p>
    </header>
    <nav class="hc-family-jump" aria-label="Jump to a chart family">
      <a v-for="family in chartFamilies" :key="family.id" :href="`#family-${family.id}`">{{
        family.label
      }}</a>
    </nav>
    <div class="hc-family-directory-grid">
      <section
        v-for="family in chartFamilies"
        :id="`family-${family.id}`"
        :key="family.id"
        class="hc-family-preview"
      >
        <header class="hc-section-heading">
          <div>
            <h2>
              <a :href="withBase(familyRoute(family.id))">{{ family.label }}</a>
            </h2>
            <p>{{ family.description }}</p>
          </div>
          <a :href="withBase(familyRoute(family.id))">See all {{ count(family.id) }} →</a>
        </header>
        <div class="hc-family-preview-grid">
          <GalleryCard
            v-for="entry in curatedExamples(data.examples, family.id, 4)"
            :key="entry.id"
            :entry="entry"
            :context="familyRoute(family.id)"
          />
        </div>
        <p class="hc-family-subtypes">
          <a
            v-for="type in family.chartTypes"
            :key="type.id"
            :href="withBase(`${familyRoute(family.id)}?subtype=${type.id}`)"
            >{{ type.label }}</a
          >
        </p>
      </section>
    </div>
    <section class="hc-family-preview">
      <header class="hc-section-heading">
        <div>
          <h2>Recipes and feature collections</h2>
          <p>Browse a charting task or technique independently of chart families.</p>
        </div>
      </header>
      <div class="hc-card-grid">
        <a
          v-for="collection in collections"
          :key="collection.kind"
          :href="withBase(collection.link ?? `/gallery/all/?kind=${collection.kind}`)"
          class="hc-card"
          ><h3>{{ collection.label }}</h3>
          <p>{{ collection.description }}</p>
          <span v-if="collection.kind === 'recipe'">{{ cookbookRecipes.length }} recipes →</span>
          <span v-else
            >{{ data.examples.filter((e) => e.contentKind === collection.kind).length }} examples
            →</span
          >
        </a>
      </div>
    </section>
    <section class="hc-family-preview">
      <header class="hc-section-heading">
        <div>
          <h2>Complete demos</h2>
          <p>Applications and reports combine several chart types and interactions.</p>
        </div>
        <a :href="withBase('/gallery/all/?kind=demo')">See all {{ demos.length }} →</a>
      </header>
      <div class="hc-family-preview-grid hc-demo-preview-grid">
        <GalleryCard
          v-for="entry in selectedDemos"
          :key="entry.id"
          :entry="entry"
          context="/gallery/all/?kind=demo"
        />
      </div>
      <p><a :href="withBase('/demos/')">Read the application walkthroughs →</a></p>
    </section>
  </main>
</template>

<style>
.hc-directory-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 24px;
  margin-top: 14px;
  font-size: 14px;
  color: var(--vp-c-brand-1);
}
.hc-family-jump {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin: 12px 0;
  font-size: 12px;
  line-height: 18px;
}
.hc-family-jump a {
  padding: 4px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
  color: var(--vp-c-text-2);
}
.hc-family-preview {
  margin: 12px 0 28px;
  scroll-margin-top: 90px;
}
.hc-section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.hc-section-heading h2 {
  margin: 0;
  border: 0;
  font-size: 21px;
  color: var(--vp-c-text-1);
}
.hc-section-heading p {
  margin: 5px 0 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--vp-c-text-2);
}
.hc-section-heading > a {
  flex-shrink: 0;
  color: var(--vp-c-brand-1);
  font-size: 13px;
}
.hc-family-preview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.hc-demo-preview-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.hc-family-subtypes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--vp-c-brand-1);
}
.hc-gallery-directory .hc-gallery-card-body {
  padding: 8px 10px;
}
.hc-gallery-directory .hc-gallery-card-badges {
  line-height: 16px;
}
@media (pointer: coarse), (max-width: 640px) {
  .hc-family-jump a {
    min-height: 44px;
    display: flex;
    align-items: center;
  }
}
@media (min-width: 1280px) {
  .hc-family-directory-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 28px;
  }
  .hc-family-directory-grid .hc-family-preview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (min-width: 1100px) {
  .hc-gallery-directory .hc-family-preview-grid .hc-gallery-thumb {
    height: 124px;
    aspect-ratio: auto;
  }
}
@media (max-width: 1099px) {
  .hc-family-preview-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 860px) {
  .hc-family-preview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .hc-demo-preview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .hc-family-preview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
}
@media (max-width: 420px) {
  .hc-family-preview-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
