import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const localStunnerRoot = path.resolve(rootDir, '..', 'stunner');
const appNodeModules = path.resolve(rootDir, 'node_modules');

export default defineConfig(({ mode }) => {
  loadEnv(mode, rootDir, '');

  return {
    plugins: [react(), basicSsl()],
    server: {
      fs: {
        allow: [rootDir, localStunnerRoot, appNodeModules],
      },
      host: true,
    },
    resolve: {
      dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      alias: [
        { find: 'react', replacement: path.resolve(appNodeModules, 'react') },
        { find: 'react-dom', replacement: path.resolve(appNodeModules, 'react-dom') },
        { find: 'react/jsx-runtime', replacement: path.resolve(appNodeModules, 'react/jsx-runtime.js') },
        { find: 'react/jsx-dev-runtime', replacement: path.resolve(appNodeModules, 'react/jsx-dev-runtime.js') },
      ],
    },
  };
});
