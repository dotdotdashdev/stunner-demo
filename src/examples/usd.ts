import { loadUsdSceneFromUrl, AssetResolver } from '@stunner/usd';
import type { RenderScene } from '@stunner/core/renderer/mesh/SceneTypes';
import type { PbrMaterial } from '@stunner/core/renderer/mesh/MaterialTypes';
import { createDefaultMaterial } from '@stunner/core/renderer/mesh/MaterialTypes';
import { createCircle } from '@stunner/core/renderer/mesh/MeshFactory';
import {
  applyImageDisplacement,
  loadDisplacementImage,
} from '@stunner/core/renderer/mesh/MeshDisplacement';
import type { MeshGeometry } from '@stunner/core/renderer/mesh/MeshTypes';
import { createSkySphere } from '@stunner/core/sky';
import type { RendererEngineOptions } from '@stunner/core/renderer/RendererEngine';
import type { WebGl2InjectionStage } from '@stunner/core/renderer/webgl2/WebGl2DeferredPipeline';

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

export type CityExampleController = UsdExampleController & {
  /**
   * Engine-level customisation (post-process injection stages, frame hooks,
   * etc.) that the host (CanvasStage) merges into `RendererEngine` options
   * when constructing the engine. Mirrors the pattern used by the crowd /
   * crowdCompute / flocking examples.
   */
  engineOptions: RendererEngineOptions;
};

export type TrainExampleController = UsdExampleController & {
  /** See `CityExampleController.engineOptions`. */
  engineOptions: RendererEngineOptions;
};

export type PorscheSkyTexture = 'sky-1' | 'sky-2' | 'sky-3';
export type PorscheSkyBlendMode = 'alpha' | 'additive' | 'multiply';

export type PorscheExampleOptions = {
  skyTexture: PorscheSkyTexture;
  /** Linear emissive multiplier on the sky texture. */
  skyIntensity: number;
  /**
   * 0..1 alpha-blend amount between the textured sky and the procedural sky.
   * 1 = fully replace, 0 = fully procedural.
   */
  skyBlendAmount: number;
  /**
   * How the sky composites with the scene behind it. Only meaningful when
   * `skyBlendAmount < 1` or `skyBlendMode !== 'alpha'`.
   */
  skyBlendMode: PorscheSkyBlendMode;
};

export const DEFAULT_PORSCHE_OPTIONS: PorscheExampleOptions = {
  skyTexture: 'sky-3',
  skyIntensity: 1,
  skyBlendAmount: 1,
  skyBlendMode: 'alpha',
};

export type PorscheExampleController = UsdExampleController & {
  setOptions: (options: PorscheExampleOptions) => void;
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

// Whether to honour the asset's authored `metersPerUnit` / `upAxis` stage
// metadata. Many "1-unit-per-cm" Sketchfab USDZ exports author this field
// even though their geometry is in metres at the right scale (the porsche
// and city assets fall into this bucket and are tuned manually instead).
// Train and worldOfMetal really are authored at 1 unit per cm, so they
// need the metadata applied to render at the correct size.
const APPLY_STAGE_METADATA_BY_MODEL: Partial<Record<ModelKey, boolean>> = {
  train: true,
  worldOfMetal: true,
};

const FLOOR_MATERIAL_NAME = '__usdExampleFloor';
const FLOOR_RADIUS = 14.9;
const FLOOR_TEXTURE_URL = '/images/concrete.jpg';
// Tile the concrete texture roughly once per ~2 metres across the disc.
// UVs on `createCircle` go 0..1 across the diameter, so the scale doubles
// the on-screen tile count vs. the disc radius.
const FLOOR_UV_TILES = 15;
// Albedo and displacement share a single UV transform so the relief
// peaks line up with the bright pixels of the concrete. The material's
// `uvScaleOffset` is built from the same constants and passed verbatim
// to the displacement sampler.
const FLOOR_UV_SCALE_OFFSET: [number, number, number, number] = [
  FLOOR_UV_TILES,
  FLOOR_UV_TILES,
  0,
  0,
];
// Peak height in world units (metres). Concrete should read as a textured
// surface, not a relief sculpture; ~3 cm puts the brightest pixels just
// barely above the surface so grazing shadows and AO sell the depth.
// At 15 tiles across a ~30 m disc each tile is ~2 m wide — anything more
// than ~10 cm starts looking like terrain instead of pavement.
const FLOOR_DISPLACEMENT_SCALE = 0.04;
// Centre the displacement around 0 so the average pixel sits at the
// authored floor height (sampled mean ~0.5 → bias = -scale * 0.5).
const FLOOR_DISPLACEMENT_BIAS = -FLOOR_DISPLACEMENT_SCALE * 0.5;
// Target sample density. Displacement is baked per-vertex, so the disc
// must have enough vertices to resolve the chosen tile frequency without
// aliasing — otherwise high tile counts collapse into a low-frequency
// "dune" pattern that has nothing to do with the source image. We aim
// for `FLOOR_VERTEX_SAMPLES_PER_TILE` vertices across one tile along
// the densest direction (the disc circumference) and derive the radial
// / ring segment counts from there. Bumping this past ~6 stops paying
// dividends because GPU shading happens per-fragment, not per-vertex.
const FLOOR_VERTEX_SAMPLES_PER_TILE = 128;
const FLOOR_RADIAL_SEGMENTS = Math.max(192, FLOOR_UV_TILES * FLOOR_VERTEX_SAMPLES_PER_TILE);
const FLOOR_RING_SEGMENTS = Math.max(96, Math.round(FLOOR_RADIAL_SEGMENTS / 2));

// Built lazily and re-built whenever any of the inputs above change. The
// cache key keeps Vite HMR edits responsive (a stale module-scoped Promise
// would mask any manual tweak to the constants below).
type FloorGeometryCache = { key: string; promise: Promise<MeshGeometry> };
let floorGeometryCache: FloorGeometryCache | null = null;
const getFloorGeometry = (): Promise<MeshGeometry> => {
  const key = JSON.stringify({
    r: FLOOR_RADIUS,
    rad: FLOOR_RADIAL_SEGMENTS,
    rng: FLOOR_RING_SEGMENTS,
    s: FLOOR_DISPLACEMENT_SCALE,
    b: FLOOR_DISPLACEMENT_BIAS,
    uv: FLOOR_UV_SCALE_OFFSET,
    url: FLOOR_TEXTURE_URL,
  });
  if (floorGeometryCache && floorGeometryCache.key === key) {
    return floorGeometryCache.promise;
  }
  const promise = (async () => {
    const geometry = createCircle({
      radius: FLOOR_RADIUS,
      radialSegments: FLOOR_RADIAL_SEGMENTS,
      ringSegments: FLOOR_RING_SEGMENTS,
    });
    try {
      const image = await loadDisplacementImage(FLOOR_TEXTURE_URL);
      applyImageDisplacement(geometry, image, {
        scale: FLOOR_DISPLACEMENT_SCALE,
        bias: FLOOR_DISPLACEMENT_BIAS,
        channel: 'r',
        uvScale: [FLOOR_UV_SCALE_OFFSET[0], FLOOR_UV_SCALE_OFFSET[1]],
        uvOffset: [FLOOR_UV_SCALE_OFFSET[2], FLOOR_UV_SCALE_OFFSET[3]],
      });
    } catch (err) {
      console.warn('usd[porsche]: displacement load failed; using flat floor.', err);
    }
    return geometry;
  })();
  floorGeometryCache = { key, promise };
  return promise;
};

const addReferenceFloor = (scene: RenderScene, geometry: MeshGeometry): void => {
  const material = createDefaultMaterial({ name: FLOOR_MATERIAL_NAME });
  // Multiplied with the sampled texture; keep neutral so the concrete reads
  // at its authored albedo without a dark tint.
  material.baseColor = [0.2, 0.2, 0.2, 1];
  material.metallic = 0;
  material.roughness = 1;
  material.transparent = false;
  material.twoSided = false;
  material.clearCoatFactor = 0;
  material.clearCoatRoughness = 0;
  material.castsShadows = false;
  material.textures.baseColor = FLOOR_TEXTURE_URL;
  material.uvScaleOffset = [...FLOOR_UV_SCALE_OFFSET];
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

  const result = await loadUsdSceneFromUrl(url, {
    resolver,
    applyStageMetadata: APPLY_STAGE_METADATA_BY_MODEL[modelKey] === true,
  });
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

// Apply all post-load Porsche customisations (lift, floor, probe, sky).
// Pure function of `scene` + options so it can be re-run after live option
// changes by re-applying the cached scene.
const applyPorscheCustomisations = (
  scene: RenderScene,
  options: PorscheExampleOptions,
  floorGeometry: MeshGeometry,
): void => {
  // Lift the car slightly above the reference floor so wheel contact reads
  // cleanly without z-fighting at the tire/disc plane.
  translateScene(scene, 0, 0.12, 0);
  addReferenceFloor(scene, floorGeometry);
  addPorscheSky(scene, options);
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
};

export const startPorscheExample = (
  applyScene: (scene: RenderScene) => void,
  initialOptions: PorscheExampleOptions = DEFAULT_PORSCHE_OPTIONS,
  onLoadingProgress?: (progress: number | null) => void,
): PorscheExampleController => {
  let disposed = false;
  let blobUrlsToRevoke: string[] = [];
  let baseScene: RenderScene | null = null;
  let currentOptions: PorscheExampleOptions = initialOptions;
  onLoadingProgress?.(0);

  const rebuildAndApply = (): void => {
    if (!baseScene) return;
    const snapshot = baseScene;
    void getFloorGeometry().then((floorGeometry) => {
      if (disposed) return;
      // Deep-clone the bits that applyPorscheCustomisations mutates: meshes get
      // their transforms translated in place by translateScene, and the meshes
      // array gets the floor + sky pushed onto it. Without cloning the
      // transforms, every option change (which re-runs this) would re-translate
      // the same Float32Arrays, drifting the car upward.
      const cloned: RenderScene = {
        ...snapshot,
        meshes: snapshot.meshes.map((m) => ({
          ...m,
          transform: m.transform ? new Float32Array(m.transform) : undefined,
        })),
        instancedMeshes: snapshot.instancedMeshes?.map((im) => ({
          ...im,
          instanceTransforms: im.instanceTransforms.map((t) => new Float32Array(t)),
        })),
        lights: snapshot.lights.map((l) => ({ ...l })),
        textureLibrary: { ...(snapshot.textureLibrary ?? {}) },
        reflectionProbes: snapshot.reflectionProbes?.map((p) => ({ ...p })),
      };
      applyPorscheCustomisations(cloned, currentOptions, floorGeometry);
      applyScene(cloned);
    });
  };

  void (async (): Promise<void> => {
    try {
      const loaded = await loadAndProcessUsdScene(
        'porsche',
        (p) => onLoadingProgress?.(p),
        () => disposed,
      );
      if (!loaded) return;
      if (disposed) {
        for (const u of loaded.blobUrls) URL.revokeObjectURL(u);
        return;
      }
      blobUrlsToRevoke = loaded.blobUrls;
      baseScene = loaded.scene;
      rebuildAndApply();
      onLoadingProgress?.(null);
    } catch (err) {
      if (!disposed) onLoadingProgress?.(null);
      console.warn('usd[porsche] example failed to load.', err);
    }
  })();

  return {
    dispose: () => {
      disposed = true;
      onLoadingProgress?.(null);
      for (const url of blobUrlsToRevoke) URL.revokeObjectURL(url);
      blobUrlsToRevoke = [];
      baseScene = null;
    },
    setOptions: (options) => {
      currentOptions = options;
      rebuildAndApply();
    },
  };
};

const PORSCHE_SKY_RADIUS = 15;

const addPorscheSky = (scene: RenderScene, options: PorscheExampleOptions): void => {
  scene.textureLibrary = scene.textureLibrary ?? {};
  const textureId = `demo:sky:${options.skyTexture}`;
  scene.textureLibrary[textureId] = `/images/${options.skyTexture}.png`;
  scene.meshes.push(
    createSkySphere({
      textureId,
      radius: PORSCHE_SKY_RADIUS,
      intensity: options.skyIntensity,
      blendAmount: options.skyBlendAmount,
      blendMode: options.skyBlendMode,
    }),
  );
  scene.environmentMap = {
    textureId,
    intensity: Math.max(0, options.skyIntensity),
  };
};

// City scenes are laid out across ~25 m on the X axis (3 cities * ~8 m
// spacing) and the camera roams freely, so the sky needs enough radius to
// avoid clipping into the buildings while still sitting inside the
// renderer's far plane.
const CITY_SKY_RADIUS = 250;
const CITY_SKY_TEXTURE: PorscheSkyTexture = 'sky-1';

const addCitySky = (scene: RenderScene): void => {
  scene.textureLibrary = scene.textureLibrary ?? {};
  const textureId = `demo:sky:${CITY_SKY_TEXTURE}`;
  scene.textureLibrary[textureId] = `/images/${CITY_SKY_TEXTURE}.png`;
  scene.meshes.push(
    createSkySphere({
      textureId,
      radius: CITY_SKY_RADIUS,
      intensity: 1,
      blendAmount: 1,
      blendMode: 'multiply',
    }),
  );
  scene.environmentMap = {
    textureId,
    intensity: 1,
  };
};

// Train measures ~20 m × 3 m × 19 m in world units (see the metersPerUnit
// stage scaling in BuildScene); 80 m radius keeps the sphere well clear of
// the model while staying inside the renderer's far plane.
const TRAIN_SKY_RADIUS = 80;
const TRAIN_SKY_TEXTURE: PorscheSkyTexture = 'sky-2';

const addTrainSky = (scene: RenderScene): void => {
  scene.textureLibrary = scene.textureLibrary ?? {};
  const textureId = `demo:sky:${TRAIN_SKY_TEXTURE}`;
  scene.textureLibrary[textureId] = `/images/${TRAIN_SKY_TEXTURE}.png`;
  scene.meshes.push(
    createSkySphere({
      textureId,
      radius: TRAIN_SKY_RADIUS,
      intensity: 1,
      blendAmount: 1,
      blendMode: 'alpha',
    }),
  );
  scene.environmentMap = {
    textureId,
    intensity: 1,
  };
};

// Rotate every world transform / light position / probe in the scene 180°
// around the Y (up) axis. After the USD loader's Z-up→Y-up correction, "yaw"
// in the engine is rotation around Y, so this flips the scene to face the
// opposite direction. Equivalent to negating x and z on every column of the
// column-major 4×4 transform.
const yaw180Scene = (scene: RenderScene): void => {
  const flipMatInPlace = (m: Float32Array | undefined): void => {
    if (!m) return;
    for (const i of [0, 2, 4, 6, 8, 10, 12, 14]) m[i] = -(m[i] ?? 0);
  };
  for (const mesh of scene.meshes) flipMatInPlace(mesh.transform);
  for (const im of scene.instancedMeshes ?? []) {
    for (const t of im.instanceTransforms) flipMatInPlace(t);
  }
  for (const light of scene.lights) {
    if ('position' in light) {
      light.position = [-light.position[0], light.position[1], -light.position[2]];
    }
    if ('direction' in light) {
      light.direction = [-light.direction[0], light.direction[1], -light.direction[2]];
    }
  }
  for (const probe of scene.reflectionProbes ?? []) {
    probe.position = [-probe.position[0], probe.position[1], -probe.position[2]];
  }
};

// ── Train watercolor (Papari circular Kuwahara) ─────────────────────────────
//
// Single-pass painterly post-process injected into the renderer's
// pre-composite slot — same hook the city CA effect (and crowd cel-shader)
// uses. Implements the circular Kuwahara filter with polynomial weighting
// from https://blog.maximeheckel.com/posts/on-crafting-painterly-shaders/ :
//
//  • 8 sectors of a circular kernel of radius `TRAIN_WC_RADIUS` (pixels).
//  • For each sector compute a polynomial-weighted mean colour and the
//    luminance variance of the per-pixel colours.
//  • Output the mean colour of the sector with the lowest variance.
//
// This preserves edges (sectors straddling an edge have high variance and
// lose) while smoothing flat regions, giving the soft, brush-stroke look
// characteristic of watercolour paintings. We skip the multi-pass
// anisotropic structure-tensor extension to stay within the existing
// single-stage injection pattern; a small saturation boost in the same
// fragment compensates for the smoothing's tendency to wash colours out.

const TRAIN_WC_RADIUS = 5;       // Sector radius in pixels.
const TRAIN_WC_SATURATION = 1.25; // Post-smoothing saturation boost.

type TrainWebGpuWatercolorState = {
  pipeline: GPURenderPipeline;
  sampler: GPUSampler;
  uniformBuffer: GPUBuffer;
  outputTexture: GPUTexture | null;
  outputView: GPUTextureView | null;
  outputWidth: number;
  outputHeight: number;
  outputFormat: GPUTextureFormat;
};

type TrainWebGl2WatercolorState = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  framebuffer: WebGLFramebuffer;
  resolveFramebuffer: WebGLFramebuffer;
  outputTexture: WebGLTexture;
  outputWidth: number;
  outputHeight: number;
  uColorTexture: WebGLUniformLocation;
  uParams: WebGLUniformLocation;
};

const TRAIN_WC_VS_WGSL = /* wgsl */ `
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VsOut {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(3.0, 1.0),
    vec2f(-1.0, 1.0),
  );
  var outputVertex: VsOut;
  outputVertex.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  outputVertex.uv = positions[vertexIndex] * 0.5 + vec2f(0.5, 0.5);
  return outputVertex;
}
`;

const TRAIN_WC_FRAGMENT_WGSL = /* wgsl */ `
@group(0) @binding(0) var linearSampler: sampler;
@group(0) @binding(1) var sourceColorTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> wcParams: vec4f; // x: radius (px), y: saturation, zw: 1/resolution

const SECTOR_COUNT: u32 = 8u;
const TWO_PI: f32 = 6.28318530718;
const ANGLE_HALF: f32 = 0.392699; // π/8
const ANGLE_STEP: f32 = 0.196349; // π/16
const MAX_RADIUS: u32 = 8u;       // Loop bound; actual radius is clamped via wcParams.x.

fn polyWeight(sx: f32, sy: f32) -> f32 {
  // [(x + ζ) - η y²]² from Kyprianidis et al. (2010), a cheap polynomial
  // approximation of a Gaussian centred on the radial sample direction.
  let eta: f32 = 0.1;
  let lambda: f32 = 0.5;
  let v = (sx + eta) - lambda * sy * sy;
  return max(0.0, v * v);
}

fn sampleSector(uv: vec2f, texel: vec2f, baseAngle: f32, radius: f32) -> vec4f {
  // Returns vec4(avgColor.rgb, luminanceVariance).
  var colorSum = vec3f(0.0);
  var sqColorSum = vec3f(0.0);
  var weightSum: f32 = 0.0;
  for (var ri: u32 = 1u; ri <= MAX_RADIUS; ri = ri + 1u) {
    let r = f32(ri);
    if (r > radius) { break; }
    var a: f32 = -ANGLE_HALF;
    loop {
      if (a > ANGLE_HALF + 0.0001) { break; }
      let theta = baseAngle + a;
      let off = vec2f(cos(theta), sin(theta)) * r;
      let w = polyWeight(off.x, off.y);
      let c = textureSampleLevel(sourceColorTexture, linearSampler, uv + off * texel, 0.0).rgb;
      colorSum = colorSum + c * w;
      sqColorSum = sqColorSum + c * c * w;
      weightSum = weightSum + w;
      a = a + ANGLE_STEP;
    }
  }
  let inv = 1.0 / max(weightSum, 1e-6);
  let avg = colorSum * inv;
  let varRgb = max(sqColorSum * inv - avg * avg, vec3f(0.0));
  let lumVar = dot(varRgb, vec3f(0.299, 0.587, 0.114));
  return vec4f(avg, lumVar);
}

fn satAdjust(rgb: vec3f, s: f32) -> vec3f {
  let lum = dot(rgb, vec3f(0.2125, 0.7154, 0.0721));
  return mix(vec3f(lum), rgb, s);
}

@fragment
fn fsMain(inFragment: VsOut) -> @location(0) vec4f {
  let uv = vec2f(inFragment.uv.x, 1.0 - inFragment.uv.y);
  let texel = wcParams.zw;
  let radius = max(1.0, wcParams.x);

  var bestColor = vec3f(0.0);
  var bestVar: f32 = 1e10;
  for (var i: u32 = 0u; i < SECTOR_COUNT; i = i + 1u) {
    let baseAngle = f32(i) * (TWO_PI / f32(SECTOR_COUNT));
    let s = sampleSector(uv, texel, baseAngle, radius);
    if (s.w < bestVar) {
      bestVar = s.w;
      bestColor = s.xyz;
    }
  }

  let alpha = textureSampleLevel(sourceColorTexture, linearSampler, uv, 0.0).a;
  return vec4f(satAdjust(bestColor, wcParams.y), alpha);
}
`;

const TRAIN_WC_VERTEX_GLSL = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 position;
  if (gl_VertexID == 0) position = vec2(-1.0, -3.0);
  else if (gl_VertexID == 1) position = vec2(3.0, 1.0);
  else position = vec2(-1.0, 1.0);
  gl_Position = vec4(position, 0.0, 1.0);
  vUv = position * 0.5 + vec2(0.5, 0.5);
}
`;

const TRAIN_WC_FRAGMENT_GLSL = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uColorTexture;
uniform vec4 uParams; // x: radius (px), y: saturation, zw: 1/resolution

const int SECTOR_COUNT = 8;
const float TWO_PI = 6.28318530718;
const float ANGLE_HALF = 0.392699;
const float ANGLE_STEP = 0.196349;
const int MAX_RADIUS = 8;

out vec4 outColor;

float polyWeight(float sx, float sy) {
  float eta = 0.1;
  float lambda = 0.5;
  float v = (sx + eta) - lambda * sy * sy;
  return max(0.0, v * v);
}

vec4 sampleSector(vec2 uv, vec2 texel, float baseAngle, float radius) {
  vec3 colorSum = vec3(0.0);
  vec3 sqColorSum = vec3(0.0);
  float weightSum = 0.0;
  for (int ri = 1; ri <= MAX_RADIUS; ri++) {
    float r = float(ri);
    if (r > radius) break;
    for (float a = -ANGLE_HALF; a <= ANGLE_HALF + 0.0001; a += ANGLE_STEP) {
      float theta = baseAngle + a;
      vec2 off = vec2(cos(theta), sin(theta)) * r;
      float w = polyWeight(off.x, off.y);
      vec3 c = textureLod(uColorTexture, uv + off * texel, 0.0).rgb;
      colorSum += c * w;
      sqColorSum += c * c * w;
      weightSum += w;
    }
  }
  float inv = 1.0 / max(weightSum, 1e-6);
  vec3 avg = colorSum * inv;
  vec3 varRgb = max(sqColorSum * inv - avg * avg, vec3(0.0));
  float lumVar = dot(varRgb, vec3(0.299, 0.587, 0.114));
  return vec4(avg, lumVar);
}

vec3 satAdjust(vec3 rgb, float s) {
  float lum = dot(rgb, vec3(0.2125, 0.7154, 0.0721));
  return mix(vec3(lum), rgb, s);
}

void main() {
  vec2 uv = vUv;
  vec2 texel = uParams.zw;
  float radius = max(1.0, uParams.x);

  vec3 bestColor = vec3(0.0);
  float bestVar = 1e10;
  for (int i = 0; i < SECTOR_COUNT; i++) {
    float baseAngle = float(i) * (TWO_PI / float(SECTOR_COUNT));
    vec4 s = sampleSector(uv, texel, baseAngle, radius);
    if (s.w < bestVar) {
      bestVar = s.w;
      bestColor = s.xyz;
    }
  }

  float alpha = textureLod(uColorTexture, uv, 0.0).a;
  outColor = vec4(satAdjust(bestColor, uParams.y), alpha);
}
`;

const createTrainWebGpuWatercolorState = (
  device: GPUDevice,
  outputFormat: GPUTextureFormat,
): TrainWebGpuWatercolorState => {
  const module = device.createShaderModule({
    code: `${TRAIN_WC_VS_WGSL}\n${TRAIN_WC_FRAGMENT_WGSL}`,
  });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsMain' },
    fragment: { module, entryPoint: 'fsMain', targets: [{ format: outputFormat }] },
    primitive: { topology: 'triangle-list' },
  });
  return {
    pipeline,
    sampler: device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    }),
    uniformBuffer: device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
    outputTexture: null,
    outputView: null,
    outputWidth: 0,
    outputHeight: 0,
    outputFormat,
  };
};

const ensureTrainWebGpuWatercolorOutput = (
  state: TrainWebGpuWatercolorState,
  device: GPUDevice,
  width: number,
  height: number,
): CityStageTextureHandle => {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  if (!state.outputTexture || state.outputWidth !== w || state.outputHeight !== h) {
    state.outputTexture?.destroy();
    state.outputTexture = device.createTexture({
      size: { width: w, height: h, depthOrArrayLayers: 1 },
      format: state.outputFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT
        | GPUTextureUsage.TEXTURE_BINDING
        | GPUTextureUsage.COPY_SRC,
    });
    state.outputView = state.outputTexture.createView();
    state.outputWidth = w;
    state.outputHeight = h;
  }
  return {
    texture: state.outputTexture!,
    view: state.outputView!,
    format: state.outputFormat,
  };
};

const createTrainWebGl2WatercolorState = (
  gl: WebGL2RenderingContext,
): TrainWebGl2WatercolorState => {
  const program = linkCityWebGl2Program(
    gl,
    TRAIN_WC_VERTEX_GLSL,
    TRAIN_WC_FRAGMENT_GLSL,
  );
  const vao = gl.createVertexArray();
  const framebuffer = gl.createFramebuffer();
  const resolveFramebuffer = gl.createFramebuffer();
  const outputTexture = gl.createTexture();
  if (!vao || !framebuffer || !resolveFramebuffer || !outputTexture) {
    if (vao) gl.deleteVertexArray(vao);
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    if (resolveFramebuffer) gl.deleteFramebuffer(resolveFramebuffer);
    if (outputTexture) gl.deleteTexture(outputTexture);
    gl.deleteProgram(program);
    throw new Error('train watercolor: failed to allocate WebGL2 resources');
  }
  gl.bindTexture(gl.TEXTURE_2D, outputTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputTexture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteTexture(outputTexture);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteFramebuffer(resolveFramebuffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
    throw new Error(`train watercolor framebuffer incomplete (status ${status})`);
  }
  const uColorTexture = gl.getUniformLocation(program, 'uColorTexture');
  const uParams = gl.getUniformLocation(program, 'uParams');
  if (!uColorTexture || !uParams) {
    gl.deleteTexture(outputTexture);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteFramebuffer(resolveFramebuffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
    throw new Error('train watercolor: failed to query WebGL2 uniforms');
  }
  return {
    gl, program, vao, framebuffer, resolveFramebuffer, outputTexture,
    outputWidth: 1, outputHeight: 1, uColorTexture, uParams,
  };
};

const ensureTrainWebGl2WatercolorOutput = (
  state: TrainWebGl2WatercolorState,
  width: number,
  height: number,
): void => {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  if (state.outputWidth === w && state.outputHeight === h) return;
  const gl = state.gl;
  gl.bindTexture(gl.TEXTURE_2D, state.outputTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  state.outputWidth = w;
  state.outputHeight = h;
};

const destroyTrainWebGl2WatercolorState = (
  state: TrainWebGl2WatercolorState | null,
): void => {
  if (!state) return;
  const gl = state.gl;
  gl.deleteTexture(state.outputTexture);
  gl.deleteFramebuffer(state.framebuffer);
  gl.deleteFramebuffer(state.resolveFramebuffer);
  gl.deleteVertexArray(state.vao);
  gl.deleteProgram(state.program);
};

export const startTrainExample = (
  applyScene: (scene: RenderScene) => void,
  onLoadingProgress?: (progress: number | null) => void,
): TrainExampleController => {
  let webGpuWcState: TrainWebGpuWatercolorState | null = null;
  let webGl2WcState: TrainWebGl2WatercolorState | null = null;

  const inner = startSingleModelExample('train', applyScene, onLoadingProgress, (scene) => {
    yaw180Scene(scene);
    addTrainSky(scene);
  });

  const webGpuStages = [
    {
      name: 'train-watercolor',
      injectionPoint: 'pre-composite' as const,
      reads: [
        { name: 'motion-blur', kind: 'texture-handle' as const },
        { name: 'dof', kind: 'texture-handle' as const },
      ],
      writes: [
        { name: 'motion-blur', kind: 'texture-handle' as const },
        { name: 'dof', kind: 'texture-handle' as const },
      ],
      execute: (stageContext: {
        device: GPUDevice;
        encoder: GPUCommandEncoder;
        width: number;
        height: number;
        resources: {
          get: <T>(name: string) => T | undefined;
          set: (name: string, value: unknown) => void;
        };
      }) => {
        if (stageContext.width <= 0 || stageContext.height <= 0) return;
        const sourceColor = stageContext.resources.get<CityStageTextureHandle>('motion-blur');
        const sourceDof = stageContext.resources.get<CityStageTextureHandle>('dof');
        if (!sourceColor || !sourceDof) return;
        if (!webGpuWcState) {
          webGpuWcState = createTrainWebGpuWatercolorState(stageContext.device, sourceColor.format);
        }
        const output = ensureTrainWebGpuWatercolorOutput(
          webGpuWcState,
          stageContext.device,
          stageContext.width,
          stageContext.height,
        );
        stageContext.device.queue.writeBuffer(
          webGpuWcState.uniformBuffer,
          0,
          new Float32Array([
            TRAIN_WC_RADIUS,
            TRAIN_WC_SATURATION,
            1 / Math.max(1, stageContext.width),
            1 / Math.max(1, stageContext.height),
          ]),
        );
        const bindGroup = stageContext.device.createBindGroup({
          layout: webGpuWcState.pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: webGpuWcState.sampler },
            { binding: 1, resource: sourceColor.view },
            { binding: 2, resource: { buffer: webGpuWcState.uniformBuffer } },
          ],
        });
        const pass = stageContext.encoder.beginRenderPass({
          colorAttachments: [{
            view: output.view,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          }],
        });
        pass.setPipeline(webGpuWcState.pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();
        const copySize = {
          width: stageContext.width,
          height: stageContext.height,
          depthOrArrayLayers: 1,
        };
        stageContext.encoder.copyTextureToTexture(
          { texture: output.texture },
          { texture: sourceColor.texture },
          copySize,
        );
        stageContext.encoder.copyTextureToTexture(
          { texture: output.texture },
          { texture: sourceDof.texture },
          copySize,
        );
        stageContext.resources.set('motion-blur', output);
        stageContext.resources.set('dof', output);
      },
    },
  ];

  const webGl2Stages: WebGl2InjectionStage[] = [
    {
      name: 'train-watercolor',
      injectionPoint: 'pre-composite',
      execute: (stageContext) => {
        if (stageContext.width <= 0 || stageContext.height <= 0) return;
        if (!webGl2WcState || webGl2WcState.gl !== stageContext.gl) {
          destroyTrainWebGl2WatercolorState(webGl2WcState);
          webGl2WcState = createTrainWebGl2WatercolorState(stageContext.gl);
        }
        ensureTrainWebGl2WatercolorOutput(webGl2WcState, stageContext.width, stageContext.height);
        const gl = stageContext.gl;
        const prevFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const prevReadFramebuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const prevDrawFramebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const prevProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
        const prevVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
        const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

        gl.bindFramebuffer(gl.FRAMEBUFFER, webGl2WcState.framebuffer);
        gl.viewport(0, 0, stageContext.width, stageContext.height);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
        gl.useProgram(webGl2WcState.program);
        gl.bindVertexArray(webGl2WcState.vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, stageContext.colorTexture);
        gl.uniform1i(webGl2WcState.uColorTexture, 0);
        gl.uniform4f(
          webGl2WcState.uParams,
          TRAIN_WC_RADIUS,
          TRAIN_WC_SATURATION,
          1 / Math.max(1, stageContext.width),
          1 / Math.max(1, stageContext.height),
        );
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, webGl2WcState.framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, webGl2WcState.resolveFramebuffer);
        gl.framebufferTexture2D(
          gl.DRAW_FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          stageContext.colorTexture,
          0,
        );
        gl.blitFramebuffer(
          0, 0, stageContext.width, stageContext.height,
          0, 0, stageContext.width, stageContext.height,
          gl.COLOR_BUFFER_BIT, gl.NEAREST,
        );
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindVertexArray(prevVao);
        gl.useProgram(prevProgram);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevReadFramebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, prevDrawFramebuffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);
        gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
      },
    },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engineOptions: RendererEngineOptions = {
    webGpuStages: webGpuStages as any,
    webGl2Stages,
    webGpuStageFailurePolicy: 'skip-stage',
  };

  return {
    engineOptions,
    dispose: () => {
      inner.dispose();
      if (webGpuWcState) {
        webGpuWcState.uniformBuffer.destroy();
        webGpuWcState.outputTexture?.destroy();
        webGpuWcState = null;
      }
      destroyTrainWebGl2WatercolorState(webGl2WcState);
      webGl2WcState = null;
    },
  };
};

export const startWorldOfMetalExample = (
  applyScene: (scene: RenderScene) => void,
  onLoadingProgress?: (progress: number | null) => void,
): UsdExampleController =>
  startSingleModelExample('worldOfMetal', applyScene, onLoadingProgress);

const CITY_MODEL_KEYS: ReadonlyArray<ModelKey> = ['city5', 'city6', 'city7'];

// ── City chromatic aberration ────────────────────────────────────────────────
//
// A bespoke post-process injected into the renderer's pre-composite slot
// (the same slot the crowd / crowdCompute examples use for cel shading).
// The effect samples the HDR colour buffer three times — once per channel —
// with offsets that grow radially toward the screen edges, then writes the
// recombined colour back into the same buffer. Strength and falloff are
// tuned for a subtle anamorphic-lens feel; bump `STRENGTH` for a stronger
// effect.

const CITY_CA_STRENGTH = 0.012; // Peak per-channel UV offset at the corners.
const CITY_CA_FALLOFF = 2.2;   // How quickly offset ramps from centre to edge.
const CITY_CA_RED_BLUE_RATIO = 1.0; // Sign factor; 1 splits R outward / B inward.

type CityWebGpuChromaticAberrationState = {
  pipeline: GPURenderPipeline;
  sampler: GPUSampler;
  uniformBuffer: GPUBuffer;
  outputTexture: GPUTexture | null;
  outputView: GPUTextureView | null;
  outputWidth: number;
  outputHeight: number;
  outputFormat: GPUTextureFormat;
};

type CityWebGl2ChromaticAberrationState = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  framebuffer: WebGLFramebuffer;
  resolveFramebuffer: WebGLFramebuffer;
  outputTexture: WebGLTexture;
  outputWidth: number;
  outputHeight: number;
  uColorTexture: WebGLUniformLocation;
  uCaParams: WebGLUniformLocation;
};

type CityStageTextureHandle = {
  texture: GPUTexture;
  view: GPUTextureView;
  format: GPUTextureFormat;
};

const CITY_CA_FULLSCREEN_TRIANGLE_VS_WGSL = /* wgsl */ `
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VsOut {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(3.0, 1.0),
    vec2f(-1.0, 1.0),
  );
  var outputVertex: VsOut;
  outputVertex.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  outputVertex.uv = positions[vertexIndex] * 0.5 + vec2f(0.5, 0.5);
  return outputVertex;
}
`;

const CITY_CA_FRAGMENT_WGSL = /* wgsl */ `
@group(0) @binding(0) var linearSampler: sampler;
@group(0) @binding(1) var sourceColorTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> caParams: vec4f; // x: strength, y: falloff, z: red/blue split sign.

@fragment
fn fsMain(inFragment: VsOut) -> @location(0) vec4f {
  let uv = vec2f(inFragment.uv.x, 1.0 - inFragment.uv.y);
  let strength = caParams.x;
  let falloff = max(0.5, caParams.y);
  let split = caParams.z;

  // Radial vector from screen centre. pow() lets the centre stay clean
  // while the corners get the full offset, mimicking real lens CA.
  let centred = uv - vec2f(0.5, 0.5);
  let radius = length(centred) * 1.4142136; // 1 at corners, 0 at centre.
  let radial = select(centred / max(0.0001, length(centred)), vec2f(0.0), length(centred) < 0.0001);
  let offset = radial * strength * pow(radius, falloff);

  let r = textureSample(sourceColorTexture, linearSampler, uv + offset * split).r;
  let g = textureSample(sourceColorTexture, linearSampler, uv).g;
  let b = textureSample(sourceColorTexture, linearSampler, uv - offset * split).b;
  let alpha = textureSample(sourceColorTexture, linearSampler, uv).a;
  return vec4f(r, g, b, alpha);
}
`;

const CITY_CA_FULLSCREEN_TRIANGLE_VERTEX_GLSL = `#version 300 es
precision highp float;

out vec2 vUv;

void main() {
  vec2 position;
  if (gl_VertexID == 0) {
    position = vec2(-1.0, -3.0);
  } else if (gl_VertexID == 1) {
    position = vec2(3.0, 1.0);
  } else {
    position = vec2(-1.0, 1.0);
  }
  gl_Position = vec4(position, 0.0, 1.0);
  vUv = position * 0.5 + vec2(0.5, 0.5);
}
`;

const CITY_CA_FRAGMENT_GLSL = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uColorTexture;
uniform vec4 uCaParams; // x: strength, y: falloff, z: split sign.

out vec4 outColor;

void main() {
  vec2 uv = vUv;
  float strength = uCaParams.x;
  float falloff = max(0.5, uCaParams.y);
  float split = uCaParams.z;

  vec2 centred = uv - vec2(0.5);
  float len = length(centred);
  float radius = len * 1.4142136;
  vec2 radial = len < 0.0001 ? vec2(0.0) : centred / len;
  vec2 offset = radial * strength * pow(radius, falloff);

  float r = texture(uColorTexture, uv + offset * split).r;
  float g = texture(uColorTexture, uv).g;
  float b = texture(uColorTexture, uv - offset * split).b;
  float alpha = texture(uColorTexture, uv).a;
  outColor = vec4(r, g, b, alpha);
}
`;

const compileCityWebGl2Shader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('city CA: failed to create WebGL shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown shader compile error';
    gl.deleteShader(shader);
    throw new Error(`city CA shader compile failed: ${log}`);
  }
  return shader;
};

const linkCityWebGl2Program = (
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram => {
  const vs = compileCityWebGl2Shader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileCityWebGl2Shader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error('city CA: failed to create WebGL program');
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown program link error';
    gl.deleteProgram(program);
    throw new Error(`city CA program link failed: ${log}`);
  }
  return program;
};

const createCityWebGpuCaState = (
  device: GPUDevice,
  outputFormat: GPUTextureFormat,
): CityWebGpuChromaticAberrationState => {
  const module = device.createShaderModule({
    code: `${CITY_CA_FULLSCREEN_TRIANGLE_VS_WGSL}\n${CITY_CA_FRAGMENT_WGSL}`,
  });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsMain' },
    fragment: { module, entryPoint: 'fsMain', targets: [{ format: outputFormat }] },
    primitive: { topology: 'triangle-list' },
  });
  return {
    pipeline,
    sampler: device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    }),
    uniformBuffer: device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
    outputTexture: null,
    outputView: null,
    outputWidth: 0,
    outputHeight: 0,
    outputFormat,
  };
};

const ensureCityWebGpuCaOutput = (
  state: CityWebGpuChromaticAberrationState,
  device: GPUDevice,
  width: number,
  height: number,
): CityStageTextureHandle => {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  if (!state.outputTexture || state.outputWidth !== w || state.outputHeight !== h) {
    state.outputTexture?.destroy();
    state.outputTexture = device.createTexture({
      size: { width: w, height: h, depthOrArrayLayers: 1 },
      format: state.outputFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT
        | GPUTextureUsage.TEXTURE_BINDING
        | GPUTextureUsage.COPY_SRC,
    });
    state.outputView = state.outputTexture.createView();
    state.outputWidth = w;
    state.outputHeight = h;
  }
  return {
    texture: state.outputTexture!,
    view: state.outputView!,
    format: state.outputFormat,
  };
};

const createCityWebGl2CaState = (
  gl: WebGL2RenderingContext,
): CityWebGl2ChromaticAberrationState => {
  const program = linkCityWebGl2Program(
    gl,
    CITY_CA_FULLSCREEN_TRIANGLE_VERTEX_GLSL,
    CITY_CA_FRAGMENT_GLSL,
  );
  const vao = gl.createVertexArray();
  const framebuffer = gl.createFramebuffer();
  const resolveFramebuffer = gl.createFramebuffer();
  const outputTexture = gl.createTexture();
  if (!vao || !framebuffer || !resolveFramebuffer || !outputTexture) {
    if (vao) gl.deleteVertexArray(vao);
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    if (resolveFramebuffer) gl.deleteFramebuffer(resolveFramebuffer);
    if (outputTexture) gl.deleteTexture(outputTexture);
    gl.deleteProgram(program);
    throw new Error('city CA: failed to allocate WebGL2 resources');
  }
  gl.bindTexture(gl.TEXTURE_2D, outputTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputTexture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteTexture(outputTexture);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteFramebuffer(resolveFramebuffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
    throw new Error(`city CA framebuffer incomplete (status ${status})`);
  }
  const uColorTexture = gl.getUniformLocation(program, 'uColorTexture');
  const uCaParams = gl.getUniformLocation(program, 'uCaParams');
  if (!uColorTexture || !uCaParams) {
    gl.deleteTexture(outputTexture);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteFramebuffer(resolveFramebuffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
    throw new Error('city CA: failed to query WebGL2 uniforms');
  }
  return {
    gl, program, vao, framebuffer, resolveFramebuffer, outputTexture,
    outputWidth: 1, outputHeight: 1, uColorTexture, uCaParams,
  };
};

const ensureCityWebGl2CaOutput = (
  state: CityWebGl2ChromaticAberrationState,
  width: number,
  height: number,
): void => {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  if (state.outputWidth === w && state.outputHeight === h) return;
  const gl = state.gl;
  gl.bindTexture(gl.TEXTURE_2D, state.outputTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  state.outputWidth = w;
  state.outputHeight = h;
};

const destroyCityWebGl2CaState = (
  state: CityWebGl2ChromaticAberrationState | null,
): void => {
  if (!state) return;
  const gl = state.gl;
  gl.deleteTexture(state.outputTexture);
  gl.deleteFramebuffer(state.framebuffer);
  gl.deleteFramebuffer(state.resolveFramebuffer);
  gl.deleteVertexArray(state.vao);
  gl.deleteProgram(state.program);
};

export const startCityExample = (
  applyScene: (scene: RenderScene) => void,
  onLoadingProgress?: (progress: number | null) => void,
): CityExampleController => {
  let disposed = false;
  let blobUrlsToRevoke: string[] = [];
  let webGpuCaState: CityWebGpuChromaticAberrationState | null = null;
  let webGl2CaState: CityWebGl2ChromaticAberrationState | null = null;
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
      addCitySky(combined);
      applyScene(combined);
      onLoadingProgress?.(null);
    } catch (err) {
      if (!disposed) onLoadingProgress?.(null);
      console.warn('usd[city] example failed to load.', err);
    }
  })();

  // Bespoke chromatic aberration injected into the renderer's pre-composite
  // slot — same hook the crowd / crowdCompute examples use for cel shading.
  // Reads the HDR colour buffer ('motion-blur' / 'dof'), splits R/G/B with
  // a radial UV offset, copies the result back so subsequent stages and the
  // composite see the aberrated image.
  const webGpuStages = [
    {
      name: 'city-chromatic-aberration',
      injectionPoint: 'pre-composite' as const,
      reads: [
        { name: 'motion-blur', kind: 'texture-handle' as const },
        { name: 'dof', kind: 'texture-handle' as const },
      ],
      writes: [
        { name: 'motion-blur', kind: 'texture-handle' as const },
        { name: 'dof', kind: 'texture-handle' as const },
      ],
      execute: (stageContext: {
        device: GPUDevice;
        encoder: GPUCommandEncoder;
        width: number;
        height: number;
        resources: {
          get: <T>(name: string) => T | undefined;
          set: (name: string, value: unknown) => void;
        };
      }) => {
        if (stageContext.width <= 0 || stageContext.height <= 0) return;
        const sourceColor = stageContext.resources.get<CityStageTextureHandle>('motion-blur');
        const sourceDof = stageContext.resources.get<CityStageTextureHandle>('dof');
        if (!sourceColor || !sourceDof) return;
        if (!webGpuCaState) {
          webGpuCaState = createCityWebGpuCaState(stageContext.device, sourceColor.format);
        }
        const output = ensureCityWebGpuCaOutput(
          webGpuCaState,
          stageContext.device,
          stageContext.width,
          stageContext.height,
        );
        stageContext.device.queue.writeBuffer(
          webGpuCaState.uniformBuffer,
          0,
          new Float32Array([CITY_CA_STRENGTH, CITY_CA_FALLOFF, CITY_CA_RED_BLUE_RATIO, 0]),
        );
        const bindGroup = stageContext.device.createBindGroup({
          layout: webGpuCaState.pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: webGpuCaState.sampler },
            { binding: 1, resource: sourceColor.view },
            { binding: 2, resource: { buffer: webGpuCaState.uniformBuffer } },
          ],
        });
        const pass = stageContext.encoder.beginRenderPass({
          colorAttachments: [{
            view: output.view,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          }],
        });
        pass.setPipeline(webGpuCaState.pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();
        const copySize = {
          width: stageContext.width,
          height: stageContext.height,
          depthOrArrayLayers: 1,
        };
        stageContext.encoder.copyTextureToTexture(
          { texture: output.texture },
          { texture: sourceColor.texture },
          copySize,
        );
        stageContext.encoder.copyTextureToTexture(
          { texture: output.texture },
          { texture: sourceDof.texture },
          copySize,
        );
        stageContext.resources.set('motion-blur', output);
        stageContext.resources.set('dof', output);
      },
    },
  ];

  const webGl2Stages: WebGl2InjectionStage[] = [
    {
      name: 'city-chromatic-aberration',
      injectionPoint: 'pre-composite',
      execute: (stageContext) => {
        if (stageContext.width <= 0 || stageContext.height <= 0) return;
        if (!webGl2CaState || webGl2CaState.gl !== stageContext.gl) {
          destroyCityWebGl2CaState(webGl2CaState);
          webGl2CaState = createCityWebGl2CaState(stageContext.gl);
        }
        ensureCityWebGl2CaOutput(webGl2CaState, stageContext.width, stageContext.height);
        const gl = stageContext.gl;
        const prevFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const prevReadFramebuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const prevDrawFramebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const prevProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
        const prevVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
        const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

        gl.bindFramebuffer(gl.FRAMEBUFFER, webGl2CaState.framebuffer);
        gl.viewport(0, 0, stageContext.width, stageContext.height);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
        gl.useProgram(webGl2CaState.program);
        gl.bindVertexArray(webGl2CaState.vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, stageContext.colorTexture);
        gl.uniform1i(webGl2CaState.uColorTexture, 0);
        gl.uniform4f(
          webGl2CaState.uCaParams,
          CITY_CA_STRENGTH,
          CITY_CA_FALLOFF,
          CITY_CA_RED_BLUE_RATIO,
          0,
        );
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // Blit the aberrated image back into the engine's colour texture so
        // downstream composite picks it up.
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, webGl2CaState.framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, webGl2CaState.resolveFramebuffer);
        gl.framebufferTexture2D(
          gl.DRAW_FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          stageContext.colorTexture,
          0,
        );
        gl.blitFramebuffer(
          0, 0, stageContext.width, stageContext.height,
          0, 0, stageContext.width, stageContext.height,
          gl.COLOR_BUFFER_BIT, gl.NEAREST,
        );
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindVertexArray(prevVao);
        gl.useProgram(prevProgram);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevReadFramebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, prevDrawFramebuffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);
        gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
      },
    },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engineOptions: RendererEngineOptions = {
    webGpuStages: webGpuStages as any,
    webGl2Stages,
    webGpuStageFailurePolicy: 'skip-stage',
  };

  return {
    engineOptions,
    dispose: () => {
      disposed = true;
      onLoadingProgress?.(null);
      for (const url of blobUrlsToRevoke) URL.revokeObjectURL(url);
      blobUrlsToRevoke = [];
      if (webGpuCaState) {
        webGpuCaState.uniformBuffer.destroy();
        webGpuCaState.outputTexture?.destroy();
        webGpuCaState = null;
      }
      destroyCityWebGl2CaState(webGl2CaState);
      webGl2CaState = null;
    },
  };
};
