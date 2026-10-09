<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { withBase } from 'vitepress';
import '../gallery.css';
import { data } from '../data/recipes.data.ts';
const ready = ref(false);
onMounted(() => {
  ready.value = true;
});
</script>

<template>
  <main class="hc-recipe-directory hc-gallery" :data-ready="ready">
    <nav class="hc-breadcrumbs" aria-label="Breadcrumb">
      <ol>
        <li><a :href="withBase('/')">Home</a></li>
        <li><span aria-current="page">Cookbook</span></li>
      </ol>
    </nav>
    <header class="hc-gallery-header">
      <p class="hc-gallery-eyebrow">Cookbook · {{ data.length }} practical recipes</p>
      <h1 class="hc-gallery-title">Solve a chart problem</h1>
      <p class="hc-gallery-lede">
        Choose a finished chart, inspect the key decisions, and copy complete runnable source. These
        recipes use deterministic data; each Python badge identifies an exact counterpart verified
        in JupyterLab and Notebook.
      </p>
      <p class="hc-directory-actions">
        <a :href="withBase('/getting-started/javascript')">Browser setup →</a
        ><a :href="withBase('/getting-started/python-jupyter')">Python / Jupyter setup →</a
        ><a :href="withBase('/gallery/')">Choose a chart family →</a>
      </p>
    </header>
    <div class="hc-recipe-grid">
      <article
        v-for="recipe in data"
        :key="recipe.slug"
        class="hc-recipe-card"
        :data-recipe="recipe.slug"
      >
        <a :href="withBase(`/cookbook/${recipe.slug}`)" class="hc-recipe-card-link">
          <img
            :src="withBase(`/${recipe.thumbnail}`)"
            alt=""
            :width="recipe.thumbnailSize.width"
            :height="recipe.thumbnailSize.height"
            loading="lazy"
          />
          <h2>{{ recipe.title }}</h2>
          <p>{{ recipe.problem }}</p>
          <span class="hc-recipe-support"
            >Browser<span v-if="recipe.python"> · Verified Python</span></span
          >
        </a>
        <p class="hc-recipe-family-links">
          <a
            v-for="family in recipe.families"
            :key="family.id"
            :href="withBase(`/gallery/${family.id}/`)"
            >{{ family.label }}</a
          >
        </p>
      </article>
    </div>
    <section class="hc-recipe-help" aria-labelledby="recipe-source-help">
      <h2 id="recipe-source-help">Use the complete source</h2>
      <p>
        Each recipe has one finished live chart and a Complete source tab with copy and download
        controls. Ordinary source and detail links work without JavaScript. Browser modules include
        data, helper code, public imports, a sized container and cleanup; live output requires
        WebGL2 and the source workspace.
      </p>
      <p>
        Five recipes offer exact verified Python variants. An absent Python badge means no verified
        counterpart is offered for that recipe; it does not declare every underlying attribute
        unsupported.
      </p>
      <p>
        Recipes explain a reusable technique. Use the
        <a :href="withBase('/reference/')">reference</a> for exhaustive attributes and
        <a :href="withBase('/demos/')">demos</a> for complete reports, data provenance and
        application controls.
      </p>
    </section>
  </main>
</template>

<style>
.hc-recipe-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-top: 22px;
}
.hc-recipe-card {
  min-width: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
  overflow: hidden;
  background: var(--hc-surface-1);
}
.hc-recipe-card-link {
  display: block;
  padding: 10px;
}
.hc-recipe-card-link:hover h2 {
  color: var(--vp-c-brand-1);
}
.hc-recipe-card img {
  display: block;
  width: 100%;
  height: 112px;
  object-fit: contain;
  background: var(--hc-bg);
}
.hc-recipe-card h2 {
  margin: 10px 0 6px;
  font-size: 16px;
  line-height: 23px;
  font-weight: 500;
}
.hc-recipe-card p {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 19px;
  color: var(--vp-c-text-2);
}
.hc-recipe-support {
  font-size: 11px;
  line-height: 18px;
  color: var(--vp-c-text-2);
}
.hc-recipe-family-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  padding: 0 10px 8px;
}
.hc-recipe-family-links a {
  color: var(--vp-c-brand-1);
  font-size: 11px;
  line-height: 18px;
}
.hc-recipe-help {
  margin-top: 28px;
  max-width: 900px;
}
.hc-recipe-help h2 {
  margin: 0 0 10px;
  font-size: 20px;
}
.hc-recipe-help p {
  margin: 8px 0;
  font-size: 13px;
  line-height: 21px;
  color: var(--vp-c-text-2);
}
.hc-recipe-help a {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 2px;
}
@media (max-width: 1279px) {
  .hc-recipe-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 959px) {
  .hc-recipe-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 639px) {
  .hc-recipe-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .hc-recipe-family-links a,
  .hc-recipe-help a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }
}
</style>
