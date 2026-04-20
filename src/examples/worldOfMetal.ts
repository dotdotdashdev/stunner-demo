import { loadUsdSceneFromUrl, AssetResolver } from '@stunner/usd';
import type { RenderScene } from '@stunner/core/renderer/mesh/SceneTypes';

const WORLD_OF_METAL_USDZ_URL = '/models/world-of-metal/world_of_metal.usdz';

export type WorldOfMetalExampleOptions = Record<string, never>;
export const DEFAULT_WORLD_OF_METAL_OPTIONS: WorldOfMetalExampleOptions = {};

export type WorldOfMetalExampleController = {
  setOptions: (_options: WorldOfMetalExampleOptions) => void;
  dispose: () => void;
};

const clampProgress = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const fetchBytesWithProgress = async (
  url: string,
  onProgress?: (progress: number) => void,
): Promise<Uint8Array> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch USDZ asset: ${url} (${response.status})`);
  const totalHeader = response.headers.get('content-length');
  const total = totalHeader ? Number.parseInt(totalHeader, 10) : Number.NaN;
  if (!response.body || !Number.isFinite(total) || total <= 0) {
    onProgress?.(0);
    const buf = await response.arrayBuffer();
    onProgress?.(0.95);
    return new Uint8Array(buf);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  onProgress?.(0);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.(clampProgress((loaded / total) * 0.9));
    }
  }
  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
  return merged;
};

/**
 * Materialise USD-internal texture references into blob URLs the renderer can
 * fetch, mutating `scene.textureLibrary` in place. Returns the list of blob
 * URLs so they can be revoked on dispose.
 */
const materialiseUsdTextures = async (
  scene: RenderScene,
  resolver: AssetResolver,
  pkgUri: string,
): Promise<string[]> => {
  const lib = scene.textureLibrary;
  if (!lib) return [];
  const blobUrls: string[] = [];
  for (const id of Object.keys(lib)) {
    if (!id.startsWith('usd:')) continue;
    const authored = id.slice('usd:'.length);
    // Anchor the authored asset path against the package URI.
    const assetUri = authored.includes('://') || authored.startsWith('/')
      ? authored
      : `${pkgUri}[${authored}]`;
    try {
      const asset = await resolver.read(assetUri);
      const blob = new Blob([asset.bytes.slice().buffer]);
      const url = URL.createObjectURL(blob);
      lib[id] = url;
      blobUrls.push(url);
    } catch (err) {
      console.warn(`worldOfMetal: failed to load USD texture '${authored}'`, err);
    }
  }
  return blobUrls;
};

export const startWorldOfMetalExample = (
  applyScene: (scene: RenderScene) => void,
  _initialOptions?: Partial<WorldOfMetalExampleOptions>,
  onLoadingProgress?: (progress: number | null) => void,
): WorldOfMetalExampleController => {
  let disposed = false;
  let blobUrlsToRevoke: string[] = [];
  onLoadingProgress?.(0);

  void (async (): Promise<void> => {
    try {
      const bytes = await fetchBytesWithProgress(WORLD_OF_METAL_USDZ_URL, (p) => {
        if (!disposed) onLoadingProgress?.(p);
      });
      if (disposed) return;
      onLoadingProgress?.(0.92);

      const fetcher = async (uri: string): Promise<Uint8Array> => {
        if (uri === WORLD_OF_METAL_USDZ_URL || uri.endsWith('/world_of_metal.usdz')) return bytes;
        const response = await fetch(uri);
        if (!response.ok) throw new Error(`USD asset fetch failed: ${uri}`);
        return new Uint8Array(await response.arrayBuffer());
      };
      const resolver = new AssetResolver({ fetcher });

      const result = await loadUsdSceneFromUrl(WORLD_OF_METAL_USDZ_URL, { resolver });
      if (disposed) return;
      onLoadingProgress?.(0.96);

      blobUrlsToRevoke = await materialiseUsdTextures(result.scene, resolver, WORLD_OF_METAL_USDZ_URL);

      if (result.warnings.length > 0) {
        console.info(`worldOfMetal: ${result.warnings.length} USD warnings`);
      }

      // Provide a single key directional light so the asset (which has no
      // authored UsdLux lights) is illuminated by the renderer's directional
      // term.
      if (result.scene.lights.length === 0) {
        result.scene.directionalLightingEnabled = true;
        result.scene.directionalLightingIntensity = 1;
      }

      if (disposed) return;
      applyScene(result.scene);
      onLoadingProgress?.(null);
    } catch (err) {
      onLoadingProgress?.(null);
      console.warn('worldOfMetal example failed to load.', err);
    }
  })();

  return {
    setOptions: () => {},
    dispose: () => {
      disposed = true;
      onLoadingProgress?.(null);
      for (const url of blobUrlsToRevoke) URL.revokeObjectURL(url);
      blobUrlsToRevoke = [];
    },
  };
};
