import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme-without-fonts';
import Example from './components/Example.vue';
import Layout from './Layout.vue';
import './fonts.css';
import './custom.css';

/**
 * Default theme (without its bundled Inter font: the site uses TeX Gyre Heros, the charts' font,
 * see `fonts.css`) plus the global `<Example>` embed and the page status banner.
 */
export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('Example', Example);
  },
} satisfies Theme;
