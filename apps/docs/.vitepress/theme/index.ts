import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import Example from './components/Example.vue';
import Layout from './Layout.vue';
import './custom.css';

/** Default theme plus the global `<Example>` embed and the page status banner. */
export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('Example', Example);
  },
} satisfies Theme;
