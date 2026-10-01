import { defineConfig } from 'vite';

// Relative asset URLs: the smoke test serves the build from a sub-path (`/vite/dist/`).
export default defineConfig({ base: './', logLevel: 'warn' });
