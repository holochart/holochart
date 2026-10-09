/** Replace VitePress's nested toggle controls with equivalent SSR-safe accessible markup. */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface SidebarPlugin {
  name: string;
  enforce: 'pre';
  resolveId(id: string, importer?: string): string | null;
}

export function sidebarAccessibilityPlugin(): SidebarPlugin {
  const require = createRequire(import.meta.url);
  const theme = path.join(
    path.dirname(require.resolve('vitepress/package.json')),
    'dist/client/theme-default',
  );
  const replacement = fileURLToPath(
    new URL('../theme/components/AccessibleSidebarItem.vue', import.meta.url),
  );
  return {
    name: 'holochart-sidebar-accessibility',
    enforce: 'pre',
    resolveId(id, importer) {
      if (
        id === './VPSidebarItem.vue' &&
        importer?.replaceAll('\\', '/').includes('/vitepress/dist/client/theme-default/components/')
      )
        return replacement;
      if (id === 'virtual:holochart-sidebar-control')
        return path.join(theme, 'composables/sidebar.js');
      if (id === 'virtual:holochart-sidebar-link') return path.join(theme, 'components/VPLink.vue');
      return null;
    },
  };
}
