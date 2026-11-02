import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      ssh2: fileURLToPath(
        new URL('./src/labs/unsupported-ssh.ts', import.meta.url),
      ),
    },
  },
});
