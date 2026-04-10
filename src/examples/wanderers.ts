import { loadGltfSceneFromArrayBuffer } from '@stunner/core/renderer/mesh/GltfLoader';
import type { RenderScene } from '@stunner/core/renderer/mesh/SceneTypes';

const WANDERERS_MODEL_URL = '/models/wanderers/wanderers.glb';

const clampProgress = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
};

const fetchArrayBufferWithProgress = async (
  url: string,
  onProgress?: (progress: number) => void,
): Promise<ArrayBuffer> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch GLB asset: ${url}`);
  }

  const contentLengthHeader = response.headers.get('content-length');
  const totalBytes = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : Number.NaN;
  const canTrackProgress = Boolean(response.body) && Number.isFinite(totalBytes) && totalBytes > 0;

  onProgress?.(0);

  if (!canTrackProgress) {
    const source = await response.arrayBuffer();
    onProgress?.(1);
    return source;
  }

  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (value) {
      chunks.push(value);
      loadedBytes += value.byteLength;
      onProgress?.(clampProgress(loadedBytes / totalBytes));
    }
  }

  const merged = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  onProgress?.(1);
  return merged.buffer;
};

export type WanderersExampleOptions = Record<string, never>;

export const DEFAULT_WANDERERS_OPTIONS: WanderersExampleOptions = {};

export type WanderersExampleController = {
  setOptions: (_options: WanderersExampleOptions) => void;
  dispose: () => void;
};

export const startWanderersExample = (
  applyScene: (scene: RenderScene) => void,
  _initialOptions?: Partial<WanderersExampleOptions>,
  onLoadingProgress?: (progress: number | null) => void,
): WanderersExampleController => {
  let disposed = false;
  let loadedDispose: (() => void) | null = null;

  void fetchArrayBufferWithProgress(WANDERERS_MODEL_URL, (progress) => {
    if (disposed) {
      return;
    }
    onLoadingProgress?.(progress);
  })
    .then((source) => {
      return loadGltfSceneFromArrayBuffer(source, { baseUrl: WANDERERS_MODEL_URL });
    })
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
      console.warn('Wanderers example failed to load.', error);
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
