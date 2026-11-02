import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config
export default defineConfig({
  // UI tests must not rewrite the dependency cache of a running desktop app.
  cacheDir: process.env.TEST_UI_PORT
    ? `node_modules/.vite-tests/${process.env.TEST_UI_PORT}`
    : 'node_modules/.vite',
  plugins: [tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  // The local source package is not prebundled. Explicitly optimize its library
  // dependencies so CommonJS internals never reach the dev browser unchanged.
  optimizeDeps: {
    include: [
      'shiki/bundle/web',
      'shiki/engine/javascript',
      'monaco-editor/languages/definitions/typescript/register',
      'monaco-editor/languages/definitions/python/register',
      'monaco-editor/languages/definitions/shell/register',
      'monaco-editor/languages/definitions/html/register',
      'monaco-editor/languages/definitions/css/register',
      'monaco-editor/languages/definitions/yaml/register',
      '@xterm/xterm',
      '@xterm/addon-fit',
      'monaco-editor/editor/editor.api',
      'monaco-editor/languages/definitions/javascript/register',
      'monaco-editor/language/json/monaco.contribution',
      'monaco-editor/languages/definitions/markdown/register',
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'unified',
      'remark-parse',
      'remark-gfm',
      'extend',
      'debug',
      '@base-ui/react/button',
      '@base-ui/react/collapsible',
      '@base-ui/react/slider',
      '@base-ui/react/switch',
      '@base-ui/react/toggle',
      '@base-ui/react/toggle-group',
      'lucide-react',
      'class-variance-authority',
      'clsx',
      'd3-scale',
      'diff',
      'tailwind-merge',
      'zod',
      'use-sync-external-store/shim',
      'use-sync-external-store/shim/with-selector',
      'use-sync-external-store/shim/with-selector.js',
    ],
  },
  // Give Forge and Chromium the same loopback address on Windows.
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/out/**', '**/test-results/**'] },
  },
});
