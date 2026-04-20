import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const localStunnerRoot = path.resolve(rootDir, '../stunner');
const installedStunnerRoot = path.resolve(rootDir, 'node_modules/stunner');

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const useInstalledStunner = env.STUNNER_SOURCE === 'installed';
  const stunnerRoot = useInstalledStunner ? installedStunnerRoot : localStunnerRoot;

  return {
    plugins: [react()],
    server: {
      fs: {
        allow: [rootDir, localStunnerRoot, installedStunnerRoot],
      },
    },
    resolve: {
      alias: {
        '@stunner/react': path.resolve(stunnerRoot, 'packages/stunner-react/src/index.ts'),
        '@stunner/core': path.resolve(stunnerRoot, 'packages/stunner-core/src'),
        '@stunner/draco': path.resolve(stunnerRoot, 'packages/stunner-draco/src/index.ts'),
        '@stunner/usd': path.resolve(stunnerRoot, 'packages/stunner-usd/src/index.ts'),
      },
    },
  };
});
