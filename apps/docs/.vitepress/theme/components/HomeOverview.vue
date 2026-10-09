<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { withBase } from 'vitepress';
import { data } from '../data/home.data.ts';
import { familyById } from '../../../../../examples/_lib/families.ts';
import {
  installStatus,
  registryInstallCommand,
  releaseState,
  sourceInstallState,
} from '../../release-state.ts';
import FamilyDirectory from './FamilyDirectory.vue';

const copied = ref(false);
const ready = ref(false);
const copyFailed = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | undefined;
function shortTitle(title: string): string {
  const rest = title.includes(': ') ? title.slice(title.indexOf(': ') + 2) : title;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}
async function copyStarter(): Promise<void> {
  if (!data.starter) return;
  try {
    copyFailed.value = false;
    await navigator.clipboard.writeText(data.starter.code);
    copied.value = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    copied.value = false;
    copyFailed.value = true;
  }
}
onMounted(() => {
  ready.value = true;
});
onBeforeUnmount(() => clearTimeout(copyTimer));
</script>

<template>
  <main class="hc-home-overview" :data-ready="ready" :aria-busy="!ready">
    <section class="hc-home-intro" aria-labelledby="hc-home-title">
      <div class="hc-home-proposition">
        <p class="hc-home-eyebrow">Holochart · Chart examples & guides</p>
        <h1 id="hc-home-title">Charts you can explore and build.</h1>
        <p class="hc-home-lede">
          Browse working examples by chart family, then start in JavaScript or a Python notebook.
        </p>
        <div class="hc-home-starts">
          <div class="hc-home-start">
            <a
              class="hc-home-action hc-home-action--brand"
              :href="withBase('/getting-started/python-jupyter')"
              >Start in Python / Jupyter →</a
            >
            <p>
              {{ installStatus(releaseState.pypi) }}.<br />
              <template v-if="registryInstallCommand(releaseState.pypi)"
                >Verified registry install available.</template
              >
              <template v-else-if="!sourceInstallState.python.publicRef"
                >Development checkout required.</template
              >
              <br />
              <a :href="withBase('/getting-started/installation#python-and-jupyter-from-source')"
                >Setup details</a
              >
            </p>
          </div>
          <div class="hc-home-start">
            <a class="hc-home-action" :href="withBase('/getting-started/javascript')"
              >Start in JavaScript →</a
            >
            <p>
              {{ installStatus(releaseState.npm) }}.<br />
              <a :href="withBase('/getting-started/installation#build-from-source-today')"
                >Setup details</a
              >
            </p>
          </div>
        </div>
        <a class="hc-home-browse" :href="withBase('/gallery/')"
          >Browse chart gallery · {{ data.count }} examples →</a
        >
        <p class="hc-home-compatibility">
          Plotly-compatible figure syntax, with
          <a :href="withBase('/reference/plotly-compat')">documented coverage and limits</a>.
          Interactive charts require WebGL2.
        </p>
      </div>
      <div
        v-if="data.previews.length"
        class="hc-home-mosaic"
        role="group"
        aria-label="Featured chart previews"
      >
        <a
          v-for="example in data.previews"
          :key="example.id"
          :href="withBase(`/gallery/example/${example.id}`)"
          class="hc-home-preview"
        >
          <img
            :src="withBase(`/${example.thumbnail}`)"
            :alt="example.title"
            :width="example.thumbnailSize.width"
            :height="example.thumbnailSize.height"
            decoding="async"
          />
          <span class="hc-home-preview-label"
            ><strong>{{ example.title }}</strong
            ><span>{{ familyById(example.primaryFamily)?.label }}</span></span
          >
        </a>
      </div>
      <p v-else class="hc-state" data-status="unavailable">
        Chart previews are temporarily unavailable.
        <a :href="withBase('/charts/')">Browse chart guides</a>.
      </p>
    </section>

    <section class="hc-home-section" aria-labelledby="hc-home-families">
      <div class="hc-home-section-heading">
        <h2 id="hc-home-families">Find the right chart family</h2>
        <a :href="withBase('/charts/')">Compare chart guides →</a>
      </div>
      <FamilyDirectory compact :families="data.families" />
    </section>

    <section v-if="data.starter" class="hc-home-section" aria-labelledby="hc-home-starter">
      <div class="hc-home-section-heading">
        <div>
          <h2 id="hc-home-starter">Start with a small chart</h2>
          <p>Seven daily values, including a negative value. The same figure draws this preview.</p>
        </div>
        <a :href="withBase('/getting-started/javascript')">Complete JavaScript setup →</a>
      </div>
      <div class="hc-home-starter">
        <div class="hc-home-code">
          <div class="hc-home-code-bar">
            <span>TypeScript · after source setup</span
            ><button type="button" :disabled="!ready" @click="copyStarter">
              {{ copied ? 'Copied' : 'Copy code' }}
            </button>
          </div>
          <p v-if="copyFailed" role="status" class="hc-home-copy-status">
            Could not copy. Select the code below.
          </p>
          <pre
            tabindex="0"
            role="region"
            aria-label="TypeScript starter source"
          ><code>{{ data.starter.code }}</code></pre>
        </div>
        <a
          :href="withBase(`/gallery/example/${data.starter.example.id}`)"
          class="hc-home-starter-result"
          ><img
            :src="withBase(`/${data.starter.example.thumbnail}`)"
            :alt="data.starter.example.description"
            :width="data.starter.example.thumbnailSize.width"
            :height="data.starter.example.thumbnailSize.height"
            loading="lazy"
          /><span>Explore the result and full source →</span></a
        >
      </div>
    </section>

    <section v-if="data.recipes.length" class="hc-home-section" aria-labelledby="hc-home-recipes">
      <div class="hc-home-section-heading">
        <h2 id="hc-home-recipes">Practical recipes</h2>
        <a :href="withBase('/cookbook/')">Browse recipes →</a>
      </div>
      <div class="hc-card-grid hc-home-collections">
        <a
          v-for="example in data.recipes"
          :key="example.id"
          :href="withBase(`/gallery/example/${example.id}`)"
          class="hc-home-collection"
          ><img
            :src="withBase(`/${example.thumbnail}`)"
            :alt="example.title"
            :width="example.thumbnailSize.width"
            :height="example.thumbnailSize.height"
            loading="lazy"
          />
          <h3>{{ shortTitle(example.title) }}</h3>
          <p>{{ example.description }}</p></a
        >
      </div>
    </section>

    <section v-if="data.demos.length" class="hc-home-section" aria-labelledby="hc-home-demos">
      <div class="hc-home-section-heading">
        <h2 id="hc-home-demos">Complete demos</h2>
        <a :href="withBase('/demos/')">All demos →</a>
      </div>
      <div class="hc-card-grid hc-home-collections">
        <a
          v-for="demo in data.demos"
          :key="demo.link"
          :href="withBase(demo.link)"
          class="hc-home-collection"
          ><img
            :src="withBase(`/${demo.preview.thumbnail}`)"
            :alt="demo.preview.title"
            :width="demo.preview.thumbnailSize.width"
            :height="demo.preview.thumbnailSize.height"
            loading="lazy"
          />
          <h3>{{ demo.title }}</h3>
          <p>
            {{ demo.count }} chart examples in a complete report. See the page for data sources and
            context.
          </p></a
        >
      </div>
    </section>

    <section class="hc-home-section hc-home-techniques" aria-labelledby="hc-home-techniques">
      <h2 id="hc-home-techniques">One figure format, several ways to work</h2>
      <p>
        Use <a :href="withBase('/getting-started/core-concepts')">data, layout and config</a> to
        describe a chart, then explore
        <a :href="withBase('/customization/')">themes and styling</a>,
        <a :href="withBase('/charts/3d/')">3D scenes</a> or
        <a :href="withBase('/guides/accessibility')">keyboard and screen-reader support</a>. Maps
        and network graphs use
        <a :href="withBase('/fundamentals/maps')">separate browser extensions</a>; check the
        <a :href="withBase('/python/')">Python support limits</a> before adapting them to a
        notebook.
      </p>
    </section>
  </main>
</template>

<style>
.hc-homepage .VPHome {
  margin-bottom: 0;
}
.hc-home-overview {
  max-width: var(--hc-catalog-width);
  margin: 0 auto;
  padding: 24px 24px 64px;
}
.hc-home-intro {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  gap: 28px;
  align-items: start;
}
.hc-home-proposition {
  min-width: 0;
}
.hc-home-eyebrow {
  margin: 0 0 10px;
  color: var(--vp-c-brand-1);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  line-height: 20px;
}
.hc-home-proposition h1 {
  margin: 0;
  color: var(--hc-title);
  font-size: clamp(30px, 3vw, 44px);
  line-height: 1.1;
  letter-spacing: -0.025em;
  font-weight: 700;
  max-width: 16ch;
}
.hc-home-lede {
  margin: 14px 0 20px;
  color: var(--vp-c-text-2);
  font-size: 16px;
  line-height: 25px;
  max-width: 48ch;
}
.hc-home-starts {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}
.hc-home-start {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}
.hc-home-action {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--hc-axis);
  border-radius: 4px;
  font-size: 14px;
  line-height: 20px;
  color: var(--vp-c-text-1);
  font-weight: 600;
}
.hc-home-action--brand {
  border-color: var(--vp-c-brand-3);
  background: var(--vp-c-brand-3);
  color: #fff;
}
.hc-home-start p {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--vp-c-text-2);
}
.hc-home-start p a,
.hc-home-compatibility a,
.hc-home-techniques a {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.hc-home-browse {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  margin-top: 10px;
  color: var(--vp-c-brand-1);
  font-size: 15px;
}
.hc-home-compatibility {
  font-size: 13px;
  line-height: 20px;
  margin: 8px 0 0;
  color: var(--vp-c-text-2);
  max-width: 60ch;
}
.hc-home-mosaic {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.hc-home-preview {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--hc-grid);
  border-radius: 4px;
  overflow: hidden;
  background: var(--hc-surface-1);
}
.hc-home-preview img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16/10;
  object-fit: contain;
  background: var(--hc-bg);
}
.hc-home-preview-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 18px;
}
.hc-home-preview-label strong {
  font-size: 14px;
  color: var(--vp-c-text-1);
  font-weight: 500;
}
.hc-home-preview-label > span {
  color: var(--vp-c-text-2);
  font-size: 12px;
}
.hc-home-section {
  margin-top: 32px;
}
.hc-home-section-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
  margin-bottom: 12px;
}
.hc-home-section h2 {
  color: var(--hc-title);
  font-size: 21px;
  line-height: 28px;
  font-weight: 600;
  margin: 0;
}
.hc-home-section-heading > a {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--vp-c-brand-1);
}
.hc-home-section-heading p {
  margin: 5px 0 0;
  font-size: 15px;
  color: var(--vp-c-text-2);
  line-height: 23px;
}
.hc-home-starter {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  border: 1px solid var(--hc-grid);
  border-radius: 4px;
  overflow: hidden;
}
.hc-home-code {
  min-width: 0;
  background: var(--hc-code-bg);
}
.hc-home-code-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 12px;
  border-bottom: 1px solid var(--hc-grid);
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-family: var(--vp-font-family-mono);
}
.hc-home-code-bar button {
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid var(--hc-axis);
  border-radius: 3px;
  color: var(--vp-c-text-1);
}
.hc-home-code pre {
  max-height: 340px;
  overflow: auto;
  margin: 0;
  padding: 16px;
  font-size: 13px;
  line-height: 21px;
  tab-size: 2;
  color: var(--vp-code-block-color);
}
.hc-home-copy-status {
  margin: 8px 12px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.hc-home-starter-result {
  display: flex;
  flex-direction: column;
  min-width: 0;
  justify-content: center;
  border-left: 1px solid var(--hc-grid);
  background: var(--hc-bg);
}
.hc-home-starter-result img {
  width: 100%;
  height: auto;
  max-height: 330px;
  object-fit: contain;
}
.hc-home-starter-result > span {
  display: block;
  padding: 8px 14px;
  color: var(--vp-c-brand-1);
  font-size: 14px;
}
.hc-home-collection {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--hc-grid);
  border-radius: 4px;
  background: var(--hc-surface-1);
}
.hc-home-collection img {
  display: block;
  aspect-ratio: 16/10;
  object-fit: contain;
  width: 100%;
  height: auto;
}
.hc-home-collection h3 {
  margin: 12px 0 4px;
  font-size: 16px;
  line-height: 22px;
  font-weight: 500;
  color: var(--vp-c-text-1);
}
.hc-home-collection p {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--vp-c-text-2);
}
.hc-home-techniques p {
  font-size: 15px;
  line-height: 24px;
  max-width: 90ch;
  margin-top: 10px;
}
.hc-home-preview:hover,
.hc-home-collection:hover,
.hc-home-action:hover {
  border-color: var(--hc-zero);
}
@media (max-width: 1099px) {
  .hc-home-intro {
    grid-template-columns: minmax(0, 1fr);
  }
  .hc-home-proposition h1 {
    max-width: 25ch;
  }
  .hc-home-starts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .hc-home-start {
    display: block;
  }
  .hc-home-start p {
    margin-top: 8px;
  }
}
@media (max-width: 599px) {
  .hc-home-overview {
    padding: 20px 16px 48px;
  }
  .hc-home-starts {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }
  .hc-home-action {
    width: 100%;
  }
  .hc-home-mosaic {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .hc-home-section-heading {
    align-items: start;
    flex-direction: column;
    gap: 4px;
  }
  .hc-home-starter {
    grid-template-columns: minmax(0, 1fr);
  }
  .hc-home-starter-result {
    border-left: 0;
    border-top: 1px solid var(--hc-grid);
  }
}
</style>

<style>
@media (pointer: coarse), (max-width: 640px) {
  .hc-home-browse,
  .hc-home-start p a,
  .hc-home-section-heading > a,
  .hc-home-code-bar button {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }
}
</style>
