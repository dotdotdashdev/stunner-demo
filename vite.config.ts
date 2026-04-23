import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const localStunnerRoot = path.resolve(rootDir, '../stunner');
const installedStunnerRoot = path.resolve(rootDir, 'node_modules/stunner');
const appNodeModules = path.resolve(rootDir, 'node_modules');

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const useInstalledStunner = env.STUNNER_SOURCE === 'installed';
  const stunnerRoot = useInstalledStunner ? installedStunnerRoot : localStunnerRoot;

  return {
    plugins: [react(), basicSsl()],
    server: {
      fs: {
        allow: [rootDir, localStunnerRoot, installedStunnerRoot],
      },
      host: true,
    },
    resolve: {
      // Ensure every import path (including aliased @stunner/* source files)
      // resolves to the app's single React instance.
      dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      alias: {
        react: path.resolve(appNodeModules, 'react'),
        'react-dom': path.resolve(appNodeModules, 'react-dom'),
        'react/jsx-runtime': path.resolve(appNodeModules, 'react/jsx-runtime.js'),
        'react/jsx-dev-runtime': path.resolve(appNodeModules, 'react/jsx-dev-runtime.js'),
        '@stunner/react': path.resolve(stunnerRoot, 'packages/stunner-react/src/index.ts'),
        '@stunner/core': path.resolve(stunnerRoot, 'packages/stunner-core/src'),
        '@stunner/draco': path.resolve(stunnerRoot, 'packages/stunner-draco/src/index.ts'),
        '@stunner/usd': path.resolve(stunnerRoot, 'packages/stunner-usd/src/index.ts'),
      },
    },
  };
});
