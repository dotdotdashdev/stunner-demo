import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@stunner/react': path.resolve(rootDir, 'node_modules/stunner/packages/stunner-react/src/index.ts'),
      '@stunner/core': path.resolve(rootDir, 'node_modules/stunner/packages/stunner-core/src'),
    },
  },
});
