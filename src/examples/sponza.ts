import { loadGltfSceneFromUrl } from '@stunner/core/renderer/mesh/GltfLoader';
import type { RenderScene } from '@stunner/core/renderer/mesh/SceneTypes';

const SPONZA_MODEL_URL = '/models/sponza/Sponza.gltf';

export type SponzaExampleOptions = Record<string, never>;

export const DEFAULT_SPONZA_OPTIONS: SponzaExampleOptions = {};

export type SponzaExampleController = {
  setOptions: (_options: SponzaExampleOptions) => void;
  dispose: () => void;
};

export const startSponzaExample = (
  applyScene: (scene: RenderScene) => void,
  _initialOptions?: Partial<SponzaExampleOptions>,
  onLoadingProgress?: (progress: number | null) => void,
): SponzaExampleController => {
  let disposed = false;
  let loadedDispose: (() => void) | null = null;
  onLoadingProgress?.(0);

  void loadGltfSceneFromUrl(SPONZA_MODEL_URL)
    .then((result) => {
      if (disposed) {
        result.dispose();
        return;
      }

      loadedDispose = result.dispose;
      const scene: RenderScene = {
        meshes: result.meshes,
        textureLibrary: result.textureLibrary,
        lights: [],
      };
      applyScene(scene);
      onLoadingProgress?.(null);
    })
    .catch((error: unknown) => {
      onLoadingProgress?.(null);
      console.warn('Sponza example failed to load.', error);
    });

  return {
    setOptions: () => {},
    dispose: () => {
      disposed = true;
      onLoadingProgress?.(null);
      if (loadedDispose) {
        loadedDispose();
        loadedDispose = null;
      }
    },
  };
};
