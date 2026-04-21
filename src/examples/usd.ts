import { loadUsdSceneFromUrl, AssetResolver } from '@stunner/usd';
import type { RenderScene } from '@stunner/core/renderer/mesh/SceneTypes';
import type { PbrMaterial } from '@stunner/core/renderer/mesh/MaterialTypes';

export type UsdModelKey = 'porsche' | 'train' | 'city5' | 'city6' | 'city7' | 'worldOfMetal';

type UsdModelEntry = {
  key: UsdModelKey;
  label: string;
  url: string;
};

export const USD_MODELS: ReadonlyArray<UsdModelEntry> = [
  { key: 'porsche', label: '2014 Porsche 911 Turbo', url: '/models/usd/2014_Porsche_911_Turbo_991.usdz' },
  { key: 'train', label: 'Train', url: '/models/usd/Train.usdz' },
  { key: 'city5', label: 'Procedural City 5', url: '/models/usd/Procedural_City_5.usdz' },
  { key: 'city6', label: 'Procedural City 6', url: '/models/usd/Procedural_City_6.usdz' },
  { key: 'city7', label: 'Procedural City 7', url: '/models/usd/Procedural_City_7.usdz' },
  { key: 'worldOfMetal', label: 'World of Metal', url: '/models/usd/world_of_metal.usdz' },
];

const URL_BY_KEY: Record<UsdModelKey, string> = USD_MODELS.reduce(
  (acc, entry) => {
    acc[entry.key] = entry.url;
    return acc;
  },
  {} as Record<UsdModelKey, string>,
);

export type UsdExampleOptions = {
  modelKey: UsdModelKey;
  /** Clearcoat strength applied to detected paint/metal trim materials. */
  paintClearCoat: number;
  /** Clearcoat roughness for paint/metal trim materials. */
  paintClearCoatRoughness: number;
  /** Override for paint material roughness (smoother than authored). */
  paintRoughness: number;
  /** Roughness override for detected glass. Higher = softer refraction (less banding). */
  glassRoughness: number;
  /** Index of refraction for detected glass. Lower = less distortion (less banding). */
  glassIor: number;
  /** Screen-space refraction strength for detected glass. */
  glassRefractionStrength: number;
  /** Active screen-space refraction march samples for detected glass (max 32). */
  glassRefractionSteps: number;
};

export const DEFAULT_USD_OPTIONS: UsdExampleOptions = {
  modelKey: 'porsche',
  paintClearCoat: 1,
  paintClearCoatRoughness: 0.5,
  paintRoughness: 0.15,
  glassRoughness: 0.02,
  glassIor: 1.45,
  glassRefractionStrength: 0.1,
  glassRefractionSteps: 12,
};

type MaterialClass = 'glass' | 'paint' | 'other';

const classifyMaterial = (mat: PbrMaterial): MaterialClass => {
  if (mat.transparent && mat.metallic < 0.1 && mat.baseColor[3] < 0.95) return 'glass';
  // Paint heuristic: opaque, metallic-leaning, semi-smooth, AND not near-black.
  // Dark trim/grille/tire materials happen to share the metallic+roughness
  // range with body paint but are *not* paint — smoothing them produces
  // screen-space reflection artifacts (the dark mirror picks up foreground
  // pixels). Require a minimum perceived brightness to qualify.
  const luminance =
    mat.baseColor[0] * 0.2126 +
    mat.baseColor[1] * 0.7152 +
    mat.baseColor[2] * 0.0722;
  if (
    !mat.transparent &&
    mat.metallic > 0.5 &&
    mat.roughness < 0.5 &&
    luminance > 0.18
  ) {
    return 'paint';
  }
  return 'other';
};

/**
 * Snapshot the original (as-loaded) values of the fields we mutate so we
 * can re-apply tuning on top of a clean baseline when the user changes
 * sliders. Stored on the material object via a non-enumerable key.
 */
type MaterialBaseline = {
  metallic: number;
  roughness: number;
  clearCoatFactor: number;
  clearCoatRoughness: number;
  refractionStrength: number;
  refractionSteps: number;
  refractionDepthBias: number;
  ior: number;
};
const BASELINE_KEY = '__usdExampleBaseline' as const;
const getBaseline = (mat: PbrMaterial): MaterialBaseline => {
  const cached = (mat as unknown as Record<string, MaterialBaseline | undefined>)[BASELINE_KEY];
  if (cached) return cached;
  const snap: MaterialBaseline = {
    metallic: mat.metallic,
    roughness: mat.roughness,
    clearCoatFactor: mat.clearCoatFactor,
    clearCoatRoughness: mat.clearCoatRoughness,
    refractionStrength: mat.refractionStrength,
    refractionSteps: mat.refractionSteps,
    refractionDepthBias: mat.refractionDepthBias,
    ior: mat.ior,
  };
  Object.defineProperty(mat, BASELINE_KEY, { value: snap, enumerable: false, writable: false });
  return snap;
};

const tuneSceneMaterials = (scene: RenderScene, opts: UsdExampleOptions): void => {
  const seen = new Set<PbrMaterial>();
  const visit = (mat: PbrMaterial): void => {
    if (seen.has(mat)) return;
    seen.add(mat);
    const base = getBaseline(mat);
    // Reset to baseline first so consecutive option changes don't compound.
    mat.metallic = base.metallic;
    mat.roughness = base.roughness;
    mat.clearCoatFactor = base.clearCoatFactor;
    mat.clearCoatRoughness = base.clearCoatRoughness;
    mat.refractionStrength = base.refractionStrength;
    mat.refractionSteps = base.refractionSteps;
    mat.refractionDepthBias = base.refractionDepthBias;
    mat.ior = base.ior;
    const cls = classifyMaterial(mat);
    if (cls === 'glass') {
      mat.refractionStrength = opts.glassRefractionStrength;
      mat.refractionSteps = opts.glassRefractionSteps;
      mat.refractionDepthBias = 0.022;
      mat.ior = opts.glassIor;
      mat.roughness = opts.glassRoughness;
      // Glass benefits from a slight clearcoat for the Fresnel rim regardless
      // of what the loader heuristic set.
      mat.clearCoatFactor = Math.max(mat.clearCoatFactor, 1.0);
      mat.clearCoatRoughness = Math.max(mat.clearCoatRoughness, 0.03);
    } else if (cls === 'paint') {
      mat.clearCoatFactor = opts.paintClearCoat;
      mat.clearCoatRoughness = opts.paintClearCoatRoughness;
      mat.roughness = opts.paintRoughness;
    }
  };
  for (const m of scene.meshes) visit(m.material);
  for (const im of scene.instancedMeshes ?? []) visit(im.material);
};

export type UsdExampleController = {
  setOptions: (options: UsdExampleOptions) => void;
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
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return merged;
};

// USD authors UVs with origin at the bottom-left; the renderer samples from
// a top-left origin. Rather than flipping V on mesh UVs (which would invert
// the V tangent and break tangent-space normal maps), we flip image pixels
// vertically at texture load time. This keeps tangents USD-native, so normal
// maps' green channel direction stays consistent with the renderer.
const flipImageBlobVertically = async (rawBlob: Blob): Promise<Blob> => {
  const bitmap = await createImageBitmap(rawBlob);
  try {
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(bitmap.width, bitmap.height)
      : Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
    const ctx = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.translate(0, bitmap.height);
    ctx.scale(1, -1);
    ctx.drawImage(bitmap, 0, 0);
    if (canvas instanceof OffscreenCanvas) {
      // PNG is lossless; preserves exact normal-map RGB values.
      return await canvas.convertToBlob({ type: 'image/png' });
    }
    return await new Promise<Blob>((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
        'image/png',
      );
    });
  } finally {
    bitmap.close();
  }
};

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
    const assetUri = authored.includes('://') || authored.startsWith('/')
      ? authored
      : `${pkgUri}[${authored}]`;
    try {
      const asset = await resolver.read(assetUri);
      const rawBlob = new Blob([asset.bytes.slice().buffer]);
      const flipped = await flipImageBlobVertically(rawBlob);
      const url = URL.createObjectURL(flipped);
      lib[id] = url;
      blobUrls.push(url);
    } catch (err) {
      console.warn(`usd: failed to load USDZ texture '${authored}'`, err);
    }
  }
  return blobUrls;
};

export const startUsdExample = (
  applyScene: (scene: RenderScene) => void,
  initialOptions?: Partial<UsdExampleOptions>,
  onLoadingProgress?: (progress: number | null) => void,
): UsdExampleController => {
  let disposed = false;
  let loadToken = 0;
  let blobUrlsToRevoke: string[] = [];
  let currentOptions: UsdExampleOptions = { ...DEFAULT_USD_OPTIONS, ...initialOptions };
  let currentScene: RenderScene | null = null;

  const revokeBlobUrls = (): void => {
    for (const url of blobUrlsToRevoke) URL.revokeObjectURL(url);
    blobUrlsToRevoke = [];
  };

  const loadModel = (modelKey: UsdModelKey): void => {
    const url = URL_BY_KEY[modelKey];
    if (!url) {
      console.warn(`usd: unknown model key '${modelKey}'`);
      return;
    }
    const token = ++loadToken;
    const previousBlobUrls = blobUrlsToRevoke;
    blobUrlsToRevoke = [];
    onLoadingProgress?.(0);

    void (async (): Promise<void> => {
      try {
        const bytes = await fetchBytesWithProgress(url, (p) => {
          if (disposed || token !== loadToken) return;
          onLoadingProgress?.(p);
        });
        if (disposed || token !== loadToken) return;
        onLoadingProgress?.(0.92);

        const fetcher = async (uri: string): Promise<Uint8Array> => {
          if (uri === url || uri.endsWith(url.substring(url.lastIndexOf('/')))) return bytes;
          const response = await fetch(uri);
          if (!response.ok) throw new Error(`USD asset fetch failed: ${uri}`);
          return new Uint8Array(await response.arrayBuffer());
        };
        const resolver = new AssetResolver({ fetcher });

        const result = await loadUsdSceneFromUrl(url, { resolver });
        if (disposed || token !== loadToken) return;
        onLoadingProgress?.(0.96);

        blobUrlsToRevoke = await materialiseUsdTextures(result.scene, resolver, url);

        if (result.warnings.length > 0) {
          console.info(`usd[${modelKey}]: ${result.warnings.length} USD warnings`);
        }

        if (result.scene.lights.length === 0) {
          result.scene.directionalLightingEnabled = true;
          result.scene.directionalLightingIntensity = 1;
        }

        if (disposed || token !== loadToken) {
          for (const u of blobUrlsToRevoke) URL.revokeObjectURL(u);
          blobUrlsToRevoke = [];
          return;
        }

        tuneSceneMaterials(result.scene, currentOptions);
        currentScene = result.scene;
        applyScene(result.scene);
        // Once the new scene is live, retire the previous model's blob URLs.
        for (const u of previousBlobUrls) URL.revokeObjectURL(u);
        onLoadingProgress?.(null);
      } catch (err) {
        if (token === loadToken) onLoadingProgress?.(null);
        console.warn(`usd[${modelKey}] example failed to load.`, err);
      }
    })();
  };

  loadModel(currentOptions.modelKey);

  return {
    setOptions: (options: UsdExampleOptions) => {
      if (disposed) return;
      const modelChanged = options.modelKey !== currentOptions.modelKey;
      currentOptions = { ...options };
      if (modelChanged) {
        loadModel(currentOptions.modelKey);
        return;
      }
      // In-place re-tune on the currently loaded scene.
      if (currentScene) {
        tuneSceneMaterials(currentScene, currentOptions);
        applyScene(currentScene);
      }
    },
    dispose: () => {
      disposed = true;
      onLoadingProgress?.(null);
      revokeBlobUrls();
    },
  };
};
