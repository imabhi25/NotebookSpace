/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Opens the API connection (DNS + TLS) while the bundle downloads, when the API origin is known at build time. */
function preconnectApi(apiBase: string | undefined): Plugin {
  return {
    name: 'preconnect-api-origin',
    transformIndexHtml() {
      if (!apiBase) return [];
      try {
        const origin = new URL(apiBase).origin;
        return [{ tag: 'link', attrs: { rel: 'preconnect', href: origin, crossorigin: '' }, injectTo: 'head-prepend' as const }];
      } catch { return []; }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), preconnectApi(process.env.VITE_API_BASE_URL || env.VITE_API_BASE_URL)],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/setupTests.ts',
    },
  };
});
