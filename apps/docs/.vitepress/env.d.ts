/// <reference types="vite/client" />

declare module '*.vue' {
  type EnhanceApp = NonNullable<import('vitepress').Theme['enhanceApp']>;
  type Component = Parameters<Parameters<EnhanceApp>[0]['app']['component']>[1];
  const component: Component;
  export default component;
}

declare module 'virtual:holochart-example-sources' {
  /** Example id → loader for its raw source and Shiki-highlighted HTML. */
  export const sources: Readonly<
    Record<string, () => Promise<{ readonly code: string; readonly html: string }>>
  >;
}

/** Base URL of the dev sandbox used by "Open in sandbox" links (set in `.vitepress/config.ts`). */
declare const __HOLOCHART_SANDBOX_URL__: string;
