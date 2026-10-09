<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import '../gallery.css';
import GalleryDirectory from './GalleryDirectory.vue';
import GalleryBrowser from './GalleryBrowser.vue';
import { data } from '../data/gallery.data.ts';

const props = defineProps<{ family?: string; all?: boolean }>();
const legacy = ref(false);
function syncLegacy(): void {
  const q = new URLSearchParams(location.search);
  let id = '';
  try {
    id = decodeURIComponent(location.hash.slice(1));
  } catch {
    /* Invalid hashes recover to the directory. */
  }
  legacy.value = Boolean(
    data.examples.some((e) => e.id === id) ||
    [...q.keys()].some((key) =>
      [
        'q',
        'family',
        'subtype',
        'kind',
        'language',
        'level',
        'feature',
        'api',
        'dimension',
        'sort',
        'category',
        'trace',
        'tag',
        '3d',
      ].includes(key),
    ),
  );
}
onMounted(() => {
  syncLegacy();
  window.addEventListener('popstate', syncLegacy);
  window.addEventListener('hashchange', syncLegacy);
  window.addEventListener('hc:gallery-route', syncLegacy);
});
onBeforeUnmount(() => {
  window.removeEventListener('popstate', syncLegacy);
  window.removeEventListener('hashchange', syncLegacy);
  window.removeEventListener('hc:gallery-route', syncLegacy);
});
</script>

<template>
  <GalleryBrowser
    v-if="props.family || props.all || legacy"
    :family="props.family"
    :all="props.all"
  />
  <GalleryDirectory v-else />
</template>
