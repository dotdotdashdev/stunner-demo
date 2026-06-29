// Porsche example: a single car USD on a textured/displaced concrete disc,
// with a hemisphere sky sphere driving image-based lighting and a single
// reflection probe enclosing the floor + car so the dielectric paint and
// the floor mirror have something to reflect.
//
// Live-tunable: sky texture, sky intensity, sky blend (against the
// procedural sky), and sky composite mode. Changing options re-applies the
// customisations on top of a clean clone of the loaded scene.

import type { RenderScene } from '@dotdotdash/stunner-core/renderer/mesh/SceneTypes';
import { createDefaultMaterial } from '@dotdotdash/stunner-core/renderer/mesh/MaterialTypes';
import { createCircle } from '@dotdotdash/stunner-core/renderer/mesh/MeshFactory';
import {
  applyImageDisplacement,
  loadDisplacementImage,
} from '@dotdotdash/stunner-core/renderer/mesh/MeshDisplacement';
import type { MeshGeometry } from '@dotdotdash/stunner-core/renderer/mesh/MeshTypes';
import { createSkySphere } from '@dotdotdash/stunner-core/sky';

import {
  loadAndProcessUsdScene,
  translateScene,
  type UsdExampleController,
} from './shared';

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

// ── Floor geometry ─────────────────────────────────────────────────────────
//
// A subdivided disc that gets per-vertex displacement from the concrete
// texture's red channel so the surface reads as stony rather than printed.

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

// ── Sky ────────────────────────────────────────────────────────────────────

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

// ── Customisations applied per option-change ───────────────────────────────

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
