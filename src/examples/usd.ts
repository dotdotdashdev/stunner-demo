import { loadUsdSceneFromUrl, AssetResolver } from '@stunner/usd';
import type { RenderScene } from '@stunner/core/renderer/mesh/SceneTypes';
import type { PbrMaterial } from '@stunner/core/renderer/mesh/MaterialTypes';
import { createDefaultMaterial } from '@stunner/core/renderer/mesh/MaterialTypes';
import { createCircle } from '@stunner/core/renderer/mesh/MeshFactory';

type ModelKey = 'porsche' | 'train' | 'city5' | 'city6' | 'city7' | 'worldOfMetal';

const MODEL_URLS: Record<ModelKey, string> = {
  porsche: '/models/usd/2014_Porsche_911_Turbo_991.usdz',
  train: '/models/usd/Train.usdz',
  city5: '/models/usd/Procedural_City_5.usdz',
  city6: '/models/usd/Procedural_City_6.usdz',
  city7: '/models/usd/Procedural_City_7.usdz',
  worldOfMetal: '/models/usd/world_of_metal.usdz',
};

// Internal material-tuning options. Not currently exposed to the HUD; kept as
// constants here so behaviour is deterministic across reloads.
type UsdTuningOptions = {
  paintClearCoat: number;
  paintClearCoatRoughness: number;
  paintRoughness: number;
  glassRoughness: number;
  glassIor: number;
  glassRefractionStrength: number;
  glassRefractionSteps: number;
};

const TUNING: UsdTuningOptions = {
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

const tuneSceneMaterials = (scene: RenderScene, opts: UsdTuningOptions): void => {
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

// Scale every world transform / light position in the scene by `s`. Used to
// load procedural city USDs at a more sensible size for our viewer (their
// natural unit scale is enormous compared to the Porsche/train).
const scaleScene = (scene: RenderScene, s: number): void => {
  if (s === 1) return;
  const scaleMatInPlace = (m: Float32Array | undefined): void => {
    if (!m) return;
    // Column-major Mat4: scale rows 0..2 of every column by s (i.e. all
    // indices except 3, 7, 11, 15).
    for (let c = 0; c < 4; c += 1) {
      m[c * 4 + 0] = (m[c * 4 + 0] ?? 0) * s;
      m[c * 4 + 1] = (m[c * 4 + 1] ?? 0) * s;
      m[c * 4 + 2] = (m[c * 4 + 2] ?? 0) * s;
    }
  };
  for (const mesh of scene.meshes) scaleMatInPlace(mesh.transform);
  for (const im of scene.instancedMeshes ?? []) {
    for (const t of im.instanceTransforms) scaleMatInPlace(t);
  }
  for (const light of scene.lights) {
    if ('position' in light) {
      light.position = [light.position[0] * s, light.position[1] * s, light.position[2] * s];
    }
    if ('range' in light && typeof light.range === 'number') {
      light.range = light.range * s;
    }
    if (light.type === 'area') {
      light.size = [light.size[0] * s, light.size[1] * s];
      if (typeof light.length === 'number') light.length = light.length * s;
    }
  }
  for (const probe of scene.reflectionProbes ?? []) {
    probe.position = [probe.position[0] * s, probe.position[1] * s, probe.position[2] * s];
    probe.radius = probe.radius * s;
  }
  for (const plane of scene.planarReflections ?? []) {
    plane.offset = plane.offset * s;
  }
};

// Per-model uniform scale applied at load time.
const SCALE_BY_MODEL: Partial<Record<ModelKey, number>> = {
  city5: 0.01,
  city6: 0.01,
  city7: 0.01,
};

const FLOOR_MATERIAL_NAME = '__usdExampleFloor';

const addReferenceFloor = (scene: RenderScene): void => {
  const geometry = createCircle({ radius: 100, radialSegments: 96, ringSegments: 8 });
  const material = createDefaultMaterial({ name: FLOOR_MATERIAL_NAME });
  // Black mirror: dielectric black with a smooth surface. Metal workflow uses
  // baseColor as F0, so a black metal reflects nothing; a dielectric with
  // baseColor=black relies on Fresnel (~4% at normal incidence, ~100% at
  // grazing) which gives the classic polished-obsidian / showroom-floor look.
  material.baseColor = [0, 0, 0, 1];
  material.metallic = 0;
  material.roughness = 0.02;
  material.transparent = false;
  material.twoSided = false;
  material.clearCoatFactor = 0;
  material.clearCoatRoughness = 0;
  material.castsShadows = false;
  scene.meshes.push({ geometry, material });
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

// Translate every world transform / light position / probe / plane in the
// scene by `(dx, dy, dz)`. Used by the city example to lay out three
// procedural cities side by side in a single combined scene.
const translateScene = (scene: RenderScene, dx: number, dy: number, dz: number): void => {
  if (dx === 0 && dy === 0 && dz === 0) return;
  const translateMatInPlace = (m: Float32Array | undefined): void => {
    if (!m) return;
    m[12] = (m[12] ?? 0) + dx;
    m[13] = (m[13] ?? 0) + dy;
    m[14] = (m[14] ?? 0) + dz;
  };
  for (const mesh of scene.meshes) translateMatInPlace(mesh.transform);
  for (const im of scene.instancedMeshes ?? []) {
    for (const t of im.instanceTransforms) translateMatInPlace(t);
  }
  for (const light of scene.lights) {
    if ('position' in light) {
      light.position = [light.position[0] + dx, light.position[1] + dy, light.position[2] + dz];
    }
  }
  for (const probe of scene.reflectionProbes ?? []) {
    probe.position = [probe.position[0] + dx, probe.position[1] + dy, probe.position[2] + dz];
  }
};

// Re-key every entry in the scene's texture library with `prefix` and update
// every material reference to match. Required when merging multiple loaded
// USD scenes into one because the authored asset URIs (e.g. "0/textures/road.png")
// can collide between source files.
const prefixSceneTextureIds = (scene: RenderScene, prefix: string): void => {
  const lib = scene.textureLibrary;
  if (!lib) return;
  const remap = new Map<string, string>();
  const newLib: Record<string, string> = {};
  for (const [oldId, value] of Object.entries(lib)) {
    const newId = `${prefix}|${oldId}`;
    remap.set(oldId, newId);
    newLib[newId] = value;
  }
  scene.textureLibrary = newLib;
  const visitMat = (mat: PbrMaterial): void => {
    const ids = mat.textureIds;
    if (!ids) return;
    for (const slot of Object.keys(ids) as Array<keyof typeof ids>) {
      const old = ids[slot];
      if (old !== undefined) {
        const replacement = remap.get(old);
        if (replacement !== undefined) ids[slot] = replacement;
      }
    }
  };
  const seen = new Set<PbrMaterial>();
  const visitOnce = (m: PbrMaterial): void => {
    if (seen.has(m)) return;
    seen.add(m);
    visitMat(m);
  };
  for (const m of scene.meshes) visitOnce(m.material);
  for (const im of scene.instancedMeshes ?? []) {
    visitOnce(im.material);
    for (const im2 of im.instanceMaterials ?? []) visitOnce(im2);
  }
};

// Append `source`'s meshes / instanced meshes / lights / texture library
// entries into `target`. Caller is responsible for any prior translation /
// scaling / texture id namespacing on the source.
const mergeSceneInto = (target: RenderScene, source: RenderScene): void => {
  for (const m of source.meshes) target.meshes.push(m);
  if (source.instancedMeshes && source.instancedMeshes.length > 0) {
    target.instancedMeshes = target.instancedMeshes ?? [];
    for (const im of source.instancedMeshes) target.instancedMeshes.push(im);
  }
  for (const l of source.lights) target.lights.push(l);
  if (source.textureLibrary) {
    target.textureLibrary = target.textureLibrary ?? {};
    for (const [k, v] of Object.entries(source.textureLibrary)) {
      target.textureLibrary[k] = v;
    }
  }
  if (source.textureArrayLibrary) {
    target.textureArrayLibrary = target.textureArrayLibrary ?? {};
    for (const [k, v] of Object.entries(source.textureArrayLibrary)) {
      target.textureArrayLibrary[k] = v;
    }
  }
  if (source.reflectionProbes && source.reflectionProbes.length > 0) {
    target.reflectionProbes = target.reflectionProbes ?? [];
    for (const p of source.reflectionProbes) target.reflectionProbes.push(p);
  }
};

type LoadedScene = {
  scene: RenderScene;
  blobUrls: string[];
};

// Load and process a single USD model: fetch bytes, parse, materialise textures,
// scale, and tune materials. Caller owns the returned blob URLs and must revoke
// them when the scene is no longer needed.
const loadAndProcessUsdScene = async (
  modelKey: ModelKey,
  onProgress: (p: number) => void,
  isCancelled: () => boolean,
): Promise<LoadedScene | null> => {
  const url = MODEL_URLS[modelKey];
  const bytes = await fetchBytesWithProgress(url, (p) => {
    if (!isCancelled()) onProgress(p);
  });
  if (isCancelled()) return null;
  onProgress(0.92);

  const fetcher = async (uri: string): Promise<Uint8Array> => {
    if (uri === url || uri.endsWith(url.substring(url.lastIndexOf('/')))) return bytes;
    const response = await fetch(uri);
    if (!response.ok) throw new Error(`USD asset fetch failed: ${uri}`);
    return new Uint8Array(await response.arrayBuffer());
  };
  const resolver = new AssetResolver({ fetcher });

  const result = await loadUsdSceneFromUrl(url, { resolver });
  if (isCancelled()) return null;
  onProgress(0.96);

  const blobUrls = await materialiseUsdTextures(result.scene, resolver, url);

  const modelScale = SCALE_BY_MODEL[modelKey] ?? 1;
  scaleScene(result.scene, modelScale);

  if (result.warnings.length > 0) {
    console.info(`usd[${modelKey}]: ${result.warnings.length} USD warnings`);
  }

  if (result.scene.lights.length === 0) {
    result.scene.directionalLightingEnabled = true;
    result.scene.directionalLightingIntensity = 1;
  }

  tuneSceneMaterials(result.scene, TUNING);
  return { scene: result.scene, blobUrls };
};

// Generic single-model launcher. Used by the porsche, train, and worldOfMetal
// examples; the city example uses its own multi-model launcher below.
const startSingleModelExample = (
  modelKey: ModelKey,
  applyScene: (scene: RenderScene) => void,
  onLoadingProgress: ((progress: number | null) => void) | undefined,
  postProcess?: (scene: RenderScene) => void,
): UsdExampleController => {
  let disposed = false;
  let blobUrlsToRevoke: string[] = [];
  onLoadingProgress?.(0);

  void (async (): Promise<void> => {
    try {
      const loaded = await loadAndProcessUsdScene(
        modelKey,
        (p) => onLoadingProgress?.(p),
        () => disposed,
      );
      if (!loaded) return;
      if (disposed) {
        for (const u of loaded.blobUrls) URL.revokeObjectURL(u);
        return;
      }
      blobUrlsToRevoke = loaded.blobUrls;
      postProcess?.(loaded.scene);
      applyScene(loaded.scene);
      onLoadingProgress?.(null);
    } catch (err) {
      if (!disposed) onLoadingProgress?.(null);
      console.warn(`usd[${modelKey}] example failed to load.`, err);
    }
  })();

  return {
    dispose: () => {
      disposed = true;
      onLoadingProgress?.(null);
      for (const url of blobUrlsToRevoke) URL.revokeObjectURL(url);
      blobUrlsToRevoke = [];
    },
  };
};

export const startPorscheExample = (
  applyScene: (scene: RenderScene) => void,
  onLoadingProgress?: (progress: number | null) => void,
): UsdExampleController =>
  startSingleModelExample('porsche', applyScene, onLoadingProgress, (scene) => {
    // Lift the car slightly above the reference floor so wheel contact reads
    // cleanly without z-fighting at the tire/disc plane.
    translateScene(scene, 0, 0.16, 0);
    addReferenceFloor(scene);
    // Reflection probe enclosing the car + a slice of the floor. The floor is
    // a dielectric mirror (fresnel-driven), and probes are how Stunner feeds
    // reflective surfaces. Same pattern as the modelsAndMaterials example.
    scene.reflectionProbes = [
      ...(scene.reflectionProbes ?? []),
      {
        position: [0, 1.2, 0],
        radius: 14,
        strength: 1,
        tint: [1, 1, 1],
      },
    ];
  });

export const startTrainExample = (
  applyScene: (scene: RenderScene) => void,
  onLoadingProgress?: (progress: number | null) => void,
): UsdExampleController =>
  startSingleModelExample('train', applyScene, onLoadingProgress);

export const startWorldOfMetalExample = (
  applyScene: (scene: RenderScene) => void,
  onLoadingProgress?: (progress: number | null) => void,
): UsdExampleController =>
  startSingleModelExample('worldOfMetal', applyScene, onLoadingProgress);

const CITY_MODEL_KEYS: ReadonlyArray<ModelKey> = ['city5', 'city6', 'city7'];

export const startCityExample = (
  applyScene: (scene: RenderScene) => void,
  onLoadingProgress?: (progress: number | null) => void,
): UsdExampleController => {
  let disposed = false;
  let blobUrlsToRevoke: string[] = [];
  onLoadingProgress?.(0);

  void (async (): Promise<void> => {
    const spacing = [ 5, 8.45, 7.5 ];
    const offsets = [ -0.065, 0, 0.935 ];
    try {
      const total = CITY_MODEL_KEYS.length;
      const loaded = await Promise.all(
        CITY_MODEL_KEYS.map((key, idx) =>
          loadAndProcessUsdScene(
            key,
            (p) => {
              if (disposed) return;
              // Aggregate progress across all city loads.
              onLoadingProgress?.((idx + p) / total);
            },
            () => disposed,
          ),
        ),
      );

      if (disposed) {
        for (const l of loaded) {
          if (l) for (const u of l.blobUrls) URL.revokeObjectURL(u);
        }
        return;
      }

      const valid = loaded.filter((l): l is LoadedScene => l !== null);
      if (valid.length === 0) {
        onLoadingProgress?.(null);
        return;
      }

      // Build a combined scene from the first city's scene; merge the others
      // in with translation + texture-id namespacing.
      const combined = valid[0]!.scene;
      const offset0 = -((valid.length - 1) * spacing[0]) / 2;
      prefixSceneTextureIds(combined, CITY_MODEL_KEYS[0]!);
      translateScene(combined, offset0, 0, offsets[0]);

      for (let i = 1; i < valid.length; i += 1) {
        const src = valid[i]!.scene;
        prefixSceneTextureIds(src, CITY_MODEL_KEYS[i]!);
        translateScene(src, offset0 + i * spacing[i], 0, offsets[i]);
        mergeSceneInto(combined, src);
      }

      blobUrlsToRevoke = valid.flatMap((l) => l.blobUrls);
      applyScene(combined);
      onLoadingProgress?.(null);
    } catch (err) {
      if (!disposed) onLoadingProgress?.(null);
      console.warn('usd[city] example failed to load.', err);
    }
  })();

  return {
    dispose: () => {
      disposed = true;
      onLoadingProgress?.(null);
      for (const url of blobUrlsToRevoke) URL.revokeObjectURL(url);
      blobUrlsToRevoke = [];
    },
  };
};
