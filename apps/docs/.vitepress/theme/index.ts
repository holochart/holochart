import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme-without-fonts';
import Example from './components/Example.vue';
import ChartOverview from './components/ChartOverview.vue';
import ChartVariations from './components/ChartVariations.vue';
import ExampleLink from './components/ExampleLink.vue';
import InstallStatus from './components/InstallStatus.vue';
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
  enhanceApp({ app, router }) {
    app.component('Example', Example);
    app.component('ChartOverview', ChartOverview);
    app.component('ChartVariations', ChartVariations);
    app.component('ExampleLink', ExampleLink);
    app.component('InstallStatus', InstallStatus);
    const beforePageLoad = router.onBeforePageLoad;
    router.onBeforePageLoad = async (to) => {
      const result = await beforePageLoad?.(to);
      if (result === false) return false;
      // In production, a popstate imports the full page chunk and can replace the initial
      // lean component. Gallery query/hash state belongs to its already-mounted instance.
      if (
        typeof window !== 'undefined' &&
        router.route.data.relativePath.startsWith('gallery/') &&
        !router.route.data.relativePath.startsWith('gallery/example/') &&
        new URL(to, window.location.href).pathname === router.route.path
      ) {
        window.dispatchEvent(new Event('hc:gallery-route'));
        return false;
      }
      return result;
    };
  },
} satisfies Theme;
