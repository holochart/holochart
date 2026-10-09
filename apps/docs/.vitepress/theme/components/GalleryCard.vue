<script setup lang="ts">
import { withBase } from 'vitepress';
import { familyById, subtypeById } from '../../../../../examples/_lib/families.ts';
import { exampleRoute, hasVerifiedLanguage } from '../gallery-state.ts';
import type { GalleryData } from '../data/gallery.data.ts';

type Entry = GalleryData['examples'][number];
defineProps<{ entry: Entry; context?: string; preview?: boolean }>();
const emit = defineEmits<{ preview: [entry: Entry, event: MouseEvent] }>();
function follow(entry: Entry, preview: boolean | undefined, event: MouseEvent): void {
  if (preview) emit('preview', entry, event);
}
</script>

<template>
  <article class="hc-gallery-card">
    <a
      :href="
        withBase(
          `${exampleRoute(entry.id)}${context ? `?from=${encodeURIComponent(context)}` : ''}`,
        )
      "
      class="hc-gallery-card-link"
      :data-example-id="entry.id"
    >
      <span class="hc-gallery-thumb"
        ><img
          :src="withBase(`/${entry.thumbnail}`)"
          :width="entry.thumbnailSize.width"
          :height="entry.thumbnailSize.height"
          :alt="entry.title"
          loading="lazy"
          decoding="async"
      /></span>
      <span class="hc-gallery-card-body">
        <span class="hc-gallery-card-eyebrow">{{
          entry.chartTypes.map((t) => subtypeById(t)?.label ?? t).join(' · ')
        }}</span>
        <span class="hc-gallery-card-title">{{ entry.title }}</span>
        <span class="hc-gallery-card-summary">{{ entry.description }}</span>
        <span class="hc-gallery-card-badges">
          <span>{{ familyById(entry.primaryFamily)?.label }}</span>
          <span v-if="entry.renderingDimension === 'native-3d'">Native 3D</span>
          <span v-else-if="entry.renderingDimension === 'extruded'">2D extrusion</span>
          <span v-if="hasVerifiedLanguage(entry, 'python')">Python</span>
          <span v-if="hasVerifiedLanguage(entry, 'javascript')">JS checked</span>
          <span v-if="entry.difficulty !== 'unassessed'">{{ entry.difficulty }}</span>
        </span>
      </span>
    </a>
    <button
      v-if="preview"
      type="button"
      class="hc-gallery-preview-button"
      @click="follow(entry, true, $event)"
    >
      Quick preview<span class="hc-gallery-visually-hidden">: {{ entry.title }}</span>
    </button>
  </article>
</template>

<style>
.hc-gallery-preview-button {
  width: 100%;
  min-height: 32px;
  padding: 4px 10px;
  border-top: 1px solid var(--vp-c-divider);
  color: var(--vp-c-brand-1);
  font-size: 12px;
  line-height: 20px;
  text-align: left;
}
.hc-gallery-preview-button:hover,
.hc-gallery-preview-button:focus-visible {
  background: var(--vp-c-bg-mute);
}
@media (pointer: coarse), (max-width: 640px) {
  .hc-gallery-preview-button {
    min-height: 44px;
  }
}
.hc-gallery-card {
  min-width: 0;
  overflow: hidden;
  background: var(--hc-panel, var(--vp-c-bg-soft));
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
}
.hc-gallery-card-link {
  display: flex;
  flex-direction: column;
  text-decoration: none;
}
.hc-gallery-card-link:hover,
.hc-gallery-card-link:focus-visible {
  background: var(--vp-c-bg-mute);
}
.hc-gallery-card-link:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -2px;
}
.hc-gallery-thumb {
  display: block;
  aspect-ratio: 1.6;
  overflow: hidden;
  background: #0a0a0f;
}
.hc-gallery-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.hc-gallery-card-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  padding: 11px;
}
.hc-gallery-card-eyebrow {
  color: var(--vp-c-brand-1);
  font-size: 11px;
  line-height: 1.45;
}
.hc-gallery-card-title {
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}
.hc-gallery-card-summary {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--vp-c-text-2);
  font-size: 12px;
  line-height: 1.5;
}
.hc-gallery-card-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
  margin-top: auto;
  padding-top: 4px;
  font-size: 10px;
  color: var(--vp-c-text-3);
}
</style>
