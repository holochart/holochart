<script setup lang="ts">
import type { DefaultTheme } from 'vitepress/theme';
import { computed, useId } from 'vue';
import { useSidebarControl } from 'virtual:holochart-sidebar-control';
import VPLink from 'virtual:holochart-sidebar-link';

// Adapted from VitePress 1.6.4 VPSidebarItem.vue (MIT). Keep a single interactive toggle.
defineOptions({ name: 'AccessibleSidebarItem' });

const props = defineProps<{
  item: DefaultTheme.SidebarItem;
  depth: number;
}>();

const { collapsed, collapsible, isLink, isActiveLink, hasActiveLink, hasChildren, toggle } =
  useSidebarControl(computed(() => props.item));

const sectionTag = computed(() => (hasChildren.value ? 'section' : `div`));

const linkTag = computed(() => (isLink.value ? 'a' : 'div'));

const textTag = computed(() => {
  return !hasChildren.value ? 'p' : props.depth + 2 === 7 ? 'p' : `h${props.depth + 2}`;
});

const itemRole = computed(() => (collapsible.value && !isLink.value ? 'button' : undefined));
const childrenId = `hc-sidebar-${useId()}`;
const toggleLabel = computed(
  () => `Toggle ${props.item.text?.replace(/<[^>]*>/g, '') ?? 'section'}`,
);

const classes = computed(() => [
  [`level-${props.depth}`],
  { collapsible: collapsible.value },
  { collapsed: collapsed.value },
  { 'is-link': isLink.value },
  { 'is-active': isActiveLink.value },
  { 'has-active': hasActiveLink.value },
]);

function onItemInteraction(e: MouseEvent | KeyboardEvent) {
  if (!collapsible.value || isLink.value) return;
  if ('key' in e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
  }
  toggle();
}
</script>

<template>
  <component :is="sectionTag" class="VPSidebarItem" :class="classes">
    <div
      v-if="item.text"
      class="item"
      :role="itemRole"
      v-on="collapsible && !isLink ? { click: onItemInteraction, keydown: onItemInteraction } : {}"
      :tabindex="itemRole ? 0 : undefined"
      :aria-expanded="itemRole ? !collapsed : undefined"
      :aria-controls="itemRole ? childrenId : undefined"
    >
      <div class="indicator" />

      <VPLink
        v-if="item.link"
        :tag="linkTag"
        class="link"
        :href="item.link"
        :rel="item.rel"
        :target="item.target"
      >
        <component :is="textTag" class="text" v-html="item.text" />
      </VPLink>
      <component v-else :is="textTag" class="text" v-html="item.text" />

      <button
        v-if="collapsible && isLink"
        type="button"
        class="caret"
        :aria-label="toggleLabel"
        :aria-expanded="!collapsed"
        :aria-controls="childrenId"
        @click.stop="toggle"
      >
        <span class="vpi-chevron-right caret-icon" aria-hidden="true" />
      </button>
      <span v-else-if="collapsible" class="caret" aria-hidden="true">
        <span class="vpi-chevron-right caret-icon" />
      </span>
    </div>

    <div v-if="item.items && item.items.length" :id="childrenId" class="items">
      <template v-if="depth < 5">
        <AccessibleSidebarItem v-for="i in item.items" :key="i.text" :item="i" :depth="depth + 1" />
      </template>
    </div>
  </component>
</template>

<style scoped>
.VPSidebarItem.level-0 {
  padding-bottom: 24px;
}

.VPSidebarItem.collapsed.level-0 {
  padding-bottom: 10px;
}

.item {
  position: relative;
  display: flex;
  width: 100%;
}

.VPSidebarItem.collapsible > .item {
  cursor: pointer;
}

.indicator {
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: -17px;
  width: 2px;
  border-radius: 2px;
  transition: background-color 0.25s;
}

.VPSidebarItem.level-2.is-active > .item > .indicator,
.VPSidebarItem.level-3.is-active > .item > .indicator,
.VPSidebarItem.level-4.is-active > .item > .indicator,
.VPSidebarItem.level-5.is-active > .item > .indicator {
  background-color: var(--vp-c-brand-1);
}

.link {
  display: flex;
  align-items: center;
  flex-grow: 1;
}

.text {
  flex-grow: 1;
  padding: 4px 0;
  line-height: 24px;
  font-size: 14px;
  transition: color 0.25s;
}

.VPSidebarItem.level-0 .text {
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.VPSidebarItem.level-1 .text,
.VPSidebarItem.level-2 .text,
.VPSidebarItem.level-3 .text,
.VPSidebarItem.level-4 .text,
.VPSidebarItem.level-5 .text {
  font-weight: 500;
  color: var(--vp-c-text-2);
}

.VPSidebarItem.level-0.is-link > .item > .link:hover .text,
.VPSidebarItem.level-1.is-link > .item > .link:hover .text,
.VPSidebarItem.level-2.is-link > .item > .link:hover .text,
.VPSidebarItem.level-3.is-link > .item > .link:hover .text,
.VPSidebarItem.level-4.is-link > .item > .link:hover .text,
.VPSidebarItem.level-5.is-link > .item > .link:hover .text {
  color: var(--vp-c-brand-1);
}

.VPSidebarItem.level-0.has-active > .item > .text,
.VPSidebarItem.level-1.has-active > .item > .text,
.VPSidebarItem.level-2.has-active > .item > .text,
.VPSidebarItem.level-3.has-active > .item > .text,
.VPSidebarItem.level-4.has-active > .item > .text,
.VPSidebarItem.level-5.has-active > .item > .text,
.VPSidebarItem.level-0.has-active > .item > .link > .text,
.VPSidebarItem.level-1.has-active > .item > .link > .text,
.VPSidebarItem.level-2.has-active > .item > .link > .text,
.VPSidebarItem.level-3.has-active > .item > .link > .text,
.VPSidebarItem.level-4.has-active > .item > .link > .text,
.VPSidebarItem.level-5.has-active > .item > .link > .text {
  color: var(--vp-c-text-1);
}

.VPSidebarItem.level-0.is-active > .item .link > .text,
.VPSidebarItem.level-1.is-active > .item .link > .text,
.VPSidebarItem.level-2.is-active > .item .link > .text,
.VPSidebarItem.level-3.is-active > .item .link > .text,
.VPSidebarItem.level-4.is-active > .item .link > .text,
.VPSidebarItem.level-5.is-active > .item .link > .text {
  color: var(--vp-c-brand-1);
}

.caret {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-right: -7px;
  width: 32px;
  height: 32px;
  color: var(--vp-c-text-3);
  cursor: pointer;
  transition: color 0.25s;
  flex-shrink: 0;
}

.item:hover .caret {
  color: var(--vp-c-text-2);
}

.item:hover .caret:hover {
  color: var(--vp-c-text-1);
}

.caret-icon {
  font-size: 18px;
  /*rtl:ignore*/
  transform: rotate(90deg);
  transition: transform 0.25s;
}

.VPSidebarItem.collapsed .caret-icon {
  transform: rotate(0) /*rtl:rotate(180deg)*/;
}

.VPSidebarItem.level-1 .items,
.VPSidebarItem.level-2 .items,
.VPSidebarItem.level-3 .items,
.VPSidebarItem.level-4 .items,
.VPSidebarItem.level-5 .items {
  border-left: 1px solid var(--vp-c-divider);
  padding-left: 16px;
}

.VPSidebarItem.collapsed .items {
  display: none;
}
@media (pointer: coarse), (max-width: 640px) {
  .item[role='button'],
  .link,
  button.caret {
    min-height: 44px;
  }
  button.caret {
    min-width: 44px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .indicator,
  .text,
  .caret,
  .caret-icon {
    transition: none;
  }
}
</style>
