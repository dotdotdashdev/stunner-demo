// Shared infrastructure used by the porsche / train / city USD examples.
//
// Each example owns its own bespoke parts (sky, post-process, scene
// customisations, controller surface). Everything that has to be done the
// same way for every USD load — fetching the binary, materialising textures,
// honouring stage metadata, tuning materials — lives here.

import { loadUsdSceneFromUrl, AssetResolver } from '@stunner/usd';
import type { RenderScene } from '@stunner/core/renderer/mesh/SceneTypes';
import type { PbrMaterial } from '@stunner/core/renderer/mesh/MaterialTypes';

export type ModelKey = 'porsche' | 'train' | 'city5' | 'city6' | 'city7';

export const MODEL_URLS: Record<ModelKey, string> = {
  porsche: '/models/usd/2014_Porsche_911_Turbo_991.usdz',
  train: '/models/usd/Train.usdz',
  city5: '/models/usd/Procedural_City_5.usdz',
  city6: '/models/usd/Procedural_City_6.usdz',
  city7: '/models/usd/Procedural_City_7.usdz',
};

export type UsdExampleController = {
  dispose: () => void;
};

export type LoadedScene = {
  scene: RenderScene;
  blobUrls: string[];
};

// ── Material tuning ────────────────────────────────────────────────────────
//
// Sketchfab USDZ assets ship PBR parameters tuned for a different renderer
// (and a different definition of "paint" / "glass"). The heuristic below
// classifies each material and re-applies our own defaults so paint reads
// as paint and glass reads as glass across all three USD examples.

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

// Snapshot the original (as-loaded) values of the fields we mutate so we
// can re-apply tuning on top of a clean baseline when the user changes
// sliders. Stored on the material object via a non-enumerable key.
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

// ── Asset fetching ─────────────────────────────────────────────────────────

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

// ── Scene mutation helpers ─────────────────────────────────────────────────

// Scale every world transform / light position in the scene by `s`. Used to
// load procedural city USDs at a more sensible size for our viewer (their
// natural unit scale is enormous compared to the porsche/train).
export const scaleScene = (scene: RenderScene, s: number): void => {
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

// Translate every world transform / light position / probe in the scene by
// `(dx, dy, dz)`. Porsche uses it to lift the car above the floor; city uses
// it to lay the three procedural cities out side by side.
export const translateScene = (scene: RenderScene, dx: number, dy: number, dz: number): void => {
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

// ── Loading ────────────────────────────────────────────────────────────────

// Per-model uniform scale applied at load time. The procedural city models
// are authored at ~100x our intended size; everything else is at metres.
const modelScale = (modelKey: ModelKey): number =>
  modelKey === 'city5' || modelKey === 'city6' || modelKey === 'city7' ? 0.01 : 1;

// Whether to honour the asset's authored `metersPerUnit` / `upAxis` stage
// metadata. Many "1-unit-per-cm" Sketchfab USDZ exports author this field
// even though their geometry is in metres at the right scale (the porsche
// and city assets fall into this bucket and are tuned manually instead).
// Train really is authored at 1 unit per cm, so it needs the metadata
// applied to render at the correct size.
const applyStageMetadata = (modelKey: ModelKey): boolean => modelKey === 'train';

// Load and process a single USD model: fetch bytes, parse, materialise textures,
// scale, and tune materials. Caller owns the returned blob URLs and must revoke
// them when the scene is no longer needed.
export const loadAndProcessUsdScene = async (
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
    applyStageMetadata: applyStageMetadata(modelKey),
  });
  if (isCancelled()) return null;
  onProgress(0.96);

  const blobUrls = await materialiseUsdTextures(result.scene, resolver, url);
  scaleScene(result.scene, modelScale(modelKey));

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

// Generic single-model launcher used by examples that load exactly one USD
// asset (porsche, train). The optional `postProcess` callback is the place
// to push a sky sphere, lift the model off the floor, etc.
export const startSingleModelExample = (
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

// ── Post-process plumbing shared by city CA and train watercolor ───────────
//
// Both effects render a fullscreen triangle, sample the HDR colour buffer,
// and copy the result back into the engine's pre-composite slot. The vertex
// shader and the tiny WebGL2 program-link helper are identical between
// them; everything else is in the per-example file.

export type PostProcessTextureHandle = {
  texture: GPUTexture;
  view: GPUTextureView;
  format: GPUTextureFormat;
};

export const FULLSCREEN_TRIANGLE_VS_WGSL = /* wgsl */ `
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

export const FULLSCREEN_TRIANGLE_VERTEX_GLSL = `#version 300 es
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

const compileWebGl2Shader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string,
): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`${label}: failed to create WebGL shader`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown shader compile error';
    gl.deleteShader(shader);
    throw new Error(`${label} shader compile failed: ${log}`);
  }
  return shader;
};

export const linkWebGl2Program = (
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  label: string,
): WebGLProgram => {
  const vs = compileWebGl2Shader(gl, gl.VERTEX_SHADER, vertexSource, label);
  const fs = compileWebGl2Shader(gl, gl.FRAGMENT_SHADER, fragmentSource, label);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error(`${label}: failed to create WebGL program`);
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown program link error';
    gl.deleteProgram(program);
    throw new Error(`${label} program link failed: ${log}`);
  }
  return program;
};
